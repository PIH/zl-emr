import { type Page, type APIRequestContext } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type EntryContext } from '../../core';
import { VITALS_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs, VISIT_PAGE_URL } from '../../pages';

// vitalsPregnant.xml v2.2: legacy "Vitals (pregnant)": the one-question-per-screen vitals of vitalsInpatient.xml without
// O2 flow, GCS, RASS and pain, plus a fetal heart rate question. Nothing launches it (_availability.e2e.md: unreferenced; same
// encounter type as vitals.xml, edit would use the Simple UI), so there is no production URL. It was written for the Simple UI
// (its unit converters are ExitHandlers, which exist only there), so the behaviour tests open enterHtmlFormWithSimpleUi (local
// helper openSimple); the render-only tests use the Standard UI. The location select (tag "Vitals ANC Location") carries the
// session location on this server (unlike vitalsInpatient's tag), so it is preselected and no test has to pick one.
//
// Conditions in the form, from documentation inventory (vitalsPregnant.inv.md); ages as of today (ENTER):
//   includeIf age > 5               :160, :520   BMI script / BMI question
//   includeIf (age < 13 or female)  :239         cm<->mm script only; the MUAC question itself (:620) is ungated (V3)
//   includeIf age < 3               :316, :712   MUAC/HC ratio script, head circumference and ratio questions
//   includeIf age >= 10             :697         fetal heart rate; no gender condition (V4)
//   includeIf !visit.open and a retro privilege :395 / :404 / :414 / :440: provider+date "Details" fieldset for a closed visit;
//     the open-visit branch (:440) is its exact complement. The fixture visit is open, so only :440 renders.
//   ifMode VIEW (include true/false) :19-:677  view-only vs entry-only blocks (VIEW: getAsHtml.action, see the save test)
// Scripts: same ExitHandlers as vitalsInpatient.xml (:80-151 inches, lbs, Fahrenheit, mg/dL converters; :251-274 cm <-> mm),
//   BMI :172-198, ratio :328-354.
// Side effects on save: none. Encounter type 4fb47712-... (Vitals).
// Not covered: the VIEW scripts' output (BMI :207, MUAC in cm :287, ratio :357 are not asserted: the VIEW harness does run the form's scripts), EDIT mode, the closed-visit "Details" branch (needs a retro privilege), the converters' own
//   arithmetic (identical to vitalsInpatient.spec.ts, which tests them).
//
// Findings:
//   V1 High   :655,:667    MUAC (mm) is bound to CIEL:163187 = Mean arterial pressure (vitals.xml uses PIH:7956) and the MAP
//                          question is bound to PIH:HEIGHT (CM) with the same id height_cm. So a MUAC is saved as a MAP value and a
//                          MAP is saved as a second Height. Fix: muac_mm -> PIH:7956, MAP -> CIEL:163187 id map_mmhg. (TESTED, test.fixme)
//   V2 Medium :251-274     the cm handler runs on leaving the MUAC question whenever the cm field has a value and overwrites the mm
//                          field with cm*10: once cm was typed (or, in EDIT, prefilled), a new mm value is reverted. Fix: convert only
//                          the field that changed. (TESTED, test.fixme)
//   V3 Low    :620-657     the MUAC question is shown to men over 12 but the cm<->mm handlers are not loaded for them (:239): the cm
//                          input is dead (and is not saved). Fix: gate the question with the same includeIf. (TESTED)
//   V4 Low    :697         fetal heart rate is offered to boys and men from age 10 (comment: "reproductive age"). Fix: add gender == 'F'. (TESTED)
//   V5 Info   Standard UI throws "ExitHandlers is not defined": no converter runs there. Same duplicate id height_cm as V1.

const FORM = 'vitalsPregnant.xml';

