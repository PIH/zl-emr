import { type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test, expect, type SectionEncounter } from '../../core';
import { RegistrationSummaryPage, SectionFormPage, VisitPage, buttonsSubmit, openEditWithButtonsSubmit } from '../../pages';

// patientRegistration-social.xml: social details of the patient: place of birth (address hierarchy, one obs group
// "Birthplace address construct"), civil status, occupation ("Main activity") and religion (three coded dropdowns).
// It is not a wizard fragment: the registration summary page shows it as the "most recent encounter" widget
// (editable) and opens it for editing, so the specs create an empty Patient Registration encounter over REST
// (createSectionEncounter) and open the edit URL directly (skips that gating). Needs the Haiti address hierarchy.
//
// Conditions in the form, from documentation inventory (patientRegistration-social.inv.md):
//   ifMode VIEW include=false  :3, :32, :43, :98, :158   script, h2, edit widgets, Save/Cancel (ENTER/EDIT only)
//   ifMode VIEW include=true   :80, :132                 read-only copies of the same obs (VIEW only: checked on the registration summary page, see below)
//   The ifMode pairs reuse ids (placeOfBirth-*, civilStatus, occupation, religion) but never render together: no duplicate ids.
// Required (HFE): country, department, commune, section communale of the birthplace. Address1/address2 and the three
//   dropdowns are optional. Dropdown answers are selected by label (the English labels).
// Scripts (:6-29): registrationapp PersonAddressWithHierarchy on #placeOfBirth-container (levels are autocompletes over the
//   address hierarchy, free text is cleared on blur; the quick-search input, shortcutFor address1, picks a locality and fills
//   the levels above it; address2 is free text), removal of the generated title span (:21-23), `.required` "*" hidden (:26).
// Side effects on save: none. Encounter type Patient Registration.
// Visit-page display: the Patient Registration entry of encounterTypeConfig.js (:743) has no templateModelUrl, so the visit page shows no
//   VIEW of this form; `showOnVisitList: false` only keeps the type out of the visit list's type summary, the encounter itself is
//   shown with defaultEncounterLong: one `p.aligned` row per obs (civil status, main activity,
//   religion) and one for the birthplace group (label, the group's values). The test asserts those rows.
// Registration summary page: the "SOCIAL" widget (coreapps-mostRecentRegistrationSocial, every site) renders this form in VIEW (getAsHtml):
//   the birthplace levels, address2 and the three coded answers each in span.value under their VIEW ids (#placeOfBirth-*, #civilStatus,
//   #occupation, #religion; :80-93, :132-152), an unfilled one as span.emptyValue, no h2, quick-search input or #buttons (ifMode VIEW
//   include=false), and an edit pencil to this form. The tests read it through RegistrationSummaryPage.
// Not covered here: Cancel, the
//   85 occupation answers one by one (only the count and a sample), hierarchy contents (server data).
//
// Findings:
//   V1 Info :43-78 vs :98-130  the birthplace is required (:53-65) while civil status, occupation and religion are not: a
//                     patient's civil status/occupation/religion cannot be saved without a complete birthplace.
//   V2 Info (registrationapp, unverified) changing a higher level of the address leaves the lower levels' old values
//                     in the fields; nothing re-validates them against the new parent.

const FORM = 'patientRegistration-social.xml';
const PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID = '873f968a-73a8-4f9c-ac78-9f4778b751b6';
const LEVELS = ['country', 'stateProvince', 'cityVillage', 'address3'] as const;

// The form has its own Save button (`#buttons button.submitButton`), not the standard `#submit`.
const openForm = (page: Page, section: SectionEncounter) => openEditWithButtonsSubmit(page, FORM, section);
const save = async (page: Page) => {
  await buttonsSubmit(page).click();
};
const saveAndWait = async (page: Page) => {
  await save(page);
  await new SectionFormPage(page, FORM).expectSaved();
  await page.waitForLoadState('load');
};

const level = (page: Page, name: string) => page.locator(`#placeOfBirth-${name} input`);
const civilStatus = (page: Page) => page.locator('#civilStatus select');
const occupation = (page: Page) => page.locator('#occupation select');
const religion = (page: Page) => page.locator('#religion select');

