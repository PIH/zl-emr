import { type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type SectionEncounter, type SectionEncounterOptions } from '../../core';
import {
  NCD_INITIAL_ENCOUNTER_TYPE_UUID,
  PRIMARY_CARE_ADULT_FOLLOWUP_ENCOUNTER_TYPE_UUID,
  PRIMARY_CARE_ADULT_INITIAL_ENCOUNTER_TYPE_UUID,
  PRIMARY_CARE_PEDS_INITIAL_ENCOUNTER_TYPE_UUID,
} from '../../core/constants';
import { SectionFormPage, VISIT_PAGE_URL, expectViewShowsSavedObs } from '../../pages';

// section-history.xml (pihemr): "History": presenting history, family history, past medical history, blood type, previous
// hospitalisation, current medications, diagnostic tests; plus parent-specific sections. On the visit page it is the `pihcore-history`
// section of primary care adult initial, peds initial and NCD initial; the specs create the parent encounter over REST and open the
// section's edit URL directly (skips the gating of _availability.e2e.md). Runs on zl-ci.
//
// Conditions in the form, from documentation inventory (section-history.inv.md). N = NCD initial (ae06d311), A = primary care adult
// initial/followup (27d3a180/-81); "other" = peds initial:
//   includeIf encounterType != N          :132  #chiefComplaint (chief complaint textarea; N has none)
//   includeIf encounterType == N          :153  #referralIn (self-referral, date, internal / external / community referring service)
//   includeIf gender F                    :289  three extra past-medical-history boxes after the two-column list (any parent)
//   includeIf N && $patient.age < 12      :298  #birth-history (CURRENT age, see V2)
//   includeIf N                           :364  #habits (tobacco, secondhand smoke, alcohol, drugs)
//   includeIf A (initial or followup)     :408  #sexual-activities, adult variant: sexually active radio, family planning method + other
//   includeIf N                           :437  #sexual-activities, NCD variant: [F only :441] pregnant box, LMP/EDD, breastfeeding box, then the
//                                               family-planning table (8 methods x start/end date) + "other, specify" for everybody
//   toggle  pregnant checkbox :457        shows #pregnant (LMP, EDD)
//   toggle  family planning boxes :532    "dim" the row's two date inputs (disabled, cleared) until ticked; V1: broken for "Tubal ligation"
//   ifMode VIEW include=false :56,:63,:125,:442,:704   CSS, scripts, <h1>, the #buttons row (Next, Save, Cancel); absent in VIEW
// Scripts: :64-122 family/past-history text rule (rows with class medicalHistoryText: Cancer, Other, and the "specify" past-medical-history
//   items): text without a ticked box -> "Select family member(s)" (family) / "Select checkbox with comment" (past history); a ticked box without text ->
//   "Please specify"; checked on `change` and again in beforeSubmit, which blocks the save. :443-450 mch.js setUpEdd + the two EDD
//   validators for the NCD-variant pregnancy block (shared, see _shared.e2e.md; one test here). setUpNextAndSubmitButtons() :119.
// Side effects on save: none (no postSubmissionAction, program, order). Nothing is required.
// VIEW is tested on the visit page, which shows the section's own VIEW (`pihcore-history` has an active templateModelUrl in
//   encounterTypeConfig.js :88): expectViewShowsSavedObs.
// Findings: see pihemr _findings.e2e.md#section-history (copied here until the main session moves them):
//   V1 Medium :532,:544-549 the toggle target of the "Tubal ligation" family-planning row is `Tubal ligation-date` (the render's `comment`
//          contains a space, also used for the td id `Tubal ligation-fp` and class), so the target selector matches nothing: the row's start
//          and end dates are not dimmed while the box is unticked, unlike the other seven rows. Fix: add an `id="tubal"`-style render
//          variable without a space for the ids/classes. (TESTED below with test.fixme)
//   V2 Low    :298 `$patient.age < 12` is the CURRENT age, not the age at the encounter date (section-exam uses
//          $patient.getAge($encounter.getEncounterDatetime())): the birth-history section of an NCD intake saved at age 11 disappears from EDIT/VIEW once the
//          child turns 12 (saved obs then not shown). Fix: use getAge($encounter.getEncounterDatetime()). (reading only, not tested)
//   V3 Low    :99-105 the text rule runs on the text's `change` (blur): typing the "Specify" text and then clicking the family member's box blurs the text first,
//          the error message appears above the boxes and moves them down 29 px before the click completes, so the box is NOT ticked and the user must click again
//          (reproduced with a mouse down/up). Fix: validate on submit/blur of the whole row, or reserve space for the message.
//   Shared: the EDD validators of :443-450 (mch.js): see _shared V1 (an EDD more than 305 days ahead is never flagged); not re-tested here.
//   V4 Info   :408 the adult arm also lists primary care adult FOLLOWUP (27d3a181), whose visit-page sections do not include `pihcore-history`; :288 comment says
//          "only NCD" but the condition is gender only (the extra boxes show for every female).
// Not covered here: #next (needs the entry form); the EDD/GA derived values beyond one LMP check (shared mch.js, _shared.e2e.md).

