import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect, type SectionEncounter } from '../../core';
import { SectionFormPage, buttonsSubmit, expectViewShowsSavedObs, openEditWithButtonsSubmit } from '../../pages';

// patientRegistration-insurance.xml: the patient's insurance (company dropdown, company name as text, policy number),
// one obs group "Insurance CONSTRUCT". It is not a wizard fragment: the registration summary page shows it as the
// "most recent encounter" widget (editable) and opens it for editing, so the specs create an empty Patient
// Registration encounter over REST (createSectionEncounter) and open the edit URL directly (skips that gating).
//
// Conditions in the form, from documentation inventory (patientRegistration-insurance.inv.md):
//   ifMode VIEW include=false  :3, :22, :33, :86   script, h2, edit widgets, Save/Cancel (ENTER/EDIT only)
//   ifMode VIEW include=true   :61                 read-only copies of the three obs (VIEW only: cannot be opened here)
//   The two ifMode branches reuse ids (insuranceName, insuranceNumber) but never render together: no duplicate ids.
// Scripts (:6-19): removes the generated title span and hides every `.required` "*". Despite the inventory's
//   "show/hide?" label it does not toggle anything: #alternativeInsuranceCo (the free-text company name) is visible
//   whatever the dropdown holds.
// Side effects on save: none. No required field. Answers are selected by label (the English labels).
// VIEW (getAsHtml.action with this form, see expectViewShowsSavedObs): the three obs each under its own VIEW id (:65, :71, :77;
//   the free text is #otherInsuranceName there, not #otherInsurance), the unfilled one is not shown as a value, and the h2 and
//   #buttons (ifMode VIEW include=false) are absent.
// Not covered here: the summary-page widget, Cancel.
//
// Findings:
//   V1 Info :43-48    the free-text "other company" field (#alternativeInsuranceCo) is not tied to the "Other" answer:
//                     it is always shown and saves with any answer (id and label suggest a conditional field).

const FORM = 'patientRegistration-insurance.xml';
const PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID = '873f968a-73a8-4f9c-ac78-9f4778b751b6';

// The form has its own Save button (`#buttons button.submitButton`), not the standard `#submit`.
const openForm = (page: Page, section: SectionEncounter) => openEditWithButtonsSubmit(page, FORM, section);
const saveAndWait = async (page: Page) => {
  await buttonsSubmit(page).click();
  await new SectionFormPage(page, FORM).expectSaved();
  await page.waitForLoadState('load');
};

const company = (page: Page) => page.locator('#insuranceName select');
const otherCompany = (page: Page) => page.locator('#otherInsurance input');
const policy = (page: Page) => page.locator('#insuranceNumber input');

// Local helper: the insurance groups of the (synthetic) encounter as {concept name: value}.
const insuranceGroups = async (api: APIRequestContext, encounterUuid: string) => {
  const res = await api.get(
    `encounter/${encounterUuid}?v=custom:(obs:(groupMembers:(concept:(display),value:(display))))`,
  );
  expect(res.ok()).toBeTruthy();
  const obs = (await res.json()).obs as Array<{
    groupMembers: Array<{ concept: { display: string }; value: string | { display: string } }> | null;
  }>;
  return obs.map((o) => {
    const m: Record<string, string> = {};
    for (const g of o.groupMembers ?? []) {
      m[g.concept.display] = typeof g.value === 'string' ? g.value : g.value.display;
    }
    return m;
  });
};
const COMPANY = 'Haiti insurance company name';
const COMPANY_TEXT = 'Insurance company name (text)';
const POLICY = 'Insurance policy number';

test.describe('patientRegistration-insurance', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoInsurance', familyName: 'Tester', gender: 'M' },
    });
    await openForm(page, section);
  });

  test('renders the heading, a company dropdown (blank + 12 answers), the other-company text and the policy number', async ({
    page,
  }) => {
    // when :3, :22, :33, :86 (ENTER/EDIT)
    await expect(page.locator('h2')).toHaveCount(1);
    await expect(company(page)).toHaveValue('');
    await expect(company(page).locator('option')).toHaveCount(13);
    await expect(otherCompany(page)).toBeVisible(); // V1: shown with no answer selected
    await expect(policy(page)).toBeVisible();
    await expect(page.locator('#buttons button.cancel')).toBeVisible();
    // script :11-16
    await expect(page.locator('#insurance span.title')).toHaveCount(0);
  });

  test('the other-company field stays visible for every answer (V1: no toggle)', async ({ page }) => {
    for (const label of ['None', 'Other', 'Unknown']) {
      await company(page).selectOption({ label });
      await expect(otherCompany(page)).toBeVisible();
    }
  });

  test('saves the company and policy number as one group; the other-company text stays unset', async ({ page, api }) => {
    await company(page).selectOption({ label: 'AIC' });
    await policy(page).fill('POL-0001');
    await saveAndWait(page);

    expect(await insuranceGroups(api, section.encounter.uuid)).toEqual([{ [COMPANY]: 'AIC', [POLICY]: 'POL-0001' }]);

    // when :3 (EDIT): the widgets are filled from the saved group
    await openForm(page, section);
    await expect(company(page).locator('option:checked')).toHaveText('AIC');
    await expect(policy(page)).toHaveValue('POL-0001');
    await expect(otherCompany(page)).toHaveValue('');

    // VIEW: company and policy number are shown, the other-company text (not filled) is not; ENTER/EDIT-only parts are absent
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid);
    await expect(view.page.locator('#insuranceName .value')).toHaveText('AIC');
    await expect(view.page.locator('#insuranceNumber .value')).toHaveText('POL-0001');
    await expect(view.page.locator('#otherInsuranceName .value')).toHaveCount(0);
    for (const gone of ['h2', '#buttons', 'button.submitButton', 'select']) {
      await expect(view.page.locator(gone), `${gone} is ENTER/EDIT only`).toHaveCount(0);
    }
  });

  test('"Other" with a company name saves all three obs, and EDIT replaces the group', async ({ page, api }) => {
    await company(page).selectOption({ label: 'Other' });
    await otherCompany(page).fill('Some Local Insurer');
    await policy(page).fill('POL-0002');
    await saveAndWait(page);
    expect(await insuranceGroups(api, section.encounter.uuid)).toEqual([
      { [COMPANY]: 'Other', [COMPANY_TEXT]: 'Some Local Insurer', [POLICY]: 'POL-0002' },
    ]);
    // VIEW: the free-text company name is shown under its own id
    const firstView = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid);
    await expect(firstView.page.locator('#insuranceName .value')).toHaveText('Other');
    await expect(firstView.page.locator('#otherInsuranceName .value')).toHaveText('Some Local Insurer');

    await openForm(page, section);
    await expect(otherCompany(page)).toHaveValue('Some Local Insurer');
    await company(page).selectOption({ label: 'None' });
    await otherCompany(page).fill('');
    await saveAndWait(page);
    expect(await insuranceGroups(api, section.encounter.uuid)).toEqual([{ [COMPANY]: 'None', [POLICY]: 'POL-0002' }]);

    // VIEW of the second save: the new company, and nothing of the dropped free text
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid);
    await expect(view.page.locator('#insuranceName .value')).toHaveText('None');
    await expect(view.page.locator('#insuranceNumber .value')).toHaveText('POL-0002');
    await expect(view.page.locator('#otherInsuranceName .value')).toHaveCount(0);
  });

  test('saving the blank form records no obs', async ({ page, api }) => {
    await saveAndWait(page);
    expect(await insuranceGroups(api, section.encounter.uuid)).toEqual([]);
  });
});