// Picks the first non-blank suggestion of an address-hierarchy autocomplete (clicking the empty field lists all).
const pickFirstSuggestion = async (page: Page, field: Locator, typed = '') => {
  await field.click();
  if (typed) {
    await field.pressSequentially(typed, { delay: 40 });
  }
  const first = page.locator('ul.ui-autocomplete li:visible').filter({ hasText: /\S/ }).first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(field).not.toHaveValue('');
};
const fillBirthplace = async (page: Page) => {
  for (const name of LEVELS) {
    await pickFirstSuggestion(page, level(page, name));
  }
};

// Local helper: the encounter's obs as the coded top-level answers {concept name: answer} and the birthplace group
// {concept name: value} (all on the synthetic encounter).
const savedObs = async (api: APIRequestContext, encounterUuid: string) => {
  const res = await api.get(
    `encounter/${encounterUuid}?v=custom:(obs:(concept:(display),value:(display),groupMembers:(concept:(display),value:(display))))`,
  );
  expect(res.ok()).toBeTruthy();
  const obs = (await res.json()).obs as Array<{
    concept: { display: string };
    value: { display: string } | string | null;
    groupMembers: Array<{ concept: { display: string }; value: { display: string } | string }> | null;
  }>;
  const text = (v: { display: string } | string) => (typeof v === 'string' ? v : v.display);
  const answers: Record<string, string> = {};
  const groups: Array<Record<string, string>> = [];
  for (const o of obs) {
    if (o.groupMembers && o.groupMembers.length > 0) {
      const g: Record<string, string> = {};
      for (const m of o.groupMembers) {
        g[m.concept.display] = text(m.value);
      }
      groups.push(g);
    } else if (o.value !== null) {
      answers[o.concept.display] = text(o.value);
    }
  }
  return { answers, groups };
};

