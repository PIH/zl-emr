import { expect, type Locator, type Page } from '@playwright/test';

// The registrationapp "Register a patient" wizard (registrationapp/registerPatient.page), driven through its left-hand
// navigator (#formBreadcrumb).
//
// - The navigator moves focus itself and refuses to leave a question that does not validate: it shows the error on the
//   current question and stays there. A field has to be clicked before it is filled, and left with Tab, otherwise the
//   `change` event the validation listens to never fires.
// - A valid question moves the focus to the next one on its own (a valid birthdate year, the last address level...), so
//   a step that fills a question re-opens it through the navigator first.
// - Inputs are addressed by `name` (the generated ids, `fr1234-field`, change on every render) and questions by their
//   fieldset id (`demographics-name`, `personAddressQuestion`, ...; see QUESTION).
// - "Possible duplicates" (registrationapp duplicateCheck.js) is a gate question after the phone number. It searches the
//   existing patients with the entries so far and, until that has finished and any matches have been reviewed, it fails
//   validation, so the navigator will not go past it. It checks again whenever the name, gender, birthdate, mother's name,
//   address or phone number changes: see passDuplicateCheck.
export const QUESTION = {
  registrationDate: 'registration-date',
  name: 'demographics-name',
  gender: 'demographics-gender',
  birthdate: 'demographics-birthdate',
  mothersName: 'mothersFirstNameLabel',
  address: 'personAddressQuestion',
  phone: 'phoneNumberLabel',
  duplicates: 'possibleDuplicatesLabel',
  insurance: 'insuranceNameLabel',
  birthplace: 'birthplaceLabel',
  civilStatus: 'civilStatusLabel',
  occupation: 'occupationLabel',
  religion: 'religionLabel',
  contactName: 'contactNameLabel',
  contactAddress: 'contactQuestionLabel',
  contactPhone: 'contactPhoneNumberQuestionLabel',
  identifier: 'patient-identifier-question',
  idCard: 'idcardLabel',
} as const;

// The four address hierarchy levels that are required; `address1` (locality) and `address2` (street) are free.
export const REQUIRED_ADDRESS_LEVELS = ['country', 'stateProvince', 'cityVillage', 'address3'] as const;

const CONTACT_PREFIX = 'obsgroup.PIH:PATIENT CONTACTS CONSTRUCT.obs.PIH:';
const INSURANCE_PREFIX = 'obsgroup.PIH:Insurance CONSTRUCT.obs.PIH:';

export class RegistrationPage {
  private constructor(readonly page: Page) {}

  static async open(page: Page): Promise<RegistrationPage> {
    await page.goto('registrationapp/registerPatient.page?appId=registrationapp.registerPatient');
    const registration = new RegistrationPage(page);
    await expect(page.getByRole('heading', { name: 'Register a patient' })).toBeVisible();
    await expect(registration.form).toBeVisible();
    return registration;
  }

  // ── Locators ───────────────────────────────────────────────────────────────
  get form() {
    return this.page.locator('#registration');
  }
  input(name: string): Locator {
    return this.form.locator(`input[name="${name}"]`);
  }
  question(id: string): Locator {
    return this.form.locator(`fieldset#${id}`);
  }
  navItem(label: string): Locator {
    const exact = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    return this.page.locator('#formBreadcrumb li.question-legend > span').filter({ hasText: exact });
  }
  /** Labels of the sections (Demographics, Contact Info, ...) in the navigator, in order. */
  sectionLabels(): Promise<string[]> {
    return this.page.locator('#formBreadcrumb li.doing > span').allInnerTexts();
  }
  /** Labels of the questions in the navigator, in order. */
  questionLabels(): Promise<string[]> {
    return this.page.locator('#formBreadcrumb li.question-legend > span').allInnerTexts();
  }
  get submitButton() {
    return this.page.locator('#submit');
  }
  get confirmationRows() {
    return this.page.locator('#dataCanvas p');
  }
  /** The visible validation messages of a question. */
  errors(questionId: string): Locator {
    return this.question(questionId).locator('span.field-error:visible');
  }

  // ── Navigation and checks ──────────────────────────────────────────────────
  async goTo(label: string) {
    await this.navItem(label).click();
  }
  async expectFocused(questionId: string) {
    await expect(this.question(questionId)).toHaveClass(/focused/);
  }
  /** Asserts the question shows exactly these messages (once each, in order). */
  async expectErrors(questionId: string, messages: Array<string | RegExp>) {
    await expect(this.errors(questionId)).toHaveText(messages);
  }

