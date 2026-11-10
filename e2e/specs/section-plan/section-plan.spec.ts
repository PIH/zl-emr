import { type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type SectionEncounter, type SectionEncounterOptions } from '../../core';
import {
  NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID,
  NCD_INITIAL_ENCOUNTER_TYPE_UUID,
  PRIMARY_CARE_ADULT_FOLLOWUP_ENCOUNTER_TYPE_UUID,
  PRIMARY_CARE_ADULT_INITIAL_ENCOUNTER_TYPE_UUID,
  PRIMARY_CARE_PEDS_FOLLOWUP_ENCOUNTER_TYPE_UUID,
  PRIMARY_CARE_PEDS_INITIAL_ENCOUNTER_TYPE_UUID,
} from '../../core/constants';
import { SectionFormPage, VISIT_PAGE_URL, expectViewShowsSavedObs } from '../../pages';

// section-plan.xml (pihemr, v2.0): "Plan": clinical management plan text, lab orders (pihLabOrder), radiology, medication orders
// (drug order widget), NCD-followup assistance table, disposition (encounterDisposition) + comment + return visit date. On the visit page
// it is the `pihcore-plan` section of primary care adult/peds initial and followup and of NCD initial/followup; the specs create the parent
// encounter over REST and open the section's edit URL directly (skips the gating of _availability.e2e.md). The form uses the HFE <submit>
// tag: there is no #submit, the button is `#buttons input.submitButton`. Runs on zl-ci.
//
// Conditions in the form, from documentation inventory (section-plan.inv.md). NCD = NCD initial (ae06d311) or followup (5cbfd6a2):
//   includeIf !radiology component   :72   Chest X-ray checkbox + "other" autocomplete; includeIf radiology component :94  "At HUM, use
//                                          Radiology order". zl-ci has the `radiology` component ON, so only the :94 arm is seen (the other is not tested)
//   includeIf type not NCD           :108  standard drug-order-widget.xml (shared: Add Medication button, medication select, dose, frequency, route, ...)
//   includeIf type NCD               :113  drug-order-widget-with-non-coded.xml (adds free-text dosing instructions + dosing type) and the
//                                          "suggested NCD treatment" lists (h4 + three columns)
//   includeIf type NCD followup      :206  #assistance table: transport, food, food package, school, home, kit, cash transfer; received / recommended
//                                          checkboxes, "other" text, remarks
//   includeIf type not NCD           :292  return visit date (#apptDate, allowPastDates=false); NCD has none
//   ifMode VIEW include=false :25,:48,:304   validation script, <h1>, the #buttons row (Save, Cancel); absent in VIEW
// Scripts: :28-44 getBeforeValidation: a disposition picked while one of its visible fields (ward, site, location, death date) is empty ->
//   "Please fill out all fields associated with the selected disposition" and the save is stopped. Disposition widget (shared): Admission shows the
//   ward, Transfer out of hospital the sites, Transfer within hospital the location, Death the death date.
// Side effects on save: postSubmissionAction ApplyDispositionAction (:5, pihcore): see the disposition test below for what a Discharge does here;
//   drug orders (one saved below; voided with the encounter); lab orders (pihLabOrder) are not saved.
// VIEW is tested on the visit page, which shows the section's own VIEW (`pihcore-plan` has an active templateModelUrl in
//   encounterTypeConfig.js :146): expectViewShowsSavedObs.
// Findings: see pihemr _findings.e2e.md#section-plan (copied here until the main session moves them):
//   V1 Medium :2 formUuid ed673783-ec75-49de-a19f-3976d031aec0 is also the formUuid of ncd-initial.xml (formName "NCD Initial", formEncounterType NCD Initial
//          Consult): one Form row for two files. On zl-ci GET form/<uuid> answers name "Plan" with the NCD Initial Consult encounter type, so NCD
//          initial encounters are listed as form "Plan" and the two definitions can be opened as each other. Fix: new formUuid and formVersion for one of them.
//   V2 Low    :54-58 id="clinical-management-plan" is on both the <section> and the <obs>: duplicate id in the rendered form.
//   V3 Info   :69-100 the radiology section's content depends on the `radiology` component (zl-ci: on, shows only "At HUM, use Radiology order"); with it
//          off the user sees a Chest X-ray checkbox and an "other" autocomplete saving "Radiology image ordered" obs.
// Not covered here: pihLabOrder (an order widget; a lab order cannot be undone except by voiding the encounter), drug order revise / renew / discontinue,
//   the radiology-off arm (:72), Death and Transfer dispositions (ApplyDispositionAction would mark the patient dead / transfer), #apptDate error cases.

const FORM = 'section-plan.xml';
const SAVE = '#buttons input.submitButton';

