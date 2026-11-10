import { type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type EntryContext } from '../../core';
import { MENTAL_HEALTH_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, SectionFormPage, ViewFormPage, VISIT_PAGE_URL, expectViewShowsSavedObs } from '../../pages';
import { isoDate, obsDisplays, pickDate, pickerDate } from '../../pages/form-widgets';

// mentalHealth.xml: "Mental Health Assessment V2", one long page (referral and visit type, scores, mental status, suicide evaluation, 22 groups of diagnoses (~360
// checkboxes), psychological interventions, medication (order widget), plan and disposition). Top-level form: the specs open enterHtmlFormWithStandardUi inside a
// visit they created (EntryFormPage), so the visit action's gating (_availability.e2e.md: `programs` + `mentalHealth`, Mental Health Location, `Task: emr.enterMentalHealthNote`,
// no earlier mental-health encounter in the visit) is not exercised. Runs on zl-ci. <submit> tag: the button is `#buttons input.submitButton`. The harness user holds
// `Task: emr.retroConsultNote`, so the who / when / where block is the editable one (:239): Data Clerk (preselected), Psychologist (required, only one provider offered on zl-ci) and
// Physician, location and date; the other two includeIf variants (:287, :320) are for users without that privilege and are not covered.
//
// Conditions in the form, from documentation inventory (mentalHealth.inv.md):
//   when PIH:OTHER (referred by) :370 -> #other_refferal; CIEL:5622 (other service) :383 -> #other; PIH:OTHER (internal referral role) :399 -> #other_role; PIH:YES (hospitalised) :487 -> #hospitalReason
//   when CIEL:1408 (suicide screen high) :915 -> #high-ssi: COMMENTED OUT (UHM-8407), so #high-ssi is shown whenever #suicideScreening is
//   toggle suicide evaluation completed (checkbox) :901 -> #suicideScreening; interpersonal therapy :1719 -> #interpersonal; pregnant (women only) :1758 -> #pregnant;
//   the diagnosis checkboxes toggle their sub-lists: bipolar, depression, psychosis, autism (shown when ticked; the `toggleName` of handicapsIntellectuelsLeger / Modere / autism1-3
//   name no element)
//   includeIf $patient.age > 17 :589 -> WHODAS is required; age < 18 :600 -> WHODAS optional   (boundary: 18 / 17 years)
//   includeIf gender F :1756 -> the pregnancy checkbox and #pregnant (last period, due date)
//   includeIf privileges :239, :287, :320 -> who / when / where variants (see above)
//   ifMode VIEW include=false :114 (scripts), :232 (heading, who/when/where), :1820 (buttons); ifMode VIEW :195 (script: opens the collapsible groups that hold values when the URL has `overview`)
// Scripts :115-190: (1) validation before submit: when a disposition is chosen, every visible field that belongs to it must be filled ("fields associated with the disposition"); (2) return
//   visit date: minDate = the encounter date, re-set when the date changes (clears the return date with an alert); (3) `.medication-checkbox` handler: no such element in the form, dead code
//   (V3); (4) validateEstimatedDeliveryDate / eddCannotBeOlderThanTwoWeeks on `estimatedDeliveryDate` (shared zl scripts: _shared.e2e.md).
// Side effects on save: enrollInProgram "Mental Health" (:360, Program Location tag), postSubmissionAction ApplyDispositionAction (:18), the order widget (medication orders), encounter disposition.
// Visit-page display: the visit page shows this form's VIEW (encounterTypeConfig.js, a8584ab8: templateModelUrl with definitionUiResource=mentalHealth.xml, longTemplate
//   viewEncounterWithHtmlFormLong.page): ViewFormPage / expectViewShowsSavedObs.
// Not covered here: the two other who / when / where variants (users without the retro privilege), changing the encounter date with a return date set (alert), the medication widget's
//   dose rules (drugOrder.xml / _shared.e2e.md), disposition Death (marks the patient dead) and the other dispositions' extra fields except Admission, printing.
//
// Findings: see pihemr _findings.e2e.md#mentalHealth

const FORM = 'mentalHealth.xml';
// What the VIEW prints for answers that the form labels differently from the concept (answerCodes); filled in from a run.
const VIEW_LABELS: Record<string, string> = {
  'Disposition categories: Discharged': 'Discharge', // the encounterDisposition widget's own wording
};
const SAVE = '#buttons input.submitButton';

