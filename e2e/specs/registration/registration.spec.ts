import { type APIRequestContext } from '@playwright/test';
import { test, expect } from '../../core';
import { KLINIK_EKSTEN_LOCATION_UUID, MIREBALAIS_VISIT_LOCATION_UUID } from '../../core/constants';
import { cleanupPatient, getPatientEncounters } from '../../commands';
import { QUESTION, REQUIRED_ADDRESS_LEVELS, RegistrationPage } from '../../pages';

// registrationapp "Register a patient" (registrationapp/registerPatient.page?appId=registrationapp.registerPatient): the
// legacy wizard that creates a patient, driven through its left-hand navigator (pages/registration-page.ts). The sections
// come from pihcore SectionsHaiti + pih-config-haiti.json `registrationConfig`; they are the same on every Haiti profile,
// but the primary identifier is not: this spec needs `allowManualEntryOfPrimaryIdentifier` (true in pih-config-haiti.json)
// for the manual ZL EMR ID, and an auto-assigned ID (any generator: only its presence is asserted) for the other register test.
// THE REGISTER TESTS CREATE PATIENTS THROUGH THE UI (`AutoReg<letters> Tester`). There is no fixture: afterEach finds the
// patient by its unique given name and calls cleanupPatient (void), so each register test leaves one voided patient with its Patient Registration encounter.
//
// Questions, in navigator order (the running server, config haiti,haiti-central,haiti-local-idgen):
//   Registration Date | Demographics: Name, Gender, Birthdate, Mother's First Name | Contact Info: Address, Phone Number, Possible duplicates |
//   Insurance: Company Name (+ policy number, other company) | Social: Place of Birth, Civil Status, Occupation, Religion |
//   Contact Person: Contact Name (+ relationship), Contact Address, Contact Phone Number | Identifiers: ZL EMR ID | Print ID card
// Required (config + widgets): given and family name, gender, birthdate (exact, or estimated years + months), mother's first
//   name (registrationConfig.demographics.mothersName.required), address country/department/commune/section communale
//   (locality and street are free), Place of Birth (the same four levels), contact name, relationship, address and phone
//   (registrationConfig.contactPerson.required). Not required: phone number, insurance, civil status, occupation, religion.
// Possible duplicates (registrationapp duplicateCheck.js) is a gate: it searches the existing patients with the entries so far and the
//   navigator will not go past it until the search has finished and any matches have been reviewed (RegistrationPage.passDuplicateCheck).
// Validation (client side, shown on the current question, which the navigator refuses to leave): "Required", "Invalid."
//   for both phone numbers (regex in registrationConfig: 8 digits, xxxx-xxxx, or +xxx xxxxxxxx), "Maximum: <year>" /
//   "Minimum: <year-120>" and "There are only N days in <month> ..." for the birthdate, "Maximum: 120" for estimated years.
// Conditions: Registration Date "Today" checkbox enables the date inputs; a complete exact birthdate disables estimated
//   years/months (and clearing it enables them again); "Automatically assign" checkbox disables/enables the identifier box;
//   "Unidentified Patient" disables the name inputs.
// After created (afterCreatedActions): assignDossierNumber (Dossier Number identifier) and assignHealthCenter ("Health Center"
//   person attribute = visit location of the session location). afterCreatedUrl is pihcore/patientRegistration/afterRegistration.page,
//   which redirects: Print ID card = Yes (the default) -> pihcore/patientRegistration/printIdCard.page, else registrationapp/findPatient.page.
// printIdCard.page (Print ID card = Yes) prints on load and saves an obs, so the second register test stubs it.
// Not covered: unidentified-patient registration (it would create an `UNKNOWN` patient, not an Auto... one), Tablet Entry
//   Location simplification (needs another session location), biometrics / ID card section / HIV identifiers (components
//   and specialty off here),
//   retrospective-date registration beyond one encounter date check, edit of a registered patient.
//
// Findings (see pihcore apploader/apps/patientregistration/SectionsHaiti.java):
//   V1 Low  SectionsHaiti.java:231  contact address levels are always required (`getAddressHierarchyWidget(..., true)`), while
//                                   the contact name/relationship/phone follow registrationConfig.contactPerson.required and
//                                   the non-hierarchy branch :237 does too. A site with contactPerson.required=false still cannot
//                                   skip the contact address. Same for Place of Birth :94 (always required, no config).
//   V2 Info SectionsDefault.java:550 "Print ID card" defaults to Yes, so every registration is redirected to printIdCard.page
//                                   unless the clerk changes it (tested).
//   V3 Info (observed, not tested) typing nothing in the identifier box with "Automatically assign" turned off still generates an ID, while the
//                                   confirmation shows "ZL EMR ID: --". Not tested (would register a patient).
//   The "Possible duplicates" question is OPTIONAL here: pihcore's working copy adds it after Phone Number (showDuplicatePatientSection,
//   default true) but servers that do not have the feature yet (zl-ci at the time of writing) do not. The spec detects it
//   (RegistrationPage.hasDuplicateCheck): the order test expects it only where it is, the phone-number tests expect the focus to
//   go to it or, without it, to the insurance, `through()` and the register tests pass it only where it is, and the two tests of the
//   question itself skip where it is absent.

