import { type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures } from '../../core';
import { SURGICAL_POST_OP_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, ViewFormPage, VISIT_PAGE_URL, expectViewShowsSavedObs, visitPagePath } from '../../pages';
import { expectObs, obsDisplays } from '../../pages/form-widgets';

// surgicalPostOpNote.xml: "Brief post-operative note": five fieldsets (Service / Team, Description, Ins / Outs, Pathology / Complications, Plan).
// Reached with a synthetic adult patient who has an active visit, through enterHtmlFormWithStandardUi (EntryFormPage); who offers it: the
// SURGICAL_NOTE_VISIT_ACTION visit action (_availability.e2e.md: `surgery`, Surgery Note Location, `Task: emr.enterSurgicalNote`); availability is
// not exercised. Runs on zl-ci. The form uses the HFE <submit> tag: there is no #submit, the button is `#buttons input.submitButton`. The location
// select starts EMPTY (the session location does not carry the Surgery Note Location tag; Sal Operasyon is one of its options) and is required, as
// is the attending surgeon.
//
// Conditions in the form, from documentation inventory (surgicalPostOpNote.inv.md):
//   ifMode VIEW include=false :262-268, :672-679   the <h2> "Surgical note" and the Save / Cancel buttons (ENTER and EDIT only; asserted absent in VIEW)
//   no toggle/when/includeIf: every field is always shown. The "If yes, specify ..." fields have no show/hide rule.
// Scripts :245-259: every textarea inside #post-op-surgical-note (the <htmlform id>) grows with its content on keyup (and once on load).
// Side effects on save: none (no program, order or disposition). Providers are encounter providers by role: attending surgeon (9b135b19, required),
//   assistant surgeons x2 (6e630e03), anesthesiologists x2 (de11b25c), nurses x2 (98bf2792).
// Providers: the four provider widgets are autocompletes limited to provider roles (surgeon, anesthetist, nurse ...). The test user's provider has none
//   of those roles, so the autocomplete offers nothing for its name. The widget keeps the provider ID in a hidden field (`<id>_hid`) and the server
//   resolves that field, so the specs set it directly (to the provider the harness user already is, read from the Drug Order form's default).
//   The autocomplete itself (type, pick from the list) is therefore not exercised.
// Visit-page display: the visit page shows this form's VIEW (encounterTypeConfig.js, c4941dee: templateModelUrl without definitionUiResource, so
//   it renders the form the encounter was saved with; longTemplate viewEncounterWithHtmlFormLong.page): ViewFormPage / expectViewShowsSavedObs.
// Not covered here: the provider autocompletes (see above), the second assistant / anesthesiologist / nurse and the 3rd to 5th procedure rows
//   (same widget as the first), the hidden print datestamps (`.print-form-datestamps`, display:none; printing is not driven).
//
// Findings: see pihemr _findings.e2e.md#surgicalPostOpNote

const FORM = 'surgicalPostOpNote.xml';
const SAVE = '#buttons input.submitButton';

const newPatient = (createEntryContext: CustomTestFixtures['createEntryContext']) =>
  createEntryContext({ givenName: 'AutoSurgery', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(40) });

// The id (the value of the option) of the provider the harness user is: the Drug Order form preselects it in its provider select. Read once.
let providerId: string | undefined;
const ownProviderId = async (page: Page, context: Awaited<ReturnType<typeof newPatient>>): Promise<string> => {
  if (!providerId) {
    await EntryFormPage.open(page, 'drugOrder.xml', context);
    providerId = await page.locator('#who select').inputValue();
    expect(providerId, 'the harness user has a provider account').toMatch(/^\d+$/);
  }
  return providerId;
};
// provider widgets in DOM order: 0 attending, 1-2 assistants, 3-4 anesthesiologists, 5-6 nurses
const setProvider = async (page: Page, index: number, id: string) => {
  await page.locator('#service-team input.autoCompleteHidden').nth(index).evaluate((el, value) => {
    (el as HTMLInputElement).value = value;
  }, id);
};

