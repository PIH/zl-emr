import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type EntryContext } from '../../core';
import { LAB_RESULTS_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { VISIT_PAGE_URL, expectViewShowsSavedObs, visitPagePath } from '../../pages';
import { selectDefaultProvider } from '../../pages/provider';

// labResults.xml, ZL copy v2.1 (formUuid b437d585-..., HAI-1249; it shadows pihemr's v2.0 `5e1b0c3a-...`): "Lab results", one encounter of the 7 sections of
// the Simple UI navigator (Overview, Hematology, Biochemistry, Infectious disease, Urinalysis, Microbiology, Parasitology; ~120 result obs) with a "specimen
// collection date" that IS the encounter date, an "estimated" checkbox and a required "date of test results". What differs from pihemr's file (diff): the
// combined blood-type radio (PIH:BLOOD TYPING, `#blood-type`) is commented out, so blood type is only the ABO group (`#blood-type-group`) and the Rh radio
// (`#blood-rh`, which gains PIH:21808); the heading "Blood type" stays.
// Production: the "Lab Results" overall action (patient dashboard, no visit needed, `enterHtmlFormWithSimpleUi.page?patientId=..`) and the circular home app
// (_availability.e2e.md: `labResults`, Lab Results Location, `Task: emr.enterLabResults`; zl-ci offers it). The specs open the same URL without visitId from the
// harness's session location (Klinik Ekstèn): with a specimen date of today the encounter joins the fixture's active visit, with a back-dated one the server
// creates another visit for that date. The form calls NavigatorController (viral-load script), so every test uses the Simple UI, EDIT included
// (editHtmlFormWithSimpleUi.page). The provider is a hidden default (current user). No lab order is saved: the form only saves obs.
//
// Conditions in the form, from documentation inventory (labResults.inv.md; line numbers of the ZL file):
//   ifMode VIEW include=false :83, :536, :950, :1540  the script below; the shortcut links of Biochemistry, Infectious disease, Urinalysis
//   ifMode ENTER             :124                     default for "below detectable limit" (below)
//   includeIf gender F or age < 2 :828   Pregnancy test (b-hcg) of Biochemistry          (age as of today in ENTER)
//   includeIf age < 5 at the encounter date :1013   HIV PCR (hiv-pcr) of Infectious disease
//   includeIf gender F :1561   Pregnancy (urine-pregnancy) of Urinalysis
//   when PIH:SCANTY (TB smear CIEL:307) -> #tb-scanty (AFB number) :1105
// Scripts: :84-122 on load: (1) specimen collection date (encounter-date) change sets the minDate of the date of test results, and a test-date change sets the maxDate
//   of the specimen date; both start with maxDate = today; (2) viral-load toggle (also run on load, so EDIT starts right): "Detected" (CIEL:1301) enables the numeric load and
//   disables the lower-limit field, "Beyond detectable limit" (CIEL:1306) the reverse, no answer disables both. :125-134 (ENTER only): choosing "Beyond detectable limit" fills
//   the lower limit with 839 copies/mL, the Haiti national standard (right for ZL; wrong for other countries, see pihemr V5).
// Required: location (encounterLocation required, tag Lab Results Location, restrictToSessionVisitLocation), specimen collection date (prefilled with now), date of test results
//   (:200; may be after the specimen date, allowFutureDates).
// Side effects on save: postSubmissionAction SetObsDatesToSpecimenCollectionDateAction (:4) looks for a PIH:3038 "specimen collection date" obs; the form has none, so it does
//   nothing (pihemr V4): the obs dates come from the encounter date (tested).
// Visit-page display: the visit page shows this form's VIEW (encounterTypeConfig.js, 4d77916a: HFE VIEW through viewEncounterWithHtmlFormLong.page): expectViewShowsSavedObs.
// Not covered here: the shortcut links of the sections, the hepatitis B/C viral loads (same pattern as the HIV one), the overall-action launch from the patient dashboard
//   (a patient dashboard click, availability only), retrospective-entry gating, an encounter date later than the visit start (HFE's own rule).
//
// Findings: see pihemr _findings.e2e.md#labResults. They were recorded on kgh-ci against pihemr's v2.0 and apply to the ZL copy (same markup, lines +1 below :388): V1 Low
//   duplicate id urine-leuko, V2 Low the minDate of the results date is not applied on load, V3 Low label for= with no target, V4 Info dead post-submission action; V5 does not
//   apply (839 is the Haiti default); V6 Low (found on zl-ci) the "Control test" checkbox saves as "Rapid HIV antibody test result at 18 months of age: Yes" (concept CIEL:164860). None is a Medium/High bug, so there is no test.fixme. On zl-ci the date test confirms V2 (minDate null on load); V1 is the same template (`urine-{message}` with leuko, twice) in the ZL file.

const FORM = 'labResults.xml';
const DAY = 24 * 60 * 60 * 1000;
const SESSION_LOCATION = 'Klinik Ekstèn';

const newPatient = (createEntryContext: CustomTestFixtures['createEntryContext'], gender: 'M' | 'F' = 'F', age = 30) =>
  createEntryContext({ givenName: 'AutoLab', familyName: 'Tester', gender, birthdate: birthdateYearsAgo(age) });

// The production launch has no visitId (the encounter joins the active visit); returnUrl lands on the fixture visit's page.
const params = (context: EntryContext, extra: Record<string, string> = {}) =>
  new URLSearchParams({
    patientId: context.patient.uuid,
    definitionUiResource: `file:configuration/pih/htmlforms/${FORM}`,
    returnUrl: visitPagePath(context.visitUuid),
    ...extra,
  }).toString();
const openEnter = async (page: Page, context: EntryContext) => {
  await page.goto(`htmlformentryui/htmlform/enterHtmlFormWithSimpleUi.page?${params(context)}`);
  await expect(page.locator('#save-form')).toBeVisible();
};
const openEdit = async (page: Page, context: EntryContext, encounterUuid: string) => {
  await page.goto(`htmlformentryui/htmlform/editHtmlFormWithSimpleUi.page?${params(context, { encounterId: encounterUuid })}`);
  await expect(page.locator('#save-form')).toBeVisible();
};
// The navigator moves asynchronously: wait until the section is the focused one.
const goToQuestion = async (page: Page, label: string) => {
  await page.locator('li.question-legend', { hasText: new RegExp(`^\\s*${label}\\s*$`) }).click();
  await expect(page.locator('fieldset.focused legend')).toHaveText(label);
};
// "Save Form" validates and goes to the confirmation screen, whose Save button submits.
const save = async (page: Page) => {
  await page.locator('#save-form').click();
  await page.locator('button.submitButton:visible').click();
};
const saveAndWait = async (page: Page) => {
  await save(page);
  await expect(page).toHaveURL(VISIT_PAGE_URL);
};
// The datepickers (specimen collection date `encounter-date`, `test-date`) are read-only jQuery UI inputs; setDate also fills the submitted field.
const setDate = (page: Page, field: 'encounter-date' | 'test-date', date: Date) =>
  page.evaluate(
    ([f, ms]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).getField(`${f}.value`).datepicker('setDate', new Date(ms as number));
    },
    [field, date.getTime()],
  );
