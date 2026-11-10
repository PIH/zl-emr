import { type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type SectionEncounter } from '../../core';
import { NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID, NCD_INITIAL_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { SectionFormPage, VISIT_PAGE_URL, expectViewShowsSavedObs } from '../../pages';
import { expectObs, isoDate, obsDisplays, pickDate, pickerDate, viewDate } from '../../pages/form-widgets';

// section-sickle-cell.xml (pihemr, v1.0): "Sickle Cell": (NCD initial only) sickle-cell diagnosis radio + other text + confirmation test, then the
// follow-up indicators for every encounter: asymptomatic yes/no/unknown and nine symptoms, complications since the last visit, transfusion in the
// last 3 months, treatment (folic acid, penicillin), awareness / adherence questions, disease control, hydroxyurea indications, reasons and complications.
// On the visit page it is the `pihcore-sickle-cell` section of NCD initial and NCD followup; the specs create the parent encounter over REST and open
// the section's edit URL directly (skips the gating of _availability.e2e.md). Runs on zl-ci.
//
// Conditions in the form, from documentation inventory (section-sickle-cell.inv.md):
//   includeIf encounterType == NCD initial (ae06d311) :56   diagnosis radio (PIH:Visit Diagnoses group), "other sickle-cell" text, confirmation test
//                                          method; NOT shown under NCD followup (5cbfd6a2)
//   when asymptomatic (conceptIds PIH:SYMPTOM PRESENT/ABSENT/UNKNOWN) = ABSENT ("no") :104   shows #sc-not-asymptom (the nine symptom rows)
//   when PIH:14867 complications = YES :144   shows #scd-comp-text      when PIH:7868 transfusion = Yes :188   shows #transfusion-details
//   when :233 (repeat, malaria/understands/titrate/adherence/missing doses/aware/family radios) = YES   shows #scd-fui-{tog}-details: only
//          `#scd-fui-miss-details` (the "# of missed doses" box) exists; the other six targets do not (V1)
//   when :271 "condition improved" = YES   shows #scd-fui-improved-details: no such element (V1)
//   when PIH:11506 control = uncontrolled :287   shows #sc-fui-uncontrolled (send for admission)
//   when PIH:14869 hydroxyurea indicated = YES :315   shows #scd-hydroxy-details; when PIH:14870 on hydroxyurea = NO :329   shows #reason-no-hydroxy;
//          when PIH:14871 complications with hydroxyurea = YES :362   shows #side-effect-hydroxy-compl-details
//   ifMode VIEW include=false :42, :390   the script and the button rows (Plan, Dx, Sickle, NCD, Next, Save, Cancel); absent in VIEW
// Scripts: :43 setUpNextAndSubmitButtons() only (see _shared.e2e.md). No validation; nothing is required.
// Side effects on save: postSubmissionAction CleanDiagnosisConstructAction :20 (pihcore; not exercised beyond saving a diagnosis).
// VIEW is tested on the visit page, which shows the section's own VIEW (`pihcore-sickle-cell` has an active templateModelUrl in encounterTypeConfig.js,
//   longTemplate viewSectionWithHtmlFormLong.page): expectViewShowsSavedObs.
// Findings: see pihemr _findings.e2e.md#section-sickle-cell
//   V1 Low :233, :271 seven `when` rules (malaria, understands, titrate, adherence, aware, family, improved) point to #scd-fui-<tog>-details targets that
//          do not exist, so answering Yes shows nothing (only the missed-doses rule has a target): dead rules, probably missing detail boxes.
// Not covered here: #next and the four nextSection buttons (Plan, Dx, Sickle, NCD) navigate the visit page's sections (needs the entry form flow, see
//   _shared.e2e.md); only their presence is asserted.

const FORM = 'section-sickle-cell.xml';
const patient = { givenName: 'AutoSickle', familyName: 'Tester', gender: 'F' as const, birthdate: birthdateYearsAgo(25) };
const SAVE = '#submit';

const open = async (page: Page, create: (o: { encounterTypeUuid: string; patient: typeof patient }) => Promise<SectionEncounter>, type = NCD_INITIAL_ENCOUNTER_TYPE_UUID) => {
  const section = await create({ encounterTypeUuid: type, patient });
  await SectionFormPage.openEdit(page, FORM, section);
  return section;
};
const save = async (page: Page) => {
  await new SectionFormPage(page, FORM).save();
  await new SectionFormPage(page, FORM).expectSaved();
};
// the three answers of a yes / no / unknown radio group, by position (0 yes, 1 no, 2 unknown), in the element with this id
const answer = (page: Page, id: string, n: 0 | 1 | 2) => page.locator(`[id="${id}"] input[type=radio]`).nth(n);
const symptom = (page: Page, name: RegExp, n: 0 | 1 | 2) => page.locator('#sc-not-asymptom p', { hasText: name }).locator('input[type=radio]').nth(n);

test.describe('section-sickle-cell', () => {
  test('under NCD initial: diagnosis, other text and confirmation test are offered; under NCD followup they are not', async ({ page, createSectionEncounter }) => {
    // includeIf :56
    await open(page, createSectionEncounter);
    await expect(page.locator('#sickle').getByLabel('Sickle-cell disease', { exact: true })).toBeVisible();
    await expect(page.locator('#scd-test-method')).toBeVisible();
    await expect(page.locator('#sickle input[type=text]').first()).toBeVisible();
    await open(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    await expect(page.locator('#sickle').getByLabel('Sickle-cell disease', { exact: true })).toHaveCount(0);
    await expect(page.locator('#scd-test-method')).toHaveCount(0);
    // the follow-up indicators are there in both
    await expect(page.locator('[id="sickle-asymptom"]')).toBeVisible();
    await expect(page.locator('[id="scd-comp-q"]')).toBeVisible();
  });

  test('ENTER/EDIT shows the section buttons, Next, Save and Cancel', async ({ page, createSectionEncounter }) => {
    // ifMode VIEW include=false :390
    await open(page, createSectionEncounter);
    for (const id of ['pihcore-plan', 'pihcore-diagnosis', 'pihcore-sickle-cell', 'pihcore-ncd']) {
      await expect(page.locator(`#${id}.nextSection`)).toBeVisible();
    }
    await expect(page.locator('#next')).toBeVisible();
    await expect(page.locator('#submit')).toBeVisible();
    await expect(page.locator('#cancel')).toBeVisible();
  });

  test('the answers that show other fields: symptoms, complications, transfusion, missed doses, control', async ({ page, createSectionEncounter }) => {
    test.slow();
    await open(page, createSectionEncounter);
    // when :104: only "no" (SYMPTOM ABSENT) shows the nine symptoms
    const symptoms = page.locator('#sc-not-asymptom');
    await expect(symptoms).toBeHidden();
    await answer(page, 'sickle-asymptom', 1).check();
    await expect(symptoms).toBeVisible();
    await answer(page, 'sickle-asymptom', 0).check();
    await expect(symptoms).toBeHidden();
    await answer(page, 'sickle-asymptom', 2).check();
    await expect(symptoms).toBeHidden();
    // when :144 / :188 / :233 (missed doses) / :287
    for (const [radio, target] of [
      ['scd-comp-q', '#scd-comp-text'],
      ['transfusion-status', '#transfusion-details'],
      ['miss', '#scd-fui-miss-details'],
    ] as const) {
      await expect(page.locator(target), target).toBeHidden();
      await answer(page, radio, 0).check(); // yes
      await expect(page.locator(target), target).toBeVisible();
      await answer(page, radio, 1).check(); // no
      await expect(page.locator(target), target).toBeHidden();
    }
    const admission = page.locator('#sc-fui-uncontrolled');
    await expect(admission).toBeHidden();
    await answer(page, 'sickle-control', 1).check(); // uncontrolled (controlled, uncontrolled, complications)
    await expect(admission).toBeVisible();
    await answer(page, 'sickle-control', 0).check();
    await expect(admission).toBeHidden();
  });

  test('the hydroxyurea answers show the reasons and the complications', async ({ page, createSectionEncounter }) => {
    await open(page, createSectionEncounter);
    // when :315, :329, :362
    const details = page.locator('#scd-hydroxy-details');
    await expect(details).toBeHidden();
    await answer(page, 'scd-hydroxy-q', 0).check();
    await expect(details).toBeVisible();
    await expect(page.locator('#reason-no-hydroxy')).toBeHidden();
    await answer(page, 'hydroxy-treatment', 1).check(); // not on hydroxyurea
    await expect(page.locator('#reason-no-hydroxy')).toBeVisible();
    await answer(page, 'hydroxy-treatment', 0).check();
    await expect(page.locator('#reason-no-hydroxy')).toBeHidden();
    await expect(page.locator('#side-effect-hydroxy-compl-details')).toBeHidden();
    await answer(page, 'side-effect-hydroxy', 0).check();
    await expect(page.locator('#side-effect-hydroxy-compl-details')).toBeVisible();
    await answer(page, 'scd-hydroxy-q', 1).check(); // no: the whole block goes
    await expect(details).toBeHidden();
  });

  test('saves under NCD initial: diagnosis, test, symptoms, complications, transfusion, treatment, control, hydroxyurea; EDIT and VIEW show them', async ({ page, api, createSectionEncounter }) => {
    test.slow();
    const TRANSFUSION = isoDate(-20);
    const section = await open(page, createSectionEncounter);
    const sickle = page.locator('#sickle');
    await sickle.getByLabel('Sickle-cell disease', { exact: true }).check();
    await sickle.locator('input[type=text]').first().fill('Hemoglobin D disease');
    await page.locator('#scd-test-method').getByLabel('HPLC').check();
    await answer(page, 'sickle-asymptom', 1).check();
    await symptom(page, /^\s*Pain/, 0).check();
    await symptom(page, /^\s*Fever/, 1).check();
    await answer(page, 'scd-comp-q', 0).check();
    await page.locator('#scd-comp-text').getByLabel('Severe anemia').check();
    await page.locator('#scd-comp-text').getByLabel('Other', { exact: true }).check();
    await page.locator('#scd-comp-text input[type=text]').fill('Priapism');
    await answer(page, 'transfusion-status', 0).check();
    await page.locator('#transfusion-details input[type=text]').first().fill('2');
    await pickDate(page.locator('#transfusion-details input[readonly]'), TRANSFUSION);
    await sickle.getByLabel('Folic acid').check();
    await answer(page, 'malaria', 0).check();
    await answer(page, 'under', 1).check();
    await answer(page, 'miss', 0).check();
    await page.locator('#scd-fui-miss-details input[type=text]').fill('3');
    await answer(page, 'scd-fui-improved', 0).check();
    await answer(page, 'sickle-control', 1).check();
    await answer(page, 'scd-hydroxy-q', 0).check();
    await answer(page, 'hydroxy-treatment', 1).check();
    await page.locator('#reason-no-hydroxy').getByLabel('Out-of-stock').check();
    await answer(page, 'side-effect-hydroxy', 0).check();
    await page.locator('#side-effect-hydroxy-compl-details').getByLabel('Rash').check();
    await page.locator('#side-effect-hydroxy-compl-details input[type=text]').fill('Hair loss');
    await save(page);

    // the complications and the hydroxyurea answers are two obsgroups of the same concept (PIH:14872): each keeps its own members
    expectObs(
      await obsDisplays(api, section.encounter.uuid),
      'sickle cell disease', 'Hemoglobin D disease', 'hplc', 'asymptomatic sickle cell', 'symptom present: pain', 'symptom absent: fever',
      'severe anemia', 'out of stock', 'Hair loss', 'folic acid', 'not controlled',
      'number of missed medication doses in past 7 days: 3', 'date of blood unit transfusion',
    );

    // EDIT starts from the saved answers: the conditional blocks are open and every group is back where it was
    await SectionFormPage.openEdit(page, FORM, section);
    await expect(sickle.getByLabel('Sickle-cell disease', { exact: true })).toBeChecked();
    await expect(sickle.locator('input[type=text]').first()).toHaveValue('Hemoglobin D disease');
    await expect(page.locator('#scd-test-method').getByLabel('HPLC')).toBeChecked();
    await expect(page.locator('#sc-not-asymptom')).toBeVisible(); // when :104
    await expect(symptom(page, /^\s*Pain/, 0)).toBeChecked();
    await expect(symptom(page, /^\s*Fever/, 1)).toBeChecked();
    await expect(symptom(page, /^\s*Jaundice/, 0)).not.toBeChecked();
    await expect(page.locator('#scd-comp-text')).toBeVisible(); // when :144
    await expect(page.locator('#scd-comp-text').getByLabel('Severe anemia')).toBeChecked();
    await expect(page.locator('#scd-comp-text').getByLabel('Anemia', { exact: true })).not.toBeChecked();
    await expect(page.locator('#scd-comp-text input[type=text]')).toHaveValue('Priapism');
    await expect(page.locator('#transfusion-details')).toBeVisible(); // when :188
    await expect(page.locator('#transfusion-details input[type=text]').first()).toHaveValue('2');
    await expect(page.locator('#transfusion-details input[readonly]')).toHaveValue(pickerDate(TRANSFUSION));
    await expect(sickle.getByLabel('Folic acid')).toBeChecked();
    await expect(sickle.getByLabel('Penicillin')).not.toBeChecked();
    await expect(answer(page, 'malaria', 0)).toBeChecked();
    await expect(answer(page, 'under', 1)).toBeChecked();
    await expect(page.locator('#scd-fui-miss-details input[type=text]')).toHaveValue('3');
    await expect(answer(page, 'scd-fui-improved', 0)).toBeChecked();
    await expect(page.locator('#sc-fui-uncontrolled')).toBeVisible(); // when :287
    await expect(page.locator('#scd-hydroxy-details')).toBeVisible(); // when :315
    await expect(page.locator('#reason-no-hydroxy')).toBeVisible(); // when :329
    await expect(page.locator('#reason-no-hydroxy').getByLabel('Out-of-stock')).toBeChecked();
    await expect(page.locator('#side-effect-hydroxy-compl-details')).toBeVisible(); // when :362
    await expect(page.locator('#side-effect-hydroxy-compl-details').getByLabel('Rash')).toBeChecked();
    await expect(page.locator('#side-effect-hydroxy-compl-details input[type=text]')).toHaveValue('Hair loss');

    // VIEW on the visit page
    await page.goto('about:blank');
    // the form labels answers differently from the concept names (answerCodes), and the symptom rows are radios of three concepts
    // (SYMPTOM PRESENT = yes, SYMPTOM ABSENT = no) whose answer is the symptom
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      'NCD clinical status: Not controlled': 'uncontrolled',
      'Symptom present: Pain': '[X] yes',
      'Symptom absent: Fever': '[X] no',
      'Symptom absent: Asymptomatic sickle cell': '[X] no',
      'Diagnosis: Sickle cell disease': 'Sickle-cell disease',
      'Diagnosis order: Secondary': '', // set by CleanDiagnosisConstructAction, not shown
      'Reason for no hydroxyurea treatment: Drug not available - out of stock': 'Out-of-stock',
      'Method of sickle cell confirmation: Hemoglobin electrophoresis by HPLC': 'HPLC',
    });
    const shown = (await view.valueTexts()).join(' | ');
    for (const text of ['Hemoglobin D disease', 'Priapism', 'Hair loss', viewDate(TRANSFUSION)]) {
      expect(shown, text).toContain(text);
    }
    await expect(view.root.locator('#buttonsTopRow, #buttons, #submit, #next')).toHaveCount(0);
  });

  test('saves under NCD followup: the indicators only, and VIEW shows no diagnosis block', async ({ page, api, createSectionEncounter }) => {
    const section = await open(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    await answer(page, 'sickle-asymptom', 0).check(); // asymptomatic: yes
    await answer(page, 'scd-comp-q', 1).check();
    await answer(page, 'sickle-control', 0).check();
    await save(page);
    const displays = await obsDisplays(api, section.encounter.uuid);
    expectObs(displays, 'symptom present: asymptomatic sickle cell', 'controlled');
    expect(displays.some((d) => d.startsWith('diagnosis') || d.startsWith('visit diagnoses')), 'no diagnosis saved').toBeFalsy();

    await page.goto('about:blank');
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      'Symptom present: Asymptomatic sickle cell': '[X] yes',
      'Complications developed since last visit: No': '[X] no',
      'NCD clinical status: Controlled': 'controlled',
    });
    await expect(view.root.locator('#scd-test-method')).toHaveCount(0);
    await expect(view.root.locator('#sc-fui-uncontrolled .value')).toHaveCount(0);
  });
});
