import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type SectionEncounter } from '../../core';
import { HIV_FOLLOWUP_ENCOUNTER_TYPE_UUID, HIV_INTAKE_ENCOUNTER_TYPE_UUID, PMTCT_INTAKE_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { SectionFormPage, expectViewShowsSavedObs } from '../../pages';

// hiv/section-hiv-assessment.xml v4.0: "Assessment" of an HIV / PMTCT visit: adverse events and general health condition
// (HIV followup type only), symptoms and signs with duration, WHO clinical stage (adult or paediatric lists), diagnoses
// and opportunistic infections. On the visit page it is a section of the HIV intake (c31d306a) and PMTCT intake (584124b9)
// encounters (documentation/_availability.e2e.md); the specs open its edit URL directly, building the parent type and
// patient each test needs. It has a real `#submit` button.
//
// Conditions in the form, from documentation inventory (section-hiv-assessment.inv.md):
//   includeIf age at encounter > 1 :62  <enrollInProgram HIV> (enrolls on save)
//   includeIf type HIV followup :67     #hiv-adverse-event and #hiv-health-condition (V1)
//   toggle header "adverse event" checkbox :80 -> #ae; each AE row checkbox :107/:132 -> its date (dim = disabled)
//   toggle symptom checkbox :181 -> the symptom's radio, duration and unit (dim = disabled)
//   includeIf age >= 15 (or unknown) :274,:328,:385 / age < 15 :295,:350,:419   adult / paediatric WHO stage 2, 3, 4 lists
//   ifMode VIEW include=false :7,:37,:255,:279,:300,:333,:355,:390,:424,:460,:535 style, heading, <br>s, OI list, buttons;
//     VIEW include=true :50,:262,:316,:373 hideIfEmpty('.who-stage') and spacing (a script: runs on the visit page)
// Scripts: :43-46 setUpNextAndSubmitButtons (#next/#submit, see _shared); :52-54 (VIEW) hideIfEmpty(".who-stage").
// Side effects on save: enrollInProgram HIV (:63, age > 1, tested); postSubmissionAction CleanDiagnosisConstructAction (:4,
//   works on the diagnosis obs; not exercised). No drug or lab order. No required field.
// VIEW (on the visit page, HIV intake encounter; the save test's HIV followup encounter has no hiv-assessment section there, V1): every saved
//   obs is shown, the symptom and WHO stage blocks carry values, untouched symptom rows are not rendered, and the #buttons row (:535)
//   is absent. The adverse-event and health-condition blocks (followup only) are never shown to users, so their VIEW is not tested.
// Not covered here: the diagnoses widget (encounterDiagnosesByObs :523) and CleanDiagnosisConstructAction, #next.
//
// Findings:
//   V1 Low :67-162  the adverse-event and health-condition blocks exist only for the HIV followup type, but the visit page offers
//                   this section only under HIV intake and PMTCT intake (followups use section-hiv-state), so both blocks can
//                   never be reached from the UI (dead code unless the section is added to the followup config).
//   V2 Low :183,:187,:190 three `<td id="{comment}">` per symptom row: duplicate ids (19 ids x 3) and CIEL:128321 (:203,:299) is
//                   missing from the mappings CSV; the rows still enable together (tested), the form renders (stale CSV).
//   V3 Low :94,:131,:466-517 hardcoded "Date", "(préciser)" and the French OI list instead of message codes.

const FORM = 'hiv/section-hiv-assessment.xml';

// Local helpers.
// Coded answers the form labels differently from the concept name (obs display -> text shown in VIEW): answerLabels "1,2,3,4" of
// the WHO stage, answerCode "yes" of the adverse-event header and pihcore.noOI.
const VIEW_LABELS: Record<string, string> = {
  'Current WHO HIV Stage: WHO Stage 3': '3',
  'Adverse effect (coded): Adverse drug effect': 'yes',
  'Current opportunistic infection: None': 'No opportunistic infections',
};
const obsDisplays = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> => {
  const res = await api.get(`obs?encounter=${encounterUuid}&v=custom:(display)&limit=200`);
  expect(res.ok()).toBeTruthy();
  return ((await res.json()).results as Array<{ display: string }>).map((o) => o.display.toLowerCase());
};
const enrollments = async (api: APIRequestContext, patientUuid: string): Promise<string[]> => {
  const res = await api.get(`programenrollment?patient=${patientUuid}&v=custom:(program:(name))`);
  expect(res.ok()).toBeTruthy();
  return ((await res.json()).results as Array<{ program: { name: string } }>).map((e) => e.program.name);
};

test.describe('section-hiv-assessment @hiv-ci', () => {
  let section: SectionEncounter;

  const open = async (
    page: Page,
    createSectionEncounter: (o: { encounterTypeUuid: string; patient: { givenName: string; familyName: string; gender: 'M' | 'F'; birthdate: string } }) => Promise<SectionEncounter>,
    encounterTypeUuid = HIV_FOLLOWUP_ENCOUNTER_TYPE_UUID,
    age = 30,
  ) => {
    section = await createSectionEncounter({ encounterTypeUuid, patient: { givenName: 'AutoHivAssess', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(age) } });
    await page.goto(SectionFormPage.editUrl(FORM, section));
    await expect(page.locator('#submit')).toBeVisible();
  };
  const save = async (page: Page) => {
    await page.locator('#submit').click();
    await new SectionFormPage(page, FORM).expectSaved();
  };

  for (const { name, type, shown } of [
    { name: 'HIV followup', type: HIV_FOLLOWUP_ENCOUNTER_TYPE_UUID, shown: 1 },
    { name: 'HIV intake', type: HIV_INTAKE_ENCOUNTER_TYPE_UUID, shown: 0 },
    { name: 'PMTCT intake', type: PMTCT_INTAKE_ENCOUNTER_TYPE_UUID, shown: 0 },
  ]) {
    test(`adverse events and health condition: ${name} ${shown ? 'shows' : 'hides'} them`, async ({ page, createSectionEncounter }) => {
      // includeIf :67 (V1)
      await open(page, createSectionEncounter, type);
      await expect(page.locator('#hiv-adverse-event')).toHaveCount(shown);
      await expect(page.locator('#hiv-health-condition')).toHaveCount(shown);
      await expect(page.locator('#hiv-symptoms')).toHaveCount(1);
    });
  }

  test('the adverse-event table shows only when "adverse event" is ticked', async ({ page, createSectionEncounter }) => {
    // toggle :80
    await open(page, createSectionEncounter);
    const header = page.locator('#hiv-adverse-event > div > p input[type=checkbox]');
    await expect(page.locator('#ae')).toBeHidden();
    await header.check();
    await expect(page.locator('#ae')).toBeVisible();
    await header.uncheck();
    await expect(page.locator('#ae')).toBeHidden();
  });

  test('each adverse event enables its date only while its checkbox is ticked', async ({ page, createSectionEncounter }) => {
    // toggle :107 (7 rows) and :132 ("Other" row, with a comment box)
    await open(page, createSectionEncounter);
    await page.locator('#hiv-adverse-event > div > p input[type=checkbox]').check();
    const rows = page.locator('#ae table tr', { has: page.locator('input[type=checkbox]') });
    await expect(rows).toHaveCount(8);
    for (let i = 0; i < 8; i++) {
      const date = rows.nth(i).locator('input.hasDatepicker');
      await expect(date, `row ${i}`).toBeDisabled();
      await rows.nth(i).locator('input[type=checkbox]').check();
      await expect(date, `row ${i}`).toBeEnabled();
      await rows.nth(i).locator('input[type=checkbox]').uncheck();
      await expect(date, `row ${i}`).toBeDisabled();
    }
  });

  test('each symptom enables its radio, duration and unit while it is ticked', async ({ page, createSectionEncounter }) => {
    // toggle :181 on 19 rows (the three cells share one id, V2: all three still follow the checkbox)
    await open(page, createSectionEncounter);
    const rows = page.locator('#hiv-symptoms table tr', { has: page.locator('td[id]') });
    await expect(rows).toHaveCount(19);
    for (let i = 0; i < 19; i++) {
      const dependent = rows.nth(i).locator('td[id] input, td[id] select');
      const before = await dependent.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).disabled));
      expect(before.length).toBe(4); // yes/no radios, duration, unit
      expect(before.every(Boolean), `row ${i} dimmed`).toBeTruthy();
      await rows.nth(i).locator('input[type=checkbox]').first().check();
      const after = await dependent.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).disabled));
      expect(after.some(Boolean), `row ${i} enabled`).toBeFalsy();
    }
  });

  for (const { age, adult } of [
    { age: 30, adult: true },
    { age: 15, adult: true }, // :274 `age == 15` counts as adult
    { age: 14, adult: false },
    { age: 10, adult: false },
  ]) {
    test(`WHO stage lists for a patient of ${age}: ${adult ? 'adult' : 'paediatric'}`, async ({ page, createSectionEncounter }) => {
      // includeIf :274/:328/:385 (age >= 15) and :295/:350/:419 (age < 15): checkboxes per .who-stage block (1, 2, 3, 4)
      await open(page, createSectionEncounter, HIV_INTAKE_ENCOUNTER_TYPE_UUID, age);
      const counts = await page.locator('#hiv-who-stages .who-stage').evaluateAll((blocks) => blocks.map((b) => b.querySelectorAll('input[type=checkbox]').length));
      expect(counts).toEqual(adult ? [2, 8, 9, 21] : [2, 10, 12, 18]);
    });
  }

  test('saves symptoms, WHO stage, diagnoses comment and enrolls an adult in the HIV program; EDIT shows them', async ({ page, api, createSectionEncounter }) => {
    await open(page, createSectionEncounter);
    expect(await enrollments(api, section.patient.uuid)).toEqual([]);

    // adverse event (:80, :107): header checkbox, first row checkbox
    await page.locator('#hiv-adverse-event > div > p input[type=checkbox]').check();
    await page.locator('#ae table tr', { has: page.locator('input[type=checkbox]') }).first().locator('input[type=checkbox]').check();
    await page.locator('#hiv-health-condition input[type=radio]').first().check();
    // symptom (:181): second row (nausea): yes, 3 weeks
    const nausea = page.locator('#hiv-symptoms table tr', { has: page.locator('td[id]') }).nth(1);
    await nausea.locator('input[type=checkbox]').first().check();
    await nausea.locator('input[type=radio]').first().check(); // answers are listed No, Yes: first = No
    await nausea.locator('input[type=text]').fill('3');
    await nausea.locator('select').selectOption({ index: 2 });
    // WHO stage and its first stage-1 definition, no OI, free-text comment
    await page.locator('#hiv-who-stages p.radio input[type=radio]').nth(2).check(); // stage 3
    await page.locator('#hiv-who-stages .who-stage input[type=checkbox]').first().check();
    await page.locator('#hiv-dx input[type=checkbox]').first().check();
    await page.locator('#data-collection textarea:not([name=encounterDiagnoses])').first().fill('Clinically stable');
    await save(page);

    const displays = await obsDisplays(api, section.encounter.uuid);
    for (const expected of [
      'adverse effect construct: neuropathy', 'overall condition: good', 'sign/symptom name: nausea', 'sign/symptom duration: 3', 'time units: weeks', 'sign/symptom present: no',
      'current who hiv stage: who stage 3', 'problem added: asymptomatic hiv infection', 'current opportunistic infection: none',
      'clinical impression comments: clinically stable',
    ]) {
      expect(displays.some((d) => d.includes(expected)), expected).toBeTruthy();
    }
    expect(await enrollments(api, section.patient.uuid)).toEqual(['HIV']);

    await page.goto(SectionFormPage.editUrl(FORM, section));
    await expect(page.locator('#submit')).toBeVisible();
    // toggle :80/:181 start from the saved state
    await expect(page.locator('#ae')).toBeVisible();
    const saved = page.locator('#hiv-symptoms table tr', { has: page.locator('td[id]') }).nth(1);
    await expect(saved.locator('input[type=checkbox]').first()).toBeChecked();
    await expect(saved.locator('input[type=text]')).toBeEnabled();
    await expect(saved.locator('input[type=text]')).toHaveValue('3');
    const untouched = page.locator('#hiv-symptoms table tr', { has: page.locator('td[id]') }).nth(2);
    await expect(untouched.locator('input[type=text]')).toBeDisabled();
  });

  // VIEW on the visit page: the HIV followup type the save test needs for the adverse-event blocks has no hiv-assessment section on
  // the visit page (V1), so this test saves the rest on an HIV intake encounter, whose entry lists the section.
  test('the visit page shows the saved symptom, WHO stage and comment of an HIV intake encounter, and no button row', async ({ page, api, createSectionEncounter }) => {
    await open(page, createSectionEncounter, HIV_INTAKE_ENCOUNTER_TYPE_UUID);
    const nausea = page.locator('#hiv-symptoms table tr', { has: page.locator('td[id]') }).nth(1);
    await nausea.locator('input[type=checkbox]').first().check();
    await nausea.locator('input[type=radio]').first().check(); // answers are listed No, Yes: first = No
    await nausea.locator('input[type=text]').fill('3');
    await nausea.locator('select').selectOption({ index: 2 });
    await page.locator('#hiv-who-stages p.radio input[type=radio]').nth(2).check(); // stage 3
    await page.locator('#hiv-who-stages .who-stage input[type=checkbox]').first().check();
    await page.locator('#hiv-dx input[type=checkbox]').first().check();
    await page.locator('#data-collection textarea:not([name=encounterDiagnoses])').first().fill('Clinically stable');
    await save(page);

    // the saved answers appear under their blocks; the untouched symptom rows (showIfEmpty=false) and the button row do not
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, VIEW_LABELS);
    await expect(view.root.locator('#hiv-symptoms .value')).not.toHaveCount(0);
    await expect(view.root.locator('#hiv-who-stages .value')).not.toHaveCount(0);
    // the symptom rows are obsgroups with showIfEmpty=false: only nausea (3 values: answer, duration, unit) is rendered
    await expect(view.root.locator('#hiv-symptoms td[id="Nausea"] .value')).toHaveCount(3);
    await expect(view.root.locator('#hiv-symptoms td[id="Nausea"] .value').filter({ hasText: /^3$/ })).toHaveCount(1);
    await expect(view.root.locator('#hiv-symptoms td[id="Vomiting"]')).toHaveCount(0);
    await expect(view.root.locator('#buttons, #submit, #next, #cancel')).toHaveCount(0);
    // an intake encounter has no adverse-event or health-condition block (includeIf :67)
    await expect(view.root.locator('#hiv-adverse-event, #hiv-health-condition')).toHaveCount(0);
  });

  test('a one-year-old is not enrolled in the HIV program', async ({ page, api, createSectionEncounter }) => {
    // includeIf :62 (age at encounter > 1)
    await open(page, createSectionEncounter, HIV_INTAKE_ENCOUNTER_TYPE_UUID, 1);
    await save(page);
    expect(await enrollments(api, section.patient.uuid)).toEqual([]);
  });
});