const FORM = 'section-history.xml';

// Obs whose coded value the VIEW does not print as such: each past-history / family-history / habits tick saves "Sign/symptom present: Yes"
// (the row's own label is shown instead, "[X] Asthma"), and the pregnancy and breastfeeding boxes show their answerCode (obs display -> text shown).
const VIEW_LABELS: Record<string, string> = {
  'Sign/symptom present: Yes': '',
  'Family history diagnosis: Neoplasm/cancer': '', // the row is labelled by the form (label="Cancer", not a value span)
  'Pregnancy status: Yes': 'Pregnant',
  'Breastfeeding child: Yes': 'Currently breastfeeding',
};

// Local helpers.
// Date inputs are read-only datepickers: set the date as the picker does, then fire the hidden input's change (mch.js listens there).
const pickDate = async (input: Locator, isoDate: string) => {
  await input.evaluate((el, iso) => {
    const j = (window as unknown as { jq: (e: unknown) => { datepicker: (...a: unknown[]) => void; trigger: (n: string) => void } }).jq;
    j(el).datepicker('setDate', new Date(`${iso}T12:00:00`));
    j(el).trigger('change');
  }, isoDate);
  await input.locator('xpath=following-sibling::input[@type="hidden"]').evaluate((el) => {
    (window as unknown as { jq: (e: unknown) => { trigger: (n: string) => void } }).jq(el).trigger('change');
  });
};
// Calendar date `n` days from today as yyyy-mm-dd.
const iso = (n: number): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + n)).toISOString().slice(0, 10);
};
// Date as the VIEW shows it ("15 Mar 2024").
const viewDate = (isoDate: string): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
};
const obsDisplays = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> => {
  const res = await api.get(`obs?encounter=${encounterUuid}&v=custom:(display)&limit=300`);
  expect(res.ok(), `get obs: ${res.status()}`).toBeTruthy();
  return ((await res.json()).results as Array<{ display: string }>).map((o) => o.display.toLowerCase());
};
const expectObs = (displays: string[], ...expected: string[]) => {
  for (const e of expected) {
    expect(displays.some((d) => d.includes(e.toLowerCase())), `obs "${e}" among ${displays.length} saved obs`).toBeTruthy();
  }
};
const save = async (page: Page) => {
  await new SectionFormPage(page, FORM).save();
  await new SectionFormPage(page, FORM).expectSaved();
};

// Locators. Family history rows are .family-history-item (a label div + one .relative per family member); past-medical-history rows
// are .past-medical-history-item (checkbox, label, optional "Specify" text).
const family = (page: Page, concept: string, relative: string) =>
  page
    .locator('#family-history .family-history-item', { has: page.locator('.label', { hasText: new RegExp(`^${concept}`) }) })
    .locator('.relative', { hasText: relative })
    .locator('input[type=checkbox]');
const pmhRow = (page: Page, label: string) =>
  page.locator('#patient-history .past-medical-history-item', { has: page.locator(`label:text-is("${label}")`) });
const pmhBox = (page: Page, label: string) => pmhRow(page, label).locator('input[type=checkbox]');
const pmhText = (page: Page, label: string) => pmhRow(page, label).locator('input[type=text]');
const fpRow = (page: Page, method: string) => page.locator('#sexual-activities table tr', { has: page.locator(`label:text-is("${method}")`) });

