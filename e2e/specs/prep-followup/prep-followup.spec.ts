import { type Page, type Locator } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { PREP_FOLLOWUP_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, SectionFormPage, ViewFormPage, expectViewShowsSavedObs, VISIT_PAGE_URL } from '../../pages';

// hiv/prep-followup.xml: "Pre-Exposure Prophylaxis (PrEP) Followup" (pregnancy and breastfeeding for women, side effects, STI
// symptoms, HIV / RPR results and creatinine clearance, PrEP drug order, prevention, adherence, disposition, return date,
// remarks). Top-level form with its own provider/location/date (shared subform, tag "Consult Note Location", role
// 4f10ad1a). The specs open enterHtmlFormWithStandardUi inside a visit they create (EntryFormPage), and the edit URL
// directly for EDIT; availability (documentation/_availability.e2e.md: HIV_PREVENTION component, "Task: emr.enterVCT", no
// PrEP intake/followup yet in the visit) is not exercised. The form uses <submit>, so there is no #submit: the specs click
// `#buttons input.submitButton`.
//
// Conditions in the form, from documentation inventory (prep-followup.inv.md):
//   includeIf patient is female :133  pregnant (CIEL:5272, #hivpregnant), breastfeeding (CIEL:985, #breastfeeding-mom), #wean-date
//   includeIf patient is male   :390  VMMC question (CIEL:166677)
//   when #breastfeeding-mom (CIEL:985) = stopped (CIEL:1152) :155  show #wean-date (HFE also clears the date when it hides)
//   ifMode EDIT   :43   CSS of the disposition block only
//   ifMode VIEW include=false :74, :443  heading + provider/location/date, and the buttons (absent in the VIEW, tested)
// Scripts: none in the file (only the shared subform's, see _shared.e2e.md).
// Side effects on save: <enrollInProgram programId="PrEP"> :127 (enrolls the patient in the PrEP program, tested);
//   ApplyDispositionAction :22 (only acts on a disposition obs; the specs leave #disposition empty: a disposition can discharge,
//   transfer or record a death); a drug order (<drugOrder> :302: TDF/3TC 300/300mg or FTC/TDF 200/300mg). Only one test saves the
//   order, and it is asserted through REST.
// VIEW (getAsHtml.action with this form's file; end of three save tests): every saved value is shown under the form's labels, dates as
//   "dd MMM yyyy", unfilled blocks show no value. The PrEP order is drawn client-side (orderWidget.initialize), so it is not asserted in VIEW.
// Not covered here: retro-entry gating (_shared.e2e.md), the disposition options and ApplyDispositionAction, the
//   other order actions (revise, renew, discontinue), the RPR row, the mapping of the four other adherence answers
//   (PIH:20900-20903 are not in the Sierra Leone concept-mappings file, so their names are unverified).
//
// Findings:
//   V1 Low :181, :211  the side-effect and STI-symptom repeat templates carry ansSide="{adverse}" / ansSti="{stiSympt}" (not HFE
//                      attributes; nothing reads the render values), so the checkboxes show concept names, which are the same
//                      for the two lists ("Abdominal pain", "Other", ...). Harmless today; the render attributes are dead.
//                      Fix: answerCode="..." or drop them.
//   VW1 Low :155-165 VIEW does not run the <when> on #wean-date, so a mother who is still breastfeeding (or has no answer) gets the wean-date
//                      label and a blank line. Fix: <includeIf> on the obs value, or hide the block in VIEW. TESTED (VIEW, test.fixme).

