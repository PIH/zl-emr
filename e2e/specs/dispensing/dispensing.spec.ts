import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect, type CustomTestFixtures, type EntryContext } from '../../core';
import { DISPENSING_ENCOUNTER_TYPE_UUID, SESSION_LOCATION_UUID } from '../../core/constants';
import { getEncounterHeader, getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, SectionFormPage, ViewFormPage, VISIT_PAGE_URL, viewMismatches } from '../../pages';

// dispensing.xml (pihemr, v1.0): "Dispensing": type and location of the prescription (required), the optional prescriber and up to 8 medication blocks
// (drug, dose, unit, frequency, duration, amount, instructions). Not hiv/hiv-dispensing.xml (own spec `hiv-dispensing`: another form and encounter type).
// Runs on hiv-ci only (E2E_TARGET=hiv-ci): `dispensingForm` is listed by the haiti-hiv profile alone (_availability.e2e.md). The specs open
// enterHtmlFormWithStandardUi inside a visit they create (EntryFormPage); the visit action's gating (Task: mirebalais.dispensing, Dispensing Location
// tag) and the dispensing home app are not exercised. The harness user is the `admin` superuser, for whom $user.hasRole(...) is always true, so the
// sysAdmin block renders (provider, location and date in #who-where-when-view); the pharmacist variant of that block is not covered.
//
// Conditions in the form, from the XML:
//   includeIf sysAdmin / pharmacist roles and not sysAdmin   editable provider (roles 8fd1552e, 7ec19cca), location (tag Dispensing Location), date /
//     hidden provider + (ENTER) a read-only name + the location select + (not VIEW) the date
//   ifMode VIEW include=false   the heading and the Save / Cancel buttons
// Script: a beforeValidation hook (the only validation; Save is not disabled): per fieldset.medication, when any input/select has a value every field
//   except the instructions (and the duration + duration unit when the frequency label is "STAT") must be filled, else the block's p.field-error shows
//   the "missing required fields" message and the save is blocked; when no block has a value the first block shows "All fields are required!". The type of
//   prescription and its location are server-side required. Side effects on save: none (no order, no program): one Dispensing encounter with one
//   medication construct per filled block (showIfEmpty=false). The drug is a remote autocomplete saved as valueDrug.
// The provider select lists only providers with the role Pharmacist or Pharmacy Aide (providerRoles 8fd1552e, 7ec19cca) and the provider is required,
//   so a harness user without such a provider cannot save (the select is empty on a server without one: the local hiv-ci server had none). The
//   describe creates a synthetic provider "AutoDispenser Tester" with the Pharmacist role over REST (`providerrole` / `provider`) and retires it and
//   voids its person afterwards; the tests pick it by name.
// Visit-page display: the visit page shows the form's VIEW of the saved encounter (encounterTypeConfig.js, 8ff50dea).
// Findings: see pihemr _findings.e2e.md#dispensing (V1 Medium: the validation script also runs in VIEW and throws "htmlForm is not defined", TESTED below with
//   test.fixme; V2 Low ids with spaces; V3 Low `.length = 0`; V4 Low an English literal; V5 Info the provider list is empty for a user without a pharmacy provider)
// Not covered here: the pharmacist-role variant, blocks 3-8 (same markup as 1-2), the dispensing home app and visit action.

const FORM = 'dispensing.xml';
const PHARMACIST_PROVIDER_ROLE_UUID = '8fd1552e-6cb9-4719-b198-23a2c512a073'; // one of the two providerRoles of the form's provider select
const DISPENSER_NAME = 'AutoDispenser';
const DRUG = { search: 'Paracetamol', pick: '500mg tablet', name: 'Paracetamol, 500mg tablet' };
const DRUG_2 = { search: 'Paracetamol', pick: '100mg tablet', name: 'Paracetamol, 100mg tablet' };
const newPatient = (createEntryContext: CustomTestFixtures['createEntryContext']) =>
  createEntryContext({ givenName: 'AutoDispense', familyName: 'Tester', gender: 'F' });