type Parent = { uuid: string; gender: 'M' | 'F'; age: number };
const ADULT_F: Parent = { uuid: PRIMARY_CARE_ADULT_INITIAL_ENCOUNTER_TYPE_UUID, gender: 'F', age: 30 };
const open = async (
  page: Page,
  create: (o: SectionEncounterOptions) => Promise<SectionEncounter>,
  p: Parent,
): Promise<SectionEncounter> => {
  const section = await create({
    encounterTypeUuid: p.uuid,
    patient: { givenName: 'AutoHistory', familyName: 'Tester', gender: p.gender, birthdate: birthdateYearsAgo(p.age) },
  });
  await SectionFormPage.openEdit(page, FORM, section);
  return section;
};

// ---- includeIf: which sections each parent shows ----
test.describe('section-history sections by parent encounter type', () => {
  const COMMON = ['#complaint', '#family-history', '#patient-history', '#patient-blood-type', '#previous-hospital', '#current-medications', '#diagnostic-tests-history'];
  const cases: Array<{ name: string; parent: Parent; present: string[]; absent: string[] }> = [
    {
      name: 'primary care adult initial (woman): chief complaint and the adult sexual history, none of the NCD sections',
      parent: ADULT_F,
      present: ['#chiefComplaint', '#sexual-activities input[type=radio]', '#sexual-activities select'],
      absent: ['#referralIn', '#birth-history', '#habits', '#pregnant', '#sexual-activities table'],
    },
    {
      // includeIf :408 second id: the followup type is not offered this section on the visit page (V4), but the form renders it
      name: 'primary care adult followup: same as adult initial',
      parent: { ...ADULT_F, uuid: PRIMARY_CARE_ADULT_FOLLOWUP_ENCOUNTER_TYPE_UUID },
      present: ['#chiefComplaint', '#sexual-activities input[type=radio]'],
      absent: ['#referralIn', '#birth-history', '#habits', '#pregnant'],
    },
    {
      name: 'primary care peds initial: chief complaint, no sexual history and no NCD section',
      parent: { uuid: PRIMARY_CARE_PEDS_INITIAL_ENCOUNTER_TYPE_UUID, gender: 'F', age: 3 },
      present: ['#chiefComplaint'],
      absent: ['#sexual-activities', '#referralIn', '#birth-history', '#habits', '#pregnant'],
    },
    {
      name: 'NCD initial (woman, adult): referral, habits, pregnancy block and family planning table; no chief complaint or birth history',
      parent: { uuid: NCD_INITIAL_ENCOUNTER_TYPE_UUID, gender: 'F', age: 30 },
      present: ['#referralIn', '#habits', '#sexual-activities table', '#pregnant', '#sexual-activities input[togglehide=pregnant]'],
      absent: ['#chiefComplaint', '#birth-history', '#sexual-activities input[type=radio]', '#sexual-activities select'],
    },
    {
      name: 'NCD initial (man, adult): family planning table but no pregnancy block',
      parent: { uuid: NCD_INITIAL_ENCOUNTER_TYPE_UUID, gender: 'M', age: 30 },
      present: ['#referralIn', '#habits', '#sexual-activities table'],
      absent: ['#chiefComplaint', '#birth-history', '#pregnant', '#sexual-activities input[togglehide=pregnant]'],
    },
    {
      name: 'NCD initial (girl, 5 years): birth history appears (age < 12)',
      parent: { uuid: NCD_INITIAL_ENCOUNTER_TYPE_UUID, gender: 'F', age: 5 },
      present: ['#referralIn', '#habits', '#birth-history', '#pregnant'],
      absent: ['#chiefComplaint'],
    },
  ];
  for (const c of cases) {
    test(c.name, async ({ page, createSectionEncounter }) => {
      // includeIf :132/:153/:298/:364/:408/:437/:441
      await open(page, createSectionEncounter, c.parent);
      for (const sel of [...COMMON, ...c.present]) {
        await expect(page.locator(sel).first(), `${sel} is rendered`).toBeAttached();
      }
      for (const sel of c.absent) {
        await expect(page.locator(sel), `${sel} is not rendered`).toHaveCount(0);
      }
    });
  }

  test('the three extra past-medical-history boxes are rendered for a woman and not for a man', async ({ page, createSectionEncounter }) => {
    // includeIf gender F :289
    await open(page, createSectionEncounter, ADULT_F);
    const woman = await page.locator('#patient-history .past-medical-history-item').count();
    await open(page, createSectionEncounter, { ...ADULT_F, gender: 'M' });
    const man = await page.locator('#patient-history .past-medical-history-item').count();
    expect(woman - man).toBe(3);
  });

  test('ENTER/EDIT shows the heading and the Next, Save and Cancel buttons', async ({ page, createSectionEncounter }) => {
    // ifMode VIEW include=false :125, :704
    await open(page, createSectionEncounter, ADULT_F);
    await expect(page.locator('form#htmlform h1')).toBeVisible();
    await expect(page.locator('#next')).toBeVisible();
    await expect(page.locator('#submit')).toBeVisible();
    await expect(page.locator('#cancel')).toBeVisible();
  });
});

