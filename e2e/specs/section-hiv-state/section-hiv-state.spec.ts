import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type SectionEncounter } from '../../core';
import { HIV_FOLLOWUP_ENCOUNTER_TYPE_UUID, PMTCT_FOLLOWUP_ENCOUNTER_TYPE_UUID, SESSION_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage, ViewFormPage, expectViewShowsSavedObs, VISIT_PAGE_URL } from '../../pages';

// hiv/section-hiv-state.xml v4.0: "HIV Clinical State" section of the HIV followup (c31d3312) and PMTCT followup (95e03e7d)
// encounters: CHW name, current treatment (ARV, anti-TB, prophylaxis), complaint, TB screening, radiology, sexual
// activity / family planning / pregnancy / delivery, breastfeeding, syphilis (PMTCT), psychosocial, adherence, adverse
// events, progress, WHO stage, opportunistic infections. The specs open its edit URL on a REST-created parent encounter
// (documentation/_availability.e2e.md). VIEW is tested through getAsHtml.action on the saved encounter (end of the save test):
// every saved obs is shown, dates as dd MMM yyyy, unanswered blocks and adverse-event rows show no value.
//
// Conditions (section-hiv-state.inv.md); the same patient/encounter-type matrix is table-driven in the first describe:
//   includeIf age at encounter > 8 and F   :592 (EDD script), :1305 (pregnancy), :1379 (delivery);  age < 12 :761 (feeding + stage)
//   includeIf age >= 12 :1499 (post-test counselling, advice), :1661 (stage);  encounter type = HIV followup and F :1411
//     (breastfeeding), = PMTCT followup :1438 (syphilis), :1709 (evaluation), :1755 (breastfeeding since last visit)
//   includeIf/excludeIf CIEL:164141 (CHW name) already on the encounter :105 (big script), :608, :615; ifMode EDIT :626
//   when :831 :870 :948 :1315 :1391 :1421 :1565 :1721 :1767 :1776 (table-driven);  dim/show toggles :1005-1077, :1198, :1234-1287,
//     :1446-1478, :1605-1631;  includeIf gender == 'NoLabEntryHere' :659, :1675 (never true);  ifMode VIEW include=false :7 :559 :1791
// Scripts: :97-103 i18n messages. :106-555 (absent once the encounter has a CHW name): REST prefill from the patient's latest
//   obs: last CHW name (#lastRecorded-CHW-div, "change" checkbox), ART start date, regimen (#currentARV1), ART treatment line,
//   INH start/stop dates and line; confirm boxes (#confirmOverlay) when the regimen select or the treatment line changes.
//   :563-573 date-range validation, EDD, INH helper (shared: zl.js), Next/Save. :593-599 EDD <-> LMP (mch.js). :1138 shows the TB
//   screening result only when it has a value. Shared helpers: see _shared.e2e.md.
// Side effects on save: enrollInProgram HIV :578 (tested); CleanDiagnosisConstructAction :4 (pihcore, unverified: no OI picked).
// Not covered here: the OI autocomplete (:1696) and what CleanDiagnosisConstructAction does with it; INH stop-date prefill
//   (same code as the start date, V2); the other prefills (allergies, prophylaxis line); the date-range helper
//   (setUpDatepickerStartAndEndDateValidation); Next (needs the visit page); lab block :659 (dead markup).
//
// Findings:
//   V1 High   :255-261 changing #currentARV1 calls getRegiment() first, which resets the select to the patient's latest regimen
//                      once the REST call returns; "Yes" does nothing. With a previous regimen the user can never record a new one.
//                      Fix: do not call getRegiment() in the change handler; make the Yes callback keep the choice. (TESTED, test.fixme)
//   V2 Medium :364-392,:474-490  getProphylaxisDate() reads CIEL:163526/164384, the start/stop concepts of EVERY prophylaxis row
//                      (cotrimoxazole, ...), and puts the latest into the INH dates. A patient who only took cotrimoxazole sees (and
//                      saves, once INH is ticked) its start date as INH start date. Fix: filter by the INH group. (TESTED, test.fixme)
//   V3 Medium :568 manageInputActivationForRadioButton (5 parameters) is called with 4: the message string becomes
//                      requiredWidgetIds and requiredMsg is undefined, so INH with no line, or a line without start date, saves
//                      (empty "required" span). Fix: pass ["#inhStartDate"] and the message like section-hiv-history. (TESTED, test.fixme x2)
//   V4 Medium :242-253,:276 localStorage 'previousTreatmentLineValue' is set when a patient has a line and never cleared: for a patient
//                      with none, the next treatment-line pick asks "Previous value was <another patient's line>", and "No"
//                      selects that line. Fix: clear it on load when no line is found. (TESTED, test.fixme)
//   V5 Medium :213-219,:636-641 unticking #changeChw only hides #editChwNameDiv: the typed CHW name is still submitted. Fix: clear the input. (TESTED, test.fixme)
//   V6 Low    :640,:648 (+:612) three obs share id="chwName"; in EDIT without a CHW obs two are rendered together. Fix: distinct ids.
//   V7 Low    :507-516 duplicate keys in getStringValue(): the French labels overwrite the English ones, so the confirm text says "to 1ère".
//   V8 Low    :1386-1388 singular answerCode beside answerConceptIds is ignored (labels are the defaults); :586-587 confirm buttons hardcoded English.
//   V9 Info   :659,:1675 lab blocks wrapped in gender == 'NoLabEntryHere' are dead markup (duplicate *-lab-toggle ids with them).
//   V10 Info  duplicate ids hiv-state-stage, id-breastfeeding, breastfeeding-mom, wean-date (:763/:1663, :1414/:1757, ...) are in
//                      mutually exclusive includeIfs (age, encounter type): never rendered together (asserted below).
//   See _shared V1 (EDD > 10 months after the encounter is never flagged; TESTED, test.fixme), _shared V2 (INH re-tick: not reproduced
//   here, re-ticking re-enables the dates and unticking clears the line).

