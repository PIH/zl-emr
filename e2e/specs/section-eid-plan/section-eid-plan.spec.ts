import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type SectionEncounter } from '../../core';
import { EID_FOLLOWUP_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { SectionFormPage, expectViewShowsSavedObs } from '../../pages';

// hiv/section-eid-plan.xml v2.0: plan of an EID (exposed infant) followup: lab order widget (pihLabOrder), radiology
// checkboxes, PCR result (+ notify parent), clinical impression and diagnoses, action plan, socio-economic assistance,
// transfer out, return visit date. Section of the EID followup encounter (0f070640); the specs open its edit URL
// directly with a one-year-old patient (the visit-page gate is age < 24 months, documentation/_availability.e2e.md).
// The form uses the HFE <submit> tag: there is no #submit, the button is `#buttons input.submitButton`.
//
// Conditions in the form, from documentation inventory (section-eid-plan.inv.md):
//   ifMode VIEW include=false  :6, :25, :260   CSS, heading and the #buttons row in ENTER/EDIT only
//   when PCR (CIEL:1030) = Positive (CIEL:703)   :67    show #notify-parent (parent/guardian notified yes/no)
//   toggle "External transfer" checkbox (PIH:HUM Disposition categories = CIEL:160036)  :209   show #transfer-out-details
//   when Transfer out location = PIH:8855 / PIH:8856 :220/:221  show #internal-transfer-out / #external-transfer-out
// Scripts: none in this file (no setUpNextAndSubmitButtons: the <submit> tag saves and returns). No validation, default
//   or derived value; the "last PCR" box is a render-time <lookup expression="fn.latestObs('CIEL:1030')..."/> (:93-94).
// Side effects on save: none from the form itself (the lab order widget saves orders: not exercised, see below).
// Hidden dependent fields (the external transfer location after choosing Internal) are not submitted (tested).
// Not covered here: pihLabOrder (a saved lab order is not exercised), the diagnoses widget, the return visit
//   date (allowPastDates=false, plain datepicker).
// VIEW (getAsHtml.action on the saved encounter): PCR result, radiology, plan text, assistance and transfer-out values, the
//   "last PCR" lookup, what was not filled (internal transfer, other radiology) shows no value, and the #buttons row
//   (ifMode VIEW include=false :260) is absent.

const FORM = 'hiv/section-eid-plan.xml';
// Coded answers the form labels differently from the concept name (obs display -> text shown in VIEW): answerCode labels, and the
// assistance checkboxes (answerLabel="") that show only "[X]" under their row and column headings.
const VIEW_LABELS: Record<string, string> = {
  'Disposition categories: Patient transferred out': 'yes',
  'Transfer out location: Non-PIH facility': 'External',
  'Radiology image order (coded): Chest, 1 view (X-ray)': 'Chest X-ray',
  'Socio-economic assistance received: Transport assistance': '[X]',
  'Socio-economic assistance recommended: Nutritional assistance': '[X]',
};

const save = async (page: Page) => {
  await page.locator('#buttons input.submitButton').click();
};

// Local helper: display of each obs on the (synthetic) encounter (group parents included).
const obsDisplays = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> => {
  const res = await api.get(`obs?encounter=${encounterUuid}&v=custom:(display)&limit=100`);
  expect(res.ok()).toBeTruthy();
  return ((await res.json()).results as Array<{ display: string }>).map((o) => o.display.toLowerCase());
};

test.describe('section-eid-plan', () => {
  let section: SectionEncounter;

  const open = async (page: Page) => {
    await page.goto(SectionFormPage.editUrl(FORM, section));
    await expect(page.locator('#buttons input.submitButton')).toBeVisible();
  };

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: EID_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoEidPlan', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(1) },
    });
    await open(page);
  });

  test('"Notify parent/guardian" shows only when the PCR result is Positive', async ({ page }) => {
    // when :67
    const notify = page.locator('#notify-parent');
    await expect(notify).toBeHidden();
    await page.getByLabel('Positive', { exact: true }).check();
    await expect(notify).toBeVisible();
    await page.getByLabel('Negative', { exact: true }).check();
    await expect(notify).toBeHidden();
    await page.getByLabel('Indeterminate', { exact: true }).check();
    await expect(notify).toBeHidden();
  });

  test('the transfer-out details and the internal/external blocks follow the checkbox and the radio', async ({ page }) => {
    // toggle :209, when :220 and :221
    const details = page.locator('#transfer-out-details');
    const internal = page.locator('#internal-transfer-out');
    const external = page.locator('#external-transfer-out');
    await expect(details).toBeHidden();
    await page.locator('#w74').check();
    await expect(details).toBeVisible();
    await expect(internal).toBeHidden();
    await expect(external).toBeHidden();
    await page.getByLabel('Internal', { exact: true }).check();
    await expect(internal).toBeVisible();
    await expect(external).toBeHidden();
    await page.getByLabel('External', { exact: true }).check();
    await expect(external).toBeVisible();
    await expect(internal).toBeHidden();
    await page.locator('#w74').uncheck();
    await expect(details).toBeHidden();
  });

  test('saves the PCR result, radiology, plan text and assistance, and EDIT shows the saved state', async ({ page, api }) => {
    await page.getByLabel('Chest X-ray', { exact: true }).check();
    await page.getByLabel('Positive', { exact: true }).check();
    await page.locator('#notify-parent input[type=radio]').first().check(); // yes
    await page.locator('#eid-final-comments textarea:not([name=encounterDiagnoses])').first().fill('Infant well'); // clinical impressions
    await page.locator('#eid-final-comments textarea:not([name=encounterDiagnoses])').last().fill('Start prophylaxis'); // action plan
    await page.locator('#w52').check(); // transport: received
    await page.locator('#w58').check(); // food: recommended
    await page.locator('#w66').fill('Needs transport');
    await page.locator('#w74').check();
    await page.getByLabel('External', { exact: true }).check();
    await page.locator('#w80').fill('Clinic Elsewhere');
    await save(page);
    await new SectionFormPage(page, FORM).expectSaved();

    const displays = await obsDisplays(api, section.encounter.uuid);
    for (const expected of ['chest, 1 view (x-ray)', 'chain reaction, qualitative: positive', 'plan comment: infant well', 'conclusion of examination: start prophylaxis', 'received: transport assistance', 'recommended: nutritional assistance', 'comment: needs transport', 'transfer location: clinic elsewhere']) {
      expect(displays.some((d) => d.includes(expected)), expected).toBeTruthy();
    }

    await open(page);
    // when :67 and :209/:221 in EDIT start from the saved values
    await expect(page.locator('#notify-parent')).toBeVisible();
    await expect(page.locator('#transfer-out-details')).toBeVisible();
    await expect(page.locator('#external-transfer-out')).toBeVisible();
    await expect(page.locator('#internal-transfer-out')).toBeHidden();
    await expect(page.locator('#eid-final-comments textarea:not([name=encounterDiagnoses])').first()).toHaveValue('Infant well');
  });

  test('an external transfer location typed and then hidden by choosing Internal is not saved', async ({ page, api }) => {
    // when :221 only hides #external-transfer-out; its inputs keep their values and are submitted
    await page.locator('#w74').check();
    await page.getByLabel('External', { exact: true }).check();
    await page.locator('#external-transfer-out input[type=text]').fill('Typed then hidden');
    await page.getByLabel('Internal', { exact: true }).check();
    await expect(page.locator('#external-transfer-out')).toBeHidden();
    await save(page);
    await new SectionFormPage(page, FORM).expectSaved();
    expect((await obsDisplays(api, section.encounter.uuid)).some((d) => d.includes('typed then hidden'))).toBeFalsy();
  });

  test('the "last PCR" box shows the latest recorded PCR result of the patient', async ({ page, api }) => {
    // <lookup expression="fn.latestObs('CIEL:1030')..."/> :93-94, evaluated when the form is rendered. The obs is put on
    // the test encounter so that cleanup voids it.
    const uuidOf = async (code: string): Promise<string> => {
      const r = await api.get(`concept?source=CIEL&code=${code}&v=custom:(uuid)`);
      expect(r.ok()).toBeTruthy();
      return (await r.json()).results[0].uuid;
    };
    const res = await api.post('obs', {
      data: {
        person: section.patient.uuid,
        encounter: section.encounter.uuid,
        concept: await uuidOf('1030'),
        value: await uuidOf('664'), // negative
        obsDatetime: new Date().toISOString(),
      },
    });
    expect(res.ok(), `create obs: ${res.status()} ${(await res.text()).slice(0, 300)}`).toBeTruthy();
    await open(page);
    await expect(page.locator('p.side-by-side i')).toContainText(/negative/i);
  });

  // VIEW: the saved plan is shown under the form's own labels; what was not filled is not shown as a value.
  test('VIEW: shows the saved plan, the last-PCR lookup and no buttons; the unfilled internal transfer shows no value', async ({ page, api }) => {
    await page.getByLabel('Chest X-ray', { exact: true }).check();
    await page.getByLabel('Positive', { exact: true }).check();
    await page.locator('#notify-parent input[type=radio]').first().check(); // yes
    await page.locator('#eid-final-comments textarea:not([name=encounterDiagnoses])').first().fill('Infant well'); // clinical impressions
    await page.locator('#eid-final-comments textarea:not([name=encounterDiagnoses])').last().fill('Start prophylaxis'); // action plan
    await page.locator('#w52').check(); // transport: received
    await page.locator('#w58').check(); // food: recommended
    await page.locator('#w66').fill('Needs transport');
    await page.locator('#w74').check();
    await page.getByLabel('External', { exact: true }).check();
    await page.locator('#w80').fill('Clinic Elsewhere');
    await save(page);
    await new SectionFormPage(page, FORM).expectSaved();

    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, VIEW_LABELS);
    const shown = await view.valueTexts();
    for (const expected of ['Infant well', 'Start prophylaxis', 'Needs transport', 'Clinic Elsewhere']) {
      expect(shown, expected).toContain(expected);
    }
    await expect(view.page.locator('#pcr-results .value').first()).toContainText(/positive/i);
    await expect(view.page.locator('#assistance .value')).toHaveCount(3); // received, recommended, remarks
    await expect(view.page.locator('#external-transfer-out .value')).not.toHaveCount(0);
    await expect(view.page.locator('#internal-transfer-out .value')).toHaveCount(0);
    await expect(view.page.locator('p.side-by-side i')).toContainText(/positive/i); // <lookup> :93, evaluated at render time
    await expect(view.page.locator('#apptDate .value')).toHaveCount(0); // return date not filled
    await expect(view.page.locator('#buttons, #buttons input.submitButton')).toHaveCount(0);
  });
});
