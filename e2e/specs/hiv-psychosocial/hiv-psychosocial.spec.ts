import { type Page, type Locator } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { HIV_PSYCHOSOCIAL_ENCOUNTER_TYPE_UUID, SESSION_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, SectionFormPage, ViewFormPage, expectViewShowsSavedObs, VISIT_PAGE_URL } from '../../pages';

// hiv/hiv-psychosocial.xml: "HIV Psychosocial Evaluation" (CHW name, reason for follow-up, evaluation text, willingness
// to re-enrol, monitoring actions). Top-level form with its own provider/location/date (shared subform, tag
// "HIV Consult Location"), so it is not an auto-submit wrapper. The specs open enterHtmlFormWithStandardUi inside a visit
// they create (EntryFormPage), and the edit URL directly for EDIT; availability (documentation/_availability.e2e.md:
// enableHIVForms, not offered on the CEN test server) is not exercised. The form uses <submit>, so there is no #submit:
// the specs click `#buttons input.submitButton`.
//
// Conditions in the form, from documentation inventory (hiv-psychosocial.inv.md):
//   excludeIf obs CIEL:164141 on the encounter :50, :152   no CHW name saved yet (ENTER, or EDIT of an encounter without one):
//                                                           script :51-124 + #lastRecorded-CHW-div / #normal-CHW-div (:153-179)
//   includeIf same                                  :146   the encounter has a CHW name (EDIT): a single plain obs
//   ifMode VIEW include=false                       :28, :127, :161, :291  scripts, header, "change CHW" checkbox, buttons
//   ifMode EDIT                                     :39    shows .htmlform and binds the Next/Save buttons again
//   toggle PIH:20103=PIH:2923 (style dim)           :282   enables the free-text input .otherMonitoringActions
// Scripts: :29, :40 setUpNextAndSubmitButtons (see _shared V8). :51-124 (excludeIf, i.e. ENTER) reads the patient's CHW
//   name obs over REST (concept uuid 164141AAAA...), takes the latest one dated on or before the encounter date and shows
//   #lastRecorded-CHW-div (name, encounter display, checkbox #changeChw that shows #editChwNameDiv) or, with none,
//   #normal-CHW-div (a plain name field).
// Side effects on save: none (no program, order or disposition). No required field apart from provider and location.
// VIEW (getAsHtml.action with this form's file): the save test checks every saved value is shown (the form's own labels for the
//   reasons and actions, the date as "dd MMM yyyy"), the plain CHW name and the ENTER-only parts absent; a second test the CHW-name-only case.
// Not covered here: the Next button of the visit sections, the retro-entry privilege gating of provider/date
//   (_shared.e2e.md).
//
// Findings:
//   V1 Medium :114-120 unticking #changeChw only hides #editChwNameDiv, the typed name stays in the hidden input and is saved
//                      as the CHW name although the user withdrew the change. Fix: clear the input when the box is unticked.
//                      TESTED below (test.fixme).
//   V2 Low    :149,173,180 three obs share id="chwName" (two of them rendered together in ENTER, via #editChwNameDiv and
//                      #normal-CHW-div), so the id selects the wrong one. Fix: distinct ids.
//   V3 Low    :197 the return-visit-date obs has id="nextDispenseDate" (a dispensing leftover, nothing reads it). Fix: rename.

const FORM = 'hiv/hiv-psychosocial.xml';
// VIEW: answers the form labels with its own message (answerCode) instead of the concept name, and the date as "dd MMM yyyy"
const VIEW_LABELS: Record<string, string> = {
  'Review of socio-economic assistance: HIV suppport group': 'Support group',
  'Reason for return visit: Beyond detectable limit': 'Undetected VL',
  'Return visit date: 2030-12-15': '15 Dec 2030',
};
const CHW_CONCEPT_UUID = '164141AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; // CIEL:164141, the uuid the form's script queries