test.describe('patientRegistration-social', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoSocial', familyName: 'Tester', gender: 'F' },
    });
    await openForm(page, section);
  });

  test('renders the heading, the six address inputs and the three dropdowns, with the title span removed', async ({
    page,
  }) => {
    // when :3, :32, :43, :98, :158 (ENTER/EDIT)
    await expect(page.locator('h2')).toHaveCount(1);
    await expect(page.locator('input.address-hierarchy-shortcut')).toBeVisible();
    for (const name of [...LEVELS, 'address1', 'address2']) {
      await expect(level(page, name)).toBeVisible();
    }
    // blank + answers: 6 civil statuses, 85 occupations, 8 religions
    await expect(civilStatus(page).locator('option')).toHaveCount(7);
    await expect(occupation(page).locator('option')).toHaveCount(86);
    await expect(religion(page).locator('option')).toHaveCount(9);
    for (const dropdown of [civilStatus, occupation, religion]) {
      await expect(dropdown(page)).toHaveValue('');
    }
    await expect(page.locator('#buttons button.cancel')).toBeVisible();
    // script :21-26
    await expect(page.locator('#social span.title')).toHaveCount(0);
    await expect(page.locator('#social span.required:visible')).toHaveCount(0);
  });

  test('Save with the birthplace blank reports Required on the four required levels only (V1: even with dropdowns filled)', async ({
    page,
  }) => {
    await civilStatus(page).selectOption({ label: 'Married' });
    await save(page);
    for (const name of LEVELS) {
      await expect(page.locator(`#placeOfBirth-${name} span.field-error`)).toHaveText('Required');
    }
    await expect(page.locator('span.field-error:visible')).toHaveCount(4);
  });

  test.describe('address hierarchy (script :8-18)', () => {
    test('each level lists hierarchy entries and keeps the chosen one; address2 is free text', async ({ page }) => {
      await fillBirthplace(page);
      const address2 = level(page, 'address2');
      await address2.fill('Behind the church');
      await address2.blur();
      await expect(address2).toHaveValue('Behind the church');
    });

    test('free text that is not a hierarchy entry is cleared on blur', async ({ page }) => {
      await pickFirstSuggestion(page, level(page, 'country'));
      const state = level(page, 'stateProvince');
      await state.fill('Zzzzqq');
      await state.blur();
      await expect(state).toHaveValue('');
    });

    test('the quick-search input picks a locality and fills the levels above it', async ({ page }) => {
      await pickFirstSuggestion(page, page.locator('input.address-hierarchy-shortcut'), 'Sav');
      for (const name of [...LEVELS, 'address1']) {
        await expect(level(page, name)).not.toHaveValue('');
      }
    });
  });

  test('saves the birthplace group and the three coded answers, and EDIT starts from them', async ({ page, api }) => {
    await fillBirthplace(page);
    const chosen = await Promise.all(LEVELS.map((l) => level(page, l).inputValue()));
    await level(page, 'address2').fill('Behind the church');
    await civilStatus(page).selectOption({ label: 'Married' });
    await occupation(page).selectOption({ label: 'Teacher' });
    await religion(page).selectOption({ label: 'Catholic' });
    await saveAndWait(page);

    const { answers, groups } = await savedObs(api, section.encounter.uuid);
    expect(answers).toEqual({ 'Civil status': 'Married', 'Main activity': 'Teacher', Religion: 'Catholic' });
    expect(groups).toHaveLength(1);
    const values = Object.values(groups[0]);
    for (const expected of [...chosen, 'Behind the church']) {
      expect(values, `birthplace contains "${expected}"`).toContain(expected);
    }
    expect(values).toHaveLength(5); // address1 left blank

    // when :3 (EDIT): the widgets are filled from the saved obs
    await openForm(page, section);
    for (let i = 0; i < LEVELS.length; i++) {
      await expect(level(page, LEVELS[i])).toHaveValue(chosen[i]);
    }
    await expect(level(page, 'address2')).toHaveValue('Behind the church');
    await expect(civilStatus(page).locator('option:checked')).toHaveText('Married');
    await expect(occupation(page).locator('option:checked')).toHaveText('Teacher');
    await expect(religion(page).locator('option:checked')).toHaveText('Catholic');

    // Visit page: the encounter's default long template lists each obs as a row, the birthplace group as one row with its values
    const visit = await VisitPage.open(page, section.encounter.visitUuid);
    const long = await visit.expand(visit.encounterOfType(PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID));
    const row = (label: string) => long.locator('p.aligned').filter({ hasText: label });
    await expect(row('Civil status')).toContainText('Married');
    await expect(row('Main activity')).toContainText('Teacher');
    await expect(row('Religion')).toContainText('Catholic');
        for (const text of [...chosen, 'Behind the church']) {
      await expect(row('Birthplace address construct')).toContainText(text);
    }

    // Registration summary page: the birthplace levels, address2 and the three answers under their ids; address1 (not filled) is not shown;
    // ENTER/EDIT-only parts are absent; the pencil leads to this form's edit page
    const summary = await RegistrationSummaryPage.open(page, section.patient.uuid);
    const shown = (id: string) => summary.value('social', id);
    for (let i = 0; i < LEVELS.length; i++) {
      await expect(shown(`placeOfBirth-${LEVELS[i]}`)).toHaveText(chosen[i]);
    }
    await expect(shown('placeOfBirth-address2')).toHaveText('Behind the church');
    await expect(shown('placeOfBirth-address1')).toHaveCount(0);
    await expect(shown('civilStatus')).toHaveText('Married');
    await expect(shown('occupation')).toHaveText('Teacher');
    await expect(shown('religion')).toHaveText('Catholic');
    for (const gone of ['h2', 'input.address-hierarchy-shortcut', '#buttons', 'button.submitButton', 'select']) {
      await expect(summary.widget('social').locator(gone), `${gone} is ENTER/EDIT only`).toHaveCount(0);
    }
    await summary.expectEditLink('social');
  });

  test('EDIT: changing the answers and re-saving replaces them; the birthplace is kept', async ({ page, api }) => {
    await fillBirthplace(page);
    await civilStatus(page).selectOption({ label: 'Married' });
    await religion(page).selectOption({ label: 'Catholic' });
    await saveAndWait(page);

    await openForm(page, section);
    await civilStatus(page).selectOption({ label: 'Widowed' });
    await religion(page).selectOption({ label: '' });
    await occupation(page).selectOption({ label: 'Retired' });
    await saveAndWait(page);

    const { answers, groups } = await savedObs(api, section.encounter.uuid);
    expect(answers).toEqual({ 'Civil status': 'Widowed', 'Main activity': 'Retired' });
    expect(groups).toHaveLength(1);

    // Registration summary page for the second save: the new answers, the cleared religion not shown, the birthplace kept
    const summary = await RegistrationSummaryPage.open(page, section.patient.uuid);
    await expect(summary.value('social', 'civilStatus')).toHaveText('Widowed');
    await expect(summary.value('social', 'occupation')).toHaveText('Retired');
    await expect(summary.value('social', 'religion')).toHaveCount(0);
    await expect(summary.value('social', 'placeOfBirth-country')).toHaveCount(1);
    // the pencil opens the form again, with the saved answers
    await summary.clickEdit('social');
    await expect(civilStatus(page).locator('option:checked')).toHaveText('Widowed');
  });
});