const dateOption = (page: Page, field: 'encounter-date' | 'test-date', option: 'minDate' | 'maxDate') =>
  page.evaluate(
    ([f, o]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (window as any).getField(`${f}.value`).datepicker('option', o);
      return d ? new Date(d).toDateString() : null;
    },
    [field, option],
  );
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const location = (page: Page) => page.locator('#encounterLocation select');
const fillOverview = async (page: Page, specimen: Date, tested: Date) => {
  await location(page).selectOption({ label: SESSION_LOCATION });
  await setDate(page, 'encounter-date', specimen);
  await setDate(page, 'test-date', tested);
};
const labEncounters = async (api: APIRequestContext, patientUuid: string) =>
  (await getPatientEncounters(api, patientUuid)).filter((e) => e.encounterType.uuid === LAB_RESULTS_ENCOUNTER_TYPE_UUID);

// Specimen collected `daysAgo` days ago, results dated the day after (allowed: allowFutureDates), results of 5 sections.
const saveResults = async (page: Page, api: APIRequestContext, createEntryContext: CustomTestFixtures['createEntryContext'], daysAgo = 0) => {
  const context = await newPatient(createEntryContext, 'F', 30);
  const specimen = new Date(Date.now() - daysAgo * DAY - 60_000);
  const tested = new Date(Math.min(specimen.getTime() + DAY, Date.now()));
  await openEnter(page, context);
  await fillOverview(page, specimen, tested);
  await page.locator('#sample-id input').fill('AUTO-1');
  await page.getByLabel('estimated', { exact: true }).check(); // PIH:11781 answered Yes
  await goToQuestion(page, 'Hematology');
  await page.locator('#hemoglobin input').fill('12.5');
  await page.locator('#hematology-comment textarea').fill('Sample slightly haemolysed');
  await goToQuestion(page, 'Biochemistry');
  await page.locator('#glucose-fasting input').fill('95');
  await goToQuestion(page, 'Infectious disease');
  await page.locator('#hiv-rapid-test input[type=radio]').first().check();
  await page.locator('#viral-load input[type=radio]').first().check(); // Detected
  await page.locator('#viral-load-numeric input').fill('500');
  await page.locator('#tb-smear-test input[type=radio]').nth(3).check(); // Scanty
  await page.locator('#tb-scanty input').fill('7');
  await goToQuestion(page, 'Urinalysis');
  await page.locator('#urinalysis-comment textarea').fill('Cloudy');
  await saveAndWait(page);

  const [encounter] = await labEncounters(api, context.patient.uuid);
  expect(encounter, 'one Lab Results encounter').toBeTruthy();
  return { context, specimen, tested, encounterUuid: encounter.uuid, obs: await getEncounterObs(api, encounter.uuid) };
};