// ---- script :64-122: text and tick must go together ----
test.describe('section-history family / past-history text rule', () => {
  test.beforeEach(async ({ page, createSectionEncounter }) => {
    await open(page, createSectionEncounter, ADULT_F);
  });

  test('family history: text without a family member is rejected, a ticked member without text is rejected, both together are accepted', async ({ page }) => {
    const text = page.locator('#familyCancer input[type=text]');
    const error = page.locator('#familyCancer .field-error');
    const mother = page.locator('#familyCancer .relative', { hasText: 'Mother' }).locator('input[type=checkbox]');
    await expect(error).toBeHidden();
    // text only
    await text.fill('Colon');
    await text.blur();
    await expect(error).toBeVisible();
    await expect(error).toHaveText('Select family member(s)');
    // text and a member
    await mother.check();
    await expect(error).toBeHidden();
    // member only
    await text.fill('');
    await text.blur();
    await expect(error).toHaveText('Please specify');
    await expect(error).toBeVisible();
    // neither
    await mother.uncheck();
    await expect(error).toBeHidden();
  });

  test('past history: text without its box is rejected, a ticked box without text is rejected', async ({ page }) => {
    const error = pmhRow(page, 'Heart disease').locator('.field-error');
    await pmhText(page, 'Heart disease').fill('Murmur');
    await pmhText(page, 'Heart disease').blur();
    await expect(error).toHaveText('Select checkbox with comment');
    await pmhBox(page, 'Heart disease').check();
    await expect(error).toBeHidden();
    await pmhText(page, 'Heart disease').fill('');
    await pmhText(page, 'Heart disease').blur();
    await expect(error).toHaveText('Please specify');
    // a past-history row without a "specify" text is not subject to the rule
    await pmhBox(page, 'Asthma').check();
    await expect(pmhRow(page, 'Asthma').locator('.field-error')).toHaveCount(0);
  });

  test('Save is blocked while a rule is broken and nothing is submitted', async ({ page }) => {
    // beforeSubmit :107-115
    const submits: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/submit.action')) {
        submits.push(r.url());
      }
    });
    await page.locator('#familyOther input[type=text]').fill('Gout');
    await new SectionFormPage(page, FORM).save();
    await expect(page.locator('#familyOther .field-error')).toHaveText('Select family member(s)');
    await page.waitForTimeout(1000);
    expect(submits).toEqual([]);
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    // fixing it lets the save through
    await page.locator('#familyOther .relative', { hasText: 'Sibling' }).locator('input[type=checkbox]').check();
    await new SectionFormPage(page, FORM).save();
    await new SectionFormPage(page, FORM).expectSaved();
  });
});

