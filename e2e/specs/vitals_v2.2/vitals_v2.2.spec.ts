import { type Page, type APIRequestContext } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type EntryContext } from '../../core';
import { VITALS_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs, VISIT_PAGE_URL, visitPagePath } from '../../pages';

// vitals_v2.2.xml: "Vitals" v2.2, the one-question-per-screen (Simple UI) vitals: height, weight, BMI, temperature, pulse,
// respiratory rate, BP, SpO2, MUAC, head circumference, MUAC/HC ratio, chief complaint (11 obs; no MAP, glucose, GCS, RASS,
// air supply, pain). Entered with the Simple UI through the direct URL in a visit the fixture creates (local helper openSimple),
// EDIT with editHtmlFormWithSimpleUi. Availability is not exercised (component flag, privilege, Vitals Location tag, retro
// gating): the spec opens the form directly. Legacy form: Haiti enters vitals.xml (v3.0); v2.2 (own formUuid 68728aa6-...) is reached
// only when editing encounters saved with it (_availability.e2e.md), so the EDIT tests are the production-relevant ones. Depends on the session location carrying the "Vitals Location" tag: the location
// select (#encounterLocation) is preselected with it. The unit converters are ExitHandlers, which only the Simple UI defines.
//
// Conditions in the form, from documentation inventory (vitals_v2.2.inv.md); ages are as of today (ENTER):
//   includeIf age > 5                :153, :530  BMI script / BMI question; the same block adds class "expected" to the BP inputs (:196)
//   includeIf age < 13 or female     :238, :622  cm<->mm script AND the MUAC question (cm input + mm obs): gated together
//   includeIf age < 3                :321, :661  ratio script / head circumference + MUAC/HC ratio questions
//   includeIf !visit.open + retro privilege :402-:452  provider/date fieldset for a closed visit; the open-visit branch (:452)
//     is its exact complement (the duplicate #encounterDate is a false positive). The fixture visit is open: only :452 renders.
//   ifMode VIEW (include true/false) :27-:638  view-only vs entry-only blocks (VIEW: on the visit page, see the two save tests)
// Scripts: ExitHandlers :90-150 inches -> cm (x2.54), lbs -> kg (/2.2), Fahrenheit -> Celsius ((F-32)*5/9), one decimal, the
//   source field is cleared on exit; BMI :155-195 = kg/(cm/100)^2, one decimal, shown on its question, hidden when a value is
//   missing; cm -> mm (x10, :240-264) and mm -> cm (/10, :266-273) on leaving the MUAC question, cm shown again from the saved mm
//   on load (EDIT, :279-284); ratio :322-362 = (mm/10)/HC, one decimal. Free converter inputs carry min/max (cm 5-50, F 77-109,
//   inches 4-89, lbs 0.3-550): a violation shows "Minimum: n"/"Maximum: n" and blocks moving forward.
// Side effects on save: one Vitals encounter (4fb47712-...); no program, order or disposition. Converter inputs are not saved.
// LEGACY VERSION (not tagged @unreachable: a versioned copy is outside the reachability count; whether the visit page's edit pencil opens it for old encounters is unverified): legacy form, no profile offers it (documentation/_availability.e2e.md "Not reachable": Haiti enters vitals.xml, v3.0; v2.2 is
//   reached only when editing an encounter saved with it). Tests open it by direct URL.
// Not covered: the VIEW scripts' output other than the BMI (ratio :363, MUAC in cm :204; they do run on the visit page), the visit-page launch and retro-entry gating, the closed-visit provider/date fieldset (needs a retro
//   privilege), the VIEW-only scripts, EPLD behaviour (_shared.e2e.md), the Standard UI beyond V3.
//
// Differences from the siblings (vitalsInpatient / vitalsPregnant), each verified here: MUAC (mm) is bound to the MUAC concept
//   (saved as "Middle upper arm circumference (mm)"); the MUAC question is gated like its script, so there is no dead cm
//   input for men over 12; no duplicate height_cm id; no MAP/glucose/air/GCS/RASS/pain questions.
//
// Findings:
//   V1 Medium :256-264,:266-273  cmExitHandler converts cm -> mm whenever the cm field has a value, on every exit from the MUAC
//                          question: once cm was typed or (EDIT :279-284) prefilled, a new mm value is reverted to cm*10. So in EDIT
//                          every correction of a saved MUAC is silently undone. Fix: convert only the field that changed (clear
//                          the other one, as the inches/lbs/F handlers do). (TESTED, test.fixme, ENTER and EDIT)
//   V2 Low    :241-243     convertCmToMm = cm*10 without rounding: 15.35 cm gives 153.5 mm, and the integer-only mm obs rejects it
//                          on Confirm ("Must be a whole number" on a field the user did not type); with V1 typing a whole mm
//                          does not help (the cm handler writes 153.5 back): only clearing cm does. Fix: Math.round(cm * 10). (TESTED)
//   V3 Info   :90-150,:252-264  Standard UI throws "ExitHandlers is not defined": no converter runs there (TESTED).
//   V4 Info   :196         "expected" is added to the BP inputs only when age > 5 (the code sits inside the BMI includeIf); the
//                          comment says nothing about age. May be accidental (TESTED: class present for age 6, absent for 5).

