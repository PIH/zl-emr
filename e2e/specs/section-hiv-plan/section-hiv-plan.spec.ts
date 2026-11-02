import { type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type SectionEncounter } from '../../core';
import {
  HIV_FOLLOWUP_ENCOUNTER_TYPE_UUID,
  HIV_INTAKE_ENCOUNTER_TYPE_UUID,
  PMTCT_FOLLOWUP_ENCOUNTER_TYPE_UUID,
  PMTCT_INTAKE_ENCOUNTER_TYPE_UUID,
} from '../../core/constants';
import { SectionFormPage, expectViewShowsSavedObs } from '../../pages';

// hiv/section-hiv-plan.xml v5.0: "Plan" of an HIV / PMTCT visit: support questions (PMTCT), radiology checkboxes, lab
// order widget (pihLabOrder), INH treatment line, ART / TB / STI treatment, ARV and other drug orders, family planning,
// socio-economic assistance, transfer out, clinical impression, action plan and return visit date. Section of the HIV
// intake (c31d306a), HIV followup (c31d3312), PMTCT intake (584124b9) and PMTCT followup (95e03e7d) encounters
// (documentation/_availability.e2e.md); the specs open its edit URL directly, building the patient and the parent type
// each test needs. The form uses the HFE <submit> tag: there is no #submit, the button is `#buttons input.submitButton`.
//
// Conditions in the form, from documentation inventory (section-hiv-plan.inv.md):
//   includeIf age at encounter > 1 :52   <enrollInProgram HIV> (no checkbox: enrolls on save)
//   includeIf type PMTCT intake :77 / PMTCT followup :109   #pmtct-support-q / #counsel-support (iron, mom club, ...)
//   includeIf gender F :277     "start ARV for PMTCT" radio + transfer checkbox inside #id-treatment-art
//   includeIf type HIV intake :314,:333,:349 / HIV followup :323,:338,:354   TB-need radio (4 / 5 answers), labels
//   includeIf type HIV followup :370 #id-treatment-sti-screening; :437 #id-treatment-sti-treatment (followup layout);
//     type HIV intake :401 #id-treatment-sti-treatment (intake layout, same id: never both rendered)
//   includeIf type HIV intake and age > 13 :741   #family-plan-section
//   when syphilis treatment need = Yes :453 -> #start-date-syph-treatment; other STI need = Yes :478 -> #other-sti-details
//   when referral/transfer = either answer :865/:866 -> #transfer-out-details; location Internal :879 -> #internal-transfer-out,
//     External :880 -> #external-transfer-out
//   ifMode VIEW include=false :56, :932   heading + script, #buttons
// Scripts: :60-73 setupReturnVisitDateValidation (zl.js, see _shared) on #apptDate: readonly datepicker; valid iff after the
//   encounter and (same year, or next year with month <= the encounter month), else an inline error; checked on change
//   and in beforeSubmit (blocks the save) (tested).
// Side effects on save: enrollInProgram HIV (:53, age > 1, tested); drug orders: ART :530 and other drugs :637 (the latter saved in
//   the last test: the patient is then left behind, see `leftover-patient`); lab orders (pihLabOrder :203) are not saved.
// Not covered here: pihLabOrder, the ART drug order (autocomplete concept), order revise/discontinue, the "Program Location" of the enrollment,
//   the location select of the internal transfer (options are staff-visible data).
// VIEW (getAsHtml.action on the saved encounter, end of the save test): the saved answers, dates and texts appear under their
//   sections, unfilled sections (internal transfer, TB) show no value, and #buttons (:932) is absent; a PMTCT intake VIEW shows the
//   support block (:77) and none of the HIV followup blocks.
//
// Findings:
//   V1 Low :62-66   `currentEncounterDate` is an implicit global assigned only when the encounter has a datetime. In ENTER
//                   mode (no encounter) the call at :68 throws "ReferenceError: currentEncounterDate is not defined" and the
//                   return-date validation is never installed (confirmed by opening the form in ENTER). Not reachable from the
//                   visit page (EDIT only). Fix: `var currentEncounterDate = new Date()` first.
//   V2 Low :313-331 for PMTCT intake/followup no TB-need radio is rendered (both includeIfs name the HIV types) although the
//                   question label (:308) and the date and regimen widgets are: the label has no answer (intent unconfirmed;
//                   tested as current behaviour).
//   V3 Low :94,:339,:655 hardcoded English texts ("Date", "Non-coded Formulation") outside message codes.
//   V4 Info :404,:440 same id `id-treatment-sti-treatment` twice in the file, under exclusive includeIfs (:401 / :437).

