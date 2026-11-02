import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect, type SectionEncounter } from '../../core';
import { SectionFormPage, ViewFormPage, buttonsSubmit, openEditWithButtonsSubmit } from '../../pages';

// patientRegistration-healthCenter.xml: one question, "Patient's Primary Health Center", a dropdown of the
// Visit Location locations that writes the patient's Health Center person attribute. Not a wizard fragment: the
// registration summary page shows it as the "most recent encounter" widget (editable, CENTRAL sites only), so the
// specs create an empty Patient Registration encounter over REST (createSectionEncounter) and open the edit URL
// directly, which skips the summary-page gating.
//
// Conditions in the form, from documentation inventory (patientRegistration-healthCenter.inv.md):
//   ifMode VIEW include=false  :3, :24   h2 and the Save/Cancel buttons (ENTER/EDIT only)
// Scripts: none.
// Side effects on save: <personAttribute attributeType="8d87236c-c2cc-11de-8d13-0010c6dffd0f" tags="Visit Location">
//   (:16) saves the Health Center person attribute; the form has no obs, so the encounter stays empty.
// VIEW (getAsHtml.action with this form): the encounter has no obs, so the generic expectViewShowsSavedObs does not apply;
//   the test asserts the saved location in #healthCenter and the absence of the h2 and #buttons (ifMode VIEW include=false).
// Not covered here: the summary-page widget, which locations
//   the dropdown lists (server data: the specs only use the first options), Cancel.
//
// No findings.

const FORM = 'patientRegistration-healthCenter.xml';
const PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID = '873f968a-73a8-4f9c-ac78-9f4778b751b6';
const HEALTH_CENTER_ATTRIBUTE_TYPE_UUID = '8d87236c-c2cc-11de-8d13-0010c6dffd0f';

// The form has its own Save button (`#buttons button.submitButton`), not the standard `#submit`.
const select = (page: Page) => page.locator('#healthCenter select');
const openForm = (page: Page, section: SectionEncounter) => openEditWithButtonsSubmit(page, FORM, section);
const saveAndWait = async (page: Page) => {
  await buttonsSubmit(page).click();
  await new SectionFormPage(page, FORM).expectSaved();
  await page.waitForLoadState('load');
};

// Local helper: displays of the patient's active Health Center attributes (the patient is the synthetic one).
const healthCenterAttributes = async (api: APIRequestContext, patientUuid: string): Promise<string[]> => {
  const res = await api.get(`person/${patientUuid}?v=custom:(attributes:(attributeType:(uuid),value:(display)))`);
  expect(res.ok()).toBeTruthy();
  const attributes = (await res.json()).attributes as Array<{ attributeType: { uuid: string }; value: { display: string } | string }>;
  return attributes
    .filter((a) => a.attributeType.uuid === HEALTH_CENTER_ATTRIBUTE_TYPE_UUID)
    .map((a) => (typeof a.value === 'string' ? a.value : a.value.display));
};
const encounterObsCount = async (api: APIRequestContext, encounterUuid: string): Promise<number> => {
  const res = await api.get(`encounter/${encounterUuid}?v=custom:(obs:(uuid))`);
  expect(res.ok()).toBeTruthy();
  return ((await res.json()).obs as unknown[]).length;
};
// Text of the nth option of the dropdown (0 is the "Choose a Location..." placeholder). Never logged.
const optionText = async (page: Page, index: number) =>
  ((await select(page).locator('option').nth(index).textContent()) ?? '').trim();

test.describe('patientRegistration-healthCenter', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoHealthCenter', familyName: 'Tester', gender: 'F' },
    });
    await openForm(page, section);
  });

  test('renders the heading, a dropdown with a blank placeholder first, and Save/Cancel', async ({ page }) => {
    // when :3, :24 (ENTER/EDIT)
    await expect(page.locator('h2')).toHaveCount(1);
    await expect(select(page)).toBeVisible();
    await expect(select(page)).toHaveValue('');
    expect(await select(page).locator('option').count()).toBeGreaterThan(1);
    await expect(page.locator('#buttons button.cancel')).toBeVisible();
  });

  test('saves the Health Center person attribute (no obs), and EDIT starts from it', async ({ page, api }) => {
    expect(await healthCenterAttributes(api, section.patient.uuid)).toHaveLength(0);
    const chosen = await optionText(page, 1);
    await select(page).selectOption({ index: 1 });
    await saveAndWait(page);

    expect(await healthCenterAttributes(api, section.patient.uuid)).toEqual([chosen]);
    expect(await encounterObsCount(api, section.encounter.uuid)).toBe(0);

    await openForm(page, section);
    await expect(select(page).locator('option:checked')).toHaveText(chosen);
  });

  test('VIEW: shows the saved Health Center without the heading and the buttons', async ({ page, api }) => {
    await select(page).selectOption({ index: 1 });
    const chosen = await optionText(page, 1);
    await saveAndWait(page);
    expect(await healthCenterAttributes(api, section.patient.uuid)).toEqual([chosen]);

    const view = await ViewFormPage.open(page, FORM, section.encounter.uuid);
    await expect(view.page.locator('#healthCenter .value')).toHaveText(chosen);
    for (const gone of ['h2', '#buttons', 'button.submitButton', 'select']) {
      await expect(view.page.locator(gone), `${gone} is ENTER/EDIT only`).toHaveCount(0);
    }
  });

  test('EDIT: choosing another location replaces the attribute', async ({ page, api }) => {
    test.skip((await select(page).locator('option').count()) < 3, 'needs two locations tagged Visit Location');
    await select(page).selectOption({ index: 1 });
    await saveAndWait(page);

    await openForm(page, section);
    const second = await optionText(page, 2);
    await select(page).selectOption({ index: 2 });
    await saveAndWait(page);

    expect(await healthCenterAttributes(api, section.patient.uuid)).toEqual([second]);
  });

  test('saving with the placeholder selected adds no attribute', async ({ page, api }) => {
    await saveAndWait(page);
    expect(await healthCenterAttributes(api, section.patient.uuid)).toHaveLength(0);
    expect(await encounterObsCount(api, section.encounter.uuid)).toBe(0);
  });
});