// The <p> that holds the label with this exact text.
const row = (scope: Page | Locator, label: string): Locator => scope.locator('p', { has: scope.locator(`label:text-is("${label}")`) }).last();
const yesNo = (scope: Page | Locator, label: string, answer: 'yes' | 'no') => row(scope, label).locator('input[type=radio]').nth(answer === 'yes' ? 0 : 1);
// HFE radios keep their own click handlers (radioDown / radioClicked toggle a ticked radio off), so click once and verify.
const choose = async (radio: Locator) => {
  await radio.click();
  await expect(radio).toBeChecked();
};
const autocomplete = async (page: Page, input: Locator, term: string, pick: string) => {
  await input.pressSequentially(term, { delay: 60 });
  await page.locator('ul.ui-autocomplete:visible li', { hasText: new RegExp(`^\\s*${pick}\\s*$`, 'i') }).first().click(); // the whole label: "Appendicitis" is also a part of "Acute Appendicitis"
};

const open = async (page: Page, createEntryContext: CustomTestFixtures['createEntryContext']) => {
  const context = await newPatient(createEntryContext);
  const provider = await ownProviderId(page, context);
  await EntryFormPage.open(page, FORM, context);
  await expect(page.locator('#service-team')).toBeVisible();
  return { context, provider };
};
const pickLocation = (page: Page) => page.locator('#service-team select').first().selectOption({ label: 'Sal Operasyon' });

const editUrl = (patientUuid: string, encounterUuid: string, visitUuid: string) =>
  `htmlformentryui/htmlform/editHtmlFormWithStandardUi.page?${new URLSearchParams({
    patientId: patientUuid,
    encounterId: encounterUuid,
    definitionUiResource: `file:configuration/pih/htmlforms/${FORM}`,
    returnUrl: visitPagePath(visitUuid),
  })}`;

