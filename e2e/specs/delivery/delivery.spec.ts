import { type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures } from '../../core';
import { DELIVERY_ENCOUNTER_TYPE_UUID, KLINIK_EKSTEN_LOCATION_UUID } from '../../core/constants';
import { getEncounterHeader, getEncounterObs, getPatientEncounters } from '../../commands';
import { SectionFormPage, ViewFormPage, VisitPage, VISIT_PAGE_URL, expectViewShowsSavedObs } from '../../pages';
import { editEncounterUrl, enterShellForm } from '../../pages/sectioned-encounter';
import { isoDate, pickDate } from '../../pages/form-widgets';

// delivery.xml: "MCH Delivery" (v3.0), the entry form of the MCH Delivery encounter. It is only the shared encounter-with-sections.xml shell (heading with the encounter type's name,
// the provider / location / date block of encounter-provider-location-date.xml, Next / Save / Cancel) with no clinical field: the content is entered in the sections of the visit
// page (section-delivery, section-c-section and the diagnosis section: see their specs). The specs open enterHtmlFormWithStandardUi inside a visit the fixture creates
// (EntryFormPage via enterShellForm), which skips the visit-action gating of _availability.e2e.md (Haiti branch of `enableMCHForms`, `Task: emr.enterMCH`, Maternal and Child Location
// on the session, female, age >= 10, no delivery in the visit). Runs on zl-ci. The shell's who / where / when uses EPLD's default tag (Consult Note Location, not Maternal and
// Child Location), so the session location Klinik Ekstèn is preselected and the form auto-submits on load, as it does for a user.
//
// Conditions in the form (own file: none; the shell's, from encounter-with-sections.xml, subforms/encounter-with-sections.xml and EPLD, see _shared.e2e.md):
//   ifMode ENTER :6   when every input of #who-when-where has a value -> submitHtmlForm() (auto-submit); else hide #next and show .htmlform
//   ifMode EDIT  :23  .htmlform shown, setUpNextAndSubmitButtons() (nextAndSubmitButtons.js)
//   ifMode VIEW include=false: the heading, the who / where / when block and the buttons: nothing is rendered in VIEW
// Scripts: the two blocks above and nextAndSubmitButtons.js; none of its own. Provider (required, role Consulting Clinician 4f10ad1a-...) defaults to the current user, location to the
//   session location (when it carries the tag), date to now.
// Side effects on save: none (no enrollInProgram, no postSubmissionAction).
// Composition on the visit page (encounterTypeConfig.js, encounter type 00e5ebb2-..., DEFAULT entry): pihcore-delivery (section-delivery), pihcore-c-section (section-c-section),
//   pihcore-diagnosis (section-dx), in that order, with no `require` on any of them.
// Visit-page display: the visit page does NOT show this form's VIEW. The entry has no templateModelUrl and both templates are defaultEncounterShort.page ("no expanded view": the
//   encounter expands to its sections), so the form's own VIEW (nothing: everything is ifMode VIEW include=false) is not tested; the VIEW tests assert the section list and the VIEW
//   of section-delivery saved into this encounter.
// Findings: see _shared V9 (the auto-submit tests only the location) and V15 (the shell renders nothing in VIEW); none of its own.
// Not covered here: the form staying open (needs a session location without a Consult Note Location tag: the session is shared by every spec), availability, the sections' fields
//   (their own specs), the Next button's later hops (see _shared V8), the print-form-datestamps block (hidden, print only).

const FORM = 'delivery.xml';
const SECTION_FORM = 'section-delivery.xml'; // the first section of the encounter
const SECTIONS = ['pihcore-delivery', 'pihcore-c-section', 'pihcore-diagnosis'];

const newPatient = (createEntryContext: CustomTestFixtures['createEntryContext'], years = 28) =>
  createEntryContext({ givenName: 'AutoDeliveryShell', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(years) });

const expandEntry = async (page: Page, visitUuid: string): Promise<VisitPage> => {
  const visit = await VisitPage.open(page, visitUuid);
  await visit.expand(visit.encounterOfType(DELIVERY_ENCOUNTER_TYPE_UUID));
  return visit;
};

