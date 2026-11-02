import { type APIRequestContext } from '@playwright/test';
import { test, expect, birthdateYearsAgo } from '../../core';
import { PMTCT_FOLLOWUP_ENCOUNTER_TYPE_UUID, KLINIK_EKSTEN_LOCATION_UUID } from '../../core/constants';
import { getPatientEncounters } from '../../commands';
import { EntryFormPage, SectionFormPage, ViewFormPage, VISIT_PAGE_URL } from '../../pages';

// hiv/pmtct-followup.xml: header form ("PMTCT Followup"), 55 lines: only the encounter-provider-location-date subform
// (EPLD), the ENTER auto-submit and the EDIT Next/Save buttons; same shape as hiv-followup (the five wrappers
// differ only in uuids and heading and use the same location tag, "HIV Consult Location"; checked in the XML).
// ENTER opens enterHtmlFormWithStandardUi inside a visit the fixture creates (availability, _availability.e2e.md,
// is not exercised); EDIT opens editHtmlFormWithStandardUi on an empty PMTCT followup encounter made over REST. The
// harness session is at Klinik Ekstèn (Mirebalais), which carries the tag.
// The visit-page gate (female, age >= 10) is not exercised; the patient is a 30-year-old woman.
//
// Conditions (pmtct-followup.inv.md):
//   ifMode ENTER :10-23  .htmlform is display:none (:36); if encounterLocation has a value -> submitHtmlForm(), else
//                        hide #next and show the form (the "location empty" path)
//   ifMode EDIT  :25-34  shows .htmlform and calls setUpNextAndSubmitButtons() (nextAndSubmitButtons.js)
//   ifMode VIEW  :37     include=false: heading, EPLD and buttons are not rendered in VIEW (tested: the VIEW of the
//                        ENTER-saved encounter, loaded through getAsHtml.action, has no values, headings, inputs or buttons)
// Scripts: the two blocks above; no validation, derived values or defaults of its own (EPLD ones: _shared.e2e.md).
// Side effects on save: none (no obs, program or order).
// Not covered here: the "location empty -> form shown" path (needs a session location without the tag, and the
// session is shared by every spec run), the Next button (redirect URL, see _shared V8), availability.
//
// Findings:
//   V1 Low :38-40  the heading uses the HIV followup key ui.i18n.EncounterType.name.c31d3312-... (own type is
//                  95e03e7d-...): in EDIT the form says "HIV Followup" instead of the PMTCT followup name. Fix: use the
//                  own encounter type uuid (no test: Low). Auto-submit with an empty provider: see _shared V9.

const FORM = 'hiv/pmtct-followup.xml';

// The encounter's own fields as the server stored them (the encounter belongs to the test patient).
const getEncounterHeader = async (api: APIRequestContext, encounterUuid: string) => {
  const res = await api.get(`encounter/${encounterUuid}?v=custom:(form:(uuid),location:(uuid),visit:(uuid))`);
  expect(res.ok(), `get encounter: ${res.status()}`).toBeTruthy();
  return (await res.json()) as { form: { uuid: string } | null; location: { uuid: string }; visit: { uuid: string } };
};

test.describe('pmtct-followup', () => {
  test('ENTER auto-submits at a tagged session location and saves a form-linked encounter in the visit', async ({
    page,
    api,
    createEntryContext,
  }) => {
    // ifMode ENTER :10: encounterLocation has a value -> submitHtmlForm()
    const context = await createEntryContext({
      givenName: 'AutoPmtct',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(30),
    });
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);

    await EntryFormPage.open(page, FORM, context);
    await expect(page).toHaveURL(VISIT_PAGE_URL);

    await expect
      .poll(async () => (await getPatientEncounters(api, context.patient.uuid)).map((e) => e.encounterType.uuid))
      .toEqual([PMTCT_FOLLOWUP_ENCOUNTER_TYPE_UUID]);

    // The location default is the session location, the encounter joins the visit, and HFE links the form.
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    const header = await getEncounterHeader(api, encounter.uuid);
    expect(header.location.uuid).toBe(KLINIK_EKSTEN_LOCATION_UUID);
    expect(header.visit.uuid).toBe(context.visitUuid);
    expect(header.form).not.toBeNull();
  });

  test('EDIT shows the form with the EPLD widgets, and Save keeps the same encounter', async ({
    page,
    api,
    createSectionEncounter,
  }) => {
    // ifMode EDIT :25: .htmlform shown, setUpNextAndSubmitButtons() binds #next / #submit
    const section = await createSectionEncounter({
      encounterTypeUuid: PMTCT_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoPmtct', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(30) },
    });

    const form = await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('.htmlform h2')).toBeVisible(); // its text is the HIV one (V1)
    await expect(page.locator('#next')).toBeVisible();
    await expect(page.locator('#cancel')).toBeVisible();
    // EPLD: provider and location selects plus the date picker, which shows the encounter's date.
    await expect(page.locator('.htmlform select')).toHaveCount(2);
    await expect(page.locator('.htmlform input.hasDatepicker')).not.toHaveValue('');

    await form.save();
    await form.expectSaved();

    const encounters = await getPatientEncounters(api, section.patient.uuid);
    expect(encounters.map((e) => e.uuid)).toEqual([section.encounter.uuid]);
  });

  test('VIEW of the saved encounter renders none of the header, EPLD or buttons (ifMode VIEW include=false) and no values', async ({
    page,
    api,
    createEntryContext,
  }) => {
    // the wrapper saves no obs, and everything it renders is inside ifMode VIEW include=false
    const context = await createEntryContext({
      givenName: 'AutoPmtct',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(30),
    });
    await EntryFormPage.open(page, FORM, context);
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    await expect.poll(async () => (await getPatientEncounters(api, context.patient.uuid)).length).toBe(1);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const view = await ViewFormPage.open(page, FORM, encounter.uuid);
    expect(await view.valueTexts()).toEqual([]);
    await expect(page.locator('.htmlform')).toHaveCount(1); // the form itself rendered, empty
    await expect(page.locator('h2, #next, #submit, #cancel, #buttons')).toHaveCount(0);
    await expect(page.locator('select, input, button')).toHaveCount(0);
  });
});
