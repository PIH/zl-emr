import { type APIRequestContext, type Page, type Locator } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type EntryContext } from '../../core';
import { PREP_INTAKE_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, ViewFormPage, expectViewShowsSavedObs, VISIT_PAGE_URL } from '../../pages';

// hiv/prep-intake.xml: "Pre-Exposure Prophylaxis (PrEP) Intake" (population category, education, HIV / RPR results, PrEP
// counselling and screening, consent, PrEP start date and drug order, prevention, referral / return date). Top-level form
// with its own provider/location/date (shared subform, tag "Consult Note Location", role 4f10ad1a). The specs open
// enterHtmlFormWithStandardUi inside a visit they create (EntryFormPage); availability (documentation/_availability.e2e.md:
// HIV_PREVENTION component, "Task: emr.enterVCT", no PrEP intake/followup yet in the visit) is not exercised. The form
// uses <submit>, so there is no #submit: the specs click `#buttons input.submitButton`.
//
// Conditions in the form, from documentation inventory (prep-intake.inv.md):
//   includeIf patient is female :229  pregnancy test result (CIEL:45) in the lab-exam row
//   includeIf patient is male   :445  VMMC question (CIEL:166677)
//   when #previous-prep (CIEL:170089) = Yes :479  show #est-prog-start (estimated program start date)
//   ifMode VIEW include=false   :62, :517  heading, buttons (absent in the VIEW, tested)
// Scripts: :81-85 updateLastCheckboxRequired (zl.js, see _shared V6) on #pop-cat: no population category ticked -> message in
//   #pop-required-msg, last box focused, and beforeSubmit returns false, so the save is blocked. Evaluated on load, on
//   change/keyup and before submit.
// Side effects on save: a drug order (<drugOrder> :357: TDF/3TC 300/300mg or FTC/TDF 200/300mg, oral, outpatient, routine);
//   no program enrollment and no post-submission action. Only one test saves the order, and it is asserted through REST.
// VIEW (getAsHtml.action with this form's file; own tests after the saves, test.fixme: HAI-1278): every saved value is shown under the form's own labels ("-" for
//   a negative result, "yes" for circumcised), dates as "dd MMM yyyy"; unfilled sections and the other sex's questions show no value. The
//   PrEP order is drawn client-side (orderWidget.initialize), so it is not asserted in VIEW.
// Not covered here: EDIT mode, retro-entry gating (_shared.e2e.md), the other order actions (revise, renew,
//   discontinue), the RPR and hepatitis B rows.
//
// Findings:
//   V1 Low :101  the repeat template has answerXXX="{aLabel}" (not an HFE attribute, answerLabel/answerCode is), so the
//                population-category checkboxes show the concept names ("Male who has sex with men", "Female sex worker",
//                ...) and never the intended HARSAH / PS / TG / discordant / other strings. Fix: answerCode="{aLabel}".
//                (confirmed: rendered labels are not the render strings)
//   VW1 Low :479-489 VIEW does not run the <when> on #est-prog-start, so an intake with "no" (or no answer) for PrEP followup elsewhere gets the
//                      estimated-start-date label and a blank line. Fix: <includeIf> on the obs value, or hide the block in VIEW. TESTED (VIEW, test.fixme).
//   see _shared V6: the "required" message of #pop-cat is shown on load, before the user acts (tested).

const FORM = 'hiv/prep-intake.xml';
// VIEW shows the form's own answer labels and dates as "dd MMM yyyy", not the concept names and ISO dates
const VIEW_LABELS: Record<string, string> = {
  'Rapid test for HIV: Negative': '-',
  'Date of laboratory test: 2026-10-01': '01 Oct 2026',
  'Estimated start date of pre-exposure prophylaxis (PrEP): 2026-09-01': '01 Sep 2026',
  'Highest education level: Secondary school': 'Secondary',
};

// Local helpers.
// <submit/> renders input.submitButton (no #submit). The location select must have a value or "Required" blocks the save.
const save = async (page: Page) => {
  await expect(page.locator('#encounterLocation select')).not.toHaveValue('');
  await page.locator('#buttons input.submitButton').click();
  await expect(page).toHaveURL(VISIT_PAGE_URL);
};
// The date inputs are read-only datepickers: set the date the way the picker does.
const pickDate = async (input: Locator, isoDate: string) => {
  await input.evaluate((el, iso) => {
    const j = (window as unknown as { jq: (e: unknown) => { datepicker: (...a: unknown[]) => void; trigger: (n: string) => void } }).jq;
    j(el).datepicker('setDate', new Date(`${iso}T12:00:00`));
    j(el).trigger('change');
  }, isoDate);
};