// What the VIEW prints for the answers that the form labels differently from the concept (answerCodes, answerLabels) in the full-form test (obs display -> text shown).
const VIEW_LABELS: Record<string, string> = {
  'Urine color: Yellow color': 'Lemon yellow',
  'Urine aspect: Urine appears clear': 'Clear',
  'Rapid HIV antibody test result at 18 months of age: Yes': 'Control test', // the "control test" checkbox (:1004), see pihemr V6
  'Plasmodium species seen on smear: Positive for Plasmodium falciparum': 'Falciparum',
  'Plasmodium form seen on smear: Trophozoite of Plasmodium': 'Trophozoite',
  'Blood group cell type: Blood group A': 'A', // answerCodes A,B,AB,O of the blood-type group
  'Sickle cell RT SCAN: HbAA (Normal)': 'AA',
};

// Answers every control of the focused section of the navigator (only the visible, enabled ones, so the `when` and viral-load rules are respected) and returns how many
// answers that is. Radios, checkboxes and selects first (they enable or show other fields), then the number and text boxes: 1, or the minimum / maximum that the
// field's own error message ("Minimum: 20") asks for.
const fillFocusedSection = async (page: Page): Promise<string[]> =>
  page.evaluate(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const jq = (window as any).jq;
    const section = document.querySelector('fieldset.focused') as HTMLElement;
    const visible = (e: Element) => (e as HTMLElement).offsetParent !== null;
    const answers: string[] = [];
    const names = new Set<string>();
    section.querySelectorAll<HTMLInputElement>('input[type=radio]').forEach((r) => {
      if (visible(r) && !r.disabled && !names.has(r.name)) {
        names.add(r.name);
        r.click();
        answers.push('r:' + r.name);
      }
    });
    section.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((c) => {
      if (visible(c) && !c.disabled) {
        c.click();
        answers.push('c:' + c.name);
      }
    });
    section.querySelectorAll<HTMLSelectElement>('select').forEach((s) => {
      if (visible(s) && !s.disabled && s.options.length > 1) {
        s.selectedIndex = 1;
        jq(s).trigger('change');
        answers.push('s:' + s.name);
      }
    });
    const texts = Array.from(section.querySelectorAll<HTMLInputElement>('input[type=text]:not([readonly])')).filter((t) => visible(t) && !t.disabled);
    for (const t of texts) {
      jq(t).val('1').trigger('change').trigger('blur');
      answers.push('t:' + t.name);
    }
    section.querySelectorAll<HTMLTextAreaElement>('textarea').forEach((t) => {
      if (visible(t) && !t.disabled) {
        jq(t).val('AutoText').trigger('change').trigger('blur');
        answers.push('a:' + t.name);
      }
    });
    return answers;
  });

// The navigator checks a section when the user leaves it and shows "Minimum: 20" / "Maximum: 14" next to every number outside the concept's range; this sets each
// such box to the limit named in its own message. Returns how many it changed.
const fixRanges = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const jq = (window as any).jq;
    let fixed = 0;
    document.querySelectorAll('fieldset.focused span.field-error').forEach((e) => {
      const m = /(Minimum|Maximum): (\S+)/.exec((e as HTMLElement).innerText);
      const input = e.parentElement?.querySelector('input[type=text]');
      if (m && input) {
        jq(input).val(m[2]).trigger('change').trigger('blur');
        fixed++;
      }
    });
    return fixed;
  });