test.describe('delivery', () => {
  test('ENTER auto-submits: a form-linked MCH Delivery encounter in the visit, at the session location, with no obs', async ({ page, api, createEntryContext }) => {
    // ifMode ENTER (encounter-with-sections.xml :6): provider, location and date all have a value -> submitHtmlForm()
    const context = await newPatient(createEntryContext);
    const encounterUuid = await enterShellForm(page, api, FORM, context);

    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    expect(encounter.encounterType.uuid).toBe(DELIVERY_ENCOUNTER_TYPE_UUID);
    const header = await getEncounterHeader(api, encounterUuid);
    expect(header.form, 'HFE links the form').not.toBeNull();
    expect(header.location.uuid).toBe(KLINIK_EKSTEN_LOCATION_UUID);
    expect(header.visit?.uuid).toBe(context.visitUuid);
    expect(header.encounterProviders.map((p) => p.encounterRole.uuid)).toEqual(['4f10ad1a-ec49-48df-98c7-1391c6ac7f05']);
    expect(new Date(header.encounterDatetime).getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(await getEncounterObs(api, encounterUuid), 'the shell form saves no obs').toEqual([]);
  });

  test('the visit page offers delivery, c-section and diagnosis, for an adult and for a 10-year-old (the youngest age the visit action offers)', async ({
    page,
    api,
    createEntryContext,
  }) => {
    // composition: encounterTypeConfig.js, no `require` on the three sections
    for (const years of [28, 10]) {
      const context = await newPatient(createEntryContext, years);
      await enterShellForm(page, api, FORM, context);
      const visit = await expandEntry(page, context.visitUuid);
      expect(await visit.shownSectionIds(), `${years} years`).toEqual(SECTIONS);
    }
  });

  test('the visit page shows no VIEW of the form itself: no templateModelUrl, only the sections', async ({ page, api, createEntryContext }) => {
    // Visit-page display (header)
    const context = await newPatient(createEntryContext);
    const encounterUuid = await enterShellForm(page, api, FORM, context);
    await expect(ViewFormPage.open(page, FORM, encounterUuid)).rejects.toThrow(/shows no VIEW of delivery\.xml/);
    // the form's own rendering (heading, who / where / when, buttons) is not on the visit page
    await expandEntry(page, context.visitUuid);
    await expect(page.locator('#who-when-where, #buttons')).toHaveCount(0);
  });

  test('EDIT shows the encounter type as the heading, provider, location (the saved one) and date, and the Next, Save and Cancel buttons', async ({ page, api, createEntryContext }) => {
    // ifMode EDIT (:23) and ifMode VIEW include=false: the heading is the encounter type's translated name, "Delivery" (uimessage ui.i18n.EncounterType.name.00e5ebb2-...)
    const context = await newPatient(createEntryContext);
    const encounterUuid = await enterShellForm(page, api, FORM, context);
    await page.goto(editEncounterUrl(FORM, context, encounterUuid));
    await expect(page.locator('#submit')).toBeVisible();
    await expect(page.locator('h2')).toHaveText('Delivery');
    await expect(page.locator('#next')).toBeVisible();
    await expect(page.locator('#cancel')).toBeVisible();
    await expect(page.locator('#who select option:checked')).toHaveCount(1);
    await expect(page.locator('#where select option:checked')).toHaveText('Klinik Ekstèn');
    await expect(page.locator('#when input.hasDatepicker')).not.toHaveValue('');
  });

  test('EDIT without a provider is refused with "Required" and changes nothing', async ({ page, api, createEntryContext }) => {
    // encounterProviderAndRole required="true" (encounter-provider-location-date.xml)
    const context = await newPatient(createEntryContext);
    const encounterUuid = await enterShellForm(page, api, FORM, context);
    await page.goto(editEncounterUrl(FORM, context, encounterUuid));
    await expect(page.locator('#submit')).toBeVisible();
    await page.locator('#who select').first().selectOption({ index: 0 });
    await page.locator('#submit').click();
    await expect(page.locator('#who span.field-error')).toContainText('Required');
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect((await getEncounterHeader(api, encounterUuid)).encounterProviders).toHaveLength(1);
  });

  test('Next saves the shell and opens the edit form of the first section of the encounter (the delivery section)', async ({ page, api, createEntryContext }) => {
    // #next (nextAndSubmitButtons.js setUpNextButton)
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

  test('EDIT Save keeps the same encounter, provider, location and date', async ({ page, api, createEntryContext }) => {
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
    expect(after.form?.uuid).toBe(before.form?.uuid);
  });

  test('the delivery section saved into the encounter the shell created shows in its VIEW, and re-saving the shell keeps the section obs', async ({
    page,
    api,
    createEntryContext,
  }) => {
    // cross-section: section-delivery.xml edits THIS encounter (only its required delivery date and one answer here); the shell's EDIT must not void obs it has no field for
    const context = await newPatient(createEntryContext);
    const encounterUuid = await enterShellForm(page, api, FORM, context);
    const before = await getEncounterHeader(api, encounterUuid);

    await page.goto(editEncounterUrl(SECTION_FORM, context, encounterUuid));
    await expect(page.locator('#submit')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await pickDate(page.locator('#deliveryDate input[readonly]'), isoDate(-1)); // yesterday: the date widget does not allow a later date
    await page.locator('#hemLine label', { hasText: /^\s*No\s*$/ }).first().click();
    await page.locator('#submit').click();
    await new SectionFormPage(page, SECTION_FORM).expectSaved();

    const saved = await getEncounterObs(api, encounterUuid);
    expect(saved.length).toBeGreaterThanOrEqual(2); // the delivery date and the answer
    expect((await getPatientEncounters(api, context.patient.uuid)).map((e) => e.uuid)).toEqual([encounterUuid]);
    expect((await getEncounterHeader(api, encounterUuid)).form?.uuid, "the section does not replace the encounter's form").toBe(before.form?.uuid);

    // VIEW: the visit page shows the section's own VIEW inside this encounter
    const view = await expectViewShowsSavedObs(page, api, SECTION_FORM, encounterUuid);
    expect((await view.valueTexts()).join(' | ')).toContain('[X] No');

    // re-save the shell in EDIT: the section's obs stay
    await page.goto(editEncounterUrl(FORM, context, encounterUuid));
    await expect(page.locator('#submit')).toBeVisible();
    await page.locator('#submit').click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    expect(await getEncounterObs(api, encounterUuid)).toHaveLength(saved.length);
  });
});