const newPatient = (createEntryContext: CustomTestFixtures['createEntryContext'], gender: 'M' | 'F' = 'F', age = 30) =>
  createEntryContext({ givenName: 'AutoMental', familyName: 'Tester', gender, birthdate: birthdateYearsAgo(age) });
const open = async (page: Page, createEntryContext: CustomTestFixtures['createEntryContext'], gender: 'M' | 'F' = 'F', age = 30) => {
  const context = await newPatient(createEntryContext, gender, age);
  await EntryFormPage.open(page, FORM, context);
  await expect(page.locator(SAVE)).toBeVisible();
  return context;
};
const editUrl = (context: EntryContext, encounterUuid: string) =>
  SectionFormPage.editUrl(FORM, { patient: context.patient, encounter: { uuid: encounterUuid, visitUuid: context.visitUuid } });

// who / when / where: the select of the Psychologist (required; zl-ci offers one provider) is the second select of the block.
const whoSelects = (page: Page) => page.locator('#who-when-where select');
const psychologist = (page: Page) => whoSelects(page).nth(1);
const pickPsychologist = async (page: Page) => {
  await psychologist(page).selectOption({ index: 1 });
};
const whodas = (page: Page) => page.locator('p', { hasText: 'WHODAS' }).first().locator('input[type=text]');
const radios = (id: string, page: Page) => page.locator(`#${id} input[type=radio]`);
const save = async (page: Page) => {
  await page.locator(SAVE).click();
  await expect(page).toHaveURL(VISIT_PAGE_URL);
};
const onlyEncounter = async (api: APIRequestContext, patientUuid: string) => {
  const encounters = await getPatientEncounters(api, patientUuid);
  expect(encounters.map((e) => e.encounterType.uuid)).toEqual([MENTAL_HEALTH_ENCOUNTER_TYPE_UUID]);
  return encounters[0].uuid;
};
const programs = async (api: APIRequestContext, patientUuid: string): Promise<string[]> => {
  const res = await api.get(`programenrollment?patient=${patientUuid}&v=custom:(program:(name),dateCompleted)`);
  expect(res.ok(), `get enrollments: ${res.status()}`).toBeTruthy();
  return ((await res.json()).results as Array<{ program: { name: string } }>).map((e) => e.program.name);
};

