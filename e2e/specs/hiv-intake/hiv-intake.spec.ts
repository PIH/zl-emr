import { test, expect, birthdateYearsAgo } from '../../core';
import { HIV_INTAKE_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getPatientEncounters } from '../../commands';
import { EntryFormPage, VisitPage, VISIT_PAGE_URL } from '../../pages';

// hiv/hiv-intake.xml: header form ("HIV Intake"), 55 lines: only the encounter-provider-location-date subform
// and the ENTER auto-submit. Its content is edited through the section-hiv-* forms (see those specs); the
// other wrappers (hiv-followup, eid-followup, pmtct-intake, pmtct-followup) have the same shape.
// The spec opens enterHtmlFormWithStandardUi inside a visit it creates, so availability (documentation/
// _availability.e2e.md: component flag, privilege, "HIV Consult Location" session tag, ...) is not exercised.
// The harness session location (SESSION_LOCATION_UUID: Klinik Ekstèn on zl-ci; on hiv-ci, where these specs run, E2E_HIV_CI_SESSION_LOCATION_UUID = Mirebalais) carries the tag.
//
// Conditions: ifMode ENTER (:11) hides the form and calls submitHtmlForm() when encounterLocation has a value;
// the location defaults to the session location (tags="HIV Consult Location"), so a fresh ENTER saves an
// encounter with no obs and redirects. Otherwise the form is shown (#next hidden).
// Side effects on save: none. Not covered here: the "form shown" path (needs a session location without the
// tag), EDIT (setUpNextAndSubmitButtons).
// Visit-page display: the visit page does NOT show this form's VIEW (everything it renders is inside ifMode VIEW
// include=false :34, so it would be empty anyway). The HIV Intake entry of encounterTypeConfig.js has no templateModelUrl of
// its own: it lists the encounter with four sections (hiv-history, physical-exam, hiv-assessment, hiv-intake-plan), each
// with the VIEW of its own section form (see the section-hiv-* specs and section-exam). The VIEW test asserts that list.

test.describe('hiv-intake @hiv-ci', () => {
  test('opening the form in ENTER mode saves an HIV intake encounter with the defaults and redirects', async ({
    page,
    api,
    createEntryContext,
  }) => {
    // ifMode ENTER :11: encounterLocation has a value -> submitHtmlForm()
    const context = await createEntryContext({
      givenName: 'AutoHiv',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(30),
    });
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);

    await EntryFormPage.open(page, 'hiv/hiv-intake.xml', context);
    await expect(page).toHaveURL(VISIT_PAGE_URL);

    await expect
      .poll(async () => (await getPatientEncounters(api, context.patient.uuid)).map((e) => e.encounterType.uuid))
      .toEqual([HIV_INTAKE_ENCOUNTER_TYPE_UUID]);
  });

  test('the visit page lists the saved encounter with its four sections (the shell form has no VIEW of its own)', async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await createEntryContext({
      givenName: 'AutoHiv',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(30),
    });
    await EntryFormPage.open(page, 'hiv/hiv-intake.xml', context);
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    await expect.poll(async () => (await getPatientEncounters(api, context.patient.uuid)).length).toBe(1);

    const visit = await VisitPage.open(page, context.visitUuid);
    const entry = visit.encounterOfType(HIV_INTAKE_ENCOUNTER_TYPE_UUID);
    await expect(entry).toHaveCount(1);
    await visit.expand(entry);
    for (const section of ['hiv-history', 'physical-exam', 'hiv-assessment', 'hiv-intake-plan']) {
      await expect(visit.section(section), `section ${section} of the HIV Intake entry`).toBeVisible();
    }
  });
});
