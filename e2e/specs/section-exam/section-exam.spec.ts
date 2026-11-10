import { type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type SectionEncounter, type SectionEncounterOptions } from '../../core';
import {
  EID_FOLLOWUP_ENCOUNTER_TYPE_UUID,
  HIV_FOLLOWUP_ENCOUNTER_TYPE_UUID,
  HIV_INTAKE_ENCOUNTER_TYPE_UUID,
  NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID,
  NCD_INITIAL_ENCOUNTER_TYPE_UUID,
  OBGYN_ENCOUNTER_TYPE_UUID,
  ONCOLOGY_INTAKE_CONSULT_ENCOUNTER_TYPE_UUID,
  PMTCT_FOLLOWUP_ENCOUNTER_TYPE_UUID,
  PMTCT_INTAKE_ENCOUNTER_TYPE_UUID,
  PRIMARY_CARE_ADULT_FOLLOWUP_ENCOUNTER_TYPE_UUID,
  PRIMARY_CARE_ADULT_INITIAL_ENCOUNTER_TYPE_UUID,
  PRIMARY_CARE_PEDS_FOLLOWUP_ENCOUNTER_TYPE_UUID,
  PRIMARY_CARE_PEDS_INITIAL_ENCOUNTER_TYPE_UUID,
} from '../../core/constants';
import { SectionFormPage, expectViewShowsSavedObs } from '../../pages';

// section-exam.xml (pihemr): "Examen physique", the physical exam shared by most consult types: one collapsible block per body system
// (general, skin, HEENT, lymph, cardio, chest, abdomen, urogenital, ...), each with Normal / abnormal findings checkboxes, an "Other" box with a text
// and a comment. On the visit page it is the `physical-exam` section of primary care x4, NCD initial/followup, HIV intake/followup, PMTCT
// intake/followup, EID followup, oncology intake and OB/GYN; the specs create the parent encounter over REST (all of them on zl-ci, which offers none of the
// HIV-program forms, but the section is opened by URL) and open the section's edit URL directly (skips the gating of _availability.e2e.md).
//
// Conditions in the form, from documentation inventory (section-exam.inv.md). X = OB/GYN (d83e98fd), PMTCT intake (584124b9), PMTCT followup (95e03e7d):
//   includeIf type not X          :339   #uro "Urogenital Exam" block
//   includeIf type X              :374   #urology and #gynecology blocks (STI checkboxes, comment, ...)
//   includeIf type X              :627   #postpartum block: lochia, involution (#involution), uterus palpation; :700 <when> involution = Abnormal -> #abnormal-involution
//   includeIf gender F            :514   #women "Obstetrical Exam" (fundal height, UC, fetus 1..4), any age and parent
//   includeIf age at encounter < 15 :887  #peds "Pediatric Development" (gross / fine motor, language, social); < 6 :893 Denver test radio
//   ifMode VIEW include=false :48,:516,:1070   heading <h3>, scripts, the #buttons row (Next, Save, Cancel); absent in VIEW. ifMode VIEW :21,:89 CSS and hideIfEmpty
// Scripts: :53-86 `.normalObs` / `.abnormalObs` checkboxes are mutually exclusive inside their `.exam` container (ticking one unticks the other kind);
//   setUpNextAndSubmitButtons(). :517-550 (women, ENTER/EDIT) fetus 2-4 are hidden and a Show More / Show Less button pair toggles them; see V1.
// Side effects on save: none (no postSubmissionAction, program, order). Nothing is required.
// VIEW is tested on the visit page, which shows the section's own VIEW (`physical-exam` has an active templateModelUrl in
//   encounterTypeConfig.js :99): expectViewShowsSavedObs.
// Findings: see pihemr _findings.e2e.md#section-exam (copied here until the main session moves them):
//   V1 Medium :517-550 hasValue() reads `.fetus-name input`, a class that does not exist in the form, so fetus 2, 3 and 4 are always hidden on load: a fetus
//          saved in position 2-4 is not shown when the section is edited (the user must press Show More to see or change it). Fix: test the fetus inputs
//          that exist (`#fetus-presentation-N select`, `#fetus-hr-N input`). (TESTED below with test.fixme)
//   V2 Low    :491-497 (confirmed on zl-ci, asserted by a test) the template of the seven STI checkboxes uses `class="{switch}"` but its <render>s pass `name` and `finding`: the literal class
//          `{switch}` is rendered, so they take no part of the normal/abnormal exclusion of the gynecology block (Normal and Chlamydia can be saved together).
//   V3 Low    :514 the Obstetrical Exam block shows for every female patient of any age (a 3-year-old girl gets fundal height and fetus fields).
// Not covered here: #next (needs the entry form); the "Other" non-coded box's comment on every body system (one is saved below).