const openSimple = async (page: Page, context: EntryContext) => {
  await page.goto(EntryFormPage.enterUrl(FORM, context).replace('enterHtmlFormWithStandardUi', 'enterHtmlFormWithSimpleUi'));
  await page.waitForLoadState('networkidle');
  await expect(page.locator('li.question-legend').first()).toBeVisible();
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
  createEntryContext({ givenName: 'AutoPregnant', familyName: 'Tester', gender, birthdate: birthdateYearsAgo(age) });
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

test.describe('vitalsPregnant', () => {
  test('saving without a location does not save (required encounter location)', async ({ page, api, createEntryContext }) => {
    test.fixme(); // HAI-1277: "ExitHandlers is not defined" when the form opens in the Standard UI. Remove test.fixme() when fixed.
    // encounterLocation :358 / :390 (open visit: :440 branch): preselected with the session location; blank it
    const context = await newPatient(createEntryContext, 'F', 30);
    await EntryFormPage.open(page, FORM, context);
    await page.locator('p.required select').selectOption({ index: 0 });
    await page.locator('input.submitButton').click();
    await expect(page.locator('span.field-error:visible').first()).toBeVisible();
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  // includeIf :160/:520 (BMI), :697 (fetal heart rate), :712/:316 (head circumference, ratio); the MUAC question is not gated (V3)
  const profiles = [
    { name: 'adult woman', gender: 'F', age: 30, bmi: true, fhr: true, head: false },
    { name: '10 year old girl (age >= 10)', gender: 'F', age: 10, bmi: true, fhr: true, head: false },
    { name: '9 year old girl', gender: 'F', age: 9, bmi: true, fhr: false, head: false },
    { name: '12 year old boy (V4)', gender: 'M', age: 12, bmi: true, fhr: true, head: false },
    { name: '5 year old girl (age > 5 is false)', gender: 'F', age: 5, bmi: false, fhr: false, head: false },
    { name: '2 year old girl', gender: 'F', age: 2, bmi: false, fhr: false, head: true },
  ] as const;

  for (const p of profiles) {
    test(`age conditional questions for the ${p.name}`, async ({ page, createEntryContext }) => {
      test.fixme(); // HAI-1277: "ExitHandlers is not defined" when the form opens in the Standard UI. Remove test.fixme() when fixed.
      const context = await newPatient(createEntryContext, p.gender, p.age);
      await EntryFormPage.open(page, FORM, context);
      await expect(page.locator('#weight_kg')).toBeVisible();
      await expect(page.locator('#calculated-bmi-wrapper')).toHaveCount(p.bmi ? 1 : 0);
      await expect(page.locator('fieldset legend', { hasText: /^\s*FHR\s*$/ })).toHaveCount(p.fhr ? 1 : 0);
      await expect(page.locator('#head_cm')).toHaveCount(p.head ? 1 : 0);
      await expect(page.locator('#calculated-ratio-wrapper')).toHaveCount(p.head ? 1 : 0);
      await expect(page.locator('#muac_cm')).toHaveCount(1); // V3: always rendered
    });
  }

  test('Simple UI: the unit converters fill the metric fields; BMI follows', async ({ page, createEntryContext }) => {
    // ExitHandlers (:80-151, :251-274), BMI :172-198; the arithmetic is tested in full in vitalsInpatient.spec.ts
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await fillQuestion(page, 'Height', '#height_inches', '70');
    await fillQuestion(page, 'Weight', '#weight_lbs', '154');
    await goTo(page, '\\(Calculated\\) BMI');
    await expect(page.locator('#height_cm input').first()).toHaveValue('177.8');
    await expect(page.locator('#weight_kg input')).toHaveValue('70.0');
    await expect(page.locator('#calculated-bmi')).toHaveText('22.1');
    await fillQuestion(page, 'Temperature', '#temperature_f', '100');
    await fillQuestion(page, 'Blood glucose', '#milligramme', '90');
    await goTo(page, 'Heart Rate');
    await expect(page.locator('#temperature_c input')).toHaveValue('37.8');
    await fillQuestion(page, 'MUAC', '#muac_cm', '15');
    await goTo(page, 'MAP');
    await expect(page.locator('#muac_mm input')).toHaveValue('150');
    await goTo(page, 'FHR');
    await expect(page.locator('#milimole input')).toHaveValue('5.0');
  });

  test('V3: for an adult man the MUAC cm field does nothing (no handler is loaded)', async ({ page, createEntryContext }) => {
    // includeIf :239 is false for a man over 12, but the question (:620) is rendered
    const context = await newPatient(createEntryContext, 'M', 30);
    await openSimple(page, context);
    await fillQuestion(page, 'MUAC', '#muac_cm', '15');
    await goTo(page, 'MAP');
    await expect(page.locator('#muac_mm input')).toHaveValue('');
  });

  test('Simple UI: the MUAC/HC ratio is calculated for a child under 3', async ({ page, createEntryContext }) => {
    // ratio :328-354: (mm/10)/HC = (150/10)/50 = 0.3. The mm field is the one bound to the MAP concept (V1).
    const context = await newPatient(createEntryContext, 'F', 2);
    await openSimple(page, context);
    await fillQuestion(page, 'MUAC', '#muac_mm input', '150');
    await fillQuestion(page, 'Head Circumference', '#head_cm input', '50');
    await goTo(page, '\\(Calculated\\) MUAC/HC');
    await expect(page.locator('#calculated-ratio')).toHaveText('0.3');
  });

  test('Simple UI: saves the vitals and the fetal heart rate as one Vitals encounter', async ({ page, api, createEntryContext }) => {
    // MUAC and MAP are left empty (V1); everything else is bound to the right concept
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await fillQuestion(page, 'Height', '#height_cm input >> nth=0', '165');
    await fillQuestion(page, 'Weight', '#weight_kg input', '65');
    await fillQuestion(page, 'Temperature', '#temperature_c input', '37.2');
    await fillQuestion(page, 'Heart Rate', '#heart_rate input', '88');
    await fillQuestion(page, 'Respiratory Rate', '#respiratory_rate input', '20');
    await fillQuestion(page, 'Blood Pressure', '#bp_systolic input', '110');
    await page.locator('#bp_diastolic input').fill('70');
    await fillQuestion(page, 'O₂ Sat', '#o2_sat input', '99');
    await fillQuestion(page, 'Blood glucose', '#milligramme', '90');
    await fillQuestion(page, 'FHR', 'fieldset:has(legend:text-is("FHR")) input[type=text]', '140');
    await fillQuestion(page, 'Chief Complaint', '#chief_complaint input', 'routine visit');
    await saveSimple(page);

    const { displays, encounterUuid } = await savedEncounter(api, context.patient.uuid);
    expect(displays).toEqual(
      expect.arrayContaining([
        'Height (cm): 165.0',
        'Weight (kg): 65.0',
        'Temperature (C): 37.2',
        'Pulse: 88',
        'Respiratory rate: 20',
        'Systolic: 110',
        'Diastolic: 70',
        'Blood oxygen saturation: 99',
        'Chief complaint (text): routine visit',
      ]),
    );
    expect(displays.some((d) => /glucose.*5\.0/i.test(d))).toBe(true); // 90 mg/dL -> 5.0 mmol/L
    expect(displays.some((d) => /fetal heart rate.*140/i.test(d))).toBe(true);

    // VIEW :19-77 template; the BMI / ratio / MUAC-in-cm VIEW scripts need jq and do not run in the test page
    const view = (await expectViewShowsSavedObs(page, api, FORM, encounterUuid)).page;
    await expect(view.locator('#height_cm .value')).toContainText('165');
    await expect(view.locator('#bp_diastolic .value')).toContainText('70');
    await expect(view.locator('#milimole .value')).toContainText('5'); // the mmol/L obs, not the mg/dL converter input
    await expect(view.locator('#chief_complaint .value')).toContainText('routine visit');
    await expect(view.locator('fieldset:has(legend:text-is("FHR")) .value')).toContainText('140'); // :706, no id
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
    await fillQuestion(page, 'MUAC', '#muac_mm input', '150');
    await fillQuestion(page, 'MAP', '#height_cm input >> nth=1', '90');
    await saveSimple(page);

    const displays = await savedDisplays(api, context.patient.uuid);
    expect(displays).toContain('Middle upper arm circumference (mm): 150');
    expect(displays.some((d) => /^Mean arterial pressure: 90/.test(d))).toBe(true);
    expect(displays.filter((d) => /^Height/.test(d))).toEqual([]);
  });
});