// Local helpers.
const pickDate = async (input: Locator, isoDate: string) => {
  await input.evaluate((el, iso) => {
    const j = (window as unknown as { jq: (e: unknown) => { datepicker: (...a: unknown[]) => void; trigger: (n: string) => void } }).jq;
    j(el).datepicker('setDate', new Date(`${iso}T12:00:00`));
    j(el).trigger('change');
  }, isoDate);
  await input.locator('xpath=following-sibling::input[@type="hidden"]').evaluate((el) => {
    (window as unknown as { jq: (e: unknown) => { trigger: (n: string) => void } }).jq(el).trigger('change');
  });
};
const iso = (n: number): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + n)).toISOString().slice(0, 10);
};
const viewDate = (isoDate: string): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
};
const obsDisplays = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> => {
  const res = await api.get(`obs?encounter=${encounterUuid}&v=custom:(display)&limit=300`);
  expect(res.ok(), `get obs: ${res.status()}`).toBeTruthy();
  return ((await res.json()).results as Array<{ display: string }>).map((o) => o.display.toLowerCase());
};
const expectObs = (displays: string[], ...expected: string[]) => {
  for (const e of expected) {
    expect(displays.some((d) => d.includes(e.toLowerCase())), `obs "${e}" among ${displays.join(' | ')}`).toBeTruthy();
  }
};
const open = async (
  page: Page,
  create: (o: SectionEncounterOptions) => Promise<SectionEncounter>,
  encounterTypeUuid: string,
  patient: { gender?: 'M' | 'F'; age?: number } = {},
): Promise<SectionEncounter> => {
  const section = await create({
    encounterTypeUuid,
    patient: { givenName: 'AutoPlan', familyName: 'Tester', gender: patient.gender ?? 'F', birthdate: birthdateYearsAgo(patient.age ?? 30) },
  });
  await page.goto(SectionFormPage.editUrl(FORM, section));
  await expect(page.locator(SAVE)).toBeVisible();
  return section;
};
const save = async (page: Page) => {
  await page.locator(SAVE).click();
  await expect(page).toHaveURL(VISIT_PAGE_URL);
};
const disposition = (page: Page) => page.locator('#disposition select').first();
const NEW_ORDER = '.orderwidget-order-form:visible';
// Adds one medication order the way the widget is used: Add Medication, pick the drug, dose, frequency, duration, quantity.
const addMedication = async (page: Page, drugLabel: string) => {
  await page.locator('#order-action-button-NEW').click();
  const order = page.locator(NEW_ORDER);
  // the medication is an autocomplete: its <select> is hidden, the visible control is a text box with a jQuery UI suggestion list
  await order.locator('.order-drug input.orderwidget-autocomplete-textbox').fill(drugLabel.split(',')[0]);
  await page.locator('ul.ui-autocomplete li', { hasText: drugLabel }).first().click();
  await order.locator('.order-dose input').fill('250');
  await order.locator('.order-doseUnits select').selectOption({ index: 1 });
  await order.locator('.order-frequency select').selectOption({ index: 1 });
  await order.locator('.order-duration input').fill('10');
  await order.locator('.order-durationUnits select').selectOption({ index: 1 });
  await order.locator('.order-quantity input').fill('20');
  await order.locator('.order-quantityUnits select').selectOption({ index: 1 });
};