const FORM = 'section-exam.xml';

// Local helpers.
const obsDisplays = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> => {
  // display plus comment: the "Other" boxes (showCommentField) keep their text in the obs comment
  const res = await api.get(`obs?encounter=${encounterUuid}&v=custom:(display,comment)&limit=300`);
  expect(res.ok(), `get obs: ${res.status()}`).toBeTruthy();
  return ((await res.json()).results as Array<{ display: string; comment: string | null }>).map((o) => `${o.display} ${o.comment ?? ''}`.toLowerCase());
};
const expectObs = (displays: string[], ...expected: string[]) => {
  for (const e of expected) {
    expect(displays.some((d) => d.includes(e.toLowerCase())), `obs "${e}" among ${displays.join(' | ')}`).toBeTruthy();
  }
};
// Sticky headings (.toggle-div) and the .physical-exam wrapper intercept the pointer over the form's inputs, so Playwright's actionability check never
// lets a real click through: click through the DOM (the change handlers run as for a user's click).
const tick = (target: Locator) => target.evaluate((el) => (el as HTMLElement).click());
const save = async (page: Page) => {
  // Sticky headings can intercept the pointer on the Save button: click through the DOM.
  await page.locator('#submit').evaluate((el) => (el as HTMLElement).click());
  await expect(page).toHaveURL(/pihcore\/visit\/visit\.page/);
};
// The content block of a body system: the div right after its heading.
const block = (page: Page, headingId: string) => page.locator(`#${headingId} + .collapsible-content`);
const box = (page: Page, headingId: string, label: string) => block(page, headingId).getByLabel(label, { exact: true });
const nthBox = (page: Page, headingId: string, n: number) => block(page, headingId).locator('input[type=checkbox]').nth(n);

type Parent = { name: string; uuid: string; gender?: 'M' | 'F'; age?: number };
const open = async (
  page: Page,
  create: (o: SectionEncounterOptions) => Promise<SectionEncounter>,
  p: Parent,
): Promise<SectionEncounter> => {
  const section = await create({
    encounterTypeUuid: p.uuid,
    patient: { givenName: 'AutoExam', familyName: 'Tester', gender: p.gender ?? 'F', birthdate: birthdateYearsAgo(p.age ?? 30) },
  });
  await SectionFormPage.openEdit(page, FORM, section);
  return section;
};

const PC_ADULT: Parent = { name: 'primary care adult initial', uuid: PRIMARY_CARE_ADULT_INITIAL_ENCOUNTER_TYPE_UUID };
const OBGYN: Parent = { name: 'OB/GYN', uuid: OBGYN_ENCOUNTER_TYPE_UUID };

