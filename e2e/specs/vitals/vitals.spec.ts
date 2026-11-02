import { type Page, type APIRequestContext } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type EntryContext } from '../../core';
import { VITALS_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs, VISIT_PAGE_URL, visitPagePath } from '../../pages';

// vitals.xml v3.0: "Vitals" (height, weight, BMI, MUAC, head circumference, BP/pulse/RR/temperature/SpO2 widget,
// MAP, glucose, air supply, GCS, RASS, urine output, pain, fetal heart rate, chief complaint, comment). Opened with
// enterHtmlFormWithStandardUi inside a visit the fixture creates: that is how production launches it at Haiti sites
// (_availability.e2e.md: enableVitals, Standard UI; Simple UI only for legacy v2.2 encounters), so no Simple UI here.
// The visit-page gating (Vitals Location tag, privileges) is not exercised. The session location carries the tag, so
// location and provider are preselected.
//
// Conditions in the form, from documentation inventory (vitals.inv.md); ages are as of today (ENTER):
//   includeIf age > 5                 :70, :247    BMI script / BMI box (#no-calculated-bmi, #calculated-bmi-wrapper)
//   includeIf age < 13 or female      :147, :268   MUAC: cm<->mm script / cm input + mm obs
//   includeIf age < 3                 :309         head circumference
//   includeIf female and age > 10     :465         prenatal fieldset (fetal heart rate)
//   when air = supplemental oxygen    :379         shows #oxy2 (flow rate)
//   ifMode VIEW / not VIEW            :40-:505     view-only vs entry-only blocks (VIEW: getAsHtml.action, see the save test)
// Scripts: :29-67 glucose mg/dL <-> mmol/L (/18, x18, one decimal) on change of #milligram / millimole;
//   :72-111 BMI = kg/(cm/100)^2, one decimal, on change of weight/height; :148-180 MUAC cm -> mm (x10) and mm -> cm (/10),
//   and cm shown again when the mm obs has a value on load (EDIT); the VIEW scripts (:113 BMI, :183 MUAC in cm) are page scripts that need jq, so they do not run in the VIEW test.
// Side effects on save: none (no program, order or disposition). Encounter type 4fb47712-... (Vitals).
// Not covered: the VIEW scripts' output (BMI and MUAC cm in the VIEW), the visit-page launch and retro-entry gating, EPLD behaviour (_shared.e2e.md).
//
// Findings:
//   V1 Low  :148-155,:301  convertCmToMm = cm*10 without rounding: 15.35 cm writes 153.5 into the integer-only mm obs, and Save then
//                          fails with a field error on a value the user did not type (tested). Fix: Math.round(cm * 10).
//   V2 Low  :425,:435      id="pain" on both the section and the pain-scale obs span (duplicate id). Fix: rename one.
//   V3 Info :465           prenatal uses $patient.age (today) while every other gate uses the age at the encounter date.
//   see _shared V11, V16 for the Temp/SpO2 labels and the missing vital-sign colouring.

const FORM = 'vitals.xml';

const blur = async (page: Page, selector: string, value: string) => {
  await page.locator(selector).fill(value);
  await page.locator(selector).press('Tab');
};
const newPatient = (createEntryContext: CustomTestFixtures['createEntryContext'], gender: 'M' | 'F', age: number) =>
  createEntryContext({ givenName: 'AutoVitals', familyName: 'Tester', gender, birthdate: birthdateYearsAgo(age) });
const obsDisplays = async (api: APIRequestContext, patientUuid: string) => {
  const encounters = await getPatientEncounters(api, patientUuid);
  expect(encounters).toHaveLength(1);
  expect(encounters[0].encounterType.uuid).toBe(VITALS_ENCOUNTER_TYPE_UUID);
  return {
    encounterUuid: encounters[0].uuid,
    displays: (await getEncounterObs(api, encounters[0].uuid)).map((o) => o.display),
  };
};