test.describe('prep-intake @hiv-ci', () => {
  let context: EntryContext;

  const open = async (page: Page, createEntryContext: (p: { givenName: string; familyName: string; gender: 'M' | 'F'; birthdate: string }) => Promise<EntryContext>, gender: 'M' | 'F') => {
    context = await createEntryContext({ givenName: 'AutoPrepIntake', familyName: 'Tester', gender, birthdate: birthdateYearsAgo(30) });
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#overview')).toBeVisible();
  };

  for (const { gender, labResultRadios, vmmc } of [
    { gender: 'F', labResultRadios: 5, vmmc: 0 }, // HBsAg (3 answers) + pregnancy (2)
    { gender: 'M', labResultRadios: 3, vmmc: 1 },
  ] as const) {
    test(`a ${gender === 'F' ? 'female' : 'male'} patient sees ${gender === 'F' ? 'the pregnancy test' : 'the VMMC question'} only`, async ({ page, createEntryContext }) => {
      // includeIf :229 (female) and :445 (male)
      await open(page, createEntryContext, gender);
      await expect(page.locator('#first-steps .three-columns input[type=radio]')).toHaveCount(labResultRadios);
      await expect(page.getByText('Voluntary male circumcision (VMMC)', { exact: true })).toHaveCount(vmmc);
    });
  }

  test('the estimated program start date shows only when PrEP followup elsewhere is Yes', async ({ page, createEntryContext }) => {
    // when :479
    await open(page, createEntryContext, 'F');
    const date = page.locator('#est-prog-start');
    await expect(date).toBeHidden();
    await page.locator('#previous-prep input[type=radio]').first().check(); // yes
    await expect(date).toBeVisible();
    await page.locator('#previous-prep input[type=radio]').nth(1).check(); // no
    await expect(date).toBeHidden();
  });

  test('a population category is required: the message shows on load, blocks the save and clears when one is ticked', async ({ page, api, createEntryContext }) => {
    // script :81-85 (updateLastCheckboxRequired, _shared V6)
    await open(page, createEntryContext, 'F');
    const message = page.locator('#pop-required-msg');
    await expect(message).not.toBeEmpty(); // shown before the user acts

    await expect(page.locator('#encounterLocation select')).not.toHaveValue('');
    await page.locator('#buttons input.submitButton').click();
    await expect(message).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);

    await page.getByLabel('Transgender', { exact: true }).check();
    await expect(message).toBeEmpty();
    await page.getByLabel('Transgender', { exact: true }).uncheck();
    await expect(message).not.toBeEmpty();
  });

  const saveFemaleIntake = async (page: Page, api: APIRequestContext, createEntryContext: CustomTestFixtures['createEntryContext']) => {
    await open(page, createEntryContext, 'F');
    await page.getByLabel('Female sex worker', { exact: true }).check();
    await page.getByLabel('Intravenous drug use', { exact: true }).check();
    await page.locator('#school input[type=radio]').nth(2).check(); // secondary
    const hivRow = page.locator('#first-steps table tr').nth(1);
    await hivRow.locator('input[type=radio]').nth(1).check(); // negative
    await pickDate(hivRow.locator('input.hasDatepicker'), '2026-10-01');
    await page.locator('#first-steps table tr', { hasText: 'PrEP counselling' }).locator('input[type=radio]').first().check();
    await page.locator('#first-steps table tr', { hasText: 'interested in PrEP' }).locator('input[type=radio]').first().check();
    await page.locator('#first-steps .three-columns input[type=text]').fill('95'); // creatinine clearance
    await page.locator('#first-steps table tr', { hasText: 'Decision to start PrEP' }).locator('input[type=radio]').first().check();
    await page.locator('#consent input[type=radio]').first().check();
    await page.locator('#previous-prep input[type=radio]').first().check();
    await pickDate(page.locator('#est-prog-start input.hasDatepicker'), '2026-09-01');
    await save(page);

    await expect.poll(async () => (await getPatientEncounters(api, context.patient.uuid)).length).toBe(1);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    expect(encounter.encounterType.uuid).toBe(PREP_INTAKE_ENCOUNTER_TYPE_UUID);
    const joined = (await getEncounterObs(api, encounter.uuid)).map((o) => o.display).join(' | ');
    for (const expected of ['Female sex worker', 'Intravenous drug use', 'Secondary', 'Negative', '95']) {
      expect(joined, expected).toContain(expected);
    }
    return encounter;
  };

  test('saves a female patient\'s intake (categories, results with dates, counselling, consent, referral)', async ({ page, api, createEntryContext }) => {
    await saveFemaleIntake(page, api, createEntryContext);
  });

  test('VIEW: a female patient\'s saved intake (HAI-1278, remove test.fixme() when fixed)', async ({ page, api, createEntryContext }) => {
    test.fixme(); // HAI-1278: zl.js calls beforeSubmit, which the visit page does not define
    const encounter = await saveFemaleIntake(page, api, createEntryContext);
    // the form's own labels (answerCodes: "-" for negative, "Secondary"), dates as "dd MMM yyyy", the unticked categories and
    // the untouched sections show no value, and the ifMode VIEW include=false parts (:62, :517) are absent
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, VIEW_LABELS);
    await expect(page.locator('#pop-cat .value')).toHaveText(['[X] Female sex worker', '[X] Intravenous drug use']);
    await expect(page.locator('#school .value')).toHaveText('[X] Secondary');
    expect(await view.valueTexts()).toEqual(expect.arrayContaining(['[X] -', '01 Oct 2026', '95']));
    await expect(page.locator('#est-prog-start .value')).toHaveText('01 Sep 2026');
    await expect(page.locator('#prevention .value, #referral .value:not(#est-prog-start .value, #previous-prep .value)')).toHaveCount(0);
    await expect(page.getByText('Voluntary male circumcision (VMMC)', { exact: true })).toHaveCount(0); // includeIf :445 (male only)
    await expect(page.locator('h2, #buttons, input.submitButton, #encounterLocation')).toHaveCount(0);
  });

  // VW1 (Low): the <when> that hides #est-prog-start does not run in VIEW (:479), so an intake where PrEP was not followed elsewhere gets the
  // estimated-start-date label and a blank line. Intended: no such block unless "yes". Remove test.fixme() when it is hidden in VIEW.
  test('VIEW: an intake with "no" for PrEP followup elsewhere has no estimated start date block (VW1)', async ({ page, api, createEntryContext }) => {
    test.fixme();
    await open(page, createEntryContext, 'F');
    await page.getByLabel('Transgender', { exact: true }).check();
    await page.locator('#previous-prep input[type=radio]').nth(1).check(); // no
    await save(page);

    await expect.poll(async () => (await getPatientEncounters(api, context.patient.uuid)).length).toBe(1);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    await ViewFormPage.open(page, FORM, encounter.uuid);
    await expect(page.locator('#previous-prep .value')).toHaveText('[X] no');
    await expect(page.locator('#est-prog-start')).toBeHidden();
  });

  const saveMaleIntake = async (page: Page, api: APIRequestContext, createEntryContext: CustomTestFixtures['createEntryContext']) => {
    // <drugOrder> :357: the one order save of this spec
    await open(page, createEntryContext, 'M');
    await page.getByLabel('Male who has sex with men', { exact: true }).check();
    await page.locator('#prevention p', { hasText: 'Condoms provided' }).locator('input[type=radio]').first().check();
    await page.locator('#prevention p', { hasText: 'Voluntary male circumcision' }).locator('input[type=radio]').first().check();

    await page.locator('#order-action-button-NEW').click();
    const order = page.locator('.orderwidget-orderable-section .orderwidget-order-form');
    await order.locator('.order-drug select').selectOption({ label: 'TDF/3TC 300/300mg' });
    await order.locator('.order-dose input').fill('1');
    await order.locator('.order-frequency select').selectOption({ label: 'OD (once daily)' });
    await order.locator('.order-duration input').fill('30');
    await order.locator('.order-durationUnits select').selectOption({ label: 'Days' });
    await order.locator('.order-quantity input').fill('30');
    await save(page);

    await expect.poll(async () => (await getPatientEncounters(api, context.patient.uuid)).length).toBe(1);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    const joined = (await getEncounterObs(api, encounter.uuid)).map((o) => o.display).join(' | ');
    expect(joined).toContain('Male who has sex with men');

    const res = await api.get(`order?patient=${context.patient.uuid}&t=drugorder&v=custom:(drug:(uuid),dose,quantity,duration,action,encounter:(uuid))`);
    expect(res.ok()).toBeTruthy();
    const orders = (await res.json()).results as { drug: { uuid: string }; dose: number; quantity: number; duration: number; action: string; encounter: { uuid: string } }[];
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ drug: { uuid: '78f96a76-dfbe-11e9-8a34-2a2ae2dbcce4' }, dose: 1, quantity: 30, duration: 30, action: 'NEW', encounter: { uuid: encounter.uuid } });
    return encounter;
  };

  test('saves a male patient\'s prevention answers and a PrEP drug order', async ({ page, api, createEntryContext }) => {
    await saveMaleIntake(page, api, createEntryContext);
  });

  test('VIEW: a male patient\'s saved prevention answers (HAI-1278, remove test.fixme() when fixed)', async ({ page, api, createEntryContext }) => {
    test.fixme(); // HAI-1278: zl.js calls beforeSubmit, which the visit page does not define
    const encounter = await saveMaleIntake(page, api, createEntryContext);
    // the VMMC question (males only) and the answers show (the order widget is drawn by orderWidget.initialize, which does not
    // run in the VIEW HTML loaded by the harness, so the order is not asserted here)
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, { 'Male circumcision status: Circumcised foreskin': 'yes' });
    expect(await view.valueTexts()).toEqual(expect.arrayContaining(['[X] Male who has sex with men', '[X] yes']));
    await expect(page.locator('#prevention .value')).toHaveCount(2); // condoms and VMMC; the other prevention answers were not filled
    await expect(page.getByText('Voluntary male circumcision (VMMC)', { exact: true })).toHaveCount(1);
  });
});