// ---- includeIf: type, gender and age ----
test.describe('section-exam blocks by parent encounter type', () => {
  const parents: Array<Parent & { x: boolean }> = [
    { ...PC_ADULT, x: false },
    { name: 'primary care adult followup', uuid: PRIMARY_CARE_ADULT_FOLLOWUP_ENCOUNTER_TYPE_UUID, x: false },
    { name: 'primary care peds initial', uuid: PRIMARY_CARE_PEDS_INITIAL_ENCOUNTER_TYPE_UUID, age: 3, x: false },
    { name: 'primary care peds followup', uuid: PRIMARY_CARE_PEDS_FOLLOWUP_ENCOUNTER_TYPE_UUID, age: 3, x: false },
    { name: 'NCD initial', uuid: NCD_INITIAL_ENCOUNTER_TYPE_UUID, x: false },
    { name: 'NCD followup', uuid: NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID, x: false },
    { name: 'HIV intake', uuid: HIV_INTAKE_ENCOUNTER_TYPE_UUID, x: false },
    { name: 'HIV followup', uuid: HIV_FOLLOWUP_ENCOUNTER_TYPE_UUID, x: false },
    { name: 'EID followup', uuid: EID_FOLLOWUP_ENCOUNTER_TYPE_UUID, age: 1, x: false },
    { name: 'oncology intake consult', uuid: ONCOLOGY_INTAKE_CONSULT_ENCOUNTER_TYPE_UUID, x: false },
    { ...OBGYN, x: true },
    { name: 'PMTCT intake', uuid: PMTCT_INTAKE_ENCOUNTER_TYPE_UUID, x: true },
    { name: 'PMTCT followup', uuid: PMTCT_FOLLOWUP_ENCOUNTER_TYPE_UUID, x: true },
  ];
  for (const p of parents) {
    test(`${p.name}: ${p.x ? 'urology, gynecology and postpartum blocks instead of urogenital' : 'urogenital block, no postpartum'}`, async ({ page, createSectionEncounter }) => {
      // includeIf :339 / :374 / :627, and :514 (woman) / :887 (age < 15)
      await open(page, createSectionEncounter, p);
      for (const id of ['general', 'skin', 'heent', 'lymph', 'cardio', 'chest', 'abs', 'women', 'mental', 'neuro', 'reflex', 'musculo', 'other']) {
        await expect(page.locator(`#${id}`), `#${id} is rendered`).toHaveCount(1);
      }
      for (const id of p.x ? ['urology', 'gynecology', 'postpartum'] : ['uro']) {
        await expect(page.locator(`#${id}`), `#${id} is rendered`).toHaveCount(1);
      }
      for (const id of p.x ? ['uro'] : ['urology', 'gynecology', 'postpartum']) {
        await expect(page.locator(`#${id}`), `#${id} is not rendered`).toHaveCount(0);
      }
      await expect(page.locator('#peds')).toHaveCount((p.age ?? 30) < 15 ? 1 : 0);
    });
  }

  test('a man gets no Obstetrical Exam block', async ({ page, createSectionEncounter }) => {
    // includeIf gender F :514
    await open(page, createSectionEncounter, { ...PC_ADULT, gender: 'M' });
    await expect(page.locator('#general')).toHaveCount(1);
    await expect(page.locator('#women')).toHaveCount(0);
    await expect(page.locator('#fetus-1')).toHaveCount(0);
  });

  test('pediatric development: shown under 15 years, with the Denver test only under 6', async ({ page, createSectionEncounter }) => {
    // includeIf age at the encounter date < 15 :887, < 6 :893
    const denver = page.getByText('Denver developmental screening test');
    await open(page, createSectionEncounter, { ...PC_ADULT, age: 3 });
    await expect(page.locator('#peds')).toHaveCount(1);
    await expect(denver).toHaveCount(1);
    await open(page, createSectionEncounter, { ...PC_ADULT, age: 10 });
    await expect(page.locator('#peds')).toHaveCount(1);
    await expect(denver).toHaveCount(0);
    await open(page, createSectionEncounter, { ...PC_ADULT, age: 15 });
    await expect(page.locator('#peds')).toHaveCount(0);
  });

  test('V2: the seven STI checkboxes of the gynecology block carry the literal class {switch}', async ({ page, createSectionEncounter }) => {
    // template :491 uses {switch}, the renders pass `name` and `finding`. Documents V2 as it is: delete this test when the class is fixed.
    await open(page, createSectionEncounter, OBGYN);
    await expect(block(page, 'gynecology').locator('[class*="{switch}"]')).toHaveCount(7);
  });

  test('ENTER/EDIT shows the heading and the Next, Save and Cancel buttons', async ({ page, createSectionEncounter }) => {
    // ifMode VIEW include=false :48, :1070
    await open(page, createSectionEncounter, PC_ADULT);
    await expect(page.locator('form#htmlform h3').first()).toBeVisible();
    await expect(page.locator('#next')).toBeVisible();
    await expect(page.locator('#submit')).toBeVisible();
    await expect(page.locator('#cancel')).toBeVisible();
  });
});