// Local helpers.
// The date inputs are read-only datepickers: set the date the way the picker does.
const pickDate = async (input: Locator, isoDate: string) => {
  await input.evaluate((el, iso) => {
    const j = (window as unknown as { jq: (e: unknown) => { datepicker: (...a: unknown[]) => void; trigger: (n: string) => void } }).jq;
    j(el).datepicker('setDate', new Date(`${iso}T12:00:00`));
    j(el).trigger('change');
  }, isoDate);
};
// <submit/> renders input.submitButton (no #submit). The location select must have a value or "Required" blocks the save.
const save = async (page: Page) => {
  await expect(page.locator('#encounterLocation select')).not.toHaveValue('');
  await page.locator('#buttons input.submitButton').click();
  await expect(page).toHaveURL(VISIT_PAGE_URL);
};
// A psychosocial encounter created over REST, optionally with a CHW name, as the "previous" or "edited" encounter.
const createEncounter = async (api: import('@playwright/test').APIRequestContext, context: EntryContext, chwName?: string) => {
  const res = await api.post('encounter', {
    data: {
      patient: context.patient.uuid,
      encounterType: HIV_PSYCHOSOCIAL_ENCOUNTER_TYPE_UUID,
      location: SESSION_LOCATION_UUID,
      encounterDatetime: new Date(Date.now() - 60_000).toISOString(),
      visit: context.visitUuid,
      obs: chwName ? [{ concept: CHW_CONCEPT_UUID, value: chwName }] : [],
    },
  });
  expect(res.ok(), `create encounter: ${res.status()}`).toBeTruthy();
  return (await res.json()).uuid as string;
};
const savedObs = async (api: import('@playwright/test').APIRequestContext, patientUuid: string) => {
  const encounters = await getPatientEncounters(api, patientUuid);
  expect(encounters).toHaveLength(1);
  return { encounterType: encounters[0].encounterType.uuid, displays: (await getEncounterObs(api, encounters[0].uuid)).map((o) => o.display) };
};