// ---- save / EDIT / VIEW under primary care adult initial ----
test.describe('section-history under primary care adult initial', () => {
  const ADMIT = iso(-40);
  const DISCHARGE = iso(-35);

  test('saves every kind of field; EDIT starts from the saved values; VIEW shows them', async ({ page, api, createSectionEncounter }) => {
    const section = await open(page, createSectionEncounter, ADULT_F);
    await page.locator('#chief-complaint textarea').fill('Cough for two weeks');
    await page.locator('#presenting-history textarea').fill('Started after a cold');
    await family(page, 'Asthma', 'Father').check();
    // Text first and blur it, then tick the box: the rule's error message appears and disappears as the focus moves and shifts the
    // boxes under the pointer (V3), so a click made while that happens is lost.
    await page.locator('#familyCancer input[type=text]').fill('Colon');
    await page.locator('#familyCancer input[type=text]').blur();
    await page.locator('#familyCancer .relative', { hasText: 'Mother' }).locator('input[type=checkbox]').check();
    await pmhBox(page, 'Asthma').check();
    await pmhText(page, 'Heart disease').fill('Murmur');
    await pmhText(page, 'Heart disease').blur();
    await pmhBox(page, 'Heart disease').check();
    await page.locator('#patient-blood-type').getByLabel('O+', { exact: true }).check();
    await page.locator('#sexual-activities').getByLabel('Yes', { exact: true }).check();
    await page.locator('#sexual-activities select').selectOption({ label: 'Condoms' });
    const hospital = page.locator('#previous-hospital table tr').nth(1);
    await pickDate(hospital.locator('input[readonly]').nth(0), ADMIT);
    await pickDate(hospital.locator('input[readonly]').nth(1), DISCHARGE);
    await hospital.locator('input[type=text]:not([readonly])').nth(0).fill('Hopital Saint Nicolas');
    await hospital.locator('input[type=text]:not([readonly])').nth(1).fill('Appendectomy');
    await page.locator('#previous-hospital textarea').fill('Recovered well');
    await page.locator('#current-medications textarea').fill('Paracetamol');
    await page.locator('#diagnostic-tests-history textarea').fill('Chest x-ray normal');
    await save(page);

    expectObs(
      await obsDisplays(api, section.encounter.uuid),
      'Cough for two weeks', 'Started after a cold', 'Colon', 'Murmur', 'Hopital Saint Nicolas', 'Appendectomy', 'Recovered well',
      'Paracetamol', 'Chest x-ray normal', 'Condoms',
    );

    // EDIT
    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#chief-complaint textarea')).toHaveValue('Cough for two weeks');
    await expect(family(page, 'Asthma', 'Father')).toBeChecked();
    await expect(family(page, 'Asthma', 'Mother')).not.toBeChecked();
    await expect(page.locator('#familyCancer input[type=text]')).toHaveValue('Colon');
    await expect(page.locator('#familyCancer .relative', { hasText: 'Mother' }).locator('input[type=checkbox]')).toBeChecked();
    await expect(pmhBox(page, 'Heart disease')).toBeChecked();
    await expect(pmhText(page, 'Heart disease')).toHaveValue('Murmur');
    await expect(pmhBox(page, 'Asthma')).toBeChecked();
    await expect(page.locator('#patient-blood-type').getByLabel('O+', { exact: true })).toBeChecked();
    await expect(page.locator('#sexual-activities select')).toHaveValue(/\d+/);
    await expect(page.locator('#previous-hospital table tr').nth(1).locator('input[type=text]:not([readonly])').nth(1)).toHaveValue('Appendectomy');
    await expect(page.locator('#diagnostic-tests-history textarea')).toHaveValue('Chest x-ray normal');

    // VIEW on the visit page
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, VIEW_LABELS);
    const shown = await view.valueTexts();
    expect(shown).toEqual(expect.arrayContaining(['Cough for two weeks', 'Started after a cold', 'Chest x-ray normal', 'Paracetamol']));
    expect(shown.join(' | ')).toContain(viewDate(ADMIT));
    expect(shown.join(' | ')).toContain(viewDate(DISCHARGE));
    await expect(view.root.locator('#familyCancer .value')).toContainText(['Colon', '[X] Mother']);
    await expect(view.root.locator('h1, #buttons, #submit, #next, #cancel')).toHaveCount(0);
    await expect(view.page.locator('#buttons, #submit, #next, #cancel')).toHaveCount(0);
  });

  test('VIEW: an unfilled field and an unticked box are not shown as values', async ({ page, api, createSectionEncounter }) => {
    const section = await open(page, createSectionEncounter, ADULT_F);
    await page.locator('#presenting-history textarea').fill('Only this');
    await pmhBox(page, 'Asthma').check();
    await save(page);
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, VIEW_LABELS);
    expect(await view.valueTexts()).toContain('Only this');
    await expect(view.root.locator('#current-medications .value')).toHaveCount(0);
    await expect(view.root.locator('#familyCancer .value')).toHaveCount(0);
    await expect(view.root.locator('#chief-complaint .value')).toHaveCount(0);
  });
});