const REGISTRATION_ENCOUNTER_TYPE_UUID = '873f968a-73a8-4f9c-ac78-9f4778b751b6';
const NAME_FAMILY = 'Tester';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const randomLetters = () => Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const uniqueGivenName = () => `AutoReg${randomLetters()}`;
const required = (n: number) => Array<string>(n).fill('Required');

// ZL EMR ID: 5 characters plus a Luhn mod 30 check character (the same algorithm as commands/patient-operations.ts, which
// does not export it).
const LUHN_CHARS = '0123456789ACDEFGHJKLMNPRTUVWXY';
const manualEmrId = () => {
  const base = Array.from({ length: 5 }, () => LUHN_CHARS[Math.floor(Math.random() * LUHN_CHARS.length)]);
  let factor = 2;
  let sum = 0;
  for (let i = base.length - 1; i >= 0; i--) {
    const addend = factor * LUHN_CHARS.indexOf(base[i]);
    factor = factor === 2 ? 1 : 2;
    sum += Math.floor(addend / 30) + (addend % 30);
  }
  return base.join('') + LUHN_CHARS[(30 - (sum % 30)) % 30];
};

// The wizard only lets the clerk reach a question once the required ones before it are valid (a jump from the start lands
// on the first invalid question), so a test of a later question first fills the required questions in front of it.
// `through(registration, 'address')` fills everything before the address. Country is preset to Haiti; the other three
// required levels of every address are picked from the first suggestions.
// The "Possible duplicates" question is optional: servers without pihcore's showDuplicatePatientSection (not released everywhere yet) do not have it, and
// the tests of the question skip there. RegistrationPage.passDuplicateCheck does nothing on such a wizard.
const NO_DUPLICATE_CHECK = 'this wizard has no "Possible duplicates" question (pihcore showDuplicatePatientSection)';
const REQUIRED_STEPS: Array<[string, (r: RegistrationPage) => Promise<unknown>]> = [
  ['name', (r) => r.fillName('Autoreg', NAME_FAMILY)],
  ['gender', (r) => r.fillGender('F')],
  ['birthdate', (r) => r.fillBirthdate('15', 'March', '1985')],
  ['mothersName', (r) => r.fillMothersName('Autoreg')],
  ['address', (r) => r.fillAddress('Rue Test')],
  ['duplicates', (r) => r.passDuplicateCheck()],
  ['birthplace', (r) => r.fillBirthplace()],
  ['contactName', (r) => r.fillContactNameAndRelationship('Autocontact', 'friend')],
  ['contactAddress', (r) => r.fillContactAddress()],
  ['contactPhone', (r) => r.fillContactPhone('87654321')],
  ['identifier', async () => undefined],
];
const through = async (registration: RegistrationPage, before: string) => {
  for (const [id, fill] of REQUIRED_STEPS) {
    if (id === before) {
      return;
    }
    await fill(registration);
  }
  throw new Error(`unknown step ${before}`);
};
// pickAddress selects country too (it is preset to Haiti); only the three levels below it can be left blank
const BLANK_LEVELS = 3;