// Leaves the focused section for another; a section with a number outside its range does not let go ("Minimum: 20"): fix the ranges and try again.
const advance = async (page: Page, label: string) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator('li.question-legend', { hasText: new RegExp(`^\\s*${label}\\s*$`) }).click();
    const moved = await page.locator('fieldset.focused legend', { hasText: label }).waitFor({ timeout: 3000 }).then(() => true, () => false);
    if (moved) {
      return;
    }
    await fixRanges(page);
  }
  await goToQuestion(page, label);
};

test.describe('labResults', () => {
  test('opens by direct URL at the session location: seven sections, the session location preselected, provider defaulted, no visit needed in the URL', async ({ page, createEntryContext }) => {
    await openEnter(page, await newPatient(createEntryContext));
    await expect(page.locator('li.question-legend')).toHaveText(['Overview', 'Hematology', 'Biochemistry', 'Infectious disease', 'Urinalysis', 'Microbiology', 'Parasitology']);
    // encounterLocation tags="Lab Results Location" restrictToSessionVisitLocation (:161): the session location carries the tag
    await expect(location(page).locator('option').filter({ hasText: new RegExp(`^\\s*${SESSION_LOCATION}\\s*$`) })).toHaveCount(1);
    await expect(location(page).locator('option:checked')).toHaveText(SESSION_LOCATION);
    // the hidden "Who?" block (:2091): current user as provider (a provider is preselected)
    await expect(page.locator('#encounter-details select').first().locator('option:checked')).not.toHaveText(/^\s*(Choose.*)?$/);
  });

  test('saving without a location, then without the date of test results, reports Required and does not save', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext);
    await openEnter(page, context);
    await location(page).selectOption('');
    await page.locator('#save-form').click();
    await expect(page.locator('#encounterLocation span.field-error')).toHaveText('Required'); // encounterLocation required :161
    expect(await labEncounters(api, context.patient.uuid)).toHaveLength(0);

    await location(page).selectOption({ label: SESSION_LOCATION });
    await page.locator('#save-form').click();
    await expect(page.locator('#test-date span.field-error')).toHaveText('Required'); // required="true" :200
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await labEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test.describe('date scripts (:103-111)', () => {
    test('V2 both dates start with maxDate = today; the specimen date sets the earliest date of the results and the results date the latest specimen date', async ({ page, createEntryContext }) => {
      await openEnter(page, await newPatient(createEntryContext));
      const today = new Date().toDateString();
      expect(await dateOption(page, 'encounter-date', 'maxDate')).toBe(today);
      expect(await dateOption(page, 'test-date', 'maxDate')).toBe(today);
      // V2 (pihemr): on load the date of test results has no minDate, only a change of the specimen date sets it
      expect(await dateOption(page, 'test-date', 'minDate')).toBeNull();

      const specimen = new Date(Date.now() - 5 * DAY);
      await setDate(page, 'encounter-date', specimen);
      await page.locator('#encounter-date input').first().dispatchEvent('change');
      expect(await dateOption(page, 'test-date', 'minDate')).toBe(specimen.toDateString());

      const tested = new Date(Date.now() - 2 * DAY);
      await setDate(page, 'test-date', tested);
      await page.locator('#test-date input').first().dispatchEvent('change');
      expect(await dateOption(page, 'encounter-date', 'maxDate')).toBe(tested.toDateString());
    });
  });

  test.describe('age and gender conditions', () => {
    // includeIf :828 (female or < 2 years: b-hcg), :1013 (< 5 years: hiv-pcr), :1561 (female: urine-pregnancy)
    const profiles = [
      { name: 'adult woman', gender: 'F', age: 30, bhcg: 1, pcr: 0, urinePregnancy: 1 },
      { name: 'adult man', gender: 'M', age: 30, bhcg: 0, pcr: 0, urinePregnancy: 0 },
      { name: '1-year-old boy', gender: 'M', age: 1, bhcg: 1, pcr: 1, urinePregnancy: 0 },
      { name: '3-year-old boy', gender: 'M', age: 3, bhcg: 0, pcr: 1, urinePregnancy: 0 },
      { name: '3-year-old girl', gender: 'F', age: 3, bhcg: 1, pcr: 1, urinePregnancy: 1 },
    ] as const;
    for (const p of profiles) {
      test(`${p.name}: pregnancy test ${p.bhcg ? 'shown' : 'absent'}, HIV PCR ${p.pcr ? 'shown' : 'absent'}, urine pregnancy ${p.urinePregnancy ? 'shown' : 'absent'}`, async ({ page, createEntryContext }) => {
        await openEnter(page, await newPatient(createEntryContext, p.gender, p.age));
        await expect(page.locator('#b-hcg')).toHaveCount(p.bhcg);
        await expect(page.locator('#hiv-pcr')).toHaveCount(p.pcr);
        await expect(page.locator('#urine-pregnancy')).toHaveCount(p.urinePregnancy);
      });
    }
  });

  test('TB smear: the AFB number box shows only for "Scanty" (when :1105)', async ({ page, createEntryContext }) => {
    await openEnter(page, await newPatient(createEntryContext));
    await fillOverview(page, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000)); // the navigator lets the user move on once the Overview's required fields are answered
    await goToQuestion(page, 'Infectious disease');
    const smear = page.locator('#tb-smear-test input[type=radio]');
    await expect(page.locator('#tb-scanty')).toBeHidden();
    await smear.nth(3).check(); // Scanty
    await expect(page.locator('#tb-scanty input')).toBeVisible();
    await smear.nth(0).check(); // +++
    await expect(page.locator('#tb-scanty')).toBeHidden();
  });

  test.describe('HIV viral load (script :84-122, :125-134)', () => {
    const numeric = (page: Page) => page.locator('#viral-load-numeric input');
    const lowerLimit = (page: Page) => page.locator('#detected-lower-limit input');

    test('no answer disables both fields; Detected enables the load; Beyond detectable limit enables the lower limit (default 839 in ENTER)', async ({ page, createEntryContext }) => {
      await openEnter(page, await newPatient(createEntryContext));
      await fillOverview(page, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
      await goToQuestion(page, 'Infectious disease');
      const answer = page.locator('#viral-load input[type=radio]');
      await expect(numeric(page)).toBeDisabled();
      await expect(lowerLimit(page)).toBeDisabled();

      await answer.nth(0).check(); // Detected CIEL:1301
      await expect(numeric(page)).toBeEnabled();
      await expect(lowerLimit(page)).toBeDisabled();

      await answer.nth(1).check(); // Beyond detectable limit CIEL:1306
      await expect(numeric(page)).toBeDisabled();
      await expect(lowerLimit(page)).toBeEnabled();
      await expect(lowerLimit(page)).toHaveValue('839'); // ENTER only :125-134

      await answer.nth(0).check();
      await expect(numeric(page)).toBeEnabled();
      await expect(lowerLimit(page)).toBeDisabled();
    });
  });

  test('blood type (HAI-1249): the combined blood-type radio is gone; the ABO group and the Rh radio (with its extra answer) are saved', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext);
    await openEnter(page, context);
    await fillOverview(page, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
    await goToQuestion(page, 'Hematology');
    await expect(page.locator('#blood-type')).toHaveCount(0); // commented out in the ZL copy (:388-393)
    await expect(page.locator('h4', { hasText: /blood type/i })).toBeVisible(); // its heading stays
    const group = page.locator('#blood-type-group input[type=radio]');
    const rh = page.locator('#blood-rh input[type=radio]');
    await expect(group).toHaveCount(4); // CIEL:163115..163118: A, B, AB, O (answerCodes)
    await expect(page.locator('#blood-type-group')).toContainText('AB');
    await expect(rh).toHaveCount(3); // CIEL:703, CIEL:664 and PIH:21808 added by HAI-1249
    const rhLabels = (await page.locator('#blood-rh label').allTextContents()).map((t) => t.trim()).filter(Boolean);
    expect(rhLabels.length, `Rh answers: ${rhLabels.join(', ')}`).toBe(3);
    await group.nth(2).check(); // AB
    await rh.nth(2).check(); // the answer HAI-1249 added
    await saveAndWait(page);
    const [encounter] = await labEncounters(api, context.patient.uuid);
    const displays = (await getEncounterObs(api, encounter.uuid)).map((o) => o.display.toLowerCase());
    expect(displays.some((d) => /ab/.test(d) && /blood/.test(d)), `ABO group among ${displays.join(' | ')}`).toBeTruthy();
    expect(displays.length).toBe(3); // date of test results, ABO group, Rh
  });

  // Every field of the form once, filled the generic way (the first answer of every radio group, 1 or the concept's minimum / maximum in every number box, text in every text
  // area, every checkbox ticked, the first option of every select), for a 3-year-old girl so that the age and gender conditions all show (b-hcg, hiv-pcr, urine-pregnancy).
  // The saved obs are then compared with what was filled in, and the VIEW on the visit page must show every one of them.
  test('every field: one obs per answered control is saved and the VIEW shows all of them', async ({ page, api, createEntryContext }) => {
    test.setTimeout(240_000); // ~200 controls through the navigator, the confirmation page, then the visit page and its VIEW
    const context = await newPatient(createEntryContext, 'F', 3);
    await openEnter(page, context);
    await fillOverview(page, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
    await page.locator('#sample-id input').fill('AUTO-ALL');
    const names: string[] = [];
    const answeredBase = 2; // sample id, date of test results (the "estimated" checkbox is left unticked: it is tested with the targeted save)
    for (const section of ['Hematology', 'Biochemistry', 'Infectious disease', 'Urinalysis', 'Microbiology', 'Parasitology']) {
      await advance(page, section);
      names.push(...(await fillFocusedSection(page)));
    }
    await page.locator('#save-form').click();
    if (!(await page.locator('button.submitButton:visible').waitFor({ timeout: 3000 }).then(() => true, () => false))) {
      await fixRanges(page); // the last section's numbers are checked on Save Form
      await page.locator('#save-form').click();
    }
    await page.locator('button.submitButton:visible').click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    const [encounter] = await labEncounters(api, context.patient.uuid);
    const obs = await getEncounterObs(api, encounter.uuid, 500);
    const answered = answeredBase + names.length;
    // the REST obs list holds the members of an obs group as obs of their own, and the group obs itself: do not count the latter (the HIV rapid test, the viral loads)
    const groups = await (await api.get(`obs?encounter=${encounter.uuid}&v=custom:(groupMembers:(uuid))&limit=500`)).json();
    const groupObs = (groups.results as Array<{ groupMembers: unknown[] | null }>).filter((o) => o.groupMembers && o.groupMembers.length > 0).length;
    expect(groupObs, 'obs groups saved (the form has four obsgroup tags)').toBe(4);
    // one obs per answer, except that a comment box (showCommentField, e.g. the HIV PCR) is saved in the comment of its obs and is not an obs of its own
    const withComments = await (await api.get(`obs?encounter=${encounter.uuid}&v=custom:(comment)&limit=500`)).json();
    const comments = (withComments.results as Array<{ comment: string | null }>).filter((o) => o.comment).length;
    expect(comments, 'comment boxes answered: the HIV PCR has one').toBeGreaterThan(0);
    const saved = obs.length - groupObs;
    expect(saved, `obs saved (${obs.length}, ${groupObs} of them groups) vs controls answered (${answered}, ${comments} of them comment boxes)`).toBe(answered - comments);
    expect(new Set(obs.map((o) => o.concept.uuid)).size, 'no concept is saved twice').toBe(obs.length);
    // and every answered control is filled again when the encounter is opened for EDIT (the control names are the same: same fields in the same order)
    await openEdit(page, context, encounter.uuid);
    const empty = await page.evaluate(
      (ns) =>
        ns
          .map((n) => ({ kind: n.slice(0, 1), name: n.slice(2) }))
          .filter(({ name }) => !(Array.from(document.getElementsByName(name)) as HTMLInputElement[]).some((e) => (e.type === 'radio' || e.type === 'checkbox' ? e.checked : !!e.value)))
          .map(({ name }) => name),
      names,
    );
    expect(empty, 'answered controls that are empty after a reload in EDIT').toEqual([]);
    // every saved text and number appears in the VIEW; a coded answer by its concept name (or the label the form gives it)
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, VIEW_LABELS, 500);
    expect(await view.values.count(), 'the VIEW shows a value for every saved obs that is not a group').toBeGreaterThanOrEqual(saved);
  });

  test('saves the results under the specimen collection date: encounter and obs dates are the specimen date', async ({ page, api, createEntryContext }) => {
    // encounterDate :185 is the specimen date; the post-submission action does nothing (pihemr V4), the obs dates come from the encounter
    const { specimen, encounterUuid, obs } = await saveResults(page, api, createEntryContext, 3);
    const displays = obs.map((o) => o.display);

    expect(displays.some((d) => /^Hemoglobin: 12\.5/i.test(d))).toBe(true);
    expect(displays.some((d) => /^Fasting blood glucose: 95/i.test(d))).toBe(true);
    expect(displays.some((d) => /AUTO-1/.test(d))).toBe(true);
    expect(displays.some((d) => /Estimated.*Yes/i.test(d))).toBe(true); // PIH:11781
    expect(displays.some((d) => /Sample slightly haemolysed/.test(d))).toBe(true);
    expect(displays.some((d) => /500/.test(d))).toBe(true); // viral load
    expect(displays.some((d) => /Cloudy/.test(d))).toBe(true);
    expect(obs.some((o) => o.concept.display === 'Date of test results')).toBe(true);
    expect(displays.some((d) => /potassium|sodium|creatinine/i.test(d))).toBe(false); // not filled in

    const encounter = await (await api.get(`encounter/${encounterUuid}?v=custom:(encounterDatetime,location:(display),visit:(uuid))`)).json();
    expect(String(encounter.encounterDatetime).startsWith(isoDate(specimen))).toBe(true);
    expect(encounter.location.display).toBe(SESSION_LOCATION);
    const dated = await (await api.get(`obs?encounter=${encounterUuid}&v=custom:(concept:(display),obsDatetime)&limit=200`)).json();
    const dates = (dated.results as Array<{ concept: { display: string }; obsDatetime: string }>).filter((o) => o.concept.display !== 'Date of test results');
    expect(dates.length).toBeGreaterThan(5);
    for (const o of dates) {
      expect(o.obsDatetime.startsWith(isoDate(specimen)), `${o.concept.display} is dated ${o.obsDatetime}`).toBe(true);
    }
  });

  test('EDIT starts from the saved results (viral-load toggle included) and a changed value replaces the saved one', async ({ page, api, createEntryContext }) => {
    const { context, encounterUuid } = await saveResults(page, api, createEntryContext, 0);

    await openEdit(page, context, encounterUuid);
    await goToQuestion(page, 'Hematology');
    await expect(page.locator('#hemoglobin input')).toHaveValue('12.5');
    await goToQuestion(page, 'Infectious disease');
    await expect(page.locator('#viral-load input[type=radio]').first()).toBeChecked();
    await expect(page.locator('#viral-load-numeric input')).toHaveValue('500');
    await expect(page.locator('#viral-load-numeric input')).toBeEnabled(); // toggle run on load (EDIT)
    await expect(page.locator('#detected-lower-limit input')).toBeDisabled();
    await expect(page.locator('#tb-scanty input')).toHaveValue('7'); // when :1105 starts from the saved answer
    await goToQuestion(page, 'Hematology');
    await page.locator('#hemoglobin input').fill('13');
    await saveAndWait(page);

    const after = (await getEncounterObs(api, encounterUuid)).map((o) => o.display);
    expect(after.some((d) => /^Hemoglobin: 13/i.test(d))).toBe(true);
    expect(after.some((d) => /^Hemoglobin: 12\.5/i.test(d))).toBe(false);
    expect(after.some((d) => /^Fasting blood glucose: 95/i.test(d))).toBe(true);
  });

  test('VIEW on the visit page (Lab Results entry): the saved results under their ids, nothing for the others, no Save button', async ({ page, api, createEntryContext }) => {
    test.slow(); // the encounter is saved through the navigator, then the visit page is loaded
    const { encounterUuid, obs } = await saveResults(page, api, createEntryContext, 0);
    const estimated = obs.find((o) => /^Estimated/i.test(o.display))?.display ?? '';
    // the checkbox shows its own label (answerCode pihcore.date_estimated), not the concept name
    const view = (await expectViewShowsSavedObs(page, api, FORM, encounterUuid, { [estimated]: '[X] estimated' })).page;

    await expect(view.locator('#hemoglobin .value')).toContainText('12.5');
    await expect(view.locator('#glucose-fasting .value')).toContainText('95');
    await expect(view.locator('#viral-load-numeric .value')).toContainText('500');
    await expect(view.locator('#tb-scanty .value')).toContainText('7');
    await expect(view.locator('#hiv-pcr .value')).toHaveCount(0); // not filled in (and not offered to an adult)
    await expect(view.locator('#save-form, button.submitButton')).toHaveCount(0); // ifMode VIEW include=false
  });
});