test.describe('section-plan sections by parent encounter type', () => {
  const cases = [
    { name: 'primary care adult initial', uuid: PRIMARY_CARE_ADULT_INITIAL_ENCOUNTER_TYPE_UUID, ncd: false, assistance: false },
    { name: 'primary care adult followup', uuid: PRIMARY_CARE_ADULT_FOLLOWUP_ENCOUNTER_TYPE_UUID, ncd: false, assistance: false },
    { name: 'primary care peds initial', uuid: PRIMARY_CARE_PEDS_INITIAL_ENCOUNTER_TYPE_UUID, ncd: false, assistance: false },
    { name: 'primary care peds followup', uuid: PRIMARY_CARE_PEDS_FOLLOWUP_ENCOUNTER_TYPE_UUID, ncd: false, assistance: false },
    { name: 'NCD initial', uuid: NCD_INITIAL_ENCOUNTER_TYPE_UUID, ncd: true, assistance: false },
    { name: 'NCD followup', uuid: NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID, ncd: true, assistance: true },
  ];
  for (const c of cases) {
    test(`${c.name}: ${c.ncd ? 'free-text drug widget, suggested treatments, no return visit date' : 'standard drug widget and return visit date'}${c.assistance ? ', assistance table' : ''}`, async ({ page, createSectionEncounter }) => {
      // includeIf :108 / :113 / :206 / :292
      await open(page, createSectionEncounter, c.uuid);
      await expect(page.locator('#drug-orders textarea'), 'free-text dosing instructions exist only in the NCD widget').toHaveCount(c.ncd ? 1 : 0);
      await expect(page.locator('#drug-orders .three-columns')).toHaveCount(c.ncd ? 1 : 0);
      await expect(page.locator('#apptDate')).toHaveCount(c.ncd ? 0 : 1);
      await expect(page.locator('#assistance')).toHaveCount(c.assistance ? 1 : 0);
      // always present
      await expect(page.locator('#clinical-management-plan textarea')).toBeVisible();
      await expect(page.locator('#test-orders')).toBeVisible();
      await expect(page.locator('#disposition-section')).toBeVisible();
      // includeIf :94: the radiology component is on at zl-ci
      await expect(page.locator('#radiology-orders')).toContainText('At HUM, use Radiology order');
      await expect(page.locator('#radiology-orders input')).toHaveCount(0);
    });
  }

  test('ENTER/EDIT shows the heading, Save and Cancel', async ({ page, createSectionEncounter }) => {
    // ifMode VIEW include=false :48, :304
    await open(page, createSectionEncounter, PRIMARY_CARE_ADULT_INITIAL_ENCOUNTER_TYPE_UUID);
    await expect(page.locator('form#htmlform h1')).toBeVisible();
    await expect(page.locator(SAVE)).toBeVisible();
    await expect(page.locator('#buttons .cancel')).toBeVisible();
  });
});

test.describe('section-plan disposition', () => {
  test('each disposition shows its own extra field', async ({ page, createSectionEncounter }) => {
    // disposition widget (shared) wired by setupWhenThen
    await open(page, createSectionEncounter, PRIMARY_CARE_ADULT_INITIAL_ENCOUNTER_TYPE_UUID);
    const ward = page.locator('#disposition-emrapi-admittohospital-admissionlocation');
    const death = page.locator('#disposition-emrapi-death-deathdate');
    await expect(ward).toBeHidden();
    await disposition(page).selectOption({ label: 'Admission' });
    await expect(ward).toBeVisible();
    await expect(death).toBeHidden();
    await disposition(page).selectOption({ label: 'Death' });
    await expect(death).toBeVisible();
    await expect(ward).toBeHidden();
    await disposition(page).selectOption({ label: 'Discharge' });
    await expect(ward).toBeHidden();
    await expect(death).toBeHidden();
  });

  test('Admission without a ward is rejected and nothing is submitted; Discharge saves', async ({ page, api, createSectionEncounter }) => {
    // getBeforeValidation :28-44
    const section = await open(page, createSectionEncounter, PRIMARY_CARE_ADULT_INITIAL_ENCOUNTER_TYPE_UUID);
    const submits: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/submit.action')) {
        submits.push(r.url());
      }
    });
    await disposition(page).selectOption({ label: 'Admission' });
    await page.locator(SAVE).click();
    await expect(page.locator('#disposition .field-error').first()).toHaveText('Please fill out all fields associated with the selected disposition');
    await page.waitForTimeout(1000);
    expect(submits).toEqual([]);
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);

    // a disposition without extra fields passes the same rule; the error is cleared
    await disposition(page).selectOption({ label: 'Discharge' });
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    expectObs(await obsDisplays(api, section.encounter.uuid), 'disposition');
    // ApplyDispositionAction: a Discharge leaves the visit open (the visit is not ended by the plan section)
    const visit = await api.get(`visit/${section.encounter.visitUuid}?v=custom:(stopDatetime)`);
    expect((await visit.json()).stopDatetime).toBeNull();
  });
});

