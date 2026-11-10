import { type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type EntryContext } from '../../core';
import { KLINIK_EKSTEN_LOCATION_UUID, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterHeader, getEncounterObs, getPatientEncounters } from '../../commands';
import { SectionFormPage, ViewFormPage, VisitPage, VISIT_PAGE_URL, visitPagePath, expectViewShowsSavedObs } from '../../pages';
import { editEncounterUrl, enterShellForm } from '../../pages/sectioned-encounter';

// ncd-followup.xml: "NCD Followup", the entry form of the NCD followup encounter (NCD Followup Consult). The form has no fields of its own: it is the
// encounter-with-sections.xml shell (heading with the encounter type's name + the encounter-provider-location-date subform, "EPLD") with EPLD's default
// location tag `Consult Note Location` (no subform-parameter override); the clinical content is entered in the sections of the visit page (section-exam,
// section-ncd, section-sickle-cell, section-dx, section-plan: see their specs). The specs reach it with enterHtmlFormWithStandardUi inside a visit the
// fixture creates (EntryFormPage), which skips the visit-action gating of _availability.e2e.md (`programs` + `ncd`, NCD Consult Location, `Task:
// emr.enterNCDConsultNote`, no NCD encounter of the six types in the visit). Runs on zl-ci (session location Klinik Ekstèn carries the tag).
//
// Conditions in the form (an 11-line wrapper around subforms/encounter-with-sections.xml, whose line numbers "shell" below are; "trivial" in the skill's terms; the shell is the same as
// primary-care-adult-initial.xml, see its spec):
//   ifMode ENTER   shell :12-25   .htmlform is display:none; when every input of #who-when-where has a value -> submitHtmlForm() (the form "auto-submits"),
//                                 else #next is hidden and the form is shown
//   ifMode EDIT    shell :28-35   shows .htmlform, setUpNextAndSubmitButtons() (nextAndSubmitButtons.js)
//   ifMode VIEW include=false     shell :39-41, :47-53   heading, EPLD and the Next / Save / Cancel buttons: nothing is rendered in VIEW
// Scripts: the two shell blocks above and the EPLD permission script (_shared.e2e.md): no validation, default or derived value of its own.
//   Provider (required, role Consulting Clinician 4f10ad1a-...) defaults to the current user, location to the session location, date to now.
// Side effects on save: none (no obs, program or order; the encounter is saved with the form linked).
// Composition on the visit page (encounterTypeConfig.js, encounter type 5cbfd6a2-..., Haiti, form version 2.0 = the DEFAULT version): physical-exam,
//   vaccinations (an include-section, `require` age at visit start < 15 years), pihcore-ncd, pihcore-sickle-cell, pihcore-diagnosis, pihcore-plan, in that order.
//   No history section and no peds feeding section (those are NCD initial only). The version "0.5" of this form (ncd-followup_v0.5.xml) lists only pihcore-ncd (not tested).
// Visit-page display: the visit page does NOT show this form's VIEW. Its entry has no templateModelUrl and both templates are defaultEncounterShort.page: the
//   encounter expands to its sections, each showing the VIEW of its own section form. So the form's own VIEW is not tested (everything it renders is ifMode
//   VIEW include=false); the VIEW tests assert the section list and one section's VIEW (the skin exam of section-exam) saved into this encounter.
// Not covered here: the "location empty -> form shown" path (needs a session location without the tag; the session is shared by every spec), the Next button's later
//   hops (see _shared V8), availability, the sections' fields (their own specs), the 0.5 version.

const FORM = 'ncd-followup.xml';
const FORM_UUID = '1eb303ab-99ea-4022-bdda-1a89a339c737';
const SECTION_FORM = 'section-exam.xml'; // the first section of the encounter, and a simple one to save into it
const ADULT_SECTIONS = ['physical-exam', 'pihcore-ncd', 'pihcore-sickle-cell', 'pihcore-diagnosis', 'pihcore-plan'];
const CHILD_SECTIONS = ['physical-exam', 'vaccinations', 'pihcore-ncd', 'pihcore-sickle-cell', 'pihcore-diagnosis', 'pihcore-plan'];
const NOT_OFFERED = ['pihcore-history', 'pihcore-peds'];