const whoWhereWhen = (page: Page) => page.locator('#who-where-when-view');
const medication = (page: Page, n: number) => page.locator('fieldset.medication').nth(n - 1);
const medError = (page: Page, n: number) => medication(page, n).locator('p.field-error');
const SAVE = '#buttons button.submitButton';

const fillPrescription = async (page: Page) => {
  await page.locator('[id="Timing of hospital prescription"] select').selectOption({ index: 1 });
  await page.locator('[id="Discharge location"] select').selectOption({ index: 1 });
};
const pickDrug = async (page: Page, n: number, drug: { search: string; pick: string }) => {
  const input = page.locator(`#name${n} input.ui-autocomplete-input`);
  await input.click();
  await input.pressSequentially(drug.search, { delay: 40 });
  await page.locator('ul.ui-autocomplete:visible li', { hasText: drug.pick }).first().click();
  await expect(page.locator(`#name${n} input[type="hidden"]`)).toHaveValue(/^Drug:\d+$/);
};
const fillMedication = async (
  page: Page,
  n: number,
  o: { drug?: { search: string; pick: string }; frequency?: string; duration?: boolean; instructions?: string } = {},
) => {
  await pickDrug(page, n, o.drug ?? DRUG);
  await page.locator(`#dose${n} input`).fill('2');
  await page.locator(`#doseUnit${n} select`).selectOption({ index: 1 }); // the first unit (mg); the labels are message codes of the module
  await page.locator(`#frequencyCoded${n} select`).selectOption({ label: o.frequency ?? 'BID' });
  if (o.duration !== false) {
    await page.locator(`#duration${n} input`).fill('5');
    await page.locator(`#durationUnit${n} select`).selectOption({ index: 1 });
  }
  await page.locator(`#amount${n} input`).fill('20');
  if (o.instructions) {
    await page.locator(`#instructions${n} input`).fill(o.instructions);
  }
};
const openForm = async (page: Page, context: EntryContext) => {
  const form = await EntryFormPage.open(page, FORM, context);
  await expect(page.locator('#typePrescription')).toBeVisible();
  const provider = whoWhereWhen(page).locator('select').first(); // the dispenser (sysAdmin block); the other select is the location
  await provider.selectOption({ label: await provider.locator('option', { hasText: DISPENSER_NAME }).first().innerText() });
  return form;
};
const savedEncounter = async (api: APIRequestContext, patientUuid: string) => {
  const encounters = await getPatientEncounters(api, patientUuid);
  expect(encounters.map((e) => e.encounterType.uuid)).toEqual([DISPENSING_ENCOUNTER_TYPE_UUID]);
  return { encounterUuid: encounters[0].uuid, obs: await getEncounterObs(api, encounters[0].uuid) };
};
// Two medication blocks; returns what the EDIT and VIEW tests need.
const saveFull = async (page: Page, api: APIRequestContext, createEntryContext: CustomTestFixtures['createEntryContext']) => {
  const context = await newPatient(createEntryContext);
  const form = await openForm(page, context);
  await fillPrescription(page);
  await fillMedication(page, 1, { instructions: 'after meals' });
  await fillMedication(page, 2, { drug: DRUG_2, frequency: 'OD' });
  await page.locator(SAVE).click();
  await form.expectSaved();
  return { context, ...(await savedEncounter(api, context.patient.uuid)) };
};

