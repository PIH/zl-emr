import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures } from '../../core';
import { CONSULT_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, VisitPage, VISIT_PAGE_URL, visitPagePath } from '../../pages';

// outpatientConsult.xml: "Clinical Consult" (coded diagnoses, non-coded diagnosis, procedure, disposition, return visit
// date, comments). Reached with a synthetic adult patient who has an active visit and no encounter, through
// enterHtmlFormWithStandardUi (EntryFormPage). Who offers it: the CONSULT_NOTE_VISIT_ACTION visit action (CEN and HSN,
// _availability.e2e.md); availability (privilege, Consult Note Location tag, retro rules) is not exercised.
// The location select starts with the session location (Klinik Ekstèn carries the Consult Note Location tag).
//
// Conditions in the form, from documentation inventory (outpatientConsult.inv.md):
//   ifMode EDIT                          :8    CSS for #disposition and .check-inline (EDIT only, see V2)
//   ifMode VIEW include=false            :65, :113   heading, who/when/where subform, buttons (ENTER and EDIT); the form's own VIEW is not shown on the visit page (see Visit-page display)
//   toggle PIH:20580 (checkbox)          :78   shows #non-coded-diagnosis-div (textarea PIH:7416)
// Scripts: :29-63 validateForm(), run on load and on every document click/change: Save (#buttons .submitButton) is
//   disabled unless (a diagnosis chip `.diagnosis` exists OR the non-coded text has a value) AND no visible select or
//   input inside #disposition is empty. needsDisposition is hard-coded true, so a disposition is always required.
//   The disposition widget (coreapps, not this file) shows a location select for Admission / Transfer within hospital /
//   Transfer out, and a date of death for Death; those visible fields then become required through the same rule.
// Side effects on save: ApplyDispositionAction (:5) runs the configured actions of the chosen disposition (pih-dispositions-
//   haiti.json); the tests use "ED Observation" (no actions, keeps the visit open) and assert the visit stays open and
//   the patient is not marked dead. The coded diagnosis is saved as a Visit Diagnoses obs group. Nothing creates an order.
//   Not saved by any test: Admission, Transfer, Discharge, Death (these change visits/locations/patient).
// Visit-page display: the visit page does NOT show this form's VIEW. The consultation entry of encounterTypeConfig.js
//   (`// consultation / outpatientConsult`, :995, encounter type 92fd09b4-...) has no templateModelUrl: it renders the encounter's obs
//   with templates/encounters/clinicConsultLong.page (rows Diagnoses, Non-Coded Diagnoses, Disposition, Procedure performed, Return
//   visit date, Clinical Note), so the VIEW test asserts those rows. The form's own VIEW (ifMode VIEW :65-118) is therefore not
//   tested, and HAI-1278 (validateForm calls getValue, undefined on the visit page) does not apply to this encounter type: the
//   earlier test.fixme() for it was removed. (outpatientConsultInitial.xml, type 59e55ca8-..., does get a VIEW; not this form.)
// Not covered here: the Procedure autocomplete (:86), the Procedure obs on the visit page
//   (never filled), provider/location/date behaviour (see _shared.e2e.md), the other dispositions' actions.
//
// Findings:
//   V1 Low    :8-24 the disposition/checkbox CSS sits in ifMode EDIT, so it is not applied on first entry (ENTER).
//                    Fix: ifMode VIEW include="false". (unconfirmed visually)
//   V2 Low    :30-36 hasDisposition is computed and unused; needsDisposition is always true (dead code).

const FORM = 'outpatientConsult.xml';

const save = (page: Page) => page.locator('#buttons button.submitButton');
const disposition = (page: Page) => page.locator('#disposition select').first();
const newPatient = (createEntryContext: CustomTestFixtures['createEntryContext']) =>
  createEntryContext({ givenName: 'AutoConsult', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(30) });
const pickDiagnosis = async (page: Page) => {
  await page.locator('#diagnosis-search').fill('mal');
  await page.locator('ul.ui-autocomplete li').first().click();
  await expect(page.locator('.diagnosis')).toHaveCount(1);
};