// ---- NCD initial: referral, habits, birth history (child) ----
test.describe('section-history under NCD initial (child)', () => {
  test('saves the referral, habits and birth history; EDIT starts from the saved values; VIEW shows them', async ({ page, api, createSectionEncounter }) => {
    const section = await open(page, createSectionEncounter, { uuid: NCD_INITIAL_ENCOUNTER_TYPE_UUID, gender: 'M', age: 5 });
    const referralDate = iso(-10);
    // :153 referral
    await page.locator('#referralIn').getByLabel('Primary care clinic', { exact: true }).check();
    await pickDate(page.locator('#referralIn input[readonly]'), referralDate);
    // :364 habits: currently smokes, packs per year, never drinks
    const habits = page.locator('#habits');
    await habits.locator('p.radio').nth(0).getByLabel('Currently', { exact: true }).check();
    await habits.locator('p.radio').nth(0).locator('input[type=text]').fill('2');
    await habits.locator('p.radio').nth(2).getByLabel('Never', { exact: true }).check();
    // :298 birth history
    await page.locator('#birth-history input[type=radio]').first().check();
    await page.locator('#birth-history input[type=radio]').last().check();
    await page.locator('#birth-history input[type=text]').first().fill('3');
    await page.locator('#patient-history').locator('.past-medical-history-item', { has: page.locator('label:text-is("Asthma")') }).locator('input[type=checkbox]').check();
    await page.locator('#presenting-history textarea').fill('Seen for follow up');
    await save(page);

    const displays = await obsDisplays(api, section.encounter.uuid);
    expectObs(displays, 'Seen for follow up', 'Primary care clinic');
    expect(displays.some((d) => d.includes('packs') || d.includes('11949') || d.includes(': 2')), 'packs per year saved').toBeTruthy();

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#referralIn').getByLabel('Primary care clinic', { exact: true })).toBeChecked();
    await expect(page.locator('#habits p.radio').nth(0).getByLabel('Currently', { exact: true })).toBeChecked();
    await expect(page.locator('#habits p.radio').nth(0).locator('input[type=text]')).toHaveValue('2');
    await expect(page.locator('#birth-history input[type=radio]').first()).toBeChecked();
    await expect(page.locator('#birth-history input[type=radio]').last()).toBeChecked();
    await expect(page.locator('#birth-history input[type=text]').first()).toHaveValue('3');

    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, VIEW_LABELS);
    const shown = await view.valueTexts();
    expect(shown).toEqual(expect.arrayContaining(['Seen for follow up', '2', '3']));
    expect(shown.join(' | ')).toContain(viewDate(referralDate));
    await expect(view.root.locator('#chiefComplaint')).toHaveCount(0);
  });
});