// ---- script :53-86: normal and abnormal findings exclude each other ----
test.describe('section-exam normal / abnormal exclusion', () => {
  test('ticking Normal unticks the abnormal findings of the same block and vice versa; other blocks are not touched', async ({ page, createSectionEncounter }) => {
    await open(page, createSectionEncounter, PC_ADULT);
    await tick(box(page, 'skin', 'Normal'));
    await tick(box(page, 'general', 'Obesity'));
    await tick(box(page, 'general', 'Distress'));
    await tick(box(page, 'general', 'Normal'));
    await expect(box(page, 'general', 'Obesity')).not.toBeChecked();
    await expect(box(page, 'general', 'Distress')).not.toBeChecked();
    await expect(box(page, 'general', 'Other')).not.toBeChecked();
    await expect(box(page, 'skin', 'Normal')).toBeChecked(); // another block
    await tick(box(page, 'general', 'Cachectic'));
    await expect(box(page, 'general', 'Normal')).not.toBeChecked();
    await expect(box(page, 'general', 'Cachectic')).toBeChecked();
    await expect(box(page, 'skin', 'Normal')).toBeChecked();
    // the "Other" box (an abnormal one) also unticks Normal
    await tick(box(page, 'general', 'Normal'));
    await tick(box(page, 'general', 'Other'));
    await expect(box(page, 'general', 'Normal')).not.toBeChecked();
  });

  test('the same rule applies to the pediatric gross motor skills', async ({ page, createSectionEncounter }) => {
    await open(page, createSectionEncounter, { ...PC_ADULT, age: 3 });
    const gross = page.locator('#gross');
    await tick(gross.locator('.normalObs input[type=checkbox]'));
    await tick(gross.locator('.abnormalObs input[type=checkbox]'));
    await expect(gross.locator('.normalObs input[type=checkbox]')).not.toBeChecked();
    await tick(gross.locator('.normalObs input[type=checkbox]'));
    await expect(gross.locator('.abnormalObs input[type=checkbox]')).not.toBeChecked();
  });
});

// ---- women's block: fetus 1..4 (script :517-550) ----
test.describe('section-exam obstetrical exam', () => {
  test('only fetus 1 is shown; Show More shows fetus 2-4 and Show Less hides them again', async ({ page, createSectionEncounter }) => {
    // script :517-550
    await open(page, createSectionEncounter, PC_ADULT);
    await expect(page.locator('#fetus-1')).toBeVisible();
    for (const n of [2, 3, 4]) {
      await expect(page.locator(`#fetus-${n}`)).toBeHidden();
    }
    await expect(page.locator('#show-less-fetus-button')).toBeHidden();
    await tick(page.locator('#show-more-fetus-button'));
    for (const n of [2, 3, 4]) {
      await expect(page.locator(`#fetus-${n}`)).toBeVisible();
    }
    await expect(page.locator('#show-more-fetus-button')).toBeHidden();
    await tick(page.locator('#show-less-fetus-button'));
    await expect(page.locator('#fetus-2')).toBeHidden();
    await expect(page.locator('#show-more-fetus-button')).toBeVisible();
  });

  // V1: remove test.fixme() when the script looks at fields that exist.
  test.fixme('V1: a fetus saved in position 2 is shown when the section is edited', async ({ page, createSectionEncounter }) => {
    const section = await open(page, createSectionEncounter, PC_ADULT);
    await tick(page.locator('#show-more-fetus-button'));
    await page.locator('#fetus-hr-2 input').fill('140');
    await save(page);
    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#fetus-2')).toBeVisible();
    await expect(page.locator('#fetus-hr-2 input')).toHaveValue('140');
  });
});

// ---- postpartum block (X parents): <when> :700 ----
test.describe('section-exam postpartum block', () => {
  test('an abnormal involution of the uterus shows the umbilicus measure; EDIT starts from the saved value', async ({ page, api, createSectionEncounter }) => {
    // when :700 (involution = Abnormal -> #abnormal-involution)
    const section = await open(page, createSectionEncounter, OBGYN);
    await expect(page.locator('#abnormal-involution')).toBeHidden();
    await tick(page.locator('#involution').getByLabel('Abnormal', { exact: true }));
    await expect(page.locator('#abnormal-involution')).toBeVisible();
    await tick(page.locator('#involution').getByLabel('Normal', { exact: true }));
    await expect(page.locator('#abnormal-involution')).toBeHidden();
    await tick(page.locator('#involution').getByLabel('Abnormal', { exact: true }));
    await page.locator('#abnormal-involution input[type=text]').fill('3');
    await save(page);
    expectObs(await obsDisplays(api, section.encounter.uuid), 'involution', 'abnormal');

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#involution').getByLabel('Abnormal', { exact: true })).toBeChecked();
    await expect(page.locator('#abnormal-involution')).toBeVisible();
    await expect(page.locator('#abnormal-involution input[type=text]')).toHaveValue('3');
  });
});