interface RegisteredPatient {
  uuid: string;
  identifiers: Array<{ identifier: string; preferred: boolean; identifierType: { display: string } }>;
  person: {
    gender: string;
    birthdate: string;
    birthdateEstimated: boolean;
    names: Array<{ givenName: string; familyName: string }>;
    preferredAddress: Record<string, string | null>;
    attributes: Array<{ value: string | { uuid: string }; attributeType: { display: string } }>;
  };
}
// Only ever called with the unique given name of a patient this test registered.
const findRegistered = async (api: APIRequestContext, givenName: string): Promise<RegisteredPatient[]> => {
  const res = await api.get(
    `patient?q=${givenName}&v=custom:(uuid,identifiers:(identifier,preferred,identifierType:(display)),` +
      'person:(gender,birthdate,birthdateEstimated,names:(givenName,familyName),' +
      'preferredAddress:(country,stateProvince,cityVillage,address3,address1,address2),' +
      'attributes:(value,attributeType:(display))))',
  );
  expect(res.ok(), `find registered patient: ${res.status()}`).toBeTruthy();
  return (await res.json()).results;
};
const getRegistrationEncounter = async (api: APIRequestContext, patientUuid: string) => {
  const encounters = await getPatientEncounters(api, patientUuid);
  expect(encounters.map((e) => e.encounterType.uuid)).toEqual([REGISTRATION_ENCOUNTER_TYPE_UUID]);
  const res = await api.get(
    `encounter/${encounters[0].uuid}?v=custom:(encounterDatetime,location:(uuid),visit:(uuid),` +
      'encounterProviders:(encounterRole:(display)),' +
      'obs:(display,concept:(display),groupMembers:(display,concept:(display))))',
  );
  expect(res.ok(), `get encounter: ${res.status()}`).toBeTruthy();
  return res.json() as Promise<{
    encounterDatetime: string;
    location: { uuid: string };
    visit: unknown;
    encounterProviders: Array<{ encounterRole: { display: string } }>;
    obs: Array<{ display: string; concept: { display: string }; groupMembers: Array<{ display: string }> | null }>;
  }>;
};
const attribute = (p: RegisteredPatient, type: string) => p.person.attributes.find((a) => a.attributeType.display === type)?.value;

