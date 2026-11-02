import { test, expect, birthdateYearsAgo } from '../../core';
import { HIV_INTAKE_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getPatientEncounters } from '../../commands';
import { EntryFormPage, ViewFormPage, VISIT_PAGE_URL } from '../../pages';

// hiv/hiv-intake.xml: header form ("HIV Intake"), 55 lines: only the encounter-provider-location-date subform
// and the ENTER auto-submit. Its content is edited through the section-hiv-* forms (see those specs); the
// other wrappers (hiv-followup, eid-followup, pmtct-intake, pmtct-followup) have the same shape.
// The spec opens enterHtmlFormWithStandardUi inside a visit it creates, so availability (documentation/
// _availability.e2e.md: component flag, privilege, "HIV Consult Location" session tag, ...) is not exercised.
// The harness session is at Klinik Ekstèn (Mirebalais), which has the tag.
//
// Conditions: ifMode ENTER (:11) hides the form and calls submitHtmlForm() when encounterLocation has a value;
// the location defaults to the session location (tags="HIV Consult Location"), so a fresh ENTER saves an
// encounter with no obs and redirects. Otherwise the form is shown (#next hidden).
// Side effects on save: none. Not covered here: the "form shown" path (needs a session location without the
// tag), EDIT (setUpNextAndSubmitButtons).
// VIEW (ifMode VIEW include=false :34, everything the form renders): the VIEW of the saved encounter, loaded through
// getAsHtml.action, has no values, headings, inputs or buttons (tested).

test.describe('hiv-intake', () => {
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

  test('VIEW of the saved encounter renders none of the header, EPLD or buttons (ifMode VIEW include=false) and no values', async ({
    page,
    api,
    createEntryContext,
  }) => {
    // the wrapper saves no obs, and everything it renders is inside ifMode VIEW include=false
    const context = await createEntryContext({
      givenName: 'AutoHiv',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(30),
    });
    await EntryFormPage.open(page, 'hiv/hiv-intake.xml', context);
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    await expect.poll(async () => (await getPatientEncounters(api, context.patient.uuid)).length).toBe(1);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const view = await ViewFormPage.open(page, 'hiv/hiv-intake.xml', encounter.uuid);
    expect(await view.valueTexts()).toEqual([]);
    await expect(page.locator('.htmlform')).toHaveCount(1); // the form itself rendered, empty
    await expect(page.locator('h2, #next, #submit, #cancel, #buttons')).toHaveCount(0);
    await expect(page.locator('select, input, button')).toHaveCount(0);
  });
});
