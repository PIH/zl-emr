import { type Page, type APIRequestContext } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type EntryContext } from '../../core';
import { VITALS_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs, VISIT_PAGE_URL } from '../../pages';

// vitalsInpatient.xml v2.2: legacy "Vitals (inpatient)" (one question per screen: height, weight, BMI, temperature, HR, RR,
// BP, SpO2, MUAC, MAP, glucose, O2 flow, GCS, RASS, pain, head circumference, MUAC/HC ratio, chief complaint). Nothing
// launches it (_availability.e2e.md: unreferenced; same encounter type as vitals.xml, edit would use the Simple UI), so there
// is no production URL. It was written for the Simple UI (its unit converters are ExitHandlers, which exist only there), so
// the behaviour tests open enterHtmlFormWithSimpleUi (local helper openSimple); the render-only tests use the Standard UI.
// The location select (tag "Vitals Inpatient Location") has no option on this server, and the form cannot be saved or
// even left past "Details" without one (V3): the helper pickLocation copies the session location's option value from
// vitals.xml into the select. The value is never logged.
//
// Conditions in the form, from documentation inventory (vitalsInpatient.inv.md); ages as of today (ENTER):
//   includeIf age > 5               :185, :538   BMI script / BMI question
//   includeIf (age < 13 or female)  :262         cm<->mm script only; the MUAC question itself (:639) is ungated (V4)
//   includeIf age < 3               :336, :787   MUAC/HC ratio script, head circumference and ratio questions
//   includeIf !visit.open and a retro privilege :413 / :422 / :432 / :458: provider+date "Details" fieldset for a closed visit;
//     the open-visit branch (:458) is its exact complement. The fixture visit is open, so only :458 renders.
//   ifMode VIEW (include true/false) :28-:776  view-only vs entry-only blocks (VIEW: getAsHtml.action, see the save test)
// Scripts (all ExitHandlers, i.e. Simple UI only, :103-176, :273-296): inches -> cm (x2.54), lbs -> kg (/2.2), Fahrenheit -> Celsius
//   ((F-32)*5/9), mg/dL -> mmol/L (/18), each one decimal and clearing the source field on exit; cm -> mm (x10, no rounding) and
//   mm -> cm (/10); BMI = kg/(cm/100)^2 :196-222; ratio = (mm/10)/HC :347-373; the "expected" BP class :224.
// Side effects on save: none. Encounter type 4fb47712-... (Vitals).
// Not covered: the VIEW scripts' output (BMI :231, MUAC in cm :308, ratio :375 are not asserted: the VIEW harness does run the form's scripts), EDIT mode, the closed-visit "Details" branch (needs a retro privilege), required-field gating.
//
// Findings:
//   V1 High   :673,:685    MUAC (mm) is bound to CIEL:163187 = Mean arterial pressure (vitals.xml uses PIH:7956) and the MAP
//                          question is bound to PIH:HEIGHT (CM) with the same id height_cm. So a MUAC is saved as a MAP value and a
//                          MAP is saved as a second Height. Fix: muac_mm -> PIH:7956, MAP -> CIEL:163187 id map_mmhg. (TESTED, test.fixme)
//   V2 Medium :273-296     the cm handler (cmExitHandler) runs on leaving the MUAC question whenever the cm field has a value and
//                          overwrites the mm field with cm*10: once cm was typed (or, in EDIT, prefilled :291-295), a new mm value is
//                          reverted. mm -> cm only works when cm is empty. Fix: convert only the field that changed. (TESTED, test.fixme)
//   V3 Low    :377,:409    tags="Vitals Inpatient Location": no Mirebalais location carries it, so the select is empty (see _shared Leads).
//   V4 Low    :639-675     the MUAC question is shown to men over 12 but the cm<->mm handlers are not loaded for them (:262): the cm
//                          input is dead (and is not saved). Fix: gate the question with the same includeIf. (TESTED)
//   V5 Low    :508,:685    duplicate id height_cm (from V1): getField('height_cm.value') in the BMI script resolves the first one, so
//                          the BMI ignores the MAP field (tested). Fix: see V1.
//   V6 Low    :721         showUnits=" lt" (vitals.xml: L/min). Fix: L/min.
//   V7 Info   Standard UI throws "ExitHandlers is not defined" (:117, :137, :156, :176, :295-296): no converter runs there.