// ---- NCD initial, woman: pregnancy block and family planning table ----
test.describe('section-history under NCD initial (woman)', () => {
  const NCD_F: Parent = { uuid: NCD_INITIAL_ENCOUNTER_TYPE_UUID, gender: 'F', age: 30 };

  test('the pregnancy checkbox shows #pregnant (LMP, EDD)', async ({ page, createSectionEncounter }) => {
    // toggle :457 (togglehide)
    await open(page, createSectionEncounter, NCD_F);
    await expect(page.locator('#pregnant')).toBeHidden();
    await page.locator('input[togglehide=pregnant]').check();
    await expect(page.locator('#pregnant')).toBeVisible();
    await page.locator('input[togglehide=pregnant]').uncheck();
    await expect(page.locator('#pregnant')).toBeHidden();
  });

  test('an LMP fills the EDD (+280 days) and shows the calculated gestational age', async ({ page, createSectionEncounter }) => {
    // mch.js setUpEdd via :443-450 (shared, _shared.e2e.md)
    await open(page, createSectionEncounter, NCD_F);
    await page.locator('input[togglehide=pregnant]').check();
    await expect(page.locator('#calculated-edd-and-gestational')).toBeHidden();
    await pickDate(page.locator('#lastPeriodDate input[readonly]'), iso(-100));
    await expect(page.locator('#edd input[type=hidden]')).toHaveValue(iso(180));
    await expect(page.locator('#calculated-edd-and-gestational')).toBeVisible();
  });

  test('a family planning method enables its start and end dates and clearing the box clears them', async ({ page, createSectionEncounter }) => {
    // toggle :532 "dim": the row's date inputs are disabled until the method is ticked
    await open(page, createSectionEncounter, NCD_F);
    const row = fpRow(page, 'Oral contraception');
    const dates = row.locator('td.Pill-date input[type=text]');
    await expect(dates).toHaveCount(2);
    await expect(dates.first()).toBeDisabled();
    await expect(dates.nth(1)).toBeDisabled();
    await row.locator('input[type=checkbox]').check();
    await expect(dates.first()).toBeEnabled();
    await pickDate(dates.first(), iso(-60));
    await row.locator('input[type=checkbox]').uncheck();
    await expect(dates.first()).toBeDisabled();
    await expect(row.locator('td.Pill-date input[type=hidden]').first()).toHaveValue('');
  });

  // V1: remove test.fixme() when the Tubal ligation row dims its dates like the other rows.
  test.fixme('V1: the Tubal ligation dates are disabled until its method is ticked', async ({ page, createSectionEncounter }) => {
    await open(page, createSectionEncounter, NCD_F);
    const row = fpRow(page, 'Tubal ligation');
    const dates = row.locator('input[type=text][readonly]');
    await expect(dates).toHaveCount(2);
    await expect(dates.first()).toBeDisabled();
    await row.locator('input[type=checkbox]').check();
    await expect(dates.first()).toBeEnabled();
  });

  test('saves the pregnancy, the family planning methods and the other-method text; EDIT and VIEW show them', async ({ page, api, createSectionEncounter }) => {
    const section = await open(page, createSectionEncounter, NCD_F);
    const lmp = iso(-100);
    const pillStart = iso(-60);
    await page.locator('input[togglehide=pregnant]').check();
    await pickDate(page.locator('#lastPeriodDate input[readonly]'), lmp);
    await page.locator('#sexual-activities').getByLabel('Currently breastfeeding', { exact: true }).check();
    const pill = fpRow(page, 'Oral contraception');
    await pill.locator('input[type=checkbox]').check();
    await pickDate(pill.locator('td.Pill-date input[readonly]').first(), pillStart);
    await fpRow(page, 'Condoms').locator('input[type=checkbox]').check();
    await page.locator('#sexual-activities table td[align=right] input[type=text]').fill('Withdrawal');
    await save(page);

    expectObs(await obsDisplays(api, section.encounter.uuid), 'Pregnancy status', 'Breastfeeding child', 'Oral contraception', 'Condoms', 'Withdrawal');

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#pregnant')).toBeVisible();
    await expect(page.locator('#edd input[type=hidden]')).toHaveValue(iso(180));
    await expect(fpRow(page, 'Oral contraception').locator('input[type=checkbox]')).toBeChecked();
    await expect(fpRow(page, 'Oral contraception').locator('td.Pill-date input[type=text]').first()).toBeEnabled();
    await expect(fpRow(page, 'Condoms').locator('input[type=checkbox]')).toBeChecked();
    await expect(fpRow(page, 'Vasectomy').locator('td input[type=text]').first()).toBeDisabled();

    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, VIEW_LABELS);
    const shown = (await view.valueTexts()).join(' | ');
    expect(shown).toContain(viewDate(lmp));
    expect(shown).toContain(viewDate(pillStart));
    expect(shown).toContain('Withdrawal');
    await expect(view.root.locator('#pregnant')).toBeVisible();
  });
});