// ---- save / EDIT / VIEW ----
test.describe('section-exam save, EDIT and VIEW', () => {
  test('saves findings across body systems; EDIT starts from the saved values; VIEW shows them', async ({ page, api, createSectionEncounter }) => {
    const section = await open(page, createSectionEncounter, PC_ADULT);
    await tick(box(page, 'general', 'Obesity'));
    await tick(box(page, 'general', 'Other'));
    await block(page, 'general').locator('input[type=text]').first().fill('Scar on forearm');
    await page.locator('#general-exam-comments textarea').fill('Looks tired');
    await tick(box(page, 'skin', 'Normal'));
    await tick(nthBox(page, 'cardio', 1)); // first abnormal cardiac finding
    await block(page, 'women').locator('input[type=text]').first().fill('20'); // fundal height
    await tick(block(page, 'women').getByLabel('Present', { exact: true }));
    await tick(block(page, 'other').getByLabel('II', { exact: true })); // Tanner stage
    await block(page, 'other').locator('textarea').fill('Nothing else');
    await save(page);

    expectObs(await obsDisplays(api, section.encounter.uuid), 'general exam findings: obesity', 'Scar on forearm', 'Looks tired', 'skin exam findings: normal', 'Nothing else');

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(box(page, 'general', 'Obesity')).toBeChecked();
    await expect(box(page, 'general', 'Other')).toBeChecked();
    await expect(block(page, 'general').locator('input[type=text]').first()).toHaveValue('Scar on forearm');
    await expect(page.locator('#general-exam-comments textarea')).toHaveValue('Looks tired');
    await expect(box(page, 'skin', 'Normal')).toBeChecked();
    await expect(nthBox(page, 'cardio', 1)).toBeChecked();
    await expect(block(page, 'women').locator('input[type=text]').first()).toHaveValue('20');
    await expect(block(page, 'other').getByLabel('II', { exact: true })).toBeChecked();

    // VIEW on the visit page
    // Tanner stage: answerLabels I..V, the obs value is the concept "Stage II"
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, { 'Tanner staging, qualitative: Stage II': '' });
    const shown = (await view.valueTexts()).join(' | ');
    expect(shown).toContain('[X] II');
    expect(shown).toContain('Looks tired');
    expect(shown).toContain('Scar on forearm');
    expect(shown).toContain('Nothing else');
    await expect(view.root.locator('#general + .collapsible-content .value').filter({ hasText: 'Obesity' })).toHaveCount(1);
    // untouched blocks show no value; ifMode VIEW include=false parts are absent
    await expect(view.root.locator('#chest + .collapsible-content .value')).toHaveCount(0);
    await expect(view.root.locator('#abs + .collapsible-content .value')).toHaveCount(0);
    await expect(view.root.locator('h3, #buttons, #submit, #next, #cancel')).toHaveCount(0);
    await expect(view.page.locator('#buttons, #submit, #next, #cancel')).toHaveCount(0);
  });

  test('a child: saves the Denver test and the gross motor skills; EDIT and VIEW show them', async ({ page, api, createSectionEncounter }) => {
    const section = await open(page, createSectionEncounter, { ...PC_ADULT, age: 3, gender: 'M' });
    await tick(block(page, 'peds').locator('p', { hasText: 'Denver developmental screening test' }).getByLabel('Yes', { exact: true }));
    await tick(page.locator('#gross .normalObs input[type=checkbox]'));
    await page.locator('#gross textarea').fill('Walks steadily');
    await save(page);
    expectObs(await obsDisplays(api, section.encounter.uuid), 'Walks steadily', 'gross motor skills evaluation: normal');

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#gross .normalObs input[type=checkbox]')).toBeChecked();
    await expect(page.locator('#gross textarea')).toHaveValue('Walks steadily');

    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {});
    expect(await view.valueTexts()).toEqual(expect.arrayContaining(['Walks steadily']));
    await expect(view.root.locator('#fine .value')).toHaveCount(0);
    await expect(view.root.locator('#women')).toHaveCount(0); // a boy
  });
});