const FORM = 'hiv/section-hiv-state.xml';
const CHW_CONCEPT_UUID = '164141AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; // CIEL:164141, the uuid the form's script queries
const ART_START_DATE_UUID = '159599AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; // CIEL:159599
const REGIMEN_UUID = '3cd9491e-26fe-102b-80cb-0017a47871b2'; // CIEL:1282, queried by getRegiment()
const TREATMENT_LINE_UUID = '0c709500-0cf8-4959-b244-3e9d24dcacc0'; // PIH:13115, queried by getArtTreatmentLine()
const PROPHYLAXIS_START_DATE_UUID = '163526AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; // CIEL:163526, shared by every prophylaxis row

// Local helpers.
// Date as the VIEW shows it ("15 Mar 2024").
const viewDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
};
const pad = (n: number) => String(n).padStart(2, '0');
const localIso = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// The date inputs are read-only datepickers: set the date the way the picker does. The handlers (mch.js) listen on the
// hidden input's change event, so both inputs get one.
const pickDate = async (page: Page, wrapper: string, iso: string) => {
  await page.evaluate(
    ([w, d]) => {
      type Jq = (s: string) => { datepicker: (...a: unknown[]) => void; trigger: (n: string) => void };
      const j = (window as unknown as { jq: Jq }).jq;
      j(`${w} input.hasDatepicker`).datepicker('setDate', new Date(`${d}T12:00:00`));
      j(`${w} input.hasDatepicker`).trigger('change');
      j(`${w} input[type=hidden]`).trigger('change');
    },
    [wrapper, iso],
  );
};

const conceptUuid = async (api: APIRequestContext, source: string, code: string): Promise<string> => {
  const res = await api.get(`concept?source=${source}&code=${code}&v=custom:(uuid)`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).results[0].uuid;
};

// An earlier encounter of the (synthetic) patient, yesterday and without a visit, carrying the given obs. The form's
// scripts read the patient's latest obs over REST, so this is what they find.
const priorEncounter = async (api: APIRequestContext, section: SectionEncounter, obs: Array<Record<string, unknown>>) => {
  const res = await api.post('encounter', {
    data: {
      patient: section.patient.uuid,
      encounterType: HIV_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      location: SESSION_LOCATION_UUID,
      encounterDatetime: new Date(Date.now() - 86400000).toISOString(),
      obs,
    },
  });
  expect(res.ok(), `create prior encounter: ${res.status()}`).toBeTruthy();
};

const displays = async (api: APIRequestContext, section: SectionEncounter): Promise<string[]> =>
  (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display.toLowerCase());

const radio = (page: Page, wrapperId: string, index: number) => page.locator(`#${wrapperId} input[type=radio]`).nth(index);

// Waits for the form's REST prefills to finish (they run on load and would overwrite what a test types).
const settle = async (page: Page) => {
  await page.waitForLoadState('networkidle');
};