test.describe('hiv-psychosocial @hiv-ci', () => {
  let context: EntryContext;

  test.beforeEach(async ({ createEntryContext }) => {
    context = await createEntryContext({ givenName: 'AutoPsychosocial', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(30) });
  });

  test('without a recorded CHW name the plain name field shows (ENTER)', async ({ page }) => {
    // excludeIf :50/:152, script :51-124: no CHW obs for the patient -> #normal-CHW-div
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#normal-CHW-div')).toBeVisible();
    await expect(page.locator('#normal-CHW-div input[type=text]')).toBeVisible();
    await expect(page.locator('#lastRecorded-CHW-div')).toBeHidden();
  });

  test('with a CHW name recorded earlier the last name shows, and "change" reveals the name field', async ({ page, api }) => {
    // script :51-124 + #changeChw handler :114-120
    await createEncounter(api, context, 'AutoChwOne');
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#lastRecorded-CHW-div')).toBeVisible();
    await expect(page.locator('#lastRecordedCHW')).toHaveText('AutoChwOne');
    await expect(page.locator('#normal-CHW-div')).toBeHidden();

    const edit = page.locator('#editChwNameDiv');
    await expect(edit).toBeHidden();
    await page.locator('#changeChw').check();
    await expect(edit).toBeVisible();
    await page.locator('#changeChw').uncheck();
    await expect(edit).toBeHidden();
  });

  test('a changed CHW name is saved with the encounter', async ({ page, api }) => {
    // #changeChw ticked -> the name in #editChwNameDiv is saved
    await createEncounter(api, context, 'AutoChwOne');
    await EntryFormPage.open(page, FORM, context);
    await page.locator('#changeChw').check();
    await page.locator('#editChwNameDiv input[type=text]').fill('AutoChwTwo');
    await save(page);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters).toHaveLength(2);
    const displays = (await Promise.all(encounters.map((e) => getEncounterObs(api, e.uuid)))).flat().map((o) => o.display);
    expect(displays.some((d) => d.includes('AutoChwTwo'))).toBeTruthy();
  });

  // V1 (Medium): the typed name stays in the hidden input after "change" is unticked and is saved.
  // Intended: nothing is saved from a withdrawn change. Remove test.fixme() when :114-120 clears the input.
  test('a CHW name typed and then withdrawn by unticking "change" is not saved (V1)', async ({ page, api }) => {
    test.fixme();
    await createEncounter(api, context, 'AutoChwOne');
    await EntryFormPage.open(page, FORM, context);
    await page.locator('#changeChw').check();
    await page.locator('#editChwNameDiv input[type=text]').fill('AutoChwWithdrawn');
    await page.locator('#changeChw').uncheck();
    await save(page);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    const displays = (await Promise.all(encounters.map((e) => getEncounterObs(api, e.uuid)))).flat().map((o) => o.display);
    expect(displays.some((d) => d.includes('AutoChwWithdrawn'))).toBeFalsy();
  });

  test('an encounter with a saved CHW name shows it as a plain field in EDIT', async ({ page, api }) => {
    // includeIf :146: the encounter has CIEL:164141 -> one plain obs, none of the ENTER-only elements
    const encounterUuid = await createEncounter(api, context, 'AutoChwOne');
    await page.goto(SectionFormPage.editUrl(FORM, { patient: context.patient, encounter: { uuid: encounterUuid, visitUuid: context.visitUuid } }));
    await expect(page.locator('#buttons input.submitButton')).toBeVisible();
    await expect(page.locator('#chw-name input[type=text]')).toHaveValue('AutoChwOne');
    await expect(page.locator('#lastRecorded-CHW-div')).toHaveCount(0);
    await expect(page.locator('#normal-CHW-div')).toHaveCount(0);
  });

  test('the free-text monitoring action input is enabled only while "Other socioeconomic assistance" is ticked', async ({ page }) => {
    // toggle PIH:20103 = PIH:2923, style dim :282
    await EntryFormPage.open(page, FORM, context);
    const text = page.locator('p.otherMonitoringActions input[type=text]');
    const other = page.getByLabel('Other socioeconomic assistance', { exact: false });
    await expect(text).toBeDisabled();
    await other.check();
    await expect(text).toBeEnabled();
    await other.uncheck();
    await expect(text).toBeDisabled();
  });

  test('saves the CHW name, return date, follow-up reasons, evaluation text and monitoring actions', async ({ page, api }) => {
    await EntryFormPage.open(page, FORM, context);
    await page.locator('#normal-CHW-div input[type=text]').fill('AutoChwSaved');
    await pickDate(page.locator('#nextDispenseDate input.hasDatepicker'), '2030-12-15');
    await page.getByLabel('Return to care', { exact: true }).check();
    await page.getByLabel('Undetected VL', { exact: true }).check();
    await page.locator('#visit-reason textarea').first().fill('Missed three visits');
    await page.locator('#visit-reason p', { hasText: 'Willing to re-enroll' }).getByLabel('Yes', { exact: true }).check();
    await page.getByLabel('Home Visits', { exact: true }).check();
    await page.getByLabel('Support group', { exact: true }).check();
    await save(page);

    const { encounterType, displays } = await savedObs(api, context.patient.uuid);
    expect(encounterType).toBe(HIV_PSYCHOSOCIAL_ENCOUNTER_TYPE_UUID);
    const joined = displays.join(' | ');
    for (const expected of ['AutoChwSaved', 'Missed three visits', '15']) {
      expect(joined).toContain(expected);
    }
    expect(displays.length).toBeGreaterThanOrEqual(7); // chw, date, 2 reasons, text, willing, 2 actions

    // VIEW: the saved CHW name is a plain obs (includeIf :146), the return date and the ticked boxes show, the rest does not
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, VIEW_LABELS);
    await expect(page.locator('#chw-name .value')).toHaveText('AutoChwSaved');
    await expect(page.locator('#lastRecorded-CHW-div, #normal-CHW-div, #changeChw')).toHaveCount(0); // ENTER-only parts (:50, :152, :161)
    await expect(page.locator('#nextDispenseDate .value')).toHaveCount(1); // the date, in the form's own format
    const shown = await view.valueTexts();
    expect(shown).toEqual(expect.arrayContaining(['AutoChwSaved', 'Missed three visits']));
    expect(shown.filter((t) => t.startsWith('[X]')).length).toBeGreaterThanOrEqual(5); // 2 reasons, willing, 2 actions
    // not filled: the consequences-of-inadherence textarea, the reinforce-adherence radio and the "other" assistance text
    await expect(page.locator('#visit-reason p', { hasText: /reinforce/i }).locator('.value')).toHaveCount(0);
    await expect(page.locator('#visit-reason p', { hasText: /consequences/i }).locator('.value')).toHaveCount(0);
    await expect(page.locator('.otherMonitoringActions .value')).toHaveCount(0);
    await expect(page.locator('h2, #buttons, input.submitButton, #encounterLocation')).toHaveCount(0); // ifMode VIEW include=false :127, :291
  });

  test('VIEW of an encounter with only a CHW name shows that name and nothing else as a value', async ({ page, api }) => {
    // includeIf :146 (the ENTER-only divs are not rendered); the radios and checkboxes show as unselected, not as values
    const encounterUuid = await createEncounter(api, context, 'AutoChwOne');
    const view = await ViewFormPage.open(page, FORM, encounterUuid);
    expect(await view.valueTexts()).toEqual(['AutoChwOne']);
    await expect(page.locator('#chw-name .value')).toHaveCount(1);
    await expect(page.locator('#visit-reason .value, #monitorint-actions .value')).toHaveCount(0);
    await expect(page.locator('#visit-reason .emptyValue').first()).toBeVisible();
  });
});