const FORM = 'vitals_v2.2.xml';

// Local helpers.
const openSimple = async (page: Page, context: EntryContext) => {
  await page.goto(EntryFormPage.enterUrl(FORM, context).replace('enterHtmlFormWithStandardUi', 'enterHtmlFormWithSimpleUi'));
  await page.waitForLoadState('networkidle');
  await expect(page.locator('li.question-legend').first()).toBeVisible();
};
const editSimple = async (page: Page, context: EntryContext, encounterUuid: string) => {
  const params = new URLSearchParams({
    patientId: context.patient.uuid,
    visitId: context.visitUuid,
    encounterId: encounterUuid,
    definitionUiResource: `file:configuration/pih/htmlforms/${FORM}`,
    returnUrl: visitPagePath(context.visitUuid),
  });
  await page.goto(`htmlformentryui/htmlform/editHtmlFormWithSimpleUi.page?${params.toString()}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('li.question-legend').first()).toBeVisible();
};
// The first breadcrumb li holds every label run together, hence the anchored regex.
const goTo = async (page: Page, label: string) => {
  await page.locator('#formBreadcrumb li', { hasText: new RegExp(`^\\s*${label}\\s*$`) }).click();
};
const fillQuestion = async (page: Page, label: string, selector: string, value: string) => {
  await goTo(page, label);
  await page.locator(selector).fill(value);
};
const saveSimple = async (page: Page) => {
  await goTo(page, 'Confirm');
  await page.locator('#confirmationQuestion button.submitButton').click();
  await expect(page).toHaveURL(VISIT_PAGE_URL);
};
const newPatient = (createEntryContext: CustomTestFixtures['createEntryContext'], gender: 'M' | 'F', age: number) =>
  createEntryContext({ givenName: 'AutoVitalsTwo', familyName: 'Tester', gender, birthdate: birthdateYearsAgo(age) });
const savedVitals = async (api: APIRequestContext, patientUuid: string) => {
  const encounters = await getPatientEncounters(api, patientUuid);
  expect(encounters).toHaveLength(1);
  expect(encounters[0].encounterType.uuid).toBe(VITALS_ENCOUNTER_TYPE_UUID);
  return {
    encounterUuid: encounters[0].uuid,
    displays: (await getEncounterObs(api, encounters[0].uuid)).map((o) => o.display),
  };
};
// An adult woman whose only answer is a MUAC of 15 cm (saved as 150 mm), for the EDIT tests.
const saveMuacOnly = async (page: Page, api: APIRequestContext, context: EntryContext) => {
  await openSimple(page, context);
  await fillQuestion(page, 'MUAC', '#muac_cm', '15');
  await saveSimple(page);
  return (await savedVitals(api, context.patient.uuid)).encounterUuid;
};

test.describe('vitals_v2.2', () => {
  // includeIf :153/:530 (BMI + "expected"), :238/:622 (MUAC), :321/:661 (head circumference + ratio)
  const profiles = [
    { name: 'adult woman', gender: 'F', age: 30, bmi: true, muac: true, head: false },
    { name: 'adult man (no MUAC question)', gender: 'M', age: 30, bmi: true, muac: false, head: false },
    { name: '13 year old boy', gender: 'M', age: 13, bmi: true, muac: false, head: false },
    { name: '12 year old boy', gender: 'M', age: 12, bmi: true, muac: true, head: false },
    { name: '6 year old boy', gender: 'M', age: 6, bmi: true, muac: true, head: false },
    { name: '5 year old boy (age > 5 is false)', gender: 'M', age: 5, bmi: false, muac: true, head: false },
    { name: '3 year old girl (age < 3 is false)', gender: 'F', age: 3, bmi: false, muac: true, head: false },
    { name: '2 year old boy', gender: 'M', age: 2, bmi: false, muac: true, head: true },
  ] as const;

  for (const p of profiles) {
    test(`age/gender conditional questions for the ${p.name}`, async ({ page, createEntryContext }) => {
      const context = await newPatient(createEntryContext, p.gender, p.age);
      await openSimple(page, context);
      await expect(page.locator('#weight_kg')).toHaveCount(1);

      await expect(page.locator('#calculated-bmi-wrapper')).toHaveCount(p.bmi ? 1 : 0);
      await expect(page.locator('#bp_systolic > input.expected')).toHaveCount(p.bmi ? 1 : 0); // V4
      await expect(page.locator('#bp_diastolic > input.expected')).toHaveCount(p.bmi ? 1 : 0);
      // the MUAC question and its cm input are gated together (:622): no dead cm input
      await expect(page.locator('#muac_cm')).toHaveCount(p.muac ? 1 : 0);
      await expect(page.locator('#muac_mm')).toHaveCount(p.muac ? 1 : 0);
      await expect(page.locator('#formBreadcrumb li', { hasText: /^\s*MUAC\s*$/ })).toHaveCount(p.muac ? 1 : 0);
      await expect(page.locator('#head_cm')).toHaveCount(p.head ? 1 : 0);
      await expect(page.locator('#calculated-ratio-wrapper')).toHaveCount(p.head ? 1 : 0);
    });
  }

  test('Simple UI: inches, lbs and Fahrenheit fill the metric fields and clear the source field; BMI follows', async ({ page, createEntryContext }) => {
    // ExitHandlers :90-150: 70 in = 177.8 cm, 154 lb = 70.0 kg, 100 F = 37.8 C; BMI :155-195 = 70 / 1.778^2 = 22.1
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await fillQuestion(page, 'Height', '#height_inches', '70');
    await fillQuestion(page, 'Weight', '#weight_lbs', '154');
    await expect(page.locator('#height_cm input')).toHaveValue('177.8');
    await expect(page.locator('#height_inches')).toHaveValue('');
    await goTo(page, '\\(Calculated\\) BMI');
    await expect(page.locator('#weight_kg input')).toHaveValue('70.0');
    await expect(page.locator('#weight_lbs')).toHaveValue('');
    await expect(page.locator('#calculated-bmi')).toHaveText('22.1');
    await fillQuestion(page, 'Temperature', '#temperature_f', '100');
    await goTo(page, 'Heart Rate');
    await expect(page.locator('#temperature_c input')).toHaveValue('37.8');
    await expect(page.locator('#temperature_f')).toHaveValue('');
  });

  test('Simple UI: BMI is shown only when both weight and height have a value', async ({ page, createEntryContext }) => {
    // updateBmi :166-181: hide the value and keep the instructions when either is missing
    const context = await newPatient(createEntryContext, 'M', 30);
    await openSimple(page, context);
    await fillQuestion(page, 'Height', '#height_cm input', '170');
    await goTo(page, '\\(Calculated\\) BMI');
    await expect(page.locator('#calculated-bmi-wrapper')).toBeHidden();
    await expect(page.locator('#no-calculated-bmi')).toBeVisible();
    await fillQuestion(page, 'Weight', '#weight_kg input', '70');
    await goTo(page, '\\(Calculated\\) BMI');
    await expect(page.locator('#calculated-bmi-wrapper')).toBeVisible();
    await expect(page.locator('#calculated-bmi')).toHaveText('24.2');
    await expect(page.locator('#no-calculated-bmi')).toBeHidden();
    await fillQuestion(page, 'Weight', '#weight_kg input', '');
    await goTo(page, '\\(Calculated\\) BMI');
    await expect(page.locator('#calculated-bmi-wrapper')).toBeHidden();
  });

  test('Simple UI: MUAC converts cm to mm, and mm to cm while cm is empty (adult woman)', async ({ page, createEntryContext }) => {
    // cmExitHandler :252-258, mmExitHandler :259-264
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await fillQuestion(page, 'MUAC', '#muac_cm', '15');
    await goTo(page, 'Chief Complaint');
    await expect(page.locator('#muac_mm input')).toHaveValue('150');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await fillQuestion(page, 'MUAC', '#muac_mm input', '200');
    await goTo(page, 'Chief Complaint');
    await expect(page.locator('#muac_cm')).toHaveValue('20');
  });

  test('Simple UI: the MUAC/HC ratio is calculated for a child under 3 and hidden while a value is missing', async ({ page, createEntryContext }) => {
    // ratio :322-362: (mm/10)/HC = (150/10)/50 = 0.3; the mm comes from cm 15 through the cm handler
    const context = await newPatient(createEntryContext, 'M', 2);
    await openSimple(page, context);
    await fillQuestion(page, 'MUAC', '#muac_cm', '15');
    await fillQuestion(page, 'Head Circumference', '#head_cm input', '50');
    await goTo(page, '\\(Calculated\\) MUAC/HC');
    await expect(page.locator('#calculated-ratio')).toHaveText('0.3');
    await expect(page.locator('#no-calculated-ratio')).toBeHidden();
    await fillQuestion(page, 'Head Circumference', '#head_cm input', '');
    await goTo(page, '\\(Calculated\\) MUAC/HC');
    await expect(page.locator('#calculated-ratio-wrapper')).toBeHidden();
  });

  test('a converter input outside its range shows the message and blocks moving forward', async ({ page, createEntryContext }) => {
    // min/max on the free inputs: MUAC cm 5-50 (:641), Fahrenheit 77-109 (:562)
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await fillQuestion(page, 'MUAC', '#muac_cm', '4');
    await goTo(page, 'Chief Complaint');
    await expect(page.locator('span.field-error:visible', { hasText: 'Minimum: 5' })).toBeVisible();
    await expect(page.locator('li.question-legend.focused', { hasText: /^\s*MUAC\s*$/ })).toBeVisible();
    await page.locator('#muac_cm').fill('51');
    await goTo(page, 'Chief Complaint');
    await expect(page.locator('span.field-error:visible', { hasText: 'Maximum: 50' })).toBeVisible();
    await page.locator('#muac_cm').fill('15');
    await goTo(page, 'Chief Complaint');
    await expect(page.locator('#chief_complaint input')).toBeVisible();

    await fillQuestion(page, 'Temperature', '#temperature_f', '120');
    await goTo(page, 'Heart Rate');
    await expect(page.locator('span.field-error:visible', { hasText: 'Maximum: 109' })).toBeVisible();
    await expect(page.locator('li.question-legend.focused', { hasText: /^\s*Temperature\s*$/ })).toBeVisible();
  });

  test('a value outside the concept range (pulse 999) blocks the save', async ({ page, api, createEntryContext }) => {
    // numeric range of the concept (not form specific): pulse max 300
    const context = await newPatient(createEntryContext, 'M', 30);
    await openSimple(page, context);
    await fillQuestion(page, 'Heart Rate', '#heart_rate input', '999');
    await goTo(page, 'Confirm');
    await expect(page.locator('span.field-error:visible', { hasText: 'Maximum: 300' })).toBeVisible();
    await expect(page.locator('#confirmationQuestion button.submitButton')).toBeHidden();
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('saving without a location does not save (required encounter location)', async ({ page, api, createEntryContext }) => {
    // encounterLocation :433 / :469 (open visit: :452 branch): preselected with the session location; blank it
    const context = await newPatient(createEntryContext, 'M', 30);
    await openSimple(page, context);
    await fillQuestion(page, 'Heart Rate', '#heart_rate input', '80');
    await goTo(page, 'Details');
    await page.locator('#encounterLocation select').selectOption({ index: 0 });
    await goTo(page, 'Confirm');
    await expect(page.locator('span.field-error:visible').first()).toBeVisible();
    await expect(page.locator('#confirmationQuestion button.submitButton')).toBeHidden();
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('saves the vitals as one Vitals encounter with the MUAC bound to the MUAC concept', async ({ page, api, createEntryContext }) => {
    // all 10 obs of an adult woman; the cm field, the BMI and the converter inputs are not saved (exact count)
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await fillQuestion(page, 'Height', '#height_cm input', '170');
    await fillQuestion(page, 'Weight', '#weight_kg input', '70');
    await fillQuestion(page, 'Temperature', '#temperature_c input', '37.5');
    await fillQuestion(page, 'Heart Rate', '#heart_rate input', '80');
    await fillQuestion(page, 'Respiratory Rate', '#respiratory_rate input', '18');
    await fillQuestion(page, 'Blood Pressure', '#bp_systolic input', '120');
    await page.locator('#bp_diastolic input').fill('80');
    await fillQuestion(page, 'O2 Sat', '#o2_sat input', '98');
    await fillQuestion(page, 'MUAC', '#muac_cm', '15');
    await fillQuestion(page, 'Chief Complaint', '#chief_complaint input', 'cough');
    await saveSimple(page);

    const { displays, encounterUuid } = await savedVitals(api, context.patient.uuid);
    expect([...displays].sort()).toEqual(
      [
        'Height (cm): 170.0',
        'Weight (kg): 70.0',
        'Temperature (C): 37.5',
        'Pulse: 80',
        'Respiratory rate: 18',
        'Systolic: 120',
        'Diastolic: 80',
        'Blood oxygen saturation: 98',
        'Middle upper arm circumference (mm): 150',
        'Chief complaint (text): cough',
      ].sort(),
    );

    // VIEW :27-86 template (legends hidden, one h3 per question); the VIEW script :155 computes the BMI on the visit page (170 cm, 70 kg)
    const view = (await expectViewShowsSavedObs(page, api, FORM, encounterUuid)).page;
    await expect(view.locator('#calculated-bmi')).toHaveText('24.2');
    await expect(view.locator('#height_cm .value')).toContainText('170');
    await expect(view.locator('#bp_systolic .value')).toContainText('120');
    await expect(view.locator('#bp_diastolic .value')).toContainText('80');
    await expect(view.locator('#muac_mm .value')).toContainText('150'); // saved in mm (the cm field is not an obs)
    await expect(view.locator('#chief_complaint .value')).toContainText('cough');
    await expect(view.locator('#head_cm')).toHaveCount(0); // :661 not offered to an adult
    // ifMode VIEW include=false :165, :251, :486 ...: the converter inputs and the retro-entry fieldset are not in the VIEW
    await expect(view.locator('#height_inches, #weight_lbs, #temperature_f, #muac_cm, #encounterLocation select')).toHaveCount(0);
  });

  test('saves the head circumference of a child under 3; the calculated ratio is not saved', async ({ page, api, createEntryContext }) => {
    // :661 questions; ratio :322-362 only fills a hidden helper input
    const context = await newPatient(createEntryContext, 'F', 2);
    await openSimple(page, context);
    await fillQuestion(page, 'MUAC', '#muac_mm input', '140');
    await fillQuestion(page, 'Head Circumference', '#head_cm input', '45');
    await saveSimple(page);
    const { displays, encounterUuid } = await savedVitals(api, context.patient.uuid);
    expect(displays).toHaveLength(2);
    expect(displays).toEqual(expect.arrayContaining(['Middle upper arm circumference (mm): 140']));
    expect(displays.filter((d) => /head circumference.*45/i.test(d))).toHaveLength(1);

    // VIEW: the head circumference is shown; what was not filled in (height, chief complaint) is not shown as a value
    const view = (await expectViewShowsSavedObs(page, api, FORM, encounterUuid)).page;
    await expect(view.locator('#head_cm .value')).toContainText('45');
    await expect(view.locator('#muac_mm .value')).toContainText('140');
    await expect(view.locator('#height_cm .value, #weight_kg .value, #chief_complaint .value')).toHaveCount(0);
  });

  test('EDIT (Simple UI): the cm field and the BMI are filled again from the saved values', async ({ page, api, createEntryContext }) => {
    // on-load script :279-284 (cm from the saved mm); BMI :155-195 runs on load (:183-185)
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await fillQuestion(page, 'Height', '#height_cm input', '170');
    await fillQuestion(page, 'Weight', '#weight_kg input', '70');
    await fillQuestion(page, 'MUAC', '#muac_cm', '15');
    await saveSimple(page);
    const { encounterUuid } = await savedVitals(api, context.patient.uuid);

    await editSimple(page, context, encounterUuid);
    await goTo(page, 'MUAC');
    await expect(page.locator('#muac_cm')).toHaveValue('15');
    await expect(page.locator('#muac_mm input')).toHaveValue('150');
    await goTo(page, '\\(Calculated\\) BMI');
    await expect(page.locator('#calculated-bmi')).toHaveText('24.2');
  });

  test('V2: a MUAC of 15.35 cm gives 153.5 mm, which Confirm rejects on the field the user did not type', async ({ page, api, createEntryContext }) => {
    // :241-243 no rounding; the mm obs is integer-only. V1 makes it worse: a whole mm typed afterwards is overwritten again.
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await fillQuestion(page, 'MUAC', '#muac_cm', '15.35');
    await goTo(page, 'Chief Complaint');
    await expect(page.locator('#muac_mm input')).toHaveValue('153.5');
    await goTo(page, 'Confirm');
    await expect(page.locator('span.field-error:visible', { hasText: 'Must be a whole number' })).toBeVisible();
    await expect(page.locator('li.question-legend.focused', { hasText: /^\s*MUAC\s*$/ })).toBeVisible();
    await expect(page.locator('#confirmationQuestion button.submitButton')).toBeHidden();

    await page.locator('#muac_mm input').fill('154'); // V1: leaving the question writes cm*10 back
    await goTo(page, 'Chief Complaint');
    await goTo(page, 'MUAC');
    await expect(page.locator('#muac_mm input')).toHaveValue('153.5');
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);

    await page.locator('#muac_cm').fill(''); // the only way out: clear cm, then type the whole mm
    await page.locator('#muac_mm input').fill('154');
    await goTo(page, 'Confirm');
    await expect(page.locator('#muac_mm input')).toHaveValue('154');
    await expect(page.locator('#confirmationQuestion button.submitButton')).toBeVisible();
  });

  // remove test.fixme() when V1 is fixed
  test.fixme('V1: a MUAC typed in mm after one in cm replaces it, and cm follows (ENTER)', async ({ page, createEntryContext }) => {
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await fillQuestion(page, 'MUAC', '#muac_cm', '15');
    await goTo(page, 'Chief Complaint'); // leave: cm 15 -> mm 150
    await fillQuestion(page, 'MUAC', '#muac_mm input', '200');
    await goTo(page, 'Chief Complaint'); // leave: cmExitHandler writes 150 back
    await expect(page.locator('#muac_mm input')).toHaveValue('200');
    await expect(page.locator('#muac_cm')).toHaveValue('20');
  });

  // remove test.fixme() when V1 is fixed
  test.fixme('V1: correcting a saved MUAC in mm is kept (EDIT, cm is prefilled)', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext, 'F', 30);
    const encounterUuid = await saveMuacOnly(page, api, context);
    await editSimple(page, context, encounterUuid);
    await fillQuestion(page, 'MUAC', '#muac_mm input', '200');
    await goTo(page, 'Chief Complaint');
    await expect(page.locator('#muac_mm input')).toHaveValue('200');
  });

  test('V3: in the Standard UI the converter scripts do not throw "ExitHandlers is not defined" (HAI-1277, remove test.fixme() when fixed)', async ({ page, createEntryContext }) => {
    test.fixme(); // HAI-1277
    // :90-150, :252-264 register ExitHandlers, which only the Simple UI defines (vitals.xml, not this version, is the Standard UI form)
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const context = await newPatient(createEntryContext, 'F', 30);
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#weight_kg')).toHaveCount(1);
    expect(errors.filter((m) => /ExitHandlers/.test(m))).toEqual([]);
  });
});