test.describe('section-plan under primary care adult initial', () => {
  const RETURN = iso(14);

  test('saves the plan, a medication order, the disposition, its comment and the return visit date; EDIT and VIEW show them', async ({ page, api, createSectionEncounter }) => {
    const section = await open(page, createSectionEncounter, PRIMARY_CARE_ADULT_INITIAL_ENCOUNTER_TYPE_UUID);
    await page.locator('#clinical-management-plan textarea').fill('Rest and fluids');
    await addMedication(page, 'Acetazolamide, 250mg tablet');
    await disposition(page).selectOption({ label: 'Discharge' });
    await page.locator('#disposition-section input[type=text]:not([readonly])').first().fill('Back if worse');
    await pickDate(page.locator('#apptDate input[readonly]'), RETURN);
    await save(page);

    expectObs(await obsDisplays(api, section.encounter.uuid), 'Rest and fluids', 'Back if worse', 'discharge');
    const orders = await api.get(`order?patient=${section.patient.uuid}&v=custom:(action,drug:(display),dose,quantity)`);
    expect(orders.ok()).toBeTruthy();
    const list = (await orders.json()).results as Array<{ action: string; drug: { display: string } | null; dose: number; quantity: number }>;
    expect(list).toHaveLength(1);
    expect(list[0].action).toBe('NEW');
    expect(list[0].drug?.display).toContain('Acetazolamide');
    expect(list[0].dose).toBe(250);
    expect(list[0].quantity).toBe(20);

    // EDIT starts from the saved values
    await page.goto(SectionFormPage.editUrl(FORM, section));
    await expect(page.locator(SAVE)).toBeVisible();
    await expect(page.locator('#clinical-management-plan textarea')).toHaveValue('Rest and fluids');
    await expect(disposition(page).locator('option:checked')).toHaveText('Discharge');
    await expect(page.locator('#disposition-section input[type=text]:not([readonly])').first()).toHaveValue('Back if worse');

    // VIEW on the visit page
    // the disposition widget prints the disposition's name ("Discharge"), the obs value is the category concept "Discharged"
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, { 'Disposition categories: Discharged': 'Discharge' });
    const shown = (await view.valueTexts()).join(' | ');
    expect(shown).toContain('Rest and fluids');
    expect(shown).toContain('Back if worse');
    expect(shown).toContain(viewDate(RETURN));
    await expect(view.root.locator('#buttons, input.submitButton, h1')).toHaveCount(0);
  });

  test('VIEW: nothing but the plan text is shown when only the plan text is saved', async ({ page, api, createSectionEncounter }) => {
    const section = await open(page, createSectionEncounter, PRIMARY_CARE_ADULT_INITIAL_ENCOUNTER_TYPE_UUID);
    await page.locator('#clinical-management-plan textarea').fill('Only a plan');
    await save(page);
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {});
    expect(await view.valueTexts()).toEqual(['Only a plan']);
  });
});

test.describe('section-plan under NCD followup', () => {
  test('saves the assistance table and the plan; EDIT and VIEW show them', async ({ page, api, createSectionEncounter }) => {
    const section = await open(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    const transport = page.locator('#assistance tr', { hasText: 'Transport' }).first();
    await transport.locator('input[type=checkbox]').nth(0).check(); // received
    await transport.locator('input[type=checkbox]').nth(1).check(); // recommended
    await page.locator('#assistance tr', { hasText: 'School' }).first().locator('input[type=checkbox]').nth(1).check(); // recommended only
    await page.locator('#assistance p input[type=text]').fill('Needs help with bus fare');
    await page.locator('#clinical-management-plan textarea').fill('Adjust amlodipine');
    await save(page);

    expectObs(await obsDisplays(api, section.encounter.uuid), 'Adjust amlodipine', 'Needs help with bus fare');

    await page.goto(SectionFormPage.editUrl(FORM, section));
    await expect(page.locator(SAVE)).toBeVisible();
    await expect(page.locator('#assistance tr', { hasText: 'Transport' }).first().locator('input[type=checkbox]').nth(0)).toBeChecked();
    await expect(page.locator('#assistance tr', { hasText: 'School' }).first().locator('input[type=checkbox]').nth(0)).not.toBeChecked();
    await expect(page.locator('#assistance tr', { hasText: 'School' }).first().locator('input[type=checkbox]').nth(1)).toBeChecked();
    await expect(page.locator('#assistance p input[type=text]')).toHaveValue('Needs help with bus fare');

    // the received / recommended boxes have answerLabel="" (the row label is the first cell): a bare [X] (obs display -> '' = not looked for)
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      'Socio-economic assistance received: Transport assistance': '',
      'Socio-economic assistance recommended: Transport assistance': '',
      'Socio-economic assistance recommended: School assistance': '',
    });
    const shown = await view.valueTexts();
    expect(shown).toEqual(expect.arrayContaining(['Adjust amlodipine', 'Needs help with bus fare']));
    expect(shown.filter((t) => t === '[X]')).toHaveLength(3);
    const school = view.root.locator('#assistance tr', { hasText: 'School' }).first();
    await expect(school.locator('.value')).toHaveCount(1);
  });
});

test.describe('section-plan under NCD initial', () => {
  test('lists the suggested treatments (cardiovascular, respiratory, endocrine, other)', async ({ page, createSectionEncounter }) => {
    // includeIf :113
    await open(page, createSectionEncounter, NCD_INITIAL_ENCOUNTER_TYPE_UUID);
    await expect(page.locator('#drug-orders .three-columns li', { hasText: 'Amlodipine besylate' })).toBeVisible();
    await expect(page.locator('#drug-orders .three-columns li', { hasText: 'Salbutamol' })).toBeVisible();
    await expect(page.locator('#drug-orders .three-columns li', { hasText: 'Metformin hydrochloride' })).toBeVisible();
  });
});