const FORM = 'hiv/section-hiv-plan.xml';
const SAVE = '#buttons input.submitButton';

type Gender = 'M' | 'F';

// Local helpers.
// Date as the VIEW shows it ("01 Oct 2026").
const viewDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
};
const pickDate = async (input: Locator, isoDate: string) => {
  await input.evaluate((el, iso) => {
    const j = (window as unknown as { jq: (e: unknown) => { datepicker: (...a: unknown[]) => void; trigger: (n: string) => void } }).jq;
    j(el).datepicker('setDate', new Date(`${iso}T12:00:00`));
    j(el).trigger('change');
  }, isoDate);
};
const isoDate = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = (n: number): string => isoDate(new Date(Date.now() + n * 86400000));
const obsDisplays = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> => {
  const res = await api.get(`obs?encounter=${encounterUuid}&v=custom:(display)&limit=200`);
  expect(res.ok()).toBeTruthy();
  return ((await res.json()).results as Array<{ display: string }>).map((o) => o.display.toLowerCase());
};
const enrollments = async (api: APIRequestContext, patientUuid: string): Promise<string[]> => {
  const res = await api.get(`programenrollment?patient=${patientUuid}&v=custom:(program:(name))`);
  expect(res.ok()).toBeTruthy();
  return ((await res.json()).results as Array<{ program: { name: string } }>).map((e) => e.program.name);
};