test.describe('outpatientConsult', () => {
  test('Save stays disabled until a diagnosis and a disposition are given', async ({ page, createEntryContext }) => {
    // validateForm :29-63
    await EntryFormPage.open(page, FORM, await newPatient(createEntryContext));
    await expect(save(page)).toBeDisabled();
    await pickDiagnosis(page);
    await expect(save(page)).toBeDisabled(); // disposition still empty
    await disposition(page).selectOption({ label: 'ED Observation' });
    await expect(save(page)).toBeEnabled();
    await disposition(page).selectOption({ index: 0 });
    await expect(save(page)).toBeDisabled();
  });

  test('a non-coded diagnosis alone satisfies the diagnosis rule', async ({ page, createEntryContext }) => {
    // toggle :78 shows #non-coded-diagnosis-div; validateForm accepts getValue('non-coded-diagnosis.value')
    await EntryFormPage.open(page, FORM, await newPatient(createEntryContext));
    const div = page.locator('#non-coded-diagnosis-div');
    await expect(div).toBeHidden();
    await page.locator('#non-coded-diagnosis-toggle input[type=checkbox]').check();
    await expect(div).toBeVisible();
    await page.locator('#non-coded-diagnosis textarea').fill('unclear abdominal pain');
    await disposition(page).selectOption({ label: 'ED Observation' });
    await expect(save(page)).toBeEnabled();
    await page.locator('#non-coded-diagnosis-toggle input[type=checkbox]').uncheck();
    await expect(div).toBeHidden();
  });

  test('unticking "non-coded diagnosis" withdraws its text from the diagnosis rule', async ({ page, createEntryContext }) => {
    // the toggle clears the hidden textarea, so the rule no longer sees it
    await EntryFormPage.open(page, FORM, await newPatient(createEntryContext));
    await page.locator('#non-coded-diagnosis-toggle input[type=checkbox]').check();
    await page.locator('#non-coded-diagnosis textarea').fill('unclear abdominal pain');
    await page.locator('#non-coded-diagnosis-toggle input[type=checkbox]').uncheck();
    await disposition(page).selectOption({ label: 'ED Observation' });
    await expect(save(page)).toBeDisabled();
  });

  test('dispositions with an extra field make that field required (no save)', async ({ page, createEntryContext }) => {
    // validateForm: visible empty select/input inside #disposition keeps Save disabled
    await EntryFormPage.open(page, FORM, await newPatient(createEntryContext));
    await pickDiagnosis(page);

    await disposition(page).selectOption({ label: 'Admission' });
    await expect(page.locator('#admissionLocation select')).toBeVisible();
    await expect(save(page)).toBeDisabled();
    await page.locator('#admissionLocation select').selectOption({ index: 1 });
    await expect(save(page)).toBeEnabled();

    await disposition(page).selectOption({ label: 'Death' });
    await expect(page.locator('#dateOfDeath input.hasDatepicker')).toBeVisible();
    await expect(save(page)).toBeDisabled();

    await disposition(page).selectOption({ label: 'ED Observation' });
    await expect(page.locator('#dateOfDeath input.hasDatepicker')).toBeHidden();
    await expect(save(page)).toBeEnabled();
  });

  const saveConsult = async (page: Page, api: APIRequestContext, createEntryContext: CustomTestFixtures['createEntryContext']) => {
    // ApplyDispositionAction :5 with a disposition that has no actions
    const context = await newPatient(createEntryContext);
    const form = await EntryFormPage.open(page, FORM, context);
    await pickDiagnosis(page);
    await disposition(page).selectOption({ label: 'ED Observation' });
    await page.locator('textarea').last().fill('seen in clinic'); // comments
    await save(page).click();
    await form.expectSaved();

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([CONSULT_ENCOUNTER_TYPE_UUID]);
    const displays = (await getEncounterObs(api, encounters[0].uuid)).map((o) => o.display);
    expect(displays).toEqual(
      expect.arrayContaining([
        'Clinical impression comments: seen in clinic',
        'Disposition categories: Emergency Department observation',
        'Diagnosis order: Primary',
      ]),
    );
    expect(displays.some((d) => d.startsWith('Diagnosis: '))).toBe(true);

    const visit = await (await api.get(`visit/${context.visitUuid}?v=custom:(stopDatetime)`)).json();
    expect(visit.stopDatetime).toBeNull();
    const patient = await (await api.get(`patient/${context.patient.uuid}?v=custom:(person:(dead))`)).json();
    expect(patient.person.dead).toBe(false);
    return { context, encounters, displays };
  };

  test('saves a consult with a diagnosis and ED Observation; the visit stays open and nothing else changes', async ({
    page,
    api,
    createEntryContext,
  }) => {
    await saveConsult(page, api, createEntryContext);
  });

  test('the visit page shows the saved consult in its own rows: diagnosis, disposition and comment (clinicConsultLong)', async ({
    page,
    api,
    createEntryContext,
  }) => {
    const { context, displays } = await saveConsult(page, api, createEntryContext);
    const visit = await VisitPage.open(page, context.visitUuid);
    const long = await visit.expand(visit.encounterOfType(CONSULT_ENCOUNTER_TYPE_UUID));
    // each row is a div with a left-column heading and a right-column value
    const row = (heading: string) => long.locator(`div:has(> .left-column > h3:text-is("${heading}")) > .right-column`);
    const diagnosis = (displays.find((d) => d.startsWith('Diagnosis: ')) ?? '').replace('Diagnosis: ', '');
    await expect(row('Diagnoses').locator('p.diagnosis')).toHaveCount(1);
    await expect(row('Diagnoses')).toContainText(diagnosis);
    await expect(row('Diagnoses')).toContainText('Primary');
    await expect(row('Disposition')).toContainText('Emergency Department observation');
    await expect(row('Clinical Note')).toHaveText('seen in clinic');
    // not filled in: the non-coded diagnosis, the procedure and the return visit date
    for (const heading of ['Non-Coded Diagnoses', 'Procedure performed', 'Return visit date']) {
      await expect(row(heading), `${heading} is empty`).toHaveText('');
    }
  });

  test('EDIT starts from the saved diagnosis and disposition', async ({ page, api, createEntryContext }) => {
    // EDIT mode: validateForm runs on load, so Save is enabled when the saved values satisfy the rule
    const context = await newPatient(createEntryContext);
    await EntryFormPage.open(page, FORM, context);
    await pickDiagnosis(page);
    await disposition(page).selectOption({ label: 'ED Observation' });
    await save(page).click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const params = new URLSearchParams({
      patientId: context.patient.uuid,
      encounterId: encounter.uuid,
      definitionUiResource: `file:configuration/pih/htmlforms/${FORM}`,
      returnUrl: visitPagePath(context.visitUuid),
    });
    await page.goto(`htmlformentryui/htmlform/editHtmlFormWithStandardUi.page?${params.toString()}`);
    await expect(page.locator('.diagnosis')).toHaveCount(1);
    await expect(disposition(page)).toHaveValue(/.+/);
    await expect(save(page)).toBeEnabled();
  });
});