test.describe('dispensing @hiv-ci', () => {
  let provider: { uuid: string; personUuid: string };

  test.beforeAll(async ({ api }) => {
    const person = await api.post('person', { data: { names: [{ givenName: DISPENSER_NAME, familyName: 'Tester' }], gender: 'F' } });
    expect(person.ok(), `create dispenser person: ${person.status()}`).toBeTruthy();
    const personUuid = (await person.json()).uuid as string;
    const created = await api.post('provider', {
      data: { person: personUuid, identifier: `AUTODISP${Date.now()}`, providerRole: PHARMACIST_PROVIDER_ROLE_UUID },
    });
    expect(created.ok(), `create dispenser provider: ${created.status()}`).toBeTruthy();
    provider = { uuid: (await created.json()).uuid as string, personUuid };
  });

  test.afterAll(async ({ api }) => {
    const retired = await api.delete(`provider/${provider.uuid}`);
    const voided = await api.delete(`person/${provider.personUuid}`);
    expect(retired.ok(), `retire dispenser provider: ${retired.status()}`).toBeTruthy();
    expect(voided.ok(), `void dispenser person: ${voided.status()}`).toBeTruthy();
  });

  test('ENTER shows the provider, location and date block, the prescription type and location and eight empty medication blocks', async ({ page, createEntryContext }) => {
    await openForm(page, await newPatient(createEntryContext));
    await expect(whoWhereWhen(page).locator('select')).not.toHaveCount(0);
    await expect(page.locator('fieldset.medication')).toHaveCount(8);
    await expect(page.locator(SAVE)).toBeVisible();
  });

  test('Save with nothing entered shows "All fields are required!" on the first medication and saves nothing', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext);
    await openForm(page, context);
    await page.locator(SAVE).click();
    await expect(medError(page, 1)).toHaveText('All fields are required!');
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('a medication block with only some fields filled shows the missing-fields error and blocks the save', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext);
    await openForm(page, context);
    await fillPrescription(page);
    await page.locator('#dose1 input').fill('2');
    await page.locator(SAVE).click();
    await expect(medError(page, 1)).toHaveText(/\S/);
    await expect(medError(page, 1)).not.toHaveText('All fields are required!');
    await expect(medError(page, 2)).toHaveText('');
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('a complete medication without the type of prescription is refused as Required', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext);
    await openForm(page, context);
    await page.locator('[id="Discharge location"] select').selectOption({ index: 1 });
    await fillMedication(page, 1);
    await page.locator(SAVE).click();
    await expect(page.locator('span.field-error', { hasText: /required/i }).first()).toBeVisible();
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  // The duration and its unit are optional only when the frequency label is "STAT".
  test('STAT makes the duration optional; any other frequency requires it', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext);
    const form = await openForm(page, context);
    await fillPrescription(page);
    await fillMedication(page, 1, { duration: false, frequency: 'BID' });
    await page.locator(SAVE).click();
    await expect(medError(page, 1)).toHaveText(/\S/);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);

    await page.locator('#frequencyCoded1 select').selectOption({ label: 'STAT' });
    await page.locator(SAVE).click();
    await form.expectSaved();
    const { obs } = await savedEncounter(api, context.patient.uuid);
    const displays = obs.map((o) => o.display);
    expect(displays.some((d) => /^Medication frequency: STAT/i.test(d))).toBe(true);
    expect(displays.some((d) => /^Medication duration/i.test(d))).toBe(false);
  });

  test('saves two medications as one Dispensing encounter at the session location, with the dispenser role', async ({ page, api, createEntryContext }) => {
    const { encounterUuid, obs } = await saveFull(page, api, createEntryContext);
    const displays = obs.map((o) => o.display);

    expect(obs.filter((o) => o.concept.display === 'Dispensing construct')).toHaveLength(2); // showIfEmpty=false: blocks 3-8 are not saved
    expect(displays.filter((d) => /^Medication\(s\) name:/i.test(d))).toEqual(
      expect.arrayContaining([expect.stringContaining(DRUG.name), expect.stringContaining(DRUG_2.name)]),
    );
    expect(displays.filter((d) => /^Quantity of medication prescribed per dose.*\b2\b/i.test(d))).toHaveLength(2);
    expect(displays.some((d) => /^Medication frequency: BID/i.test(d))).toBe(true);
    expect(displays.some((d) => /^Medication frequency: OD/i.test(d))).toBe(true);
    expect(displays.filter((d) => /^Medication duration.*\b5\b/i.test(d))).toHaveLength(2);
    expect(displays.filter((d) => /^Quantity of medication dispensed.*\b20\b/i.test(d))).toHaveLength(2);
    expect(displays.filter((d) => /^Prescription instructions, non-coded: after meals/i.test(d))).toHaveLength(1);

    const header = await getEncounterHeader(api, encounterUuid);
    expect(header.location.uuid).toBe(SESSION_LOCATION_UUID);
    expect(header.encounterProviders.map((p) => p.encounterRole.uuid)).toContain('bad21515-fd04-4ff6-bfcd-78456d12f168'); // Dispenser
  });

  test('EDIT starts from the saved medications, and a changed instruction replaces the saved one', async ({ page, api, createEntryContext }) => {
    const { context, encounterUuid } = await saveFull(page, api, createEntryContext);

    await page.goto(SectionFormPage.editUrl(FORM, { patient: context.patient, encounter: { uuid: encounterUuid, visitUuid: context.visitUuid } }));
    await expect(page.locator('#typePrescription')).toBeVisible();
    await expect(page.locator('#name1 input.ui-autocomplete-input')).toHaveValue(DRUG.name);
    await expect(page.locator('#dose1 input')).toHaveValue('2');
    await expect(page.locator('#frequencyCoded1 select option:checked')).toHaveText('BID');
    await expect(page.locator('#instructions1 input')).toHaveValue('after meals');

    await page.locator('#instructions1 input').fill('before meals');
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    await expect
      .poll(async () => (await getEncounterObs(api, encounterUuid)).map((o) => o.display))
      .toEqual(expect.arrayContaining([expect.stringMatching(/^Prescription instructions, non-coded: before meals/i)]));
    const after = (await getEncounterObs(api, encounterUuid)).map((o) => o.display);
    expect(after.some((d) => /after meals/.test(d))).toBe(false);
  });

  // VIEW on the visit page (`viewEncounterWithHtmlFormLong`): the saved values under their ids. The medication names are answerDrugs obs, printed in a plain
  // span (not span.value): asserted by id and left out of the generic check. The frequency is shown under the form's own label (answerCodes), not the concept name.
  const openView = async (page: Page, api: APIRequestContext, createEntryContext: CustomTestFixtures['createEntryContext'], consoleErrors?: string[]) => {
    const { encounterUuid, obs } = await saveFull(page, api, createEntryContext);
    const labels: Record<string, string> = {};
    for (const o of obs) {
      if (/^Medication\(s\) name:/.test(o.display)) {
        labels[o.display] = '';
      }
      if (/^Medication frequency: (BID|OD)/.test(o.display)) {
        labels[o.display] = o.display.includes('BID') ? 'BID' : 'OD';
      }
    }
    if (consoleErrors) {
      page.on('console', (m) => {
        if (m.type() === 'error') {
          consoleErrors.push(m.text().split('\n')[0]);
        }
      });
    }
    const view = await ViewFormPage.open(page, FORM, encounterUuid);
    expect(await viewMismatches(api, view, encounterUuid, labels)).toEqual([]);
    return view;
  };

  test('VIEW (visit page): a saved encounter shows its two medication blocks', async ({ page, api, createEntryContext }) => {
    const view = await openView(page, api, createEntryContext);
    await expect(view.root.locator('fieldset.medication')).toHaveCount(2); // showIfEmpty=false hides blocks 3-8
    await expect(view.root.locator('#name1')).toHaveText(DRUG.name);
    await expect(view.root.locator('#name2')).toHaveText(DRUG_2.name);
    await expect(view.root.locator('h2, #buttons, button.submitButton')).toHaveCount(0); // ifMode VIEW include=false
  });

  // V1: remove test.fixme() when the script is wrapped in <ifMode mode="VIEW" include="false">. Confirmed on hiv-ci (the test failed with the error below): the
  // script is outside any ifMode, so it also runs in VIEW (visit page), where htmlForm is undefined: Angular's exception handler logs
  // "ReferenceError: htmlForm is not defined" (a console error, not an uncaught page error, so the failOnJsError fixture does not see it).
  test.fixme('V1 VIEW: a saved dispensing encounter renders without a script error', async ({ page, api, createEntryContext }) => {
    const consoleErrors: string[] = [];
    await openView(page, api, createEntryContext, consoleErrors);
    expect(consoleErrors.filter((e) => /htmlForm is not defined/.test(e))).toEqual([]);
  });
});