test.describe('section-hiv-plan', () => {
  let section: SectionEncounter;

  // The conditions depend on the parent encounter type and the patient, so each test builds its own fixture.
  const open = async (
    page: Page,
    createSectionEncounter: (o: { encounterTypeUuid: string; patient: { givenName: string; familyName: string; gender: Gender; birthdate: string } }) => Promise<SectionEncounter>,
    encounterTypeUuid = HIV_FOLLOWUP_ENCOUNTER_TYPE_UUID,
    gender: Gender = 'F',
    age = 30,
  ) => {
    section = await createSectionEncounter({ encounterTypeUuid, patient: { givenName: 'AutoHivPlan', familyName: 'Tester', gender, birthdate: birthdateYearsAgo(age) } });
    await page.goto(SectionFormPage.editUrl(FORM, section));
    await expect(page.locator(SAVE)).toBeVisible();
  };
  const save = async (page: Page) => {
    await page.locator(SAVE).click();
    await new SectionFormPage(page, FORM).expectSaved();
  };

  for (const row of [
    // type, gender, age, sections present, TB radios (answers + 3 regimen), ART radios (13 + 2 for females)
    { name: 'HIV intake, woman of 30', type: HIV_INTAKE_ENCOUNTER_TYPE_UUID, g: 'F', age: 30, present: ['#id-treatment-sti-treatment', '#family-plan-section'], tb: 7, art: 15 },
    { name: 'HIV intake, man of 13 (family planning needs age > 13)', type: HIV_INTAKE_ENCOUNTER_TYPE_UUID, g: 'M', age: 13, present: ['#id-treatment-sti-treatment'], tb: 7, art: 13 },
    { name: 'HIV intake, man of 14', type: HIV_INTAKE_ENCOUNTER_TYPE_UUID, g: 'M', age: 14, present: ['#id-treatment-sti-treatment', '#family-plan-section'], tb: 7, art: 13 },
    { name: 'HIV followup, woman of 30', type: HIV_FOLLOWUP_ENCOUNTER_TYPE_UUID, g: 'F', age: 30, present: ['#id-treatment-sti-screening', '#id-treatment-sti-treatment', '#start-date-syph-treatment'], tb: 8, art: 15 },
    { name: 'PMTCT intake, woman of 30', type: PMTCT_INTAKE_ENCOUNTER_TYPE_UUID, g: 'F', age: 30, present: ['#pmtct-support-q'], tb: 3, art: 15 },
    { name: 'PMTCT followup, woman of 30', type: PMTCT_FOLLOWUP_ENCOUNTER_TYPE_UUID, g: 'F', age: 30, present: ['#counsel-support'], tb: 3, art: 15 },
  ] as const) {
    test(`which blocks show: ${row.name}`, async ({ page, createSectionEncounter }) => {
      // includeIf :77, :109, :277, :314-:354, :370, :401, :437, :741 (V2 for the PMTCT TB count)
      await open(page, createSectionEncounter, row.type, row.g, row.age);
      const all = ['#pmtct-support-q', '#counsel-support', '#id-treatment-sti-screening', '#id-treatment-sti-treatment', '#start-date-syph-treatment', '#family-plan-section'];
      for (const sel of all) {
        await expect(page.locator(sel), sel).toHaveCount((row.present as readonly string[]).includes(sel) ? 1 : 0);
      }
      await expect(page.locator('#id-treatment-tb input[type=radio]')).toHaveCount(row.tb);
      await expect(page.locator('#id-treatment-art input[type=radio]')).toHaveCount(row.art); // female: + "start ARV for PMTCT" yes/no
      await expect(page.locator('#id-treatment-art input[type=checkbox]')).toHaveCount(row.g === 'F' ? 1 : 0);
    });
  }

  test('syphilis start date and the other-STI details show only for "Yes"', async ({ page, createSectionEncounter }) => {
    // when :453 and :478 (HIV followup layout)
    await open(page, createSectionEncounter);
    for (const [need, target] of [['#syph-treatment-need', '#start-date-syph-treatment'], ['#other-sti-treatment-need', '#other-sti-details']] as const) {
      await expect(page.locator(target)).toBeHidden();
      await page.locator(`${need} input[type=radio]`).first().check(); // yes
      await expect(page.locator(target)).toBeVisible();
      await page.locator(`${need} input[type=radio]`).nth(1).check(); // no
      await expect(page.locator(target)).toBeHidden();
    }
  });

  test('transfer-out details follow referral/transfer, and internal/external follow the location radio', async ({ page, createSectionEncounter }) => {
    // when :865, :866, :879, :880
    await open(page, createSectionEncounter);
    const details = page.locator('#transfer-out-details');
    await expect(details).toBeHidden();
    for (const i of [0, 1]) {
      await page.locator('#transfer-referral-spots input[type=radio]').nth(i).check(); // referral, then transfer
      await expect(details).toBeVisible();
    }
    await expect(page.locator('#internal-transfer-out')).toBeHidden();
    await expect(page.locator('#external-transfer-out')).toBeHidden();
    await page.locator('#transfer-out-spots input[type=radio]').first().check(); // internal
    await expect(page.locator('#internal-transfer-out')).toBeVisible();
    await expect(page.locator('#external-transfer-out')).toBeHidden();
    await page.locator('#transfer-out-spots input[type=radio]').nth(1).check(); // external
    await expect(page.locator('#external-transfer-out')).toBeVisible();
    await expect(page.locator('#internal-transfer-out')).toBeHidden();
  });

  test('an external location typed and then hidden by choosing Internal is not saved', async ({ page, api, createSectionEncounter }) => {
    // when :879/:880 hide the block only; HFE must not submit values of hidden inputs
    await open(page, createSectionEncounter);
    await page.locator('#transfer-referral-spots input[type=radio]').nth(1).check();
    await page.locator('#transfer-out-spots input[type=radio]').nth(1).check();
    await page.locator('#external-transfer-out input[type=text]').first().fill('Typed then hidden');
    await page.locator('#transfer-out-spots input[type=radio]').first().check();
    await expect(page.locator('#external-transfer-out')).toBeHidden();
    await save(page);
    expect((await obsDisplays(api, section.encounter.uuid)).some((d) => d.includes('typed then hidden'))).toBeFalsy();
  });

  // setupReturnVisitDateValidation (:68, zl.js): the picker has no min/max, so every date can be set; the rule is in the script
  test.describe('return visit date', () => {
    const encounterMonth = new Date().getMonth(); // 0-based; the encounter is created "now"
    const nextYear = new Date().getFullYear() + 1;
    const rows = [
      { name: 'yesterday', date: inDays(-1), valid: false },
      { name: 'in 30 days', date: inDays(30), valid: true },
      { name: 'two years ahead', date: inDays(730), valid: false },
      // next year with a month after the encounter month is invalid (no such month when the encounter is in December)
      ...(encounterMonth < 11 ? [{ name: 'next year, a month after the encounter month', date: `${nextYear}-${String(encounterMonth + 2).padStart(2, '0')}-20`, valid: false }] : []),
      { name: 'next year, in the encounter month', date: `${nextYear}-${String(encounterMonth + 1).padStart(2, '0')}-01`, valid: true },
    ];
    for (const row of rows) {
      test(`${row.name} is ${row.valid ? 'accepted' : 'rejected'}`, async ({ page, api, createSectionEncounter }) => {
        await open(page, createSectionEncounter);
        await pickDate(page.locator('#apptDate input.hasDatepicker'), row.date);
        const error = page.locator('#apptDate .field-error');
        if (row.valid) {
          await expect(error).toBeHidden();
          await save(page);
          expect((await obsDisplays(api, section.encounter.uuid)).some((d) => d.includes('return visit date'))).toBeTruthy();
        } else {
          await expect(error).toBeVisible();
          await page.locator(SAVE).click(); // beforeSubmit returns false: the form stays
          await page.waitForTimeout(1000);
          await expect(page).toHaveURL(/editHtmlFormWithStandardUi/);
          await expect(error).toBeVisible();
        }
      });
    }
  });

  test('enrolls an adult in the HIV program on save, a one-year-old is not enrolled', async ({ page, api, createSectionEncounter }) => {
    // includeIf :52 + enrollInProgram :53 (age at encounter > 1)
    await open(page, createSectionEncounter, HIV_INTAKE_ENCOUNTER_TYPE_UUID, 'M', 1);
    await save(page);
    expect(await enrollments(api, section.patient.uuid)).toEqual([]);
    await open(page, createSectionEncounter, HIV_INTAKE_ENCOUNTER_TYPE_UUID, 'M', 30);
    await save(page);
    expect(await enrollments(api, section.patient.uuid)).toEqual(['HIV']);
  });

  test('saves the plan answers, EDIT shows them, and the patient is enrolled in the HIV program', async ({ page, api, createSectionEncounter }) => {
    test.setTimeout(60_000); // save + EDIT + VIEW page loads each take several seconds on the server: over the default 30s
    await open(page, createSectionEncounter);
    await page.locator('#radiology-orders').getByLabel('Chest', { exact: false }).first().check();
    await page.locator('#id-treatment-art input[type=radio]').first().check(); // needs ART: no, not indicated
    await page.locator('#id-treatment-sti-screening input[type=radio]').first().check(); // discharge: yes
    await page.locator('#syph-treatment-need input[type=radio]').first().check();
    await pickDate(page.locator('#start-date-syph-treatment input.hasDatepicker'), '2026-10-01');
    await page.locator('#assistance input[type=checkbox]').first().check(); // transport received
    await page.locator('#transfer-referral-spots input[type=radio]').nth(1).check(); // transfer
    await page.locator('#transfer-out-spots input[type=radio]').nth(1).check(); // external
    await page.locator('#external-transfer-out input[type=text]').first().fill('Clinic Elsewhere');
    await page.locator('#hiv-disposition-section textarea').first().fill('Stable on treatment');
    await page.locator('#hiv-disposition-section textarea').nth(1).fill('Return in one month');
    await pickDate(page.locator('#apptDate input.hasDatepicker'), inDays(30));
    await save(page);

    const displays = await obsDisplays(api, section.encounter.uuid);
    for (const expected of [
      'eligible for antiretroviral therapy (art): no', 'genital discharge: yes', 'syphilis counseling and treatment: yes', 'syphilis drug start date: 2026-10-01',
      'socio-economic assistance received: transport assistance', 'radiology image order (coded): chest', 'referral or transfer?: transfer',
      'transfer out location: non-pih facility', 'name of external transfer location: clinic elsewhere', 'clinical management plan comment: stable on treatment',
      'comments at conclusion of examination: return in one month', `return visit date: ${inDays(30)}`,
    ]) {
      expect(displays.some((d) => d.includes(expected)), expected).toBeTruthy();
    }
    expect(await enrollments(api, section.patient.uuid)).toEqual(['HIV']);

    await page.goto(SectionFormPage.editUrl(FORM, section));
    await expect(page.locator(SAVE)).toBeVisible();
    // when :453, :865, :880 start from the saved values
    await expect(page.locator('#start-date-syph-treatment')).toBeVisible();
    await expect(page.locator('#transfer-out-details')).toBeVisible();
    await expect(page.locator('#external-transfer-out')).toBeVisible();
    await expect(page.locator('#internal-transfer-out')).toBeHidden();
    await expect(page.locator('#hiv-disposition-section textarea').first()).toHaveValue('Stable on treatment');

    // VIEW: the saved plan appears under its sections; what was not filled shows no value
    // coded answers the form labels differently (answerCode, answerLabel="") and the dates (obs display -> text shown)
    const labels = {
      [`Return visit date: ${inDays(30)}`]: viewDate(inDays(30)),
      'Syphilis drug start date: 2026-10-01': '01 Oct 2026',
      'Socio-economic assistance received: Transport assistance': '[X]',
      'Transfer out location: Non-PIH facility': 'External',
      'Radiology image order (coded): Chest, 1 view (X-ray)': 'Chest X-ray',
    };
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, labels);
    const shown = await view.valueTexts();
    for (const expected of ['Clinic Elsewhere', 'Stable on treatment', 'Return in one month', '01 Oct 2026', viewDate(inDays(30)), '[X] Chest X-ray', '[X] External']) {
      expect(shown, expected).toContain(expected);
    }
    await expect(view.page.locator('#hiv-disposition-section .value')).toHaveCount(3); // plan text, action plan, return date
    await expect(view.page.locator('#external-transfer-out .value')).not.toHaveCount(0);
    await expect(view.page.locator('#internal-transfer-out .value')).toHaveCount(0);
    await expect(view.page.locator('#id-treatment-tb .value')).toHaveCount(0);
    await expect(view.page.locator('#family-plan-section')).toHaveCount(0); // HIV followup: the block is not rendered
    await expect(view.page.locator('#buttons, #buttons input.submitButton')).toHaveCount(0);
  });

  // VIEW of a PMTCT intake: the support block is rendered with the saved answers, the HIV-followup-only blocks are not.
  test('VIEW: a PMTCT intake shows its saved support answers and none of the HIV followup blocks', async ({ page, api, createSectionEncounter }) => {
    await open(page, createSectionEncounter, PMTCT_INTAKE_ENCOUNTER_TYPE_UUID);
    await page.locator('#pmtct-support-q input[type=radio]').first().check(); // iron/folate: yes
    await page.locator('#pmtct-support-q input[type=radio]').nth(2).check(); // mom club: yes
    await save(page);

    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid);
    expect((await view.valueTexts()).filter((t) => t === '[X] Yes')).toHaveLength(2);
    await expect(view.page.locator('#pmtct-support-q .value')).toHaveCount(2);
    await expect(view.page.locator('#id-treatment-sti-screening, #counsel-support, #family-plan-section')).toHaveCount(0);
    await expect(view.page.locator('#buttons')).toHaveCount(0);
  });

  // Saves one "other drugs" order (Cotrimoxazole): the cleanup voids the encounter, and the order with it. The ART widget (:530) has an autocomplete
  // concept whose <select> is hidden and a drug list that stays hidden until a concept is chosen: not driven here.
  test('saves an "other drugs" order', async ({ page, api, createSectionEncounter }) => {
    // <drugOrder> :637
    await open(page, createSectionEncounter);
    await page.locator('#order-action-button-NEW').nth(1).click();
    const order = page.locator('.orderwidget-order-form:visible');
    await order.locator('.order-concept select').selectOption({ label: 'Cotrimoxazole' });
    await order.locator('.order-dose input').fill('480');
    await order.locator('.order-doseUnits select').selectOption({ index: 1 });
    await order.locator('.order-frequency select').selectOption({ label: 'OD (once daily)' });
    await order.locator('.order-route select').selectOption({ index: 1 });
    await order.locator('.order-duration input').fill('30');
    await order.locator('.order-durationUnits select').selectOption({ index: 1 });
    await order.locator('.order-quantity input').fill('30');
    await order.locator('.order-quantityUnits select').selectOption({ index: 1 });
    await save(page);

    const res = await api.get(`order?patient=${section.patient.uuid}&v=custom:(action,concept:(display),dose,quantity)`);
    expect(res.ok()).toBeTruthy();
    const orders = (await res.json()).results as Array<{ action: string; concept: { display: string }; dose: number; quantity: number }>;
    expect(orders).toHaveLength(1);
    expect(orders[0].action).toBe('NEW');
    expect(orders[0].concept.display.toLowerCase()).toContain('cotrimoxazole');
    expect(orders[0].dose).toBe(480);
    expect(orders[0].quantity).toBe(30);
  });
});