const FORM = 'vitalsInpatient.xml';

const openSimple = async (page: Page, context: EntryContext) => {
  await page.goto(EntryFormPage.enterUrl(FORM, context).replace('enterHtmlFormWithStandardUi', 'enterHtmlFormWithSimpleUi'));
  await page.waitForLoadState('networkidle');
  await expect(page.locator('li.question-legend').first()).toBeVisible();
};
// V3: the location select has only the blank option, so copy the session location's option value from vitals.xml
const pickLocation = async (page: Page, context: EntryContext) => {
  const other = await page.context().newPage();
  await other.goto(EntryFormPage.enterUrl('vitals.xml', context));
  const value = await other.locator('#where select').evaluate((e) => (e as HTMLSelectElement).value);
  await other.close();
  await page.locator('p.required select').evaluate((e, v) => {
    const select = e as HTMLSelectElement;
    select.add(new Option('session location', v));
    select.value = v;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
};
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
  createEntryContext({ givenName: 'AutoInpatient', familyName: 'Tester', gender, birthdate: birthdateYearsAgo(age) });
const savedEncounter = async (api: APIRequestContext, patientUuid: string) => {
  const encounters = await getPatientEncounters(api, patientUuid);
  expect(encounters).toHaveLength(1);
  expect(encounters[0].encounterType.uuid).toBe(VITALS_ENCOUNTER_TYPE_UUID);
  return {
    encounterUuid: encounters[0].uuid,
    displays: (await getEncounterObs(api, encounters[0].uuid)).map((o) => o.display),
  };
};
const savedDisplays = async (api: APIRequestContext, patientUuid: string) => (await savedEncounter(api, patientUuid)).displays;

test.describe('vitalsInpatient', () => {
  test('V3: the location select has no option on this server (Vitals Inpatient Location tag)', async ({ page, createEntryContext }) => {
    test.fixme(); // HAI-1277: "ExitHandlers is not defined" when the form opens in the Standard UI. Remove test.fixme() when fixed.
    // encounterLocation tags="Vitals Inpatient Location" :377 / :409 (open visit: :458 branch renders)
    const context = await newPatient(createEntryContext, 'M', 30);
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('p.required select')).toHaveCount(1);
    await expect(page.locator('p.required select option')).toHaveCount(1); // only the blank option
  });

  // includeIf :185/:538 (BMI), :336/:787 (head circumference, ratio); the MUAC question is not gated (V4)
  const profiles = [
    { name: 'adult man', gender: 'M', age: 30, bmi: true, head: false },
    { name: '6 year old girl', gender: 'F', age: 6, bmi: true, head: false },
    { name: '5 year old boy (age > 5 is false)', gender: 'M', age: 5, bmi: false, head: false },
    { name: '2 year old boy', gender: 'M', age: 2, bmi: false, head: true },
  ] as const;

  for (const p of profiles) {
    test(`age conditional questions for the ${p.name}`, async ({ page, createEntryContext }) => {
      test.fixme(); // HAI-1277: "ExitHandlers is not defined" when the form opens in the Standard UI. Remove test.fixme() when fixed.
      const context = await newPatient(createEntryContext, p.gender, p.age);
      await EntryFormPage.open(page, FORM, context);
      await expect(page.locator('#weight_kg')).toBeVisible();
      await expect(page.locator('#calculated-bmi-wrapper')).toHaveCount(p.bmi ? 1 : 0);
      await expect(page.locator('#head_cm')).toHaveCount(p.head ? 1 : 0);
      await expect(page.locator('#calculated-ratio-wrapper')).toHaveCount(p.head ? 1 : 0);
      await expect(page.locator('#muac_cm')).toHaveCount(1); // V4: always rendered
    });
  }

  test('Simple UI: the unit converters fill the metric fields and clear the source field; BMI follows', async ({ page, createEntryContext }) => {
    // ExitHandlers :103-176; BMI :196-222 (adult). Converters run when the question is left.
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await pickLocation(page, context);

    await fillQuestion(page, 'Height', '#height_inches', '70');
    await goTo(page, 'Weight');
    await expect(page.locator('#height_cm input').first()).toHaveValue('177.8');
    await expect(page.locator('#height_inches')).toHaveValue('');
    await page.locator('#weight_lbs').fill('154');
    await goTo(page, '\\(Calculated\\) BMI');
    await expect(page.locator('#weight_kg input')).toHaveValue('70.0');
    await expect(page.locator('#calculated-bmi')).toHaveText('22.1');

    await fillQuestion(page, 'Temperature', '#temperature_f', '100');
    await fillQuestion(page, 'Blood glucose', '#milligramme', '90');
    await goTo(page, 'Heart Rate');
    await expect(page.locator('#temperature_c input')).toHaveValue('37.8'); // (100-32)*5/9
    await goTo(page, 'GCS');
    await expect(page.locator('#milimole input')).toHaveValue('5.0');
    await expect(page.locator('#milligramme')).toHaveValue('');

    // MUAC (adult woman: the script is loaded): cm -> mm; mm -> cm only when cm is empty (V2)
    await fillQuestion(page, 'MUAC', '#muac_cm', '15');
    await goTo(page, 'MAP');
    await expect(page.locator('#muac_mm input')).toHaveValue('150');
    await goTo(page, 'MUAC');
    await page.locator('#muac_cm').fill('');
    await page.locator('#muac_mm input').fill('200');
    await goTo(page, 'MAP');
    await expect(page.locator('#muac_cm')).toHaveValue('20');

    // V5: a MAP typed in the second height_cm span does not change the BMI
    await page.locator('#height_cm input').nth(1).fill('90');
    await goTo(page, '\\(Calculated\\) BMI');
    await expect(page.locator('#calculated-bmi')).toHaveText('22.1');
  });

  test('V4: for an adult man the MUAC cm field does nothing (no handler is loaded)', async ({ page, createEntryContext }) => {
    // includeIf :262 is false for a man over 12, but the question (:639) is rendered
    const context = await newPatient(createEntryContext, 'M', 30);
    await openSimple(page, context);
    await pickLocation(page, context);
    await fillQuestion(page, 'MUAC', '#muac_cm', '15');
    await goTo(page, 'MAP');
    await expect(page.locator('#muac_mm input')).toHaveValue('');
  });

  test('Simple UI: the MUAC/HC ratio is calculated for a child under 3', async ({ page, createEntryContext }) => {
    // ratio :347-373: (mm/10)/HC = (150/10)/50 = 0.3. The mm field is the one bound to the MAP concept (V1).
    const context = await newPatient(createEntryContext, 'M', 2);
    await openSimple(page, context);
    await pickLocation(page, context);
    await fillQuestion(page, 'MUAC', '#muac_mm input', '150');
    await fillQuestion(page, 'Head Circumference', '#head_cm input', '50');
    await goTo(page, '\\(Calculated\\) MUAC/HC');
    await expect(page.locator('#calculated-ratio')).toHaveText('0.3');
  });

  test('Simple UI: saves the vitals entered as one Vitals encounter', async ({ page, api, createEntryContext }) => {
    // MUAC and MAP are left empty (V1); everything else is bound to the right concept
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await pickLocation(page, context);
    await fillQuestion(page, 'Height', '#height_cm input >> nth=0', '170');
    await fillQuestion(page, 'Weight', '#weight_kg input', '70');
    await fillQuestion(page, 'Temperature', '#temperature_c input', '37.5');
    await fillQuestion(page, 'Heart Rate', '#heart_rate input', '80');
    await fillQuestion(page, 'Respiratory Rate', '#respiratory_rate input', '18');
    await fillQuestion(page, 'Blood Pressure', '#bp_systolic input', '120');
    await page.locator('#bp_diastolic input').fill('80');
    await fillQuestion(page, 'O₂ Sat', '#o2_sat input', '98');
    await fillQuestion(page, 'Blood glucose', '#milligramme', '90');
    await goTo(page, 'Pain');
    await page.locator('#pain input[type=radio]').nth(2).check();
    await fillQuestion(page, 'Chief Complaint', '#chief_complaint input', 'cough');
    await saveSimple(page);

    const { displays, encounterUuid } = await savedEncounter(api, context.patient.uuid);
    expect(displays).toEqual(
      expect.arrayContaining([
        'Height (cm): 170.0',
        'Weight (kg): 70.0',
        'Temperature (C): 37.5',
        'Pulse: 80',
        'Respiratory rate: 18',
        'Systolic: 120',
        'Diastolic: 80',
        'Blood oxygen saturation: 98',
        'Chief complaint (text): cough',
      ]),
    );
    expect(displays.some((d) => /glucose.*5\.0/i.test(d))).toBe(true); // 90 mg/dL -> 5.0 mmol/L

    // VIEW :42-101 template; the BMI / ratio / MUAC-in-cm VIEW scripts need jq and do not run in the test page
    const view = (await expectViewShowsSavedObs(page, api, FORM, encounterUuid)).page;
    await expect(view.locator('#height_cm .value')).toContainText('170');
    await expect(view.locator('#weight_kg .value')).toContainText('70');
    await expect(view.locator('#bp_systolic .value')).toContainText('120');
    await expect(view.locator('#milimole .value')).toContainText('5'); // the mmol/L obs, not the mg/dL converter input
    await expect(view.locator('#pain .value').first()).toContainText('[X]'); // pain scale 4 is one selected radio
    await expect(view.locator('#chief_complaint .value')).toContainText('cough');
    // not filled in (V1 keeps MUAC and MAP empty); head circumference is not offered to an adult
    await expect(view.locator('#muac_mm .value')).toHaveCount(0);
    await expect(view.locator('#head_cm')).toHaveCount(0);
    // ifMode VIEW include=false: the converter inputs are not in the VIEW
    await expect(view.locator('#height_inches, #weight_lbs, #temperature_f, #milligramme, #muac_cm')).toHaveCount(0);
  });

  // remove test.fixme() when V2 is fixed
  test.fixme('V2: a MUAC typed in mm after one in cm replaces it (and cm follows)', async ({ page, createEntryContext }) => {
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await pickLocation(page, context);
    await fillQuestion(page, 'MUAC', '#muac_cm', '15');
    await fillQuestion(page, 'MAP', '#height_cm input >> nth=1', '90'); // leave MUAC (cm 15 -> mm 150), then back
    await fillQuestion(page, 'MUAC', '#muac_mm input', '200');
    await goTo(page, 'MAP');
    await expect(page.locator('#muac_mm input')).toHaveValue('200');
    await expect(page.locator('#muac_cm')).toHaveValue('20');
  });

  // remove test.fixme() when V1 is fixed
  test.fixme('V1: MUAC is saved as a MUAC and MAP as a MAP (not as a second height)', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await pickLocation(page, context);
    await fillQuestion(page, 'MUAC', '#muac_mm input', '150');
    await fillQuestion(page, 'MAP', '#height_cm input >> nth=1', '90');
    await saveSimple(page);

    const displays = await savedDisplays(api, context.patient.uuid);
    expect(displays).toContain('Middle upper arm circumference (mm): 150');
    expect(displays.some((d) => /^Mean arterial pressure: 90/.test(d))).toBe(true);
    expect(displays.filter((d) => /^Height/.test(d))).toEqual([]);
  });
});