  // ── Filling ────────────────────────────────────────────────────────────────
  async fillInput(name: string, value: string) {
    const field = this.input(name);
    await field.click();
    await field.fill(value);
    await field.press('Tab');
  }

  async fillName(givenName: string, familyName: string) {
    await this.goTo('Name');
    await this.fillInput('familyName', familyName);
    await this.fillInput('givenName', givenName);
  }
  async fillGender(gender: 'M' | 'F') {
    await this.goTo('Gender');
    await this.form.locator('#gender-field').selectOption(gender);
  }
  async fillBirthdate(day: string, month: string, year: string) {
    await this.goTo('Birthdate');
    await this.fillInput('birthdateDay', day);
    await this.form.locator('#birthdateMonth-field').selectOption({ label: month });
    await this.fillInput('birthdateYear', year);
  }
  async fillEstimatedAge(years: string, months: string) {
    await this.goTo('Birthdate');
    await this.fillInput('birthdateYears', years);
    await this.fillInput('birthdateMonths', months);
  }
  async fillMothersName(name: string) {
    await this.goTo("Mother's First Name");
    await this.fillInput('mothersFirstName', name);
  }

  /**
   * Fills the four required levels of an address hierarchy question with the first suggestion of each level (the
   * suggestions are the server's address hierarchy, so no value is assumed) and returns what was selected, from
   * country to section communale. A suggestion has to be clicked: typing and Enter does not select it.
   */
  async pickAddress(questionId: string): Promise<string[]> {
    const levels = this.question(questionId).locator('input.level');
    const picked: string[] = [];
    for (let i = 0; i < REQUIRED_ADDRESS_LEVELS.length; i++) {
      await levels.nth(i).click();
      const suggestion = this.page.locator('ul.ui-autocomplete:visible li').filter({ hasText: /\S/ }).first();
      await suggestion.click();
      picked.push(await levels.nth(i).inputValue());
    }
    // picking the last required level opens the (long) list of the next level, which covers the fields below it
    const list = this.page.locator('ul.ui-autocomplete:visible');
    await list.first().waitFor({ timeout: 5000 }).catch(() => undefined);
    await this.page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    return picked;
  }
  addressLevel(questionId: string, level: number): Locator {
    return this.question(questionId).locator('input.level').nth(level);
  }
  /** Fills the address, the free text street included, and returns the selected levels. */
  async fillAddress(street: string): Promise<string[]> {
    await this.goTo('Address');
    const picked = await this.pickAddress(QUESTION.address);
    await this.fillInput('address2', street);
    return picked;
  }
  async fillPhoneNumber(phone: string) {
    await this.goTo('Phone Number');
    await this.fillInput('phoneNumber', phone);
  }
  /**
   * Whether this wizard has the "Possible duplicates" question (pihcore `showDuplicatePatientSection`: a server that does not have the feature yet
   * lacks it, and then the phone number is followed directly by the insurance).
   */
  async hasDuplicateCheck(): Promise<boolean> {
    return (await this.question(QUESTION.duplicates).count()) > 0;
  }
  /** The question that has the focus after a valid phone number: "Possible duplicates" where the wizard has it, else the insurance. */
  async questionAfterPhone(): Promise<string> {
    return (await this.hasDuplicateCheck()) ? QUESTION.duplicates : QUESTION.insurance;
  }
  /**
   * Gets past "Possible duplicates": waits for the search to finish, then presses the button of the question, which is
   * "Continue" when nothing similar was found and "None of these is the patient" when something was (the test server's
   * patients decide which, so both are handled). It moves on to Company Name. Call it again after changing an entry the
   * search compares (see the header), which makes the question fail validation until it is passed again. Does nothing on a wizard
   * without the question; returns whether it passed one.
   */
  async passDuplicateCheck(): Promise<boolean> {
    if (!(await this.hasDuplicateCheck())) {
      return false;
    }
    await this.goTo('Possible duplicates');
    const button = this.page.locator('#duplicates-none');
    await expect(button).not.toHaveText(/checking/i);
    await button.click();
    return true;
  }