test.describe('vitals', () => {
  // includeIf :70/:247 (BMI), :147/:268 (MUAC), :309 (head circumference), :465 (prenatal)
  const profiles = [
    { name: 'adult male', gender: 'M', age: 30, bmi: true, muac: false, head: false, prenatal: false },
    { name: 'adult female', gender: 'F', age: 30, bmi: true, muac: true, head: false, prenatal: true },
    { name: '11 year old girl', gender: 'F', age: 11, bmi: true, muac: true, head: false, prenatal: true },
    { name: '10 year old girl (age > 10 is false)', gender: 'F', age: 10, bmi: true, muac: true, head: false, prenatal: false },
    { name: '12 year old boy', gender: 'M', age: 12, bmi: true, muac: true, head: false, prenatal: false },
    { name: '13 year old boy', gender: 'M', age: 13, bmi: true, muac: false, head: false, prenatal: false },
    { name: '6 year old boy', gender: 'M', age: 6, bmi: true, muac: true, head: false, prenatal: false },
    { name: '5 year old boy (age > 5 is false)', gender: 'M', age: 5, bmi: false, muac: true, head: false, prenatal: false },
    { name: '2 year old boy', gender: 'M', age: 2, bmi: false, muac: true, head: true, prenatal: false },
  ] as const;

  for (const p of profiles) {
    test(`age/gender conditional boxes for the ${p.name}`, async ({ page, createEntryContext }) => {
      const context = await newPatient(createEntryContext, p.gender, p.age);
      await EntryFormPage.open(page, FORM, context);
      await expect(page.locator('#weight_kg')).toBeVisible();

      await expect(page.locator('#calculated-bmi-wrapper')).toHaveCount(p.bmi ? 1 : 0);
      await expect(page.locator('#muac_cm')).toHaveCount(p.muac ? 1 : 0);
      await expect(page.locator('#muac_mm')).toHaveCount(p.muac ? 1 : 0);
      await expect(page.locator('#head_cm')).toHaveCount(p.head ? 1 : 0);
      await expect(page.locator('fieldset#prenatal')).toHaveCount(p.prenatal ? 1 : 0);
    });
  }

  test('BMI is calculated from weight and height and hidden when one is missing', async ({ page, createEntryContext }) => {
    // BMI script :86-109 (age > 5)
    const context = await newPatient(createEntryContext, 'M', 30);
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#calculated-bmi-wrapper')).toBeHidden();
    await expect(page.locator('#no-calculated-bmi')).toBeVisible();

    await blur(page, '#height_cm input', '170');
    await expect(page.locator('#calculated-bmi-wrapper')).toBeHidden();
    await blur(page, '#weight_kg input', '70');
    await expect(page.locator('#calculated-bmi-wrapper')).toBeVisible();
    await expect(page.locator('#calculated-bmi')).toHaveText('24.2');
    await expect(page.locator('#no-calculated-bmi')).toBeHidden();

    await blur(page, '#weight_kg input', '');
    await expect(page.locator('#calculated-bmi-wrapper')).toBeHidden();
  });

  test('glucose converts mg/dL to mmol/L and back', async ({ page, createEntryContext }) => {
    // :45-56: typing mg/dL fills mmol/L (/18); typing mmol/L fills mg/dL (x18); .val() fires no change, so no loop
    const context = await newPatient(createEntryContext, 'M', 30);
    await EntryFormPage.open(page, FORM, context);
    await blur(page, '#milligram', '100');
    await expect(page.locator('#millimole input')).toHaveValue('5.6');
    await expect(page.locator('#milligram')).toHaveValue('100');
    await blur(page, '#millimole input', '5');
    await expect(page.locator('#milligram')).toHaveValue('90.0');
  });

  test('MUAC converts cm to mm and back (adult woman)', async ({ page, createEntryContext }) => {
    // :160-171
    const context = await newPatient(createEntryContext, 'F', 30);
    await EntryFormPage.open(page, FORM, context);
    await blur(page, '#muac_cm', '15');
    await expect(page.locator('#muac_mm input')).toHaveValue('150');
    await blur(page, '#muac_mm input', '200');
    await expect(page.locator('#muac_cm')).toHaveValue('20');
  });

  test('the air supply answer "supplemental oxygen" shows the flow rate, room air hides it', async ({ page, createEntryContext }) => {
    // when :379 -> #oxy2
    const context = await newPatient(createEntryContext, 'M', 30);
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#oxy2')).toBeHidden();
    await page.locator('#air input[type=radio]').nth(1).check(); // answers: room air, supplemental oxygen therapy
    await expect(page.locator('#oxy2')).toBeVisible();
    await page.locator('#air input[type=radio]').nth(0).check();
    await expect(page.locator('#oxy2')).toBeHidden();
  });

  test('a value outside the concept range blocks the save', async ({ page, api, createEntryContext }) => {
    // numeric range of the concept (not form specific): pulse 999
    const context = await newPatient(createEntryContext, 'M', 30);
    await EntryFormPage.open(page, FORM, context);
    await blur(page, '#heart_rate input', '999');
    await page.locator('input.submitButton').click();
    await expect(page.locator('span.field-error:visible').first()).toBeVisible();
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('saving without a location does not save (required encounter location)', async ({ page, api, createEntryContext }) => {
    // EPLD (see _shared): the location select is preselected with the session location; blank it
    const context = await newPatient(createEntryContext, 'M', 30);
    await EntryFormPage.open(page, FORM, context);
    await blur(page, '#heart_rate input', '80');
    await page.locator('#where select').selectOption({ index: 0 });
    await page.locator('input.submitButton').click();
    await expect(page.locator('#where span.field-error:visible')).toBeVisible();
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('saves the vitals entered as one Vitals encounter, and EDIT shows the converted fields', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext, 'F', 30);
    const form = await EntryFormPage.open(page, FORM, context);
    await blur(page, '#height_cm input', '170');
    await blur(page, '#weight_kg input', '70');
    await blur(page, '#muac_cm', '15');
    await blur(page, '#bp_systolic input', '120');
    await blur(page, '#bp_diastolic input', '80');
    await blur(page, '#heart_rate input', '80');
    await blur(page, '#respiratory_rate input', '18');
    await blur(page, '#temperature_c input', '37.5');
    await blur(page, '#o2_sat input', '98');
    await blur(page, '#milligram', '90');
    await page.locator('#air input[type=radio]').nth(1).check();
    await blur(page, '#oxy2 input', '2');
    await page.locator('#pain input[type=radio]').nth(2).check(); // pain scale 4
    await page.locator('#chief_complaint textarea').fill('cough');
    await blur(page, 'fieldset#prenatal input', '140');
    await page.locator('input.submitButton').click();
    await form.expectSaved();

    const saved = await obsDisplays(api, context.patient.uuid);
    expect(saved.displays).toEqual(
      expect.arrayContaining([
        'Height (cm): 170.0',
        'Weight (kg): 70.0',
        'Middle upper arm circumference (mm): 150',
        'Systolic: 120',
        'Diastolic: 80',
        'Pulse: 80',
        'Respiratory rate: 18',
        'Temperature (C): 37.5',
        'Blood oxygen saturation: 98',
        'Chief complaint (text): cough',
      ]),
    );
    expect(saved.displays.some((d) => /glucose.*5\.0/i.test(d))).toBe(true); // 90 mg/dL -> 5.0 mmol/L
    expect(saved.displays.some((d) => /fetal heart rate.*140/i.test(d))).toBe(true);

    // EDIT :174-177, :59-62: cm and mg/dL are filled again from the saved mm and mmol/L values
    const params = new URLSearchParams({
      patientId: context.patient.uuid,
      visitId: context.visitUuid,
      encounterId: saved.encounterUuid,
      definitionUiResource: `file:configuration/pih/htmlforms/${FORM}`,
      returnUrl: visitPagePath(context.visitUuid),
    });
    await page.goto(`htmlformentryui/htmlform/editHtmlFormWithStandardUi.page?${params.toString()}`);
    await expect(page.locator('#muac_cm')).toHaveValue('15');
    await expect(page.locator('#milligram')).toHaveValue('90.0');
    await expect(page.locator('#calculated-bmi')).toHaveText('24.2');

    const view = await expectViewShowsSavedObs(page, api, FORM, saved.encounterUuid);
    // VIEW :113-142, :183-208 compute BMI and the MUAC in cm with page scripts that need jq: not run here.
    const shown = view.page;
    await expect(shown.locator('#height_cm .value')).toContainText('170');
    await expect(shown.locator('#muac_mm .value')).toContainText('150'); // the mm obs is what is saved; the cm display is script-filled
    await expect(shown.locator('#air .value')).toHaveText(/^\[X\]\s+Supplemental oxygen/i);
    await expect(shown.locator('#oxy2 .value')).toContainText('2');
    await expect(shown.locator('fieldset#prenatal .value')).toContainText('140');
    await expect(shown.locator('#pain .value').first()).toContainText('[X]');
    // not filled in this test: MAP, comment, and the head circumference (not offered to an adult)
    await expect(shown.locator('#map_mmhg .value, #vital_comment .value')).toHaveCount(0);
    await expect(shown.locator('#head_cm')).toHaveCount(0);
    // ifMode VIEW include=false: the cm entry input and the Save button are not in the VIEW
    await expect(shown.locator('#muac_cm, input.submitButton')).toHaveCount(0);
  });

  test('V1: a MUAC in cm with two decimals gives a mm value the form then rejects', async ({ page, api, createEntryContext }) => {
    // :150 15.35 * 10 = 153.5 goes into the mm obs; the integer-only mm concept rejects it on a field the user did not type
    const context = await newPatient(createEntryContext, 'F', 30);
    await EntryFormPage.open(page, FORM, context);
    await blur(page, '#muac_cm', '15.35');
    await expect(page.locator('#muac_mm input')).toHaveValue('153.5');
    await page.locator('input.submitButton').click();
    await expect(page.locator('#muac_mm span.field-error:visible')).toBeVisible();
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('switching the air supply back to room air drops the flow rate that was typed', async ({ page, api, createEntryContext }) => {
    // when :379 only hides #oxy2: a value typed before is still submitted unless HFE ignores hidden fields
    const context = await newPatient(createEntryContext, 'M', 30);
    const form = await EntryFormPage.open(page, FORM, context);
    await page.locator('#air input[type=radio]').nth(1).check();
    await blur(page, '#oxy2 input', '2');
    await page.locator('#air input[type=radio]').nth(0).check();
    await page.locator('input.submitButton').click();
    await form.expectSaved();
    const { displays } = await obsDisplays(api, context.patient.uuid);
    expect(displays.filter((d) => /flow/i.test(d))).toEqual([]);
  });
});