const newPatient = (createEntryContext: CustomTestFixtures['createEntryContext'], years = 30) =>
  createEntryContext({ givenName: 'AutoNcdFollowup', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(years) });

const expandEntry = async (page: Page, visitUuid: string): Promise<VisitPage> => {
  const visit = await VisitPage.open(page, visitUuid);
  await visit.expand(visit.encounterOfType(NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID));
  return visit;
};

// The edit link of the visit page (hfeStandardEditUrl of encounterTypeConfig.js): no definitionUiResource, so the server picks the form from the encounter's own form.
const visitPageEditUrl = (context: EntryContext, encounterUuid: string): string => {
  const params = new URLSearchParams({ patientId: context.patient.uuid, encounterId: encounterUuid, returnUrl: visitPagePath(context.visitUuid) });
  return `htmlformentryui/htmlform/editHtmlFormWithStandardUi.page?${params.toString()}`;
};

test.describe('ncd-followup', () => {
  test('ENTER auto-submits at a Consult Note location and saves a form-linked NCD Followup encounter in the visit', async ({ page, api, createEntryContext }) => {
    // ifMode ENTER shell :12: every #who-when-where input has a value -> submitHtmlForm()
    const context = await newPatient(createEntryContext);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
    const encounterUuid = await enterShellForm(page, api, FORM, context);

    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    expect(encounter.encounterType.uuid).toBe(NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    const header = await getEncounterHeader(api, encounterUuid);
    expect(header.form?.uuid, 'HFE links the form').toBe(FORM_UUID);
    expect(header.visit?.uuid).toBe(context.visitUuid);
    // location defaults to the session location (Klinik Ekstèn, which has the tag); provider to the current user, as Consulting Clinician
    expect(header.location.uuid).toBe(KLINIK_EKSTEN_LOCATION_UUID);
    expect(header.encounterProviders.map((p) => p.encounterRole.uuid)).toEqual(['4f10ad1a-ec49-48df-98c7-1391c6ac7f05']);
    // date defaults to now: not after the server clock
    expect(new Date(header.encounterDatetime).getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(await getEncounterObs(api, encounterUuid), 'the shell form saves no obs').toEqual([]);
  });

  test('the visit page offers exam, NCD, sickle cell, diagnosis and plan to an adult, and no history, peds or vaccination section', async ({
    page,
    api,
    createEntryContext,
  }) => {
    // composition: encounterTypeConfig.js ncdFollowupConsult, Haiti DEFAULT version
    const context = await newPatient(createEntryContext);
    await enterShellForm(page, api, FORM, context);
    const visit = await expandEntry(page, context.visitUuid);
    const shown = await visit.shownSectionIds();
    expect(shown).toEqual(ADULT_SECTIONS);
    for (const id of [...NOT_OFFERED, 'vaccinations']) {
      expect(shown, `${id} is not a section of an adult's NCD followup`).not.toContain(id);
    }
  });

  test.describe('the vaccinations include-section needs an age under 15 years at visit start', () => {
    for (const { age, sections } of [
      { age: 14, sections: CHILD_SECTIONS },
      { age: 15, sections: ADULT_SECTIONS },
    ]) {
      test(`${age} years: ${sections.includes('vaccinations') ? 'vaccinations are offered' : 'no vaccinations'}; the peds feeding section is never offered`, async ({
        page,
        api,
        createEntryContext,
      }) => {
        // encounterTypeConfig.js pedsVaccinations `require`: fullMonthsBetweenDates(birthdate, visit.startDatetime) < 15*12; pedsFoodAndSupplements is not a section of this encounter type
        const context = await newPatient(createEntryContext, age);
        await enterShellForm(page, api, FORM, context);
        const visit = await expandEntry(page, context.visitUuid);
        expect(await visit.shownSectionIds()).toEqual(sections);
      });
    }
  });

  test('the visit page shows no VIEW of the form itself: no templateModelUrl, only the sections', async ({ page, api, createEntryContext }) => {
    // Visit-page display (header)
    const context = await newPatient(createEntryContext);
    const encounterUuid = await enterShellForm(page, api, FORM, context);
    await expect(ViewFormPage.open(page, FORM, encounterUuid)).rejects.toThrow(/shows no VIEW of ncd-followup\.xml/);
    // the form's own rendering (heading, EPLD, buttons) is not on the visit page
    await expandEntry(page, context.visitUuid);
    await expect(page.locator('.htmlform, #who-when-where, #buttons')).toHaveCount(0);
  });

  test('EDIT shows the "NCD Followup" heading (the encounter type name message), the provider and location selects, the date and the Next, Save and Cancel buttons', async ({
    page,
    api,
    createEntryContext,
  }) => {
    // ifMode EDIT shell :28: .htmlform shown; EPLD renders #who, #where (tag Consult Note Location), #when
    const context = await newPatient(createEntryContext);
    const encounterUuid = await enterShellForm(page, api, FORM, context);
    await page.goto(editEncounterUrl(FORM, context, encounterUuid));
    await expect(page.locator('#submit')).toBeVisible();
    await expect(page.locator('.htmlform h2')).toHaveText(/^\s*NCD Followup\s*$/);
    await expect(page.locator('#next')).toBeVisible();
    await expect(page.locator('#cancel')).toBeVisible();
    await expect(page.locator('.htmlform select')).toHaveCount(2);
    await expect(page.locator('#who select option:checked')).toHaveCount(1);
    await expect(page.locator('#when input.hasDatepicker')).not.toHaveValue('');
    // the location select offers only the Consult Note Location locations, with the saved one selected
    const tagged = await (await api.get('location?tag=Consult%20Note%20Location&v=custom:(display)&limit=100')).json();
    const names: string[] = tagged.results.map((l: { display: string }) => l.display);
    const selected = (await page.locator('#where select option:checked').innerText()).trim();
    expect(names, 'the saved location is one of the tagged locations').toContain(selected);
    const options = await page.locator('#where select option').count();
    expect(options).toBeGreaterThan(1);
    expect(options).toBeLessThanOrEqual(names.length);
  });

  test('the edit link of the visit page (no definitionUiResource) opens this shell, not another form', async ({ page, api, createEntryContext }) => {
    // hfeStandardEditUrl: the server picks the form by the encounter's form uuid
    const context = await newPatient(createEntryContext);
    const encounterUuid = await enterShellForm(page, api, FORM, context);
    await page.goto(visitPageEditUrl(context, encounterUuid));
    await expect(page.locator('#submit')).toBeVisible();
    await expect(page.locator('.htmlform h2')).toHaveText(/^\s*NCD Followup\s*$/);
    await expect(page.locator('#who-when-where')).toBeVisible();
  });

  test('EDIT without a provider is refused with "Required" and changes nothing', async ({ page, api, createEntryContext }) => {
    // EPLD: encounterProviderAndRole required="true"
    const context = await newPatient(createEntryContext);
    const encounterUuid = await enterShellForm(page, api, FORM, context);
    await page.goto(editEncounterUrl(FORM, context, encounterUuid));
    await expect(page.locator('#submit')).toBeVisible();
    await page.locator('#who select').first().selectOption({ index: 0 });
    await page.locator('#submit').click();
    await expect(page.locator('#who span.field-error')).toContainText('Required');
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    const header = await getEncounterHeader(api, encounterUuid);
    expect(header.encounterProviders).toHaveLength(1);
  });

  test('Next saves the shell and opens the edit form of the first section of the encounter (the exam: there is no history section)', async ({
    page,
    api,
    createEntryContext,
  }) => {
    // #next (nextAndSubmitButtons.js setUpNextButton): submit with goToNext=true -> the visit page opens the first section's edit form
    const context = await newPatient(createEntryContext);
    const encounterUuid = await enterShellForm(page, api, FORM, context);
    await page.goto(editEncounterUrl(FORM, context, encounterUuid));
    await expect(page.locator('#next')).toBeVisible();
    await page.locator('#next').click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('definitionUiResource'))
      .toBe(`file:configuration/pih/htmlforms/${SECTION_FORM}`);
    expect(new URL(page.url()).searchParams.get('encounterId')).toBe(encounterUuid);
    expect((await getPatientEncounters(api, context.patient.uuid)).map((e) => e.uuid)).toEqual([encounterUuid]);
  });

  test('EDIT Save keeps the same encounter and its provider, location, date and form', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext);
    const encounterUuid = await enterShellForm(page, api, FORM, context);
    const before = await getEncounterHeader(api, encounterUuid);
    await page.goto(editEncounterUrl(FORM, context, encounterUuid));
    await expect(page.locator('#submit')).toBeVisible();
    await page.locator('#submit').click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);

    expect((await getPatientEncounters(api, context.patient.uuid)).map((e) => e.uuid)).toEqual([encounterUuid]);
    const after = await getEncounterHeader(api, encounterUuid);
    expect(after.location.uuid).toBe(before.location.uuid);
    expect(after.encounterProviders.map((p) => p.encounterRole.uuid)).toEqual(before.encounterProviders.map((p) => p.encounterRole.uuid));
    expect(after.encounterDatetime.slice(0, 10)).toBe(before.encounterDatetime.slice(0, 10));
    expect(after.form?.uuid).toBe(FORM_UUID);
  });

  test('a section saved into the encounter the shell created shows in its VIEW, and re-saving the shell keeps the section obs', async ({
    page,
    api,
    createEntryContext,
  }) => {
    // cross-section: the exam section (section-exam.xml) edits THIS encounter; the shell's EDIT must not void obs it has no field for
    const context = await newPatient(createEntryContext);
    const encounterUuid = await enterShellForm(page, api, FORM, context);
    const before = await getEncounterHeader(api, encounterUuid);

    await page.goto(editEncounterUrl(SECTION_FORM, context, encounterUuid));
    // the "Normal" box of the skin block; sticky headings intercept the pointer, so click through the DOM
    await page.locator('#skin + .collapsible-content').getByLabel('Normal', { exact: true }).evaluate((el) => (el as HTMLElement).click());
    await page.locator('#submit').evaluate((el) => (el as HTMLElement).click());
    await new SectionFormPage(page, SECTION_FORM).expectSaved();

    const obs = await getEncounterObs(api, encounterUuid);
    expect(obs.map((o) => o.display.toLowerCase())).toEqual([expect.stringContaining('skin exam findings: normal')]);
    expect((await getPatientEncounters(api, context.patient.uuid)).map((e) => e.uuid)).toEqual([encounterUuid]);
    expect((await getEncounterHeader(api, encounterUuid)).form?.uuid, "the section does not replace the encounter's form").toBe(before.form?.uuid);

    // VIEW: the visit page shows the section's own VIEW inside this encounter
    const view = await expectViewShowsSavedObs(page, api, SECTION_FORM, encounterUuid);
    expect((await view.valueTexts()).join(' | ')).toContain('Normal');

    // re-save the shell in EDIT: the section's obs stay
    await page.goto(editEncounterUrl(FORM, context, encounterUuid));
    await expect(page.locator('#submit')).toBeVisible();
    await page.locator('#submit').click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    expect(await getEncounterObs(api, encounterUuid)).toHaveLength(1);
  });
});