  async fillInsurance(company: string, policyNumber: string) {
    await this.goTo('Company Name');
    await this.question(QUESTION.insurance).locator('select').selectOption({ label: company });
    await this.fillInput(`${INSURANCE_PREFIX}Insurance policy number`, policyNumber);
  }
  async fillBirthplace(): Promise<string[]> {
    await this.goTo('Place of Birth');
    return this.pickAddress(QUESTION.birthplace);
  }
  async fillCivilStatus(status: string) {
    await this.goTo('Civil Status');
    await this.question(QUESTION.civilStatus).locator('select').selectOption({ label: status });
  }
  /** The occupation is a select shown as an autocomplete box: type, then click the suggestion. */
  async fillOccupation(occupation: string) {
    await this.goTo('Occupation');
    const box = this.question(QUESTION.occupation).locator('input.dropdown-field-textbox');
    // the list is re-rendered while the typed text filters it, so a click on a stale entry can pick another occupation
    await expect(async () => {
      await box.click();
      await box.fill(occupation);
      const option = this.page.locator('ul.ui-autocomplete:visible li').filter({ hasText: new RegExp(`^\\s*${occupation}\\s*$`) });
      await expect(option).toHaveCount(1, { timeout: 2000 });
      await option.click();
      await expect(box).toHaveValue(occupation, { timeout: 2000 });
    }).toPass({ timeout: 20000 });
  }
  async fillReligion(religion: string) {
    await this.goTo('Religion');
    await this.question(QUESTION.religion).locator('select').selectOption({ label: religion });
  }

  async fillContactNameAndRelationship(name: string, relationship: string) {
    await this.goTo('Contact Name');
    await this.fillInput(`${CONTACT_PREFIX}NAMES AND FIRSTNAMES OF CONTACT`, name);
    await this.fillInput(`${CONTACT_PREFIX}RELATIONSHIPS OF CONTACT`, relationship);
  }
  async fillContactAddress(): Promise<string[]> {
    await this.goTo('Contact Address');
    return this.pickAddress(QUESTION.contactAddress);
  }
  async fillContactPhone(phone: string) {
    await this.goTo('Contact Phone Number');
    await this.fillInput(`${CONTACT_PREFIX}TELEPHONE NUMBER OF CONTACT`, phone);
  }
  get contactPhoneName() {
    return `${CONTACT_PREFIX}TELEPHONE NUMBER OF CONTACT`;
  }

  get autoIdentifierCheckbox() {
    return this.page.locator('#checkbox-autogenerate-identifier');
  }
  get identifierInput() {
    return this.page.locator('#patient-identifier');
  }
  /** Turns off "Automatically assign" and types the ZL EMR ID (the profile has to allow manual entry). */
  async fillManualIdentifier(identifier: string) {
    await this.goTo('ZL EMR ID');
    await this.autoIdentifierCheckbox.uncheck();
    await this.identifierInput.click();
    await this.identifierInput.fill(identifier);
    await this.identifierInput.press('Tab');
  }
  async fillIdCard(answer: 'Yes' | 'No') {
    await this.goTo('Print ID card');
    await this.question(QUESTION.idCard).locator('select').selectOption({ label: answer });
  }

  // ── Required answers and saving ────────────────────────────────────────────
  /** Fills every required question of the Haiti form with the given person, and returns the addresses it selected. */
  async fillRequired(person: {
    givenName: string;
    familyName: string;
    gender: 'M' | 'F';
    birthdate?: { day: string; month: string; year: string };
    estimatedAge?: { years: string; months: string };
    mothersName: string;
    contactName: string;
    contactRelationship: string;
    contactPhone: string;
  }) {
    await this.fillName(person.givenName, person.familyName);
    await this.fillGender(person.gender);
    if (person.birthdate) {
      await this.fillBirthdate(person.birthdate.day, person.birthdate.month, person.birthdate.year);
    } else if (person.estimatedAge) {
      await this.fillEstimatedAge(person.estimatedAge.years, person.estimatedAge.months);
    }
    await this.fillMothersName(person.mothersName);
    const address = await this.fillAddress('Rue Test');
    await this.passDuplicateCheck();
    const birthplace = await this.fillBirthplace();
    await this.fillContactNameAndRelationship(person.contactName, person.contactRelationship);
    const contactAddress = await this.fillContactAddress();
    await this.fillContactPhone(person.contactPhone);
    return { address, birthplace, contactAddress };
  }

  async openConfirmation() {
    await this.page.locator('#confirmation_label').click();
    await expect(this.page.locator('#confirmation')).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }
  /**
   * Submits the confirmation. The profile's afterCreatedUrl (pihcore/patientRegistration/afterRegistration.page) is a
   * server-side redirect, so the browser ends on printIdCard.page (Print ID card = Yes) or registrationapp/findPatient.page.
   */
  async submit() {
    await this.submitButton.click();
    await this.page.waitForURL(/printIdCard\.page|findPatient\.page/);
  }
}