test.describe('surgicalPostOpNote', () => {
  test('ENTER shows the heading, the c-section pointer, the five fieldsets, and Save / Cancel', async ({ page, createEntryContext }) => {
    // ifMode VIEW include=false :262, :672 (present in ENTER)
    await open(page, createEntryContext);
    await expect(page.locator('h2')).toHaveText('Surgical note');
    await expect(page.getByText('For cesarean section, complete c-section questions on the delivery form.')).toBeVisible();
    for (const id of ['service-team', 'description', 'ins-outs', 'pathology-complications', 'plan']) {
      await expect(page.locator(`fieldset#${id}`), id).toBeVisible();
    }
    await expect(page.locator('#service-team select').first(), 'location starts empty').toHaveValue('');
    await expect(page.locator('#service-team select').first().locator('option', { hasText: 'Sal Operasyon' })).toHaveCount(1);
    await expect(page.locator(SAVE)).toBeVisible();
    await expect(page.locator('#buttons .cancel')).toBeVisible();
    await expect(page.locator('#submit')).toHaveCount(0);
  });

  test('the attending surgeon and the location are required: Save is refused with "Required" and saves nothing', async ({ page, api, createEntryContext }) => {
    const { context, provider } = await open(page, createEntryContext);
    await page.locator(SAVE).click();
    await expect(page.locator('#service-team .field-error:visible')).toHaveCount(2);
    await expect(page.locator('#service-team .field-error:visible').first()).toHaveText(/Required/i);
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await getPatientEncounters(api, context.patient.uuid)).toEqual([]);

    // the attending alone is not enough
    await setProvider(page, 0, provider);
    await page.locator(SAVE).click();
    await expect(page.locator('#service-team .field-error:visible')).toHaveCount(1);
    expect(await getPatientEncounters(api, context.patient.uuid)).toEqual([]);

    // the minimal note: location and attending
    await pickLocation(page);
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    expect(encounter.encounterType.uuid).toBe(SURGICAL_POST_OP_ENCOUNTER_TYPE_UUID);
    expect(await getEncounterObs(api, encounter.uuid)).toEqual([]);
    const providers = await (await api.get(`encounter/${encounter.uuid}?v=custom:(encounterProviders:(encounterRole:(uuid)))`)).json();
    expect(providers.encounterProviders.map((p: { encounterRole: { uuid: string } }) => p.encounterRole.uuid)).toEqual(['9b135b19-7ebe-4a51-aea2-69a53f9383af']);
  });

  test('volumes outside the concept range are flagged and block Save (IVF and blood loss at most 20 L, a transfusion at most 12 units)', async ({ page, api, createEntryContext }) => {
    // HFE number validation from the concept ranges; the same message appears on blur
    const { context, provider } = await open(page, createEntryContext);
    await setProvider(page, 0, provider);
    await pickLocation(page);
    const ins = page.locator('#ins-outs');
    const volumes = ins.locator('input[type=text]');
    const check = async (index: number, message: string) => {
      await volumes.nth(index).fill('500');
      await volumes.nth(index).blur();
      await expect(volumes.nth(index)).toHaveClass(/illegalValue/);
      await expect(volumes.nth(index).locator('xpath=following::span[contains(@class,"field-error")][1]')).toHaveText(message);
    };
    await check(0, 'Cannot be greater than 20'); // IVF volume
    await check(1, 'Cannot be greater than 12'); // whole blood volume
    await check(5, 'Cannot be greater than 20'); // estimated blood loss
    await page.locator(SAVE).click();
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await getPatientEncounters(api, context.patient.uuid)).toEqual([]);
    await volumes.nth(0).fill('2');
    await volumes.nth(1).fill('2');
    await volumes.nth(5).fill('0.5');
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);
  });

  test('a textarea grows with its content (script :245-259)', async ({ page, createEntryContext }) => {
    await open(page, createEntryContext);
    const findings = page.locator('#plan textarea');
    const before = (await findings.boundingBox())!.height;
    await findings.pressSequentially('line one\nline two\nline three\nline four\nline five', { delay: 10 });
    await expect.poll(async () => (await findings.boundingBox())!.height).toBeGreaterThan(before + 20);
  });

  // Saves a note with every field of the form filled (one provider of each role).
  const saveFull = async (page: Page, api: APIRequestContext, createEntryContext: CustomTestFixtures['createEntryContext']) => {
    test.slow();
    const { context, provider } = await open(page, createEntryContext);
    for (let i = 0; i <= 6; i++) {
      if ([0, 1, 3, 5].includes(i)) {
        await setProvider(page, i, provider);
      }
    }
    await pickLocation(page);
    await row(page, 'Surgical service').locator('select').selectOption({ label: 'General surgery department' });
    await row(page, 'other assistants').locator('input').fill('Dr Other Assistant');

    // Description
    await choose(row(page, 'Admission status').getByLabel('Hospitalized'));
    await choose(yesNo(page, 'Emergency/Urgent', 'yes'));
    await choose(yesNo(page, 'Planned return to OR', 'no'));
    await choose(yesNo(page, 'Scheduled/Elective', 'yes'));
    const pre = row(page, 'Pre-operative diagnoses').locator('input.autoCompleteText');
    await autocomplete(page, pre.nth(0), 'appen', 'Acute Appendicitis');
    await autocomplete(page, pre.nth(1), 'hernia', 'Inguinal hernia');
    const procedures = row(page, 'Procedures performed').locator('input.autoCompleteText');
    await autocomplete(page, procedures.nth(0), 'appen', 'Laparoscopic appendectomy');
    await autocomplete(page, procedures.nth(1), 'hernia', 'Repair of inguinal hernia');
    await autocomplete(page, row(page, 'Post-operative Diagnoses').locator('input.autoCompleteText').nth(0), 'appen', 'Appendicitis');
    await row(page, 'Anesthesia type').locator('select').selectOption({ label: 'General anesthesia' });
    await row(page, 'Wound Classification').locator('select').selectOption({ label: 'Clean/Contaminated' });

    // Ins / Outs: selects are IVF, antibiotic, VTE prophylaxis; texts are IVF volume, four transfusion volumes, blood loss, urine output
    const ins = page.locator('#ins-outs');
    await ins.locator('select').nth(0).selectOption({ label: 'Dextrose 5% in water' });
    await ins.locator('input[type=text]').nth(0).fill('2'); // litres, at most 20
    await ins.locator('input[type=text]').nth(0).blur(); // leave the field first: an out-of-range value would show its message on blur and shift the layout under a click
    await choose(yesNo(page, 'Blood transfusion', 'yes'));
    await ins.locator('input[type=checkbox]').nth(0).check(); // whole blood
    await ins.locator('input[type=text]').nth(1).fill('2'); // units, at most 12
    await ins.locator('input[type=checkbox]').nth(2).check(); // plasma
    await ins.locator('input[type=text]').nth(3).fill('1');
    await ins.locator('input[type=text]').nth(5).fill('0.5'); // estimated blood loss, litres, at most 20
    await ins.locator('input[type=text]').nth(6).fill('0.3'); // urine output, litres
    await choose(yesNo(page, 'Pre-operative antibiotics administered', 'yes'));
    await ins.locator('select').nth(1).selectOption({ label: 'Ceftriaxone' });
    await ins.locator('select').nth(2).selectOption({ label: 'Low molecular weight heparin' });

    // Pathology / complications
    await choose(yesNo(page, 'Pathology', 'yes'));
    await row(page, 'If yes, describe pathology sample').locator('input').fill('Appendix to pathology');
    await choose(yesNo(page, 'Lab (ie. culture)', 'no'));
    await choose(yesNo(page, 'Implant', 'no'));
    await row(page, 'Complications').locator('select').selectOption({ label: 'None' });
    await page.locator('#plan textarea').fill('Uncomplicated laparoscopic appendectomy');
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);

    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    expect(encounter.encounterType.uuid).toBe(SURGICAL_POST_OP_ENCOUNTER_TYPE_UUID);
    return { context, provider, encounter };
  };

  test('saves every section; providers are saved by role; obs and groups are stored as entered', async ({ page, api, createEntryContext }) => {
    const { encounter } = await saveFull(page, api, createEntryContext);
    const displays = await obsDisplays(api, encounter.uuid);
    expectObs(
      displays,
      'General surgery department',
      'Dr Other Assistant',
      'Hospitalized', // type of patient
      'Acute Appendicitis',
      'Inguinal hernia',
      'Laparoscopic appendectomy',
      'Repair of inguinal hernia',
      'General anesthesia',
      'Clean/Contaminated',
      'Dextrose 5% in water',
      'Whole blood',
      'Plasma',
      'Ceftriaxone',
      'Low molecular weight heparin',
      'Appendix to pathology',
      'Uncomplicated laparoscopic appendectomy',
    );
    // several obs share one concept (3 pre-op diagnoses, 5 procedures, 3 post-op diagnoses): the order is not stable, so compare as a set
    expect(displays.filter((d) => d.startsWith('pre-surgery diagnosis')).length, 'pre-op diagnoses').toBe(2);
    expect(displays.filter((d) => d.startsWith('surgical procedure')).length, 'procedures').toBe(2);
    expect(displays.filter((d) => d.startsWith('post-surgery diagnosis')).length, 'post-op diagnoses').toBe(1);

    // the transfusion groups: one group per blood product, each with its own volume
    const groups = await (await api.get(`obs?encounter=${encounter.uuid}&v=custom:(concept:(display),groupMembers:(display))&limit=100`)).json();
    const transfusions = (groups.results as Array<{ concept: { display: string }; groupMembers: Array<{ display: string }> | null }>)
      .filter((o) => o.concept.display === 'Transfusion construct')
      .map((o) => (o.groupMembers ?? []).map((m) => m.display).sort().join(' + '))
      .sort();
    expect(transfusions).toEqual(['Type of transfusion fluid: Plasma + Volume of transfusion: 1.0', 'Type of transfusion fluid: Whole blood + Volume of transfusion: 2.0']);

    const providers = await (await api.get(`encounter/${encounter.uuid}?v=custom:(encounterProviders:(encounterRole:(uuid)))`)).json();
    expect(providers.encounterProviders.map((p: { encounterRole: { uuid: string } }) => p.encounterRole.uuid).sort()).toEqual(
      [
        '9b135b19-7ebe-4a51-aea2-69a53f9383af', // attending
        '6e630e03-5182-4cb3-9a82-a5b1a85c09a7', // assistant
        'de11b25c-a641-4630-9524-5b85ece9a4f8', // anesthesiologist
        '98bf2792-3f0a-4388-81bb-c78b29c0df92', // nurse
      ].sort(),
    );
  });

  test('the visit page shows the saved note in the form VIEW', async ({ page, api, createEntryContext }) => {
    const { encounter } = await saveFull(page, api, createEntryContext);
    // radios and checkboxes print as "[X] <label>"; the provider widgets and the date print as text
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, {
      'Type of patient: Inpatient hospitalization': 'Hospitalized',
      'Emergency: Yes': 'yes',
      'Planned return to operating room: No': 'no',
      'Scheduled surgery: Yes': 'yes',
      'Transfusion status: Yes': 'yes',
      'Pre-operative antibiotic administered: Yes': 'yes',
      'Pathology sample sent: Yes': 'yes',
      'Laboratory specimen sent: No': 'no',
      'Insertion of implantation: No': 'no',
      'Transfusion of fluid: Whole blood': '',
      'Transfusion of fluid: Plasma': '',
      'Complications from surgery: None': 'None',
    });
    const root = view.root;
    await expect(root.locator('#service-team')).toContainText('General surgery department');
    await expect(root.locator('#service-team')).toContainText('Dr Other Assistant');
    await expect(root.locator('#description .value').filter({ hasText: /^\s*Acute Appendicitis\s*$/i })).toHaveCount(1);
    await expect(root.locator('#description .value').filter({ hasText: /^\s*Inguinal hernia\s*$/i })).toHaveCount(1);
    await expect(root.locator('#description .value').filter({ hasText: /General anesthesia/i })).toHaveCount(1);
    await expect(root.locator('#ins-outs')).toContainText('Whole blood');
    await expect(root.locator('#ins-outs .value').filter({ hasText: /^2(\.0)?$/ })).toHaveCount(2); // IVF volume and whole blood volume
    await expect(root.locator('#plan .value')).toHaveText(['Uncomplicated laparoscopic appendectomy']);
    // what was not filled in (the platelets and packed cells rows) shows no value
    await expect(root.locator('#ins-outs .value').filter({ hasText: /Platelets|Packed red blood cells/i })).toHaveCount(0);
    // ifMode VIEW include=false: no heading, no Save / Cancel
    await expect(root.locator('h2, #buttons, input.submitButton')).toHaveCount(0);
    // not conditional on mode: the c-section pointer stays
    await expect(root.getByText('For cesarean section, complete c-section questions on the delivery form.')).toBeVisible();
  });

  test('EDIT starts from the saved values and a re-save keeps them', async ({ page, api, createEntryContext }) => {
    const { context, provider, encounter } = await saveFull(page, api, createEntryContext);
    await page.goto(editUrl(context.patient.uuid, encounter.uuid, context.visitUuid));
    await expect(page.locator(SAVE)).toBeVisible();
    await expect(page.locator('#service-team select').first().locator('option:checked')).toHaveText('Sal Operasyon');
    await expect(row(page, 'Surgical service').locator('select').locator('option:checked')).toHaveText('General surgery department');
    await expect(row(page, 'other assistants').locator('input')).toHaveValue('Dr Other Assistant');
    await expect(page.locator('#service-team input.autoCompleteHidden').first(), 'the attending is loaded').toHaveValue(provider);
    await expect(row(page, 'Admission status').getByLabel('Hospitalized')).toBeChecked();
    await expect(yesNo(page, 'Emergency/Urgent', 'yes')).toBeChecked();
    await expect(yesNo(page, 'Planned return to OR', 'no')).toBeChecked();
    await expect(row(page, 'Anesthesia type').locator('select').locator('option:checked')).toHaveText('General anesthesia');
    await expect(page.locator('#ins-outs input[type=checkbox]').nth(0)).toBeChecked(); // whole blood
    await expect(page.locator('#ins-outs input[type=checkbox]').nth(1)).not.toBeChecked(); // packed cells
    await expect(page.locator('#ins-outs input[type=checkbox]').nth(2)).toBeChecked(); // plasma
    await expect(page.locator('#ins-outs input[type=text]').nth(1)).toHaveValue('2');
    await expect(page.locator('#ins-outs input[type=text]').nth(3)).toHaveValue('1');
    await expect(page.locator('#plan textarea')).toHaveValue('Uncomplicated laparoscopic appendectomy');
    const pre = row(page, 'Pre-operative diagnoses').locator('input.autoCompleteText');
    await expect(pre.nth(0)).toHaveValue(/Appendicitis|Inguinal hernia/);
    await expect(pre.nth(1)).toHaveValue(/Appendicitis|Inguinal hernia/);

    // change one answer, save, and read back: the changed obs is replaced and the rest stays
    await choose(yesNo(page, 'Planned return to OR', 'yes'));
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    const displays = await obsDisplays(api, encounter.uuid);
    expectObs(displays, 'Planned return to operating room: Yes', 'Appendix to pathology', 'Uncomplicated laparoscopic appendectomy', 'Whole blood', 'Plasma');
    expect(displays.filter((d) => d.startsWith('planned return to operating room'))).toEqual(['planned return to operating room: yes']);
    expect(displays.filter((d) => d.startsWith('pre-surgery diagnosis')).length).toBe(2);
    // the unchanged text answer is not duplicated
    expect(displays.filter((d) => d.includes('uncomplicated laparoscopic appendectomy')).length).toBe(1);

    const view = await ViewFormPage.open(page, FORM, encounter.uuid);
    // Emergency, Planned return and Scheduled are all "yes" now
    await expect(view.root.locator('#description .value').filter({ hasText: '[X] yes' })).toHaveCount(3);
    await expect(view.root.locator('#description .value').filter({ hasText: '[X] no' })).toHaveCount(0);
  });
});