test.describe('section-hiv-state @hiv-ci', () => {
  const start = async (
    page: Page,
    createSectionEncounter: (o: { encounterTypeUuid: string; patient: { givenName: string; familyName: string; gender: 'M' | 'F'; birthdate: string } }) => Promise<SectionEncounter>,
    opts: { gender?: 'M' | 'F'; age?: number; type?: string; open?: boolean } = {},
  ): Promise<SectionEncounter> => {
    const section = await createSectionEncounter({
      encounterTypeUuid: opts.type ?? HIV_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoState', familyName: 'Tester', gender: opts.gender ?? 'F', birthdate: birthdateYearsAgo(opts.age ?? 30) },
    });
    if (opts.open !== false) {
      await SectionFormPage.openEdit(page, FORM, section);
      await settle(page);
    }
    return section;
  };

  const save = async (page: Page) => {
    await page.locator('#submit').click();
    await new SectionFormPage(page, FORM).expectSaved();
  };

  // ---- includeIf: patient age/gender and parent encounter type ----
  const HIV = HIV_FOLLOWUP_ENCOUNTER_TYPE_UUID;
  const PMTCT = PMTCT_FOLLOWUP_ENCOUNTER_TYPE_UUID;
  const PREGNANCY = '#hivpregnant';
  const DELIVERY = '#hiv-delivery';
  const FEEDING = '#feeding';
  const BF = '#id-breastfeeding';
  const PMTCT_ONLY = ['#syphilis-section', '#id-ev-treatment-cont', '#breast-since-visit'];
  const matrix: Array<{ name: string; gender: 'M' | 'F'; age: number; type: string; present: string[]; absent: string[]; psych: boolean }> = [
    { name: 'woman 30 y, HIV followup', gender: 'F', age: 30, type: HIV, present: [PREGNANCY, DELIVERY, BF], absent: [FEEDING, ...PMTCT_ONLY], psych: true },
    { name: 'man 30 y, HIV followup', gender: 'M', age: 30, type: HIV, present: [], absent: [PREGNANCY, DELIVERY, BF, FEEDING, ...PMTCT_ONLY], psych: true },
    { name: 'woman 30 y, PMTCT followup', gender: 'F', age: 30, type: PMTCT, present: [PREGNANCY, DELIVERY, BF, ...PMTCT_ONLY], absent: [FEEDING], psych: true },
    { name: 'girl 9 y (> 8 and < 12), HIV followup', gender: 'F', age: 9, type: HIV, present: [PREGNANCY, DELIVERY, BF, FEEDING], absent: PMTCT_ONLY, psych: false },
    { name: 'girl 8 y (not > 8), HIV followup', gender: 'F', age: 8, type: HIV, present: [BF, FEEDING], absent: [PREGNANCY, DELIVERY, ...PMTCT_ONLY], psych: false },
    { name: 'girl 12 y (the == 12 clause), HIV followup', gender: 'F', age: 12, type: HIV, present: [PREGNANCY, DELIVERY, BF], absent: [FEEDING, ...PMTCT_ONLY], psych: true },
    { name: 'boy 5 y, HIV followup', gender: 'M', age: 5, type: HIV, present: [FEEDING], absent: [PREGNANCY, DELIVERY, BF, ...PMTCT_ONLY], psych: false },
  ];

  for (const v of matrix) {
    test(`blocks rendered for a ${v.name}`, async ({ page, createSectionEncounter }) => {
      // includeIf :592/:1305/:1379 (> 8, F), :761 (< 12), :1499/:1661 (>= 12), :1411 (HIV followup, F), :1438/:1709/:1755 (PMTCT followup)
      await start(page, createSectionEncounter, { gender: v.gender, age: v.age, type: v.type });
      for (const sel of v.present) {
        await expect(page.locator(sel), `${v.name}: ${sel}`).toHaveCount(1);
      }
      for (const sel of v.absent) {
        await expect(page.locator(sel), `${v.name}: ${sel}`).toHaveCount(0);
      }
      // :1499 the psychosocial checkboxes (post-test counselling advice) exist from 12 y
      await expect(page.locator('#psych input[type=checkbox]')).toHaveCount(v.psych ? 5 : 0);
      // V10: the two WHO-stage sections (:763 < 12, :1663 >= 12) are never rendered together; V9: dead lab block
      await expect(page.locator('#hiv-state-stage')).toHaveCount(1);
      await expect(page.locator('#hiv-surveillance')).toHaveCount(0);
    });
  }

  // ---- when: an answer shows a block ----
  type WhenRow = { wrapper: string; show: number; hide: number; target: string };
  const checkWhen = async (page: Page, rows: WhenRow[]) => {
    for (const r of rows) {
      const targets = page.locator(r.target);
      const n = await targets.count();
      expect(n, `${r.wrapper}: ${r.target} exists`).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        await expect(targets.nth(i), `${r.wrapper}: hidden at start`).toBeHidden();
      }
      await radio(page, r.wrapper, r.show).check();
      for (let i = 0; i < n; i++) {
        await expect(targets.nth(i), `${r.wrapper}: shown by answer ${r.show}`).toBeVisible();
      }
      await radio(page, r.wrapper, r.hide).check();
      for (let i = 0; i < n; i++) {
        await expect(targets.nth(i), `${r.wrapper}: hidden by answer ${r.hide}`).toBeHidden();
      }
    }
  };

  test('when: ARV, anti-TB, pregnancy, delivery, breastfeeding stopped and CHW visit answers show their blocks (HIV followup, woman)', async ({ page, createSectionEncounter }) => {
    await start(page, createSectionEncounter);
    await checkWhen(page, [
      { wrapper: 'takingARVs', show: 0, hide: 1, target: '#current-arvs' }, // :870 Yes
      { wrapper: 'takingAntiTB', show: 0, hide: 1, target: '.current-tb-meds' }, // :948 Yes (two blocks)
      { wrapper: 'hivpregnant', show: 0, hide: 1, target: '#pregnant' }, // :1315 Yes
      { wrapper: 'hiv-delivery', show: 0, hide: 1, target: '#delivery' }, // :1391 Yes
      { wrapper: 'breastfeeding-mom', show: 1, hide: 0, target: '#wean-date' }, // :1421 Stopped (HIV followup: Currently / Stopped)
      { wrapper: 'chwVisit', show: 1, hide: 0, target: '#reason-without-chw' }, // :1565 No
    ]);
  });

  test('when: the vaccination card block follows the "vaccinated" answer (child < 12 y)', async ({ page, createSectionEncounter }) => {
    await start(page, createSectionEncounter, { age: 5 });
    await checkWhen(page, [{ wrapper: 'vaccinate', show: 0, hide: 1, target: '#vaccinationCard' }]); // :831 Yes
  });

  test('when: PMTCT followup evaluation and breastfeeding answers show their blocks', async ({ page, createSectionEncounter }) => {
    await start(page, createSectionEncounter, { type: PMTCT });
    await checkWhen(page, [
      { wrapper: 'daily-dose-arv', show: 1, hide: 0, target: '#side-by-side-reason' }, // :1721 No
      { wrapper: 'breast-since-visit', show: 0, hide: 1, target: '#bf-status' }, // :1767 Yes
    ]);
    // :1776 Stopped (third answer) shows the weaning date inside #bf-status; picking No above hid both
    await radio(page, 'breast-since-visit', 0).check();
    await checkWhen(page, [{ wrapper: 'breastfeeding-mom', show: 2, hide: 0, target: '#wean-date' }]);
  });

  test('a hidden dependent field is not saved (LMP typed, then pregnancy set to No)', async ({ page, api, createSectionEncounter }) => {
    // when :1315 only hides #pregnant; HFE leaves the hidden inputs out of the submission
    const section = await start(page, createSectionEncounter);
    await radio(page, 'hivpregnant', 0).check();
    await pickDate(page, '#lastPeriodDate', localIso(-60));
    await radio(page, 'hivpregnant', 1).check();
    await save(page);
    const concepts = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.concept.uuid);
    expect(concepts, 'the pregnancy answer is saved').toContain(await conceptUuid(api, 'CIEL', '5272'));
    expect(concepts, 'the hidden LMP is not').not.toContain(await conceptUuid(api, 'CIEL', '1427'));
  });

  // ---- toggle: checkbox shows / un-dims a block ----
  type ToggleRow = { checkbox: string; target: string };
  // 'dim' toggles: the target starts at opacity 0.5 with disabled inputs; ticking the box clears both.
  const checkDim = async (page: Page, rows: ToggleRow[]) => {
    for (const r of rows) {
      const target = page.locator(r.target).first();
      await expect(target, `${r.target} dimmed`).toHaveCSS('opacity', '0.5');
      await expect(target.locator('input').first(), `${r.target} disabled`).toBeDisabled();
      await page.locator(r.checkbox).first().check();
      await expect(target, `${r.target} un-dimmed`).toHaveCSS('opacity', '1');
      await expect(target.locator('input').first(), `${r.target} enabled`).toBeEnabled();
      await page.locator(r.checkbox).first().uncheck();
      await expect(target, `${r.target} dimmed again`).toHaveCSS('opacity', '0.5');
    }
  };

  test('toggle: each prophylaxis row (cotrimoxazole, isoniazid, rifapentine, fluconazole, dapsone, other) un-dims its dates', async ({ page, createSectionEncounter }) => {
    await start(page, createSectionEncounter);
    // :1005 :1027 :1055; "Other" (:1077) has the braces in its toggle id but is dimmed all the same (HFE ignores them)
    const rows = ['Cotrimoxazole', 'Isoniazide', 'Rifapentine', 'Fluconazole', 'Dapsone', 'other-current-pro-treat'].map((n) => {
      const cls = n.startsWith('other') ? n : `${n}-current-treat`;
      return { checkbox: `tr:has(td.${cls}) input[type=checkbox]`, target: `td.${cls}` };
    });
    await checkDim(page, rows);
  });

  test('toggle: the family planning table and each method un-dim their dates', async ({ page, createSectionEncounter }) => {
    await start(page, createSectionEncounter);
    // :1234 shows #fp-table; :1262 and :1287 dim the date of each method
    await expect(page.locator('#fp-table')).toBeHidden();
    await page.locator('#sexual-activity .two-columns input[type=checkbox]').first().check();
    await expect(page.locator('#fp-table')).toBeVisible();
    const rows = ['Pill', 'Depo-provera', 'Condoms', 'Norplant', 'IUD', 'TubalLigation', 'Vasectomy'].map((n) => ({
      checkbox: `#${n}-fp input[type=checkbox]`,
      target: `td.${n}-date`,
    }));
    rows.push({ checkbox: 'tr:has(td.other-fp) input[type=checkbox]', target: 'td.other-fp' });
    await checkDim(page, rows);
    await page.locator('#sexual-activity .two-columns input[type=checkbox]').first().uncheck();
    await expect(page.locator('#fp-table')).toBeHidden();
  });

  test('toggle: each adverse event un-dims its date; radiology findings show per procedure', async ({ page, createSectionEncounter }) => {
    await start(page, createSectionEncounter);
    // :1605 :1631
    const ae = ['None', 'Neuropathy', 'LacticAcidosis', 'NauseaVomiting', 'Hepatitis', 'Anemia', 'Jaundice', 'Rash', 'Other'].map((n) => ({
      checkbox: `#${n}-ae input[type=checkbox]`,
      target: `#${n}-ae-date`,
    }));
    await checkDim(page, ae);
    // :1198 the findings block of each procedure is hidden until its checkbox is ticked (the <div> inside the <p> closes the
    // <p> in the browser, so the checkboxes are located by position)
    const procedures = ['chestXRay', 'pelvicUS', 'abUS'];
    for (let i = 0; i < procedures.length; i++) {
      const box = page.locator('#radiology-findings input[type=checkbox]').nth(i);
      await expect(page.locator(`#${procedures[i]}`)).toBeHidden();
      await box.check();
      await expect(page.locator(`#${procedures[i]}`)).toBeVisible();
      await box.uncheck();
      await expect(page.locator(`#${procedures[i]}`)).toBeHidden();
    }
  });

  test('toggle: PMTCT syphilis screening and treatment blocks follow their checkboxes', async ({ page, createSectionEncounter }) => {
    await start(page, createSectionEncounter, { type: PMTCT });
    // :1446 #syph-screen, :1463 #mom-syph-treat, :1478 #partner-syph-treat
    const cases: Array<[string, string]> = [
      ['#syph-checkbox input[type=checkbox]', '#syph-screen'],
      ['#syphilis-section .two-columns > div:nth-child(1) input[type=checkbox]', '#mom-syph-treat'],
      ['#syphilis-section .two-columns > div:nth-child(2) input[type=checkbox]', '#partner-syph-treat'],
    ];
    for (const [checkbox, target] of cases) {
      await expect(page.locator(target)).toBeHidden();
      await page.locator(checkbox).first().check();
      await expect(page.locator(target)).toBeVisible();
      await page.locator(checkbox).first().uncheck();
      await expect(page.locator(target)).toBeHidden();
    }
  });

  // ---- CHW name: excludeIf/includeIf :105 :608 :615, ifMode EDIT :626, handler :213 ----
  test('CHW name: a patient with no earlier CHW name gets the plain field', async ({ page, createSectionEncounter }) => {
    await start(page, createSectionEncounter);
    await expect(page.locator('#normal-CHW-div')).toBeVisible();
    await expect(page.locator('#lastRecorded-CHW-div')).toBeHidden();
    // V6: in EDIT the "change" block's field and the plain field are both rendered
    await expect(page.locator('[id=chwName]')).toHaveCount(2);
    // :105 the big script is loaded (no CHW obs on this encounter yet)
    expect(await page.evaluate(() => typeof (window as unknown as { getRegiment?: unknown }).getRegiment)).toBe('function');
  });

  test('CHW name: the last recorded name is shown, and "change" reveals the field', async ({ page, api, createSectionEncounter }) => {
    const section = await start(page, createSectionEncounter, { open: false });
    await priorEncounter(api, section, [{ concept: CHW_CONCEPT_UUID, value: 'AutoChw Tester' }]);
    await SectionFormPage.openEdit(page, FORM, section);
    await settle(page);
    await expect(page.locator('#lastRecorded-CHW-div')).toBeVisible();
    await expect(page.locator('#lastRecordedCHW')).toHaveText('AutoChw Tester');
    await expect(page.locator('#normal-CHW-div')).toBeHidden();
    await expect(page.locator('#editChwNameDiv')).toBeHidden();
    await page.locator('#changeChw').check(); // :213
    await expect(page.locator('#editChwNameDiv')).toBeVisible();
    await page.locator('#changeChw').uncheck();
    await expect(page.locator('#editChwNameDiv')).toBeHidden();
  });

  test('CHW name: once saved on the encounter only the plain field remains and the prefill script is not loaded', async ({ page, api, createSectionEncounter }) => {
    const section = await start(page, createSectionEncounter);
    await page.locator('#normal-CHW-div input[type=text]').fill('AutoChw Saved');
    await save(page);
    expect((await displays(api, section)).some((d) => d.includes('autochw saved'))).toBeTruthy();
    await SectionFormPage.openEdit(page, FORM, section);
    await settle(page);
    // includeIf :608 renders the field with its value; excludeIf :615 and :105 drop the blocks and the script
    await expect(page.locator('#chw-name input[type=text]')).toHaveValue('AutoChw Saved');
    await expect(page.locator('#normal-CHW-div')).toHaveCount(0);
    await expect(page.locator('#lastRecorded-CHW-div')).toHaveCount(0);
    expect(await page.evaluate(() => typeof (window as unknown as { getRegiment?: unknown }).getRegiment)).toBe('undefined');
  });

  test('V5 CHW name typed under "change" and then unticked is not saved', async ({ page, api, createSectionEncounter }) => {
    test.fixme(); // V5: the hidden input is still submitted. Remove test.fixme() when fixed.
    const section = await start(page, createSectionEncounter, { open: false });
    await priorEncounter(api, section, [{ concept: CHW_CONCEPT_UUID, value: 'AutoChw Tester' }]);
    await SectionFormPage.openEdit(page, FORM, section);
    await settle(page);
    await page.locator('#changeChw').check();
    await page.locator('#editChwNameDiv input[type=text]').fill('AutoChw Withdrawn');
    await page.locator('#changeChw').uncheck();
    await save(page);
    expect((await displays(api, section)).some((d) => d.includes('autochw withdrawn'))).toBeFalsy();
  });

  // ---- REST prefill and confirm boxes (script :106-555) ----
  const priorTreatment = async (api: APIRequestContext, section: SectionEncounter) =>
    priorEncounter(api, section, [
      { concept: ART_START_DATE_UUID, value: '2024-03-15' },
      { concept: REGIMEN_UUID, value: await conceptUuid(api, 'CIEL', '164505') }, // TDF + 3TC + EFV
      { concept: TREATMENT_LINE_UUID, value: await conceptUuid(api, 'PIH', '7429') }, // 2nd
    ]);

  test('prefill: ART start date, regimen and treatment line come from the patient\'s latest obs', async ({ page, api, createSectionEncounter }) => {
    const section = await start(page, createSectionEncounter, { open: false });
    await priorTreatment(api, section);
    await SectionFormPage.openEdit(page, FORM, section);
    await settle(page);
    await expect(page.locator('#arv_start_date input[type=hidden]')).toHaveValue('2024-03-15');
    await expect(page.locator('#currentARV1 select option:checked')).toHaveText('TDF + 3TC + EFV');
    await expect(radio(page, 'treatmentLine', 1)).toBeChecked(); // second answer = 2nd line
  });

  test('confirm box: changing the treatment line asks first; No restores the previous line, Yes keeps the new one', async ({ page, api, createSectionEncounter }) => {
    const section = await start(page, createSectionEncounter, { open: false });
    await priorTreatment(api, section);
    await SectionFormPage.openEdit(page, FORM, section);
    await settle(page);
    await radio(page, 'takingARVs', 0).check();
    await radio(page, 'treatmentLine', 0).check(); // :240
    await expect(page.locator('#confirmOverlay')).toBeVisible();
    await expect(page.locator('#confirmText')).toContainText('2nd'); // V7: the new line is quoted as "1ère" in any language
    await page.locator('#confirmNo').click();
    await expect(page.locator('#confirmOverlay')).toBeHidden();
    await expect(radio(page, 'treatmentLine', 1)).toBeChecked();
    await radio(page, 'treatmentLine', 0).check();
    await page.locator('#confirmYes').click();
    await expect(page.locator('#confirmOverlay')).toBeHidden();
    await expect(radio(page, 'treatmentLine', 0)).toBeChecked();
  });

  test('confirm box: changing the regimen asks first; No keeps the previous regimen', async ({ page, api, createSectionEncounter }) => {
    const section = await start(page, createSectionEncounter, { open: false });
    await priorTreatment(api, section);
    await SectionFormPage.openEdit(page, FORM, section);
    await settle(page);
    await radio(page, 'takingARVs', 0).check();
    await page.locator('#currentARV1 select').selectOption({ label: 'TDF + 3TC + DTG' }); // :255
    await expect(page.locator('#confirmOverlay')).toBeVisible();
    await page.locator('#confirmNo').click();
    await expect(page.locator('#confirmOverlay')).toBeHidden();
    await expect(page.locator('#currentARV1 select option:checked')).toHaveText('TDF + 3TC + EFV');
  });

  test('V1 confirming a regimen change with "Yes" keeps the new regimen', async ({ page, api, createSectionEncounter }) => {
    test.fixme(); // V1: getRegiment() in the change handler resets the select to the previous regimen. Remove test.fixme() when fixed.
    const section = await start(page, createSectionEncounter, { open: false });
    await priorTreatment(api, section);
    await SectionFormPage.openEdit(page, FORM, section);
    await settle(page);
    await radio(page, 'takingARVs', 0).check();
    await page.locator('#currentARV1 select').selectOption({ label: 'TDF + 3TC + DTG' });
    await expect(page.locator('#confirmOverlay')).toBeVisible();
    await page.locator('#confirmYes').click();
    await settle(page);
    await expect(page.locator('#currentARV1 select option:checked'), 'the confirmed regimen').toHaveText('TDF + 3TC + DTG', { timeout: 5000 });
  });

  test('V4 a patient with no treatment line history is not asked about another patient\'s line', async ({ page, createSectionEncounter }) => {
    test.fixme(); // V4: stale localStorage value from another patient. Remove test.fixme() when fixed.
    // the key a previously opened patient left behind (set by getArtTreatmentLine() :276, never cleared)
    await page.addInitScript(() => {
      try {
        localStorage.setItem('previousTreatmentLineValue', '2nd');
      } catch {
        // storage unavailable: the test cannot show the bug
      }
    });
    await start(page, createSectionEncounter);
    await radio(page, 'takingARVs', 0).check();
    await radio(page, 'treatmentLine', 0).check();
    await expect(page.locator('#confirmOverlay'), 'no previous line for this patient').toBeHidden({ timeout: 5000 });
  });

  test('V2 the INH start date is not prefilled from another prophylaxis row', async ({ page, api, createSectionEncounter }) => {
    test.fixme(); // V2: CIEL:163526 is the start date of every prophylaxis row. Remove test.fixme() when fixed.
    const section = await start(page, createSectionEncounter, { open: false });
    // an earlier cotrimoxazole-only prophylaxis group
    await priorEncounter(api, section, [
      {
        concept: await conceptUuid(api, 'PIH', '2739'),
        groupMembers: [
          { concept: await conceptUuid(api, 'PIH', '2289'), value: await conceptUuid(api, 'CIEL', '105281') },
          { concept: PROPHYLAXIS_START_DATE_UUID, value: '2024-02-10' },
        ],
      },
    ]);
    await SectionFormPage.openEdit(page, FORM, section);
    await settle(page);
    await expect(page.locator('#inhStartDate input[type=hidden]')).toHaveValue('');
  });

  // ---- TB screening result :1138 ----
  test('TB screening result is shown only when it has a saved value', async ({ page, api, createSectionEncounter }) => {
    const section = await start(page, createSectionEncounter);
    await expect(page.locator('.tb-screening-result-section')).toBeHidden();
    const res = await api.post('obs', {
      data: {
        person: section.patient.uuid,
        encounter: section.encounter.uuid,
        concept: await conceptUuid(api, 'CIEL', '160108'),
        value: await conceptUuid(api, 'CIEL', '703'),
        obsDatetime: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    expect(res.ok(), `create obs: ${res.status()}`).toBeTruthy();
    await SectionFormPage.openEdit(page, FORM, section);
    await settle(page);
    await expect(page.locator('.tb-screening-result-section')).toBeVisible();
  });

  test('VIEW: the TB screening result shows its saved value, and no value before one is saved', async ({ page, api, createSectionEncounter }) => {
    test.fixme(); // HAI-1278: the read-only view throws in mch.js setUpEdd (getField is not defined on the visit page). Remove test.fixme() when fixed.
    const section = await start(page, createSectionEncounter, { open: false });
    const before = await ViewFormPage.open(page, FORM, section.encounter.uuid);
    await expect(before.page.locator('.tb-screening-result-section .value')).toHaveCount(0);
    const res = await api.post('obs', {
      data: {
        person: section.patient.uuid,
        encounter: section.encounter.uuid,
        concept: await conceptUuid(api, 'CIEL', '160108'),
        value: await conceptUuid(api, 'CIEL', '703'),
        obsDatetime: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    expect(res.ok(), `create obs: ${res.status()}`).toBeTruthy();
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid);
    await expect(view.page.locator('.tb-screening-result-section .value').first()).toContainText('Positive');
  });

  // ---- EDD (mch.js via :593-599, shared: see _shared V1) ----
  test('EDD: the last menstrual period fills the due date (LMP + 280 days) and the gestational age', async ({ page, createSectionEncounter }) => {
    await start(page, createSectionEncounter);
    await radio(page, 'hivpregnant', 0).check();
    await pickDate(page, '#lastPeriodDate', localIso(-72)); // 10 weeks and 2 days
    await expect(page.locator('.calculated-gestational-age-value')).toContainText(/^\s*10/);
    await expect(page.locator('#edd input[type=hidden]')).toHaveValue(localIso(208));
    await expect(page.locator('#calculated-edd-and-gestational')).toBeVisible();
  });

  test('EDD: a due date more than two weeks in the past is rejected and blocks Save until corrected', async ({ page, createSectionEncounter }) => {
    await start(page, createSectionEncounter);
    await radio(page, 'hivpregnant', 0).check();
    await pickDate(page, '#edd', localIso(-60));
    await expect(page.locator('#edd .field-error:visible')).toContainText('2 weeks');
    await expect(page.locator('#submit')).toBeDisabled();
    await pickDate(page, '#edd', localIso(100));
    await expect(page.locator('#edd .field-error:visible')).toHaveCount(0);
    await expect(page.locator('#submit')).toBeEnabled();
  });

  test('see _shared V1: a due date more than 10 months after the encounter is rejected', async ({ page, createSectionEncounter }) => {
    test.fixme(); // _shared V1: the second validator clears the first one's message. Remove test.fixme() when fixed.
    await start(page, createSectionEncounter);
    await radio(page, 'hivpregnant', 0).check();
    await pickDate(page, '#edd', localIso(320));
    await expect(page.locator('#edd .field-error:visible')).toContainText('10 months', { timeout: 5000 });
    await expect(page.locator('#submit')).toBeDisabled();
  });

  // ---- INH helper (zl.js manageInputActivationForRadioButton, called at :568) ----
  const tickInh = async (page: Page) => {
    await radio(page, 'takingARVs', 0).check();
    await page.locator('#Isoniazide input[type=checkbox]').check();
  };

  test('INH: with a line and a start date the group is saved', async ({ page, api, createSectionEncounter }) => {
    const section = await start(page, createSectionEncounter);
    await tickInh(page);
    await radio(page, 'prophylaxis_treatmentLine', 0).check();
    await pickDate(page, '#inhStartDate', localIso(-5));
    await save(page);
    const d = await displays(api, section);
    expect(d.some((x) => x.includes('isoniazid') && x.includes(localIso(-5))), d.join(' | ')).toBeTruthy();
  });

  test('V3 INH ticked without a treatment line shows a "required" message and does not save', async ({ page, createSectionEncounter }) => {
    test.fixme(); // V3: :568 passes 4 arguments to a 5-parameter helper. Remove test.fixme() when fixed.
    await start(page, createSectionEncounter);
    await tickInh(page);
    await page.locator('#submit').click();
    await expect(page.locator('#prophylaxis_treatmentLine .field-error'), 'message on the line').not.toBeEmpty({ timeout: 5000 });
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
  });

  test('V3 INH with a line but no start date shows a "required" message and does not save', async ({ page, createSectionEncounter }) => {
    test.fixme(); // V3: the start date is not required at :568. Remove test.fixme() when fixed.
    await start(page, createSectionEncounter);
    await tickInh(page);
    await radio(page, 'prophylaxis_treatmentLine', 0).check();
    await page.locator('#submit').click();
    await expect(page.locator('#inhStartDate .field-error:visible'), 'message on the start date').not.toBeEmpty({ timeout: 5000 });
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
  });

  // ---- save, program enrollment, EDIT ----
  const saveState = async (page: Page, api: APIRequestContext, createSectionEncounter: CustomTestFixtures['createSectionEncounter']) => {
    const section = await start(page, createSectionEncounter);
    await page.locator('#normal-CHW-div input[type=text]').fill('AutoChw Saved'); // :105 then drops the prefill script on reopen
    await radio(page, 'takingARVs', 0).check();
    await page.locator('#currentARV1 select').selectOption({ label: 'TDF + 3TC + DTG' });
    await page.locator('#confirmYes').click(); // :255 confirm box (no earlier regimen: nothing is reset)
    await expect(page.locator('#confirmOverlay')).toBeHidden();
    await radio(page, 'treatmentLine', 0).check(); // no earlier line: no confirm box
    await pickDate(page, '#arv_start_date', '2024-03-15');
    await page.locator('#chief-complaint textarea').fill('Fever and cough');
    await page.locator('#tb-screen input[type=radio]').first().check();
    await page.locator('#sexual-activity input[type=radio]').first().check();
    await page.locator('#Rash-ae input[type=checkbox]').check();
    await pickDate(page, '#Rash-ae-date', localIso(-3));
    await page.locator('#hiv-adherence input[type=text]').first().fill('30');
    await page.locator('#hiv-adherence input[type=text]').nth(1).fill('2');
    await radio(page, 'hiv-adherence', 0).check(); // CHW visit: Yes
    await page.locator('#hiv-progress input[type=radio]').nth(1).check();
    await page.locator('#hiv-state-stage input[type=radio]').nth(2).check();
    await save(page);

    const obs = await getEncounterObs(api, section.encounter.uuid);
    const has = (needle: string) => expect(obs.some((o) => o.display.toLowerCase().includes(needle)), needle).toBeTruthy();
    has('autochw saved');
    has('tdf + 3tc + dtg');
    has('2024-03-15');
    has('fever and cough');
    has('rash');
    const conceptUuids = obs.map((o) => o.concept.uuid);
    for (const [source, code] of [['PIH', '13067'], ['CIEL', '160110'], ['CIEL', '160116'], ['PIH', 'CURRENT WHO HIV STAGE']]) {
      expect(conceptUuids, `${source}:${code}`).toContain(await conceptUuid(api, source, code));
    }

    // enrollInProgram :578 (the patient had no enrollment)
    const enr = await api.get(`programenrollment?patient=${section.patient.uuid}&v=custom:(program:(name))`);
    expect(enr.ok()).toBeTruthy();
    expect(((await enr.json()).results as Array<{ program: { name: string } }>).map((e) => e.program.name)).toContain('HIV');

    await SectionFormPage.openEdit(page, FORM, section);
    await settle(page);
    // when :870 starts from the saved Yes, and the saved values are in the inputs
    await expect(page.locator('#current-arvs')).toBeVisible();
    await expect(page.locator('#currentARV1 select option:checked')).toHaveText('TDF + 3TC + DTG');
    await expect(page.locator('#chief-complaint textarea')).toHaveValue('Fever and cough');
    await expect(page.locator('#Rash-ae input[type=checkbox]')).toBeChecked();
    await expect(page.locator('#Rash-ae-date')).toHaveCSS('opacity', '1'); // :1631 dim cleared in EDIT
    await expect(page.locator('#hiv-adherence input[type=text]').first()).toHaveValue('30');
    return section;
  };

  test('saves the state, enrolls the patient in the HIV program, and EDIT starts from the saved answers', async ({ page, api, createSectionEncounter }) => {
    await saveState(page, api, createSectionEncounter);
  });

  test('VIEW: the saved state (HAI-1278, remove test.fixme() when fixed)', async ({ page, api, createSectionEncounter }) => {
    test.fixme(); // HAI-1278: mch.js setUpEdd calls getField, which the visit page does not define
    const section = await saveState(page, api, createSectionEncounter);
    // the saved state is shown under its blocks, what was not answered is not
    // dates and coded answers the form labels differently from the concept name (answerLabels "1,2,3,4", conceptLabels yes/no)
    const labels = {
      [`Adverse effect date: ${localIso(-3)}`]: viewDate(localIso(-3)),
      'Current WHO HIV Stage: WHO Stage 3': '3',
      'ARV start date: 2024-03-15': '15 Mar 2024',
      'TB symptom present: Fever and night sweats more than 2 weeks': 'Yes',
    };
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, labels);
    const shown = await view.valueTexts();
    for (const expected of ['AutoChw Saved', 'TDF + 3TC + DTG', 'Fever and cough', '15 Mar 2024', viewDate(localIso(-3)), '30', '2']) {
      expect(shown.some((t) => t.includes(expected)), expected).toBeTruthy();
    }
    await expect(view.page.locator('#chief-complaint .value')).toHaveText('Fever and cough');
    await expect(view.page.locator('#Rash-ae .value, #Rash-ae-date .value')).not.toHaveCount(0);
    await expect(view.page.locator('#Anemia-ae .value')).toHaveCount(0);
    await expect(view.page.locator('#hivpregnant .value, #hiv-delivery .value')).toHaveCount(0);
    await expect(view.page.locator('#buttons, #submit, #next, #cancel')).toHaveCount(0);
  });
});