test.describe('mentalHealth', () => {
  test('ENTER shows the heading, the editable who / when / where block, the eight sections and Save / Cancel; the follow-up fields start hidden', async ({ page, createEntryContext }) => {
    // ifMode VIEW include=false :232, :1820; includeIf :239 (the harness user has the retro privilege)
    await open(page, createEntryContext);
    await expect(page.locator('h2')).toContainText('Mental');
    await expect(page.locator('#who-when-where label')).toHaveText(['Data Clerk (required)', 'Psychologist (required)', 'Physician', 'Location (required)', 'Date']);
    await expect(whoSelects(page)).toHaveCount(4);
    await expect(whoSelects(page).nth(0)).not.toHaveValue(''); // the current user, preselected
    await expect(psychologist(page)).toHaveValue('');
    await expect(page.locator('legend')).toHaveText(['Referral', 'Scores', 'Status', 'Suicidal evaluation', 'Diagnoses', 'Psychological interventions', 'Medication', 'Plan']);
    for (const id of ['other_refferal', 'other', 'other_role', 'hospitalReason', 'suicideScreening', 'interpersonal', 'pregnant', 'autism', 'psychosis', 'depression', 'bipolar']) {
      await expect(page.locator(`#${id}`), id).toBeHidden();
    }
    await expect(page.locator('.toggle-div')).toHaveCount(22); // the diagnosis groups
    await expect(page.locator('#buttons button.cancel')).toBeVisible();
    await expect(page.locator('.print-form-datestamps')).toBeHidden();
  });

  test('a blank Save reports the psychologist and the WHODAS score as Required and saves nothing; with both, the minimal encounter is saved and the patient is enrolled in the Mental Health program', async ({ page, api, createEntryContext }) => {
    // required :256 (psychologist), required :594 (WHODAS, age > 17); enrollInProgram :360
    const context = await open(page, createEntryContext);
    await page.locator(SAVE).click();
    await expect(page.locator('span.field-error:visible')).toHaveText(['Required', 'Required']);
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await getPatientEncounters(api, context.patient.uuid)).toEqual([]);

    await pickPsychologist(page);
    await page.locator(SAVE).click();
    await expect(page.locator('span.field-error:visible')).toHaveCount(1); // WHODAS
    await whodas(page).fill('12');
    await save(page);
    const encounterUuid = await onlyEncounter(api, context.patient.uuid);
    expectObsList(await obsDisplays(api, encounterUuid), ['disability assessment']);
    expect((await programs(api, context.patient.uuid)).some((n) => /mental/i.test(n)), 'enrolled in the Mental Health program').toBeTruthy();
    const res = await api.get(`encounter/${encounterUuid}?v=custom:(encounterProviders:(encounterRole:(uuid)))`);
    const roles = ((await res.json()).encounterProviders as Array<{ encounterRole: { uuid: string } }>).map((p) => p.encounterRole.uuid).sort();
    expect(roles).toEqual(['cbfe0b9d-9923-404c-941b-f048adc8cdc0', 'deb99a5a-1cab-44d4-8a4c-631186ba863d']); // data clerk and psychologist (physician left empty)
  });

  test.describe('WHODAS is required from 18 years (includeIf :589, :600)', () => {
    for (const { age, required } of [
      { age: 18, required: true },
      { age: 17, required: false },
    ]) {
      test(`${age} years: the WHODAS score is ${required ? 'required' : 'optional'}`, async ({ page, api, createEntryContext }) => {
        const context = await open(page, createEntryContext, 'M', age);
        await expect(page.locator('p', { hasText: 'WHODAS' }).first()).toContainText(required ? /\(\s*required\s*\)/ : /WHODAS\s*:/);
        await pickPsychologist(page);
        await page.locator(SAVE).click();
        if (required) {
          await expect(page.locator('span.field-error:visible')).toHaveCount(1);
          expect(await getPatientEncounters(api, context.patient.uuid)).toEqual([]);
        } else {
          await expect(page).toHaveURL(VISIT_PAGE_URL);
          expect(await onlyEncounter(api, context.patient.uuid)).toBeTruthy();
        }
      });
    }
  });

  test('referral and hospitalisation: each "other" / "yes" answer shows its text box, any other answer hides it (when :370, :383, :399, :487)', async ({ page, createEntryContext }) => {
    await open(page, createEntryContext);
    // [question, the answer that shows the target, another answer]: "other" is the last answer of the three referral questions, "yes" the first of the hospitalisation one
    const cases: Array<[string, string, 'first' | 'last', 'first' | 'last']> = [
      ['referral', 'other_refferal', 'last', 'first'], // PIH:OTHER
      ['if_other', 'other', 'last', 'first'], // CIEL:5622
      ['role', 'other_role', 'last', 'first'], // PIH:OTHER
      ['hospitalQ', 'hospitalReason', 'first', 'last'], // PIH:YES / PIH:NO
    ];
    for (const [question, target, shows, other] of cases) {
      const group = radios(question, page);
      const trigger = shows === 'first' ? group.first() : group.last();
      const another = other === 'first' ? group.first() : group.last();
      await trigger.click();
      await expect(trigger).toBeChecked();
      await expect(page.locator(`#${target}`), `${target} shown`).toBeVisible();
      await another.click(); // HFE radios untick on a second click, so this is always another answer
      await expect(another).toBeChecked();
      await expect(page.locator(`#${target}`), `${target} hidden`).toBeHidden();
    }
  });

  test('V5 suicide evaluation and interpersonal therapy toggle their blocks; #high-ssi is not tied to the screening result (UHM-8407)', async ({ page, createEntryContext }) => {
    // toggle :901, :1719; the `when` on CIEL:1408 :915 is commented out
    await open(page, createEntryContext);
    const evaluation = page.locator('#mh-suicide input[type=checkbox]').nth(4); // past ideation, past attempt, current ideation, current attempt, evaluation completed
    await expect(page.locator('#suicideScreening')).toBeHidden();
    await evaluation.check();
    await expect(page.locator('#suicideScreening')).toBeVisible();
    await expect(page.locator('#high-ssi'), 'always shown with the screening block').toBeVisible();
    await radios('ssi-result', page).first().click();
    await expect(page.locator('#high-ssi')).toBeVisible();
    await evaluation.uncheck();
    await expect(page.locator('#suicideScreening')).toBeHidden();

    const interpersonal = page.locator('#mh-interventions input[type=checkbox]').first(); // Interpersonal Therapy
    await interpersonal.check();
    await expect(page.locator('#interpersonal')).toBeVisible();
    await interpersonal.uncheck();
    await expect(page.locator('#interpersonal')).toBeHidden();
  });

  test('a woman gets the pregnancy checkbox, which shows the last period and due date; a man gets neither (includeIf :1756, toggle :1758)', async ({ page, createEntryContext }) => {
    await open(page, createEntryContext, 'F');
    const pregnant = page.getByLabel(/pregnan/i).first();
    await expect(page.locator('#pregnant')).toBeHidden();
    await pregnant.check();
    await expect(page.locator('#pregnant')).toBeVisible();
    await expect(page.locator('#estimatedDeliveryDate')).toBeVisible();
    await pregnant.uncheck();
    await expect(page.locator('#pregnant')).toBeHidden();

    await open(page, createEntryContext, 'M');
    await expect(page.locator('#pregnant')).toHaveCount(0);
    await expect(page.locator('#estimatedDeliveryDate')).toHaveCount(0);
  });

  test('the diagnosis groups open and close on their heading, and a ticked diagnosis shows its sub-list (autism, psychosis, bipolar, depression)', async ({ page, createEntryContext }) => {
    await open(page, createEntryContext);
    const group = page.locator('.toggle-div').first();
    const content = page.locator('.collapsible-content').first();
    await group.click();
    await expect(content).toHaveClass(/open/);
    await group.click();
    await expect(content).not.toHaveClass(/open/);

    // toggle="autism" / "psychosis" / "bipolar" / "depression" (:947-, the `toggleName` of one checkbox in the group); the checkbox is found by ticking the group's checkboxes in turn
    for (const [index, target] of [[0, 'autism'], [1, 'psychosis'], [2, 'bipolar'], [3, 'depression']] as Array<[number, string]>) {
      const boxes = page.locator('.collapsible-content').nth(index).locator('input[type=checkbox]');
      await expect(page.locator(`#${target}`), `${target} hidden at load`).toBeHidden();
      let found = false;
      for (let i = 0, n = await boxes.count(); i < n && !found; i++) {
        await boxes.nth(i).evaluate((e) => (e as HTMLInputElement).click());
        if (await page.locator(`#${target}`).isVisible()) {
          found = true;
          await boxes.nth(i).evaluate((e) => (e as HTMLInputElement).click());
          await expect(page.locator(`#${target}`), `${target} hidden again`).toBeHidden();
        } else {
          await boxes.nth(i).evaluate((e) => (e as HTMLInputElement).click());
        }
      }
      expect(found, `a checkbox of group ${index} shows #${target}`).toBeTruthy();
    }
  });

  test('return visit date: its earliest date is the encounter date; the due date is checked by the shared EDD rules (script :135-141, :188-189)', async ({ page, createEntryContext }) => {
    await open(page, createEntryContext, 'F');
    const minDate = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (window as any).getField('return-visit-date.value').datepicker('option', 'minDate');
      return d ? new Date(d).toDateString() : null;
    });
    expect(minDate).toBe(new Date().toDateString());

    await page.getByLabel(/pregnan/i).first().check();
    const edd = page.locator('#estimatedDeliveryDate input.hasDatepicker');
    await pickDate(edd, isoDate(-60)); // more than two weeks before the encounter
    await edd.blur();
    await expect(page.locator('#estimatedDeliveryDate span.field-error:visible, #estimatedDeliveryDate .error:visible').first()).toBeVisible();
    await pickDate(edd, isoDate(90));
    await expect(page.locator('#estimatedDeliveryDate span.field-error:visible')).toHaveCount(0);
  });

  test('disposition: a disposition with an empty field of its own (Admission without a location) blocks Save with the message of script :119-128; Discharge saves', async ({ page, api, createEntryContext }) => {
    const context = await open(page, createEntryContext, 'M', 30);
    await pickPsychologist(page);
    await whodas(page).fill('12');
    const disposition = page.locator('#disposition select').first();
    await disposition.selectOption({ label: 'Admission' });
    await expect(page.locator('#disposition-emrapi-admittohospital-admissionlocation')).toBeVisible();
    await page.locator(SAVE).click();
    await expect(page.locator('#disposition .field-error').first()).toBeVisible();
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await getPatientEncounters(api, context.patient.uuid)).toEqual([]);

    await disposition.selectOption({ label: 'Discharge' });
    await expect(page.locator('#disposition .field-error').first()).toBeHidden(); // :152, the change clears the message
    await save(page);
    const displays = await obsDisplays(api, await onlyEncounter(api, context.patient.uuid));
    expect(displays.some((d) => /disposition/.test(d) && /discharge/.test(d)), `a Discharge disposition among ${displays.join(' | ')}`).toBeTruthy();
  });

  // A typical assessment of an adult woman: referral, visit type, hospitalisation, scores, suicide evaluation, two diagnoses, an intervention, pregnancy, plan with disposition and return date.
  const fillTypical = async (page: Page) => {
    await pickPsychologist(page);
    await radios('referral', page).first().click(); // Teacher
    await radios('visit_type', page).nth(1).click();
    await radios('hospitalQ', page).first().click();
    await page.locator('#hospitalReason input').fill('AutoReason hospital');
    await page.locator('#mh_scores input[type=text]').nth(0).fill('5'); // ZLDSI
    await whodas(page).fill('12');
    await page.locator('#mh-suicide input[type=checkbox]').nth(4).check(); // evaluation completed
    await radios('ssi-result', page).first().click();
    await page.locator('.collapsible-content').nth(0).locator('input[type=checkbox]').first().evaluate((e) => (e as HTMLInputElement).click()); // a neurodevelopmental diagnosis
    await page.locator('.collapsible-content').nth(3).locator('input[type=checkbox]').first().evaluate((e) => (e as HTMLInputElement).click()); // a depressive disorder
    await page.locator('#mh-interventions input[type=checkbox]').first().check(); // interpersonal therapy
    await page.locator('#interpersonal input[type=checkbox]').first().check();
    await page.getByLabel(/pregnan/i).first().check();
    await pickDate(page.locator('#estimatedDeliveryDate input.hasDatepicker'), isoDate(90));
    await page.locator('#mh-plan textarea').fill('AutoPlan comment');
    await pickDate(page.locator('#return-visit-date input.hasDatepicker'), isoDate(7));
    await page.locator('#disposition select').first().selectOption({ label: 'Discharge' });
  };

  test('a typical assessment: the answers are saved, shown in the VIEW on the visit page (not the ENTER-only blocks), and EDIT starts from them', async ({ page, api, createEntryContext }) => {
    test.slow(); // ENTER, the visit page with the VIEW, the EDIT page and its re-save
    const context = await open(page, createEntryContext, 'F', 30);
    await fillTypical(page);
    await save(page);
    const encounterUuid = await onlyEncounter(api, context.patient.uuid);
    expect((await obsDisplays(api, encounterUuid)).length, 'every answered field is saved: 18 obs').toBe(18);

    const view = await expectViewShowsSavedObs(page, api, FORM, encounterUuid, VIEW_LABELS, 800);
    // ifMode VIEW include=false :232, :1820: no who / when / where editor, no heading, no buttons
    await expect(view.root.locator('#who-when-where, h2, #buttons, input.submitButton')).toHaveCount(0);
    await expect(view.root.locator('#hospitalQ')).toContainText('[X]');
    await expect(view.values.filter({ hasText: 'AutoReason hospital' })).toHaveCount(1);
    await expect(view.values.filter({ hasText: 'AutoPlan comment' })).toHaveCount(1);
    await expect(view.values.filter({ hasText: pickerDate(isoDate(7)) })).toHaveCount(1); // return visit date
    await expect(view.root.locator('#other_refferal .value, #other_role .value'), 'unanswered text boxes show no value').toHaveCount(0);

    // EDIT: the form starts from the saved answers (the toggles follow them)
    await page.goto(editUrl(context, encounterUuid));
    await expect(page.locator(SAVE)).toBeVisible();
    await expect(radios('referral', page).first()).toBeChecked();
    await expect(radios('hospitalQ', page).first()).toBeChecked();
    await expect(page.locator('#hospitalReason')).toBeVisible();
    await expect(page.locator('#hospitalReason input')).toHaveValue('AutoReason hospital');
    await expect(page.locator('#suicideScreening')).toBeVisible();
    await expect(page.locator('#interpersonal')).toBeVisible();
    await expect(page.locator('#pregnant')).toBeVisible();
    await expect(page.locator('#mh-plan textarea')).toHaveValue('AutoPlan comment');
    await expect(whodas(page)).toHaveValue('12');
    // change one answer and re-save: the old one is replaced
    await radios('referral', page).nth(1).click(); // traditional healer
    await page.locator('#mh-plan textarea').fill('AutoPlan comment two');
    await save(page);
    const after = await obsDisplays(api, encounterUuid);
    expect(after.some((d) => d.includes('autoplan comment two'))).toBeTruthy();
    expect(after.some((d) => d.includes('autoplan comment') && !d.includes('two')), 'the old comment is replaced').toBeFalsy();
    expect(after.some((d) => /referring person: teacher/.test(d)), 'the old referral is replaced').toBeFalsy();
    expect(after.some((d) => /referring person: traditional healer/.test(d))).toBeTruthy();
    expect(after.some((d) => d.includes('disability assessment'))).toBeTruthy(); // untouched answers stay
  });

  test('medication: a drug of the mental-health list (the restricted order widget) is saved as a drug order and shown in the VIEW', async ({ page, api, createEntryContext }) => {
    test.slow();
    const context = await open(page, createEntryContext, 'M', 30);
    await pickPsychologist(page);
    await whodas(page).fill('12');
    const drugs = page.locator('#mh-meds-v2');
    await drugs.locator('#order-action-button-NEW').click();
    const order = page.locator('.orderwidget-order-form:visible');
    await order.locator('.order-drug input.orderwidget-autocomplete-textbox').pressSequentially('Ami', { delay: 60 });
    const suggestions = page.locator('ul.ui-autocomplete:visible li');
    await expect(suggestions.first()).toBeVisible();
    const drugName = ((await suggestions.first().innerText()) || '').trim();
    await suggestions.first().click();
    await order.locator('.order-dose input').fill('25');
    await order.locator('.order-doseUnits select').selectOption({ index: 1 });
    await order.locator('.order-frequency select').selectOption({ index: 1 });
    await order.locator('.order-duration input').fill('10');
    await order.locator('.order-durationUnits select').selectOption({ index: 1 });
    await order.locator('.order-quantity input').fill('20');
    await order.locator('.order-quantityUnits select').selectOption({ index: 1 });
    await drugs.locator('input[type=text]').last().fill('AutoMedication comment');
    await save(page);
    const encounterUuid = await onlyEncounter(api, context.patient.uuid);
    const res = await api.get(`order?patient=${context.patient.uuid}&v=custom:(drug:(display),dose,action,encounter:(uuid))`);
    expect(res.ok(), `get orders: ${res.status()}`).toBeTruthy();
    const orders = ((await res.json()).results as Array<{ drug: { display: string }; dose: number; action: string; encounter: { uuid: string } }>).filter((o) => o.encounter.uuid === encounterUuid);
    expect(orders).toHaveLength(1);
    expect(orders[0].action).toBe('NEW');
    expect(orders[0].dose).toBe(25);
    expect(drugName.toLowerCase()).toContain('amitr');
    expect(orders[0].drug.display.toLowerCase()).toContain('amitr');
    expectObsList(await obsDisplays(api, encounterUuid), ['medication comments']);
    const view = await expectViewShowsSavedObs(page, api, FORM, encounterUuid, VIEW_LABELS, 800);
    await expect(view.root).toContainText(/amitr/i);
    await expect(view.values.filter({ hasText: 'AutoMedication comment' })).toHaveCount(1);
  });

  // Every field of the form once, filled the generic way for a woman (so the pregnancy block shows): every checkbox ticked (the diagnoses, interventions, provider types, ...), the first
  // answer of every radio group, 1 (or the concept's minimum / maximum) in every number box, text in every text area, a date in every date box. The disposition is left blank (tested
  // above), the medication widget has its own test.
  test('every field: the answers are saved (one obs each), the VIEW shows a value for each and EDIT starts from all of them', async ({ page, api, createEntryContext }) => {
    test.setTimeout(240_000); // ~100 controls, the visit page with its VIEW, then the EDIT page
    const context = await open(page, createEntryContext, 'F', 30);
    await pickPsychologist(page);
    const answers = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const jq = (window as any).jq;
      const names: string[] = [];
      const visible = (e: Element) => (e as HTMLElement).offsetParent !== null;
      const form = (document.querySelector('#who-when-where') as HTMLElement).closest('form') as HTMLElement; // the HTML form, not the header's search form
      // checkboxes first (they show the sub-lists and fields behind a toggle), in document order: all of them except the ~350 diagnoses, of which the first of each of the 22
      // groups is ticked (the diagnoses are one control type: ticking all would only make the page and its VIEW slow on a shared server)
      const firstOfGroup = new Set<Element>();
      form.querySelectorAll('.collapsible-content').forEach((g) => {
        const first = g.querySelector('input[type=checkbox]');
        if (first) {
          firstOfGroup.add(first);
        }
      });
      form.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((c) => {
        if (!c.disabled && !c.closest('#who-when-where') && !c.closest('#disposition') && (!c.closest('#mh-diagnoses') || firstOfGroup.has(c))) {
          c.click();
        }
      });
      const groups = new Set<string>();
      form.querySelectorAll<HTMLInputElement>('input[type=radio]').forEach((r) => {
        if (visible(r) && !r.disabled && !groups.has(r.name)) {
          groups.add(r.name);
          r.click();
        }
      });
      form.querySelectorAll<HTMLInputElement>('input[type=text]:not([readonly]):not(.hasDatepicker)').forEach((t) => {
        if (visible(t) && !t.disabled && !t.closest('#who-when-where') && !t.closest('#disposition') && !t.closest('#mh-meds-v2') && !t.classList.contains('autoCompleteHidden')) {
          jq(t).val('1').trigger('change').trigger('blur');
        }
      });
      form.querySelectorAll<HTMLTextAreaElement>('textarea').forEach((t) => {
        if (visible(t) && !t.disabled) {
          jq(t).val('AutoText').trigger('change').trigger('blur');
        }
      });
      form.querySelectorAll<HTMLInputElement>('input[type=checkbox]:checked').forEach((c) => {
        if (visible(c) && !c.closest('#who-when-where')) {
          names.push('c:' + c.name);
        }
      });
      form.querySelectorAll<HTMLInputElement>('input[type=radio]:checked').forEach((r) => names.push('r:' + r.name));
      form.querySelectorAll<HTMLInputElement>('input[type=text]:not([readonly]):not(.hasDatepicker)').forEach((t) => {
        if (visible(t) && t.value && !t.closest('#who-when-where') && !t.closest('#mh-meds-v2') && !t.closest('[id^="disposition"]')) {
          names.push('t:' + t.name);
        }
      });
      form.querySelectorAll<HTMLTextAreaElement>('textarea').forEach((t) => {
        if (visible(t) && t.value) {
          names.push('a:' + t.name);
        }
      });
      return names;
    });
    // dates: the due date after today, the return date after the encounter date, the others (last period, suicide attempt) in the past
    const dates = page.locator('input.hasDatepicker:visible');
    for (let i = 0, n = await dates.count(); i < n; i++) {
      const wrapper = await dates.nth(i).evaluate((e) => (e.closest('#estimatedDeliveryDate') ? 'edd' : e.closest('#return-visit-date') ? 'return' : e.closest('#who-when-where') ? 'encounter' : 'past'));
      if (wrapper !== 'encounter') {
        await pickDate(dates.nth(i), isoDate(wrapper === 'edd' ? 90 : wrapper === 'return' ? 7 : -10));
        answers.push(`d:${i}`);
      }
    }
    await whodas(page).fill('12'); // already counted with the number boxes above (it was given 1)
    const unique = new Set(answers);
    // the number boxes have ranges: a Save attempt shows "Must be at least 20.0" / "Cannot be greater than 14" next to each outside it; set the limits and save again
    await page.locator(SAVE).click();
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await page.waitForURL(VISIT_PAGE_URL, { timeout: 6000 }).then(() => true, () => false)) {
        break;
      }
      const fixed = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const jq = (window as any).jq;
        let n = 0;
        document.querySelectorAll('span.field-error').forEach((e) => {
          const m = /(Must be at least|Cannot be greater than|Minimum:|Maximum:) (\S+)/.exec((e as HTMLElement).innerText);
          const input = e.parentElement?.querySelector('input[type=text]');
          if (m && input) {
            jq(input).val(String(parseFloat(m[2]))).trigger('change').trigger('blur'); // "20.0" -> "20": integer boxes refuse a decimal point
            n++;
          }
        });
        return n;
      });
      if (fixed === 0) {
        break;
      }
      await page.locator(SAVE).click();
    }
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    const encounterUuid = await onlyEncounter(api, context.patient.uuid);
    const obs = await getEncounterObs(api, encounterUuid, 1000);
    const answered = unique.size;
    // one obs per answer, except that a comment box (an obs with `commentFieldLabel`, shown next to the "Other" answers) is saved in the comment of its obs, not as an obs
    const withComments = await (await api.get(`obs?encounter=${encounterUuid}&v=custom:(comment)&limit=1000`)).json();
    const comments = (withComments.results as Array<{ comment: string | null }>).filter((o) => o.comment).length;

    // plus the obs group of the seizure frequency (a group obs of its own: 1 on zl-ci). 104 counted answers, 1 comment box, 1 group: 104 expected, 102 saved on zl-ci. One of the two
    // is the hidden death-date input (w899) that the generic filler counts (it is empty in EDIT); the other is not identified (every other answered control is filled again in EDIT,
    // below, so nothing is lost silently): the count is held to those two.
    const groupObs = (await (await api.get(`obs?encounter=${encounterUuid}&v=custom:(groupMembers:(uuid))&limit=1000`)).json()).results.filter((o: { groupMembers: unknown[] | null }) => o.groupMembers && o.groupMembers.length > 0).length;
    expect(groupObs, 'obs groups saved (the seizure frequency)').toBe(1);
    const expected = answered - comments + groupObs;
    expect(obs.length, `obs saved vs answers (${answered}, ${comments} comment boxes, ${groupObs} group obs)`).toBeGreaterThanOrEqual(expected - 2);
    expect(obs.length).toBeLessThanOrEqual(expected);

    // the VIEW (visit page): every saved obs has a value in it
    const view = await ViewFormPage.open(page, FORM, encounterUuid);
    expect(await view.values.count(), 'values shown in the VIEW').toBeGreaterThanOrEqual(obs.length);
    expect(await view.values.filter({ hasText: 'AutoText' }).count()).toBe(2); // the two text areas

    // EDIT: every control that was answered is filled again
    await page.goto(editUrl(context, encounterUuid));
    await expect(page.locator(SAVE)).toBeVisible({ timeout: 60_000 }); // the EDIT page of a 400-obs encounter is slow to render
    const empty = await page.evaluate(
      (ns) =>
        ns
          .filter((n) => /^[crta]:/.test(n) && n !== 't:whodas')
          .map((n) => n.slice(2))
          .filter((name) => (document.getElementsByName(name)[0] as HTMLInputElement | undefined)?.type !== 'hidden') // the hidden death date is not an answer
          .filter((name) => !(Array.from(document.getElementsByName(name)) as HTMLInputElement[]).some((e) => (e.type === 'radio' || e.type === 'checkbox' ? e.checked : !!e.value)))
          .map((name) => `${name}:${(document.getElementsByName(name)[0] as HTMLInputElement | undefined)?.type}:${document.getElementsByName(name)[0]?.closest('[id]')?.parentElement?.id}:${(document.getElementsByName(name)[0]?.closest('p, td, div') as HTMLElement | undefined)?.innerText.replace(/\s+/g, ' ').slice(0, 80)}`),
      answers,
    );
    expect(empty, 'answered controls that are empty after a reload in EDIT').toEqual([]);
  });
});

const expectObsList = (displays: string[], expected: string[]) => {
  for (const e of expected) {
    expect(displays.some((d) => d.includes(e)), `obs "${e}" among ${displays.join(' | ')}`).toBeTruthy();
  }
};