const FORM = 'hiv/prep-followup.xml';
// VIEW shows the form's own labels and dates as "dd MMM yyyy", not the concept names and ISO dates
const VIEW_LABELS: Record<string, string> = {
  'Adherence to post exposure prophylaxis: > 95%': '>95%',
  'Return visit date: 2030-12-15': '15 Dec 2030',
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

test.describe('prep-followup', () => {
  let context: EntryContext;

  const open = async (page: Page, createEntryContext: (p: { givenName: string; familyName: string; gender: 'M' | 'F'; birthdate: string }) => Promise<EntryContext>, gender: 'M' | 'F') => {
    context = await createEntryContext({ givenName: 'AutoPrepFollowup', familyName: 'Tester', gender, birthdate: birthdateYearsAgo(30) });
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#monitor')).toBeVisible();
  };
  const savedEncounter = async (api: import('@playwright/test').APIRequestContext) => {
    await expect.poll(async () => (await getPatientEncounters(api, context.patient.uuid)).length).toBe(1);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    expect(encounter.encounterType.uuid).toBe(PREP_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    return { uuid: encounter.uuid, displays: (await getEncounterObs(api, encounter.uuid)).map((o) => o.display) };
  };

  for (const { gender, women, vmmc } of [
    { gender: 'F', women: 1, vmmc: 0 },
    { gender: 'M', women: 0, vmmc: 1 },
  ] as const) {
    test(`a ${gender === 'F' ? 'female' : 'male'} patient sees ${gender === 'F' ? 'pregnancy and breastfeeding' : 'the VMMC question'} only`, async ({ page, createEntryContext }) => {
      // includeIf :133 (female) and :390 (male)
      await open(page, createEntryContext, gender);
      await expect(page.locator('#hivpregnant')).toHaveCount(women);
      await expect(page.locator('#breastfeeding-mom')).toHaveCount(women);
      await expect(page.locator('#wean-date')).toHaveCount(women);
      await expect(page.getByText('Voluntary male circumcision (VMMC)', { exact: true })).toHaveCount(vmmc);
    });
  }

  test('the wean date shows only when breastfeeding is "stopped", and is cleared when hidden', async ({ page, createEntryContext }) => {
    // when :155
    await open(page, createEntryContext, 'F');
    const date = page.locator('#wean-date');
    const display = date.locator('input.hasDatepicker');
    await expect(date).toBeHidden();
    await page.locator('#breastfeeding-mom input[type=radio]').nth(1).check(); // stopped
    await expect(date).toBeVisible();
    await pickDate(display, '2026-08-01');
    await expect(display).not.toHaveValue('');
    await page.locator('#breastfeeding-mom input[type=radio]').first().check(); // currently
    await expect(date).toBeHidden();
    await page.locator('#breastfeeding-mom input[type=radio]').nth(1).check();
    await expect(display).toHaveValue('');
  });

  test('a saved "stopped" breastfeeding answer shows its wean date when the form is reopened (EDIT)', async ({ page, api, createEntryContext }) => {
    // when :155, EDIT starts from the saved value
    await open(page, createEntryContext, 'F');
    await page.locator('#breastfeeding-mom input[type=radio]').nth(1).check();
    await pickDate(page.locator('#wean-date input.hasDatepicker'), '2026-08-01');
    await save(page);
    const { uuid } = await savedEncounter(api);

    await page.goto(SectionFormPage.editUrl(FORM, { patient: context.patient, encounter: { uuid, visitUuid: context.visitUuid } }));
    await expect(page.locator('#buttons input.submitButton')).toBeVisible();
    await expect(page.locator('#breastfeeding-mom input[type=radio]').nth(1)).toBeChecked();
    await expect(page.locator('#wean-date')).toBeVisible();
    await expect(page.locator('#wean-date input.hasDatepicker')).not.toHaveValue('');

    // VIEW of the same encounter: "stopped" under the form's label, with its wean date
    const view = await expectViewShowsSavedObs(page, api, FORM, uuid, { 'Feeding plan: Weaned': 'Stopped breastfeeding', 'Weaning date: 2026-08-01': '01 Aug 2026' });
    await expect(page.locator('#breastfeeding-mom .value')).toHaveText('[X] Stopped breastfeeding');
    await expect(page.locator('#wean-date .value')).toHaveText('01 Aug 2026');
    expect(await view.valueTexts()).toHaveLength(2);
  });

  // VW1 (Low): the <when> that hides #wean-date does not run in VIEW (:155), so a mother who is still breastfeeding gets the wean-date
  // label and a blank line. Intended: no wean-date block unless "stopped". Remove test.fixme() when the block is hidden in VIEW.
  test('VIEW: a mother currently breastfeeding has no wean-date block (VW1)', async ({ page, api, createEntryContext }) => {
    test.fixme();
    await open(page, createEntryContext, 'F');
    await page.locator('#breastfeeding-mom input[type=radio]').first().check(); // currently
    await save(page);
    const { uuid } = await savedEncounter(api);

    await ViewFormPage.open(page, FORM, uuid);
    await expect(page.locator('#breastfeeding-mom .value')).toHaveText('[X] Currently');
    await expect(page.locator('#wean-date')).toBeHidden();
  });

  test('saves the monitoring answers and enrolls the patient in the PrEP program', async ({ page, api, createEntryContext }) => {
    await open(page, createEntryContext, 'F');
    const enrollmentsUrl = `programenrollment?patient=${context.patient.uuid}&v=custom:(program:(name),dateCompleted)`;
    expect(((await (await api.get(enrollmentsUrl)).json()).results as unknown[]).length).toBe(0);

    await page.locator('#hivpregnant input[type=radio]').nth(1).check(); // no
    // the last .two-columns holds the side effects (left) and the STI symptoms (right), 2nd box of each: rash, genital ulcers
    const lists = page.locator('#monitor .two-columns').last().locator('> div');
    await lists.nth(0).locator('input[type=checkbox]').nth(1).check();
    await lists.nth(1).locator('input[type=checkbox]').nth(1).check();
    await page.locator('#comments input[type=radio]').first().check(); // adherence >95%
    await pickDate(page.locator('#apptDate input.hasDatepicker'), '2030-12-15');
    await page.locator('#comments textarea').fill('AutoPrep remark');
    await save(page);

    const { displays } = await savedEncounter(api);
    const joined = displays.join(' | ');
    for (const expected of ['Rash', 'Genital ulcers', 'Pregnancy status: No', '> 95%', '2030-12-15', 'AutoPrep remark']) {
      expect(joined, expected).toContain(expected);
    }
    const enrollments = (await (await api.get(enrollmentsUrl)).json()).results as { program: { name: string }; dateCompleted: string | null }[];
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0].program.name).toMatch(/PrEP/i);
    expect(enrollments[0].dateCompleted).toBeNull();

    // VIEW: the answers under the form's labels (">95%", "no"), the return date as "dd MMM yyyy", the remark; what was not filled shows no value
    const view = await expectViewShowsSavedObs(page, api, FORM, (await getPatientEncounters(api, context.patient.uuid))[0].uuid, VIEW_LABELS);
    expect(await view.valueTexts()).toEqual(['[X] no', '[X] Rash', '[X] Genital ulcers', '[X] >95%', '15 Dec 2030', 'AutoPrep remark']);
    await expect(page.locator('#hivpregnant .value')).toHaveText('[X] no');
    await expect(page.locator('#apptDate .value')).toHaveText('15 Dec 2030');
    await expect(page.locator('#breastfeeding-mom .value, #wean-date .value, #prevention .value')).toHaveCount(0);
    await expect(page.locator('#buttons, input.submitButton, #encounterLocation')).toHaveCount(0); // ifMode VIEW include=false :74, :443 (the h2 at :297 is the form's own)
  });

  test('saves a male patient\'s prevention answers and a PrEP drug order', async ({ page, api, createEntryContext }) => {
    // <drugOrder> :302: the one order save of this spec (the patient is left behind, see the header)
    await open(page, createEntryContext, 'M');
    await page.locator('#prevention p', { hasText: 'Condoms provided' }).locator('input[type=radio]').first().check();
    await page.locator('#order-action-button-NEW').click();
    const order = page.locator('.orderwidget-orderable-section .orderwidget-order-form');
    await order.locator('.order-drug select').selectOption({ label: 'FTC/TDF 200/300mg' });
    await order.locator('.order-dose input').fill('1');
    await order.locator('.order-frequency select').selectOption({ label: 'OD (once daily)' });
    await order.locator('.order-duration input').fill('30');
    await order.locator('.order-durationUnits select').selectOption({ label: 'Days' });
    await order.locator('.order-quantity input').fill('30');
    await save(page);

    const { uuid, displays } = await savedEncounter(api);
    expect(displays.join(' | ')).toContain('Condoms given during the visit: Yes');

    const res = await api.get(`order?patient=${context.patient.uuid}&t=drugorder&v=custom:(drug:(uuid),dose,quantity,duration,action,encounter:(uuid))`);
    expect(res.ok()).toBeTruthy();
    const orders = (await res.json()).results as { drug: { uuid: string }; dose: number; quantity: number; duration: number; action: string; encounter: { uuid: string } }[];
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ drug: { uuid: 'ac6a5bab-7df4-4275-af88-acdad53ccc97' }, dose: 1, quantity: 30, duration: 30, action: 'NEW', encounter: { uuid } });

    // VIEW: the male-only VMMC question is there and unfilled, the condoms answer shows; the order widget is drawn client-side
    // (orderWidget.initialize does not run in the VIEW HTML the harness loads), so the order is not asserted here
    const view = await expectViewShowsSavedObs(page, api, FORM, uuid);
    expect(await view.valueTexts()).toEqual(['[X] yes']);
    await expect(page.getByText('Voluntary male circumcision (VMMC)', { exact: true })).toHaveCount(1);
    await expect(page.locator('#hivpregnant, #breastfeeding-mom, #wean-date')).toHaveCount(0); // includeIf :133 (female only)
  });
});