test.describe('registration wizard', () => {
  let givenName: string;

  // Registered patients have no fixture: find them by their unique name and clean them up, also when the test failed.
  test.afterEach(async ({ api }) => {
    if (!givenName) {
      return;
    }
    for (const patient of await findRegistered(api, givenName)) {
      await cleanupPatient(api, patient.uuid);
    }
    givenName = '';
  });

  test.describe('structure', () => {
    test('has the sections and questions of the Haiti form, in order', async ({ page }) => {
      const registration = await RegistrationPage.open(page);
      expect(await registration.sectionLabels()).toEqual([
        'Registration Date', 'Demographics', 'Contact Info', 'Insurance', 'Social', 'Contact Person', 'Identifiers', 'Print ID card',
      ]);
      // "Possible duplicates" (after the phone number) is there only on a server that has the feature (see the header)
      expect(await registration.questionLabels()).toEqual([
        'Registration Date', 'Name', 'Gender', 'Birthdate', "Mother's First Name", 'Address', 'Phone Number',
        ...((await registration.hasDuplicateCheck()) ? ['Possible duplicates'] : []),
        'Company Name', 'Place of Birth', 'Civil Status', 'Occupation', 'Religion', 'Contact Name', 'Contact Address', 'Contact Phone Number',
        'ZL EMR ID', 'Print ID card',
      ]);
      await registration.expectFocused(QUESTION.registrationDate);
    });

    test('offers the answers of the coded questions', async ({ page }) => {
      const registration = await RegistrationPage.open(page);
      const options = (id: string) => registration.question(id).locator('select option').allInnerTexts();
      expect(await options(QUESTION.gender)).toHaveLength(2);
      expect((await options(QUESTION.civilStatus)).map((o) => o.trim()).filter(Boolean)).toEqual([
        'Single', 'Married', 'Living with Partner', 'Separated', 'Divorced', 'Widowed',
      ]);
      expect((await options(QUESTION.insurance)).map((o) => o.trim())).toEqual(expect.arrayContaining(['None', 'AIC', 'INASSA', 'Other']));
      expect((await options(QUESTION.religion)).map((o) => o.trim())).toEqual(expect.arrayContaining(['Catholic', 'Baptist', 'Other']));
      expect((await options(QUESTION.occupation)).map((o) => o.trim())).toEqual(expect.arrayContaining(['Farmer', 'Teacher', 'Unemployed']));
      // V2: the ID card question has no empty answer and starts on Yes
      expect((await options(QUESTION.idCard)).map((o) => o.trim())).toEqual(['Yes', 'No']);
      expect(await registration.question(QUESTION.idCard).locator('select').inputValue()).toBe('PIH:YES');
    });
  });

  test.describe('registration date', () => {
    test('is today until the checkbox is cleared, and a future date is refused', async ({ page }) => {
      const registration = await RegistrationPage.open(page);
      const today = registration.page.locator('#checkbox-enable-registration-date');
      await expect(today).toBeChecked();
      await expect(registration.input('registrationDateDay')).toBeDisabled();
      await today.uncheck();
      await expect(registration.input('registrationDateDay')).toBeEnabled();
      await expect(registration.input('registrationDateYear')).toBeEnabled();

      await registration.fillInput('registrationDateDay', '10');
      await registration.form.locator('#registrationDateMonth-field').selectOption({ label: 'January' });
      await registration.fillInput('registrationDateYear', String(new Date().getFullYear() + 1));
      await registration.expectErrors(QUESTION.registrationDate, [`Maximum: ${new Date().getFullYear()}`]);
      await registration.expectFocused(QUESTION.registrationDate);
    });
  });

  test.describe('demographics', () => {
    test('requires both names and the gender', async ({ page }) => {
      const registration = await RegistrationPage.open(page);
      await registration.goTo('Name');
      await registration.fillInput('familyName', NAME_FAMILY);
      await registration.goTo('Gender');
      await registration.expectErrors(QUESTION.name, ['Required']);
      await registration.expectFocused(QUESTION.name);

      await registration.fillInput('givenName', 'Autoreg');
      await registration.goTo('Gender');
      await registration.expectFocused(QUESTION.gender);
      await registration.goTo('Birthdate');
      await registration.expectErrors(QUESTION.gender, ['Required']);
      await registration.expectFocused(QUESTION.gender);
    });

    test('"Unidentified Patient" disables the names and moves on to the gender', async ({ page }) => {
      const registration = await RegistrationPage.open(page);
      await registration.goTo('Name');
      await registration.page.locator('#checkbox-unknown-patient').check();
      await expect(registration.input('familyName')).toBeDisabled();
      await expect(registration.input('givenName')).toBeDisabled();
      await registration.expectFocused(QUESTION.gender);
    });

    // birthdate validation: the widget refuses what it cannot turn into a date, and stays on the question
    const year = new Date().getFullYear();
    const invalidBirthdates = [
      { name: '31 February', day: '31', month: 'February', year: '1985', message: /There are only 28 days in february/ },
      { name: 'a future year', day: '15', month: 'March', year: String(year + 1), message: `Maximum: ${year}` },
      { name: 'more than 120 years ago', day: '15', month: 'March', year: String(year - 121), message: `Minimum: ${year - 120}` },
    ];
    for (const birthdate of invalidBirthdates) {
      test(`refuses a birthdate with ${birthdate.name}`, async ({ page }) => {
        const registration = await RegistrationPage.open(page);
        await registration.fillName('Autoreg', NAME_FAMILY);
        await registration.fillGender('F');
        await registration.fillBirthdate(birthdate.day, birthdate.month, birthdate.year);
        await registration.expectErrors(QUESTION.birthdate, [birthdate.message]);
        await registration.expectFocused(QUESTION.birthdate);
      });
    }

    test('requires a birthdate or an estimated age, and a mother\'s first name', async ({ page }) => {
      const registration = await RegistrationPage.open(page);
      await registration.fillName('Autoreg', NAME_FAMILY);
      await registration.fillGender('F');
      await registration.goTo('Birthdate');
      await registration.goTo("Mother's First Name");
      await registration.expectErrors(QUESTION.birthdate, ['Required']);

      await registration.fillBirthdate('15', 'March', '1985');
      await registration.expectFocused(QUESTION.mothersName); // a valid birthdate moves on by itself
      await registration.goTo('Address');
      await registration.expectErrors(QUESTION.mothersName, ['Required']);
      await registration.fillInput('mothersFirstName', 'Autoreg');
      await registration.goTo('Address');
      await registration.expectFocused(QUESTION.address);
    });

    test('takes an estimated age instead, which a complete birthdate switches off', async ({ page }) => {
      const registration = await RegistrationPage.open(page);
      await through(registration, 'birthdate');
      await registration.goTo('Birthdate');
      await registration.fillInput('birthdateYears', '121');
      await registration.expectErrors(QUESTION.birthdate, ['Maximum: 120']);

      // estimated years and months are only for a patient without a birthdate
      await registration.fillInput('birthdateYears', '');
      await registration.fillBirthdate('15', 'March', '1985');
      await registration.goTo('Birthdate');
      await expect(registration.input('birthdateYears')).toBeDisabled();
      await expect(registration.input('birthdateMonths')).toBeDisabled();
      await registration.fillInput('birthdateYear', '');
      await expect(registration.input('birthdateYears')).toBeEnabled();
      await expect(registration.input('birthdateMonths')).toBeEnabled();

      await registration.fillEstimatedAge('30', '5');
      await registration.expectFocused(QUESTION.mothersName);
    });
  });

  test.describe('contact info', () => {
    test('requires the four address levels, and takes the locality and the street as free', async ({ page }) => {
      const registration = await RegistrationPage.open(page);
      await through(registration, 'address');
      await registration.goTo('Address');
      await expect(registration.addressLevel(QUESTION.address, 0)).toHaveValue('Haiti');
      await registration.goTo('Phone Number');
      await registration.expectErrors(QUESTION.address, required(BLANK_LEVELS));
      await registration.expectFocused(QUESTION.address);

      const picked = await registration.pickAddress(QUESTION.address);
      expect(picked[0]).toBe('Haiti');
      for (let level = 0; level < REQUIRED_ADDRESS_LEVELS.length; level++) {
        await expect(registration.addressLevel(QUESTION.address, level)).not.toHaveValue('');
      }
      // locality (address1) stays empty
      await registration.goTo('Phone Number');
      await registration.expectFocused(QUESTION.phone);
    });

    // phone regex of registrationConfig.contactInfo.phoneNumber: 8 digits, xxxx-xxxx / xxxx xxxx, or +xxx xxxxxxxx
    const phones = [
      { phone: '12345678', valid: true },
      { phone: '1234-5678', valid: true },
      { phone: '1234 5678', valid: true },
      { phone: '+509 1234 5678', valid: true },
      { phone: '', valid: true }, // the patient's phone number is optional
      { phone: 'abc', valid: false },
      { phone: '1234', valid: false },
      { phone: '123456789012345678', valid: false },
    ];
    for (const { phone, valid } of phones) {
      test(`${valid ? 'accepts' : 'refuses'} the phone number "${phone}"`, async ({ page }) => {
        const registration = await RegistrationPage.open(page);
        await through(registration, 'duplicates');
        await registration.fillPhoneNumber(phone);
        if (valid) {
          await registration.expectFocused(await registration.questionAfterPhone()); // the phone number is the last entry before the check (or the insurance, without it)
        } else {
          await registration.expectErrors(QUESTION.phone, ['Invalid.']);
          await registration.expectFocused(QUESTION.phone);
        }
      });
    }
  });

  test.describe('possible duplicates', () => {
    // duplicateCheck.js: the question follows the phone number, searches the existing patients with the entries so far and
    // does not let the clerk past it until that has finished and any matches have been reviewed.
    test('is checked after the phone number, and continuing goes to the insurance', async ({ page }) => {
      const registration = await RegistrationPage.open(page);
      test.skip(!(await registration.hasDuplicateCheck()), NO_DUPLICATE_CHECK);
      await through(registration, 'duplicates');
      await registration.fillPhoneNumber('12345678');
      await registration.expectFocused(QUESTION.duplicates);
      await registration.passDuplicateCheck();
      await registration.expectFocused(QUESTION.insurance);
    });

    test('does not let the clerk skip it', async ({ page }) => {
      const registration = await RegistrationPage.open(page);
      test.skip(!(await registration.hasDuplicateCheck()), NO_DUPLICATE_CHECK);
      await through(registration, 'duplicates');
      await registration.goTo('Possible duplicates');
      await registration.goTo('Company Name');
      await registration.expectFocused(QUESTION.duplicates);
    });
  });

  test.describe('insurance and social', () => {
    test('insurance, civil status, occupation and religion are optional', async ({ page }) => {
      const registration = await RegistrationPage.open(page);
      await through(registration, 'birthplace');
      await registration.goTo('Company Name');
      await registration.goTo('Place of Birth');
      await registration.expectFocused(QUESTION.birthplace);
      await registration.pickAddress(QUESTION.birthplace);
      await registration.goTo('Civil Status');
      await registration.goTo('Occupation');
      await registration.expectFocused(QUESTION.occupation);
      await registration.goTo('Religion');
      await registration.expectFocused(QUESTION.religion);
      await registration.goTo('Contact Name');
      await registration.expectFocused(QUESTION.contactName);
    });

    test('requires the four levels of the place of birth', async ({ page }) => {
      const registration = await RegistrationPage.open(page);
      await through(registration, 'birthplace');
      await registration.goTo('Place of Birth');
      await registration.goTo('Civil Status');
      await registration.expectErrors(QUESTION.birthplace, required(BLANK_LEVELS)); // V1
      await registration.expectFocused(QUESTION.birthplace);
    });
  });

  test.describe('contact person', () => {
    test('requires the name and the relationship', async ({ page }) => {
      const registration = await RegistrationPage.open(page);
      await through(registration, 'contactName');
      await registration.goTo('Contact Name');
      await registration.goTo('Contact Address');
      await registration.expectErrors(QUESTION.contactName, required(2));
      await registration.fillInput('obsgroup.PIH:PATIENT CONTACTS CONSTRUCT.obs.PIH:NAMES AND FIRSTNAMES OF CONTACT', 'Autocontact');
      await registration.goTo('Contact Address');
      await registration.expectErrors(QUESTION.contactName, required(1));
      await registration.fillContactNameAndRelationship('Autocontact', 'friend');
      await registration.goTo('Contact Address');
      await registration.expectFocused(QUESTION.contactAddress);
    });

    test('requires the four address levels', async ({ page }) => {
      const registration = await RegistrationPage.open(page);
      await through(registration, 'contactAddress');
      await registration.goTo('Contact Address');
      await registration.goTo('Contact Phone Number');
      await registration.expectErrors(QUESTION.contactAddress, required(BLANK_LEVELS)); // V1
    });

    test('requires a phone number that matches the phone regex', async ({ page }) => {
      const registration = await RegistrationPage.open(page);
      await through(registration, 'contactPhone');
      await registration.goTo('Contact Phone Number');
      await registration.fillInput(registration.contactPhoneName, '');
      await registration.expectErrors(QUESTION.contactPhone, ['Required']);
      await registration.fillInput(registration.contactPhoneName, 'abc');
      await registration.expectErrors(QUESTION.contactPhone, ['Invalid.']);
      await registration.fillInput(registration.contactPhoneName, '87654321');
      await registration.expectFocused(QUESTION.identifier);
    });
  });

  test.describe('identifier', () => {
    test('is assigned automatically until the checkbox is cleared', async ({ page }) => {
      const registration = await RegistrationPage.open(page);
      await through(registration, 'identifier');
      await registration.goTo('ZL EMR ID');
      await expect(registration.autoIdentifierCheckbox).toBeChecked();
      await expect(registration.identifierInput).toBeDisabled();
      await registration.autoIdentifierCheckbox.uncheck();
      await expect(registration.identifierInput).toBeEnabled();
      await registration.autoIdentifierCheckbox.check();
      await expect(registration.identifierInput).toBeDisabled();
    });
  });

  test.describe('confirmation', () => {
    test('cannot be reached with required questions blank', async ({ page }) => {
      const registration = await RegistrationPage.open(page);
      await page.locator('#confirmation_label').click();
      await expect(page.locator('#confirmation')).toBeHidden();
      await expect(registration.submitButton).toBeHidden();
    });
  });

  test.describe('register', () => {
    test('saves the patient with a manual ZL EMR ID, an exact birthdate and every optional answer', async ({ page, api }) => {
      givenName = uniqueGivenName();
      const emrId = manualEmrId();
      const registration = await RegistrationPage.open(page);
      const addresses = await registration.fillRequired({
        givenName, familyName: NAME_FAMILY, gender: 'M', birthdate: { day: '15', month: 'March', year: '1985' },
        mothersName: 'Autoreg', contactName: 'Autocontact', contactRelationship: 'friend', contactPhone: '87654321',
      });
      await registration.fillPhoneNumber('1234-5678');
      await registration.passDuplicateCheck(); // the phone number is compared too, so the check runs again
      await registration.fillInsurance('AIC', '12AB');
      await registration.fillCivilStatus('Married');
      await registration.fillOccupation('Farmer');
      await registration.fillReligion('Catholic');
      await registration.fillManualIdentifier(emrId);
      await registration.fillIdCard('No');

      await registration.openConfirmation();
      await expect(registration.confirmationRows.filter({ hasText: 'Name:' }).first()).toContainText(`${NAME_FAMILY}, ${givenName}`);
      await expect(registration.confirmationRows.filter({ hasText: 'Registration Date:' })).toContainText('Today');
      await expect(registration.confirmationRows.filter({ hasText: 'ZL EMR ID:' })).toContainText(emrId);
      await registration.submitButton.click();

      // Print ID card = No: afterRegistration.page sends the clerk back to the search page
      await expect(page).toHaveURL(/registrationapp\/findPatient\.page/);
      await expect(page.getByRole('link', { name: `${NAME_FAMILY}, ${givenName}` })).toBeVisible();

      const [patient] = await findRegistered(api, givenName);
      expect(await findRegistered(api, givenName)).toHaveLength(1);
      expect(patient.person.names).toEqual([expect.objectContaining({ givenName, familyName: NAME_FAMILY })]);
      expect(patient.person.gender).toBe('M');
      expect(patient.person.birthdate).toMatch(/^1985-03-15/);
      expect(patient.person.birthdateEstimated).toBe(false);
      const [country, department, commune, section] = addresses.address;
      expect(patient.person.preferredAddress).toMatchObject({
        country, stateProvince: department, cityVillage: commune, address3: section, address1: null, address2: 'Rue Test',
      });
      expect(attribute(patient, "Mother's First Name")).toBe('Autoreg');
      expect(attribute(patient, 'Telephone Number')).toBe('1234-5678');

      // the ZL EMR ID is the one typed; assignDossierNumber added a Dossier Number; assignHealthCenter the Health Center
      const emrIdentifier = patient.identifiers.find((i) => i.identifierType.display === 'ZL EMR ID');
      expect(emrIdentifier).toMatchObject({ identifier: emrId, preferred: true });
      expect(patient.identifiers.find((i) => i.identifierType.display === 'Dossier Number')?.identifier).toBeTruthy();
      expect(attribute(patient, 'Health Center')).toMatchObject({ uuid: MIREBALAIS_VISIT_LOCATION_UUID });

      // the Patient Registration encounter, at the session location, by an Administrative Clerk, with the obs of the form
      const encounter = await getRegistrationEncounter(api, patient.uuid);
      expect(encounter.location.uuid).toBe(KLINIK_EKSTEN_LOCATION_UUID);
      expect(encounter.encounterProviders.map((p) => p.encounterRole.display)).toEqual(['Administrative Clerk']);
      const displays = encounter.obs.map((o) => o.display).join(' | ');
      for (const expected of ['Married', 'Farmer', 'Catholic', '12AB', 'AIC', 'Autocontact', 'friend', '87654321', 'ID Card Printing Requested: No']) {
        expect(displays).toContain(expected);
      }
      const groups = (concept: string) => encounter.obs.filter((o) => o.concept.display === concept).flatMap((o) => o.groupMembers ?? []).map((m) => m.display);
      expect(groups('Birthplace address construct')).toEqual(expect.arrayContaining(addresses.birthplace.map((v) => expect.stringContaining(v))));
      expect(groups('Questions on contacts of the patient')).toEqual(expect.arrayContaining(addresses.contactAddress.map((v) => expect.stringContaining(v))));

      // the registration summary page shows the patient and the encounter's widgets
      await page.goto(`registrationapp/registrationSummary.page?patientId=${patient.uuid}&appId=registrationapp.registerPatient`);
      await expect(page.locator('#coreapps-mostRecentRegistrationSummary')).toBeVisible();
      for (const id of ['insurance', 'social', 'contactPerson', 'healthCenter']) {
        await expect(page.locator(`#${id}`).first()).toBeVisible();
      }
      await expect(page.getByText(`${NAME_FAMILY},`).first()).toContainText(givenName);
    });

    test('saves a patient with an estimated age, a past registration date and an automatic ID, and goes to print the ID card', async ({ page, api }) => {
      givenName = uniqueGivenName();
      const registrationDate = new Date();
      registrationDate.setDate(registrationDate.getDate() - 5);
      const registration = await RegistrationPage.open(page);
      await registration.page.locator('#checkbox-enable-registration-date').uncheck();
      await registration.fillInput('registrationDateDay', String(registrationDate.getDate()));
      await registration.form.locator('#registrationDateMonth-field').selectOption({ label: MONTHS[registrationDate.getMonth()] });
      await registration.fillInput('registrationDateYear', String(registrationDate.getFullYear()));
      await registration.fillRequired({
        givenName, familyName: NAME_FAMILY, gender: 'F', estimatedAge: { years: '30', months: '5' },
        mothersName: 'Autoreg', contactName: 'Autocontact', contactRelationship: 'friend', contactPhone: '+509 8765 4321',
      });

      // printIdCard.page sends a print job to the site's ID card printer when it loads and records the attempt as an obs:
      // the request is answered with an empty page, so that only the redirect is tested
      await page.route('**/pihcore/patientRegistration/printIdCard.page*', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body></body></html>' }),
      );
      await registration.openConfirmation();
      await expect(registration.confirmationRows.filter({ hasText: 'Birthdate:' })).toContainText('30 year(s), 5 month(s)');
      await expect(registration.confirmationRows.filter({ hasText: 'ZL EMR ID:' })).toContainText('Automatically assign');
      await registration.submitButton.click();

      // Print ID card stayed on its default, Yes (V2)
      await expect(page).toHaveURL(/pihcore\/patientRegistration\/printIdCard\.page\?patientId=\d+/);

      const [patient] = await findRegistered(api, givenName);
      expect(patient.person.gender).toBe('F');
      expect(patient.person.birthdateEstimated).toBe(true);
      const ageYears = (Date.now() - new Date(patient.person.birthdate).getTime()) / (365.25 * 24 * 3600 * 1000);
      expect(ageYears).toBeGreaterThan(30.3); // 30 years 5 months = 30.42
      expect(ageYears).toBeLessThan(30.6);
      expect(patient.identifiers.find((i) => i.identifierType.display === 'ZL EMR ID')).toMatchObject({ preferred: true });
      expect(patient.identifiers.find((i) => i.identifierType.display === 'ZL EMR ID')?.identifier).toBeTruthy();
      expect(patient.identifiers.find((i) => i.identifierType.display === 'Dossier Number')?.identifier).toBeTruthy();
      expect(attribute(patient, 'Telephone Number')).toBeUndefined();

      // the encounter is dated with the registration date, and only the answered questions have obs
      const encounter = await getRegistrationEncounter(api, patient.uuid);
      const pad = (n: number) => String(n).padStart(2, '0');
      expect(encounter.encounterDatetime).toContain(`${registrationDate.getFullYear()}-${pad(registrationDate.getMonth() + 1)}-${pad(registrationDate.getDate())}`);
      const concepts = encounter.obs.map((o) => o.concept.display).sort();
      expect(concepts).toEqual(['Birthplace address construct', 'ID Card Printing Requested', 'Questions on contacts of the patient']);
    });
  });
});
