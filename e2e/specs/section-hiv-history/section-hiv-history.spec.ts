import { type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type SectionEncounter, type SectionEncounterOptions } from '../../core';
import { HIV_INTAKE_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { SectionFormPage, expectViewShowsSavedObs, VISIT_PAGE_URL } from '../../pages';

// hiv/section-hiv-history.xml v4.0: "HIV History" section of the HIV intake encounter (c31d306a): program enrollment, ARV and
// serology history, pregnancy/delivery, infant birth/feeding/mother data (< 2 y), contacts, mode of transmission, risk factors,
// adverse events, past medical/TB/prophylaxis/ARV/family planning history, radiology, psych. The specs open its edit URL
// directly on a synthetic HIV intake encounter (visit-page gating skipped, documentation/_availability.e2e.md). Patient age and
// gender decide most of the form, so each test builds the patient it needs.
//
// Conditions in the form, from documentation inventory (section-hiv-history.inv.md; "age" = at the encounter date):
//   ifMode VIEW include=false :5, :76, :94, :1949   CSS; heading + scripts; EDD script; the #buttons row (ENTER/EDIT only)
//   includeIf age > 1 :108       enrollInProgram HIV, no checkbox (automatic)       includeIf age < 2 :113  #hiv-program: choose EID or HIV
//   includeIf F and age > 8 :95/:135 EDD script, :397 #hivpregnant, :467 #hiv-delivery   includeIf F :232 refer-by-MCH checkbox, :499 #id-breastfeeding
//   includeIf age < 2 :526 #birth-history, :683 #feeding, :745 #ARVwithin72hoursOfBirth + #mother-info (:816)
//   includeIf age > 9 :1022 #transmission (+script), :1158 key population   includeIf age > 8 :1768 family planning   includeIf age >= 12 :1904 #psych
//   when :208/:209 referral or transfer -> #transfer-referral-details; :221/:222 internal/external -> #internal/#external-transfer;
//        :407 pregnant -> #pregnant; :479 delivered -> #delivery; :509 stopped -> #wean-date; :585 health facility -> #birth-zl-site;
//        :846 mother ARV -> #mom-arv-section; :911 mother TB -> #mom-tb-section
//   toggle (checkbox, "dim" = target inputs disabled+cleared until ticked) :1048,:1074 transmission modes, :1284 past medical history (19),
//        :1527 TB regimens, :1631-1677 prophylaxis, :1722/:1744 HIV regimens, :1799/:1827 family planning; "hide": :1206 #ae, :1454 #activeTB,
//        :1874 radiology (5). The :1116 toggle on risk radios does nothing (V2)
// Scripts: :56-72 hides the legacy TB rows 2RHZ/4RH and 2S RHEZ/1RHEZ/5RHE unless they hold a value, setupCheckboxRadioGroups (one box in
//   #hiv-program); :82-89 zl.js contacts (show more/less, phone check), start/end date limits in `.startDateEndDate` rows, isoniazid
//   (checkbox -> treatment line -> dates, start date required), next/submit; :96-103/:136-143 mch.js EDD (LMP + 280 d, validators);
//   :1024 transmission needs one box. All in _shared.e2e.md. 15 radios are required: 7 in #risk (:1116), 8 in #tb-screen (:1585).
// Side effects on save: enrollInProgram HIV (age > 1) or EID/HIV by checkbox (age < 2), at the "Program Location" ancestor of the
//   encounter location. Teardown voids the enrollment. No orders.
// VIEW (getAsHtml.action on the saved encounter): the woman save test and an infant test check every saved obs, dates as dd MMM yyyy,
//   the TB screening Yes/No, the feeding answerCode, blocks that were not answered show no value, and #buttons (:1949) is absent.
// Not covered here: #next (needs the visit page), the intake/followup labels (:285/:289), EDIT showing a saved legacy TB row,
//   location selects, the radiology "other" autocomplete, most obs values (a sample is saved and read back).
//
// Findings (V1.. numbered per file, High -> Low -> Info):
//   V1 Low  :499-500  "Maternal breastfeeding" (and refer-by-MCH :232) test only gender == 'F', unlike :397/:467 (age > 8; the doubled
//                     nested includeIf suggests an edit was meant): a 1- or 5-year-old girl is asked it. Fix: add the age. (TESTED, test.fixme)
//   V2 Low  :1116,:1119 `toggle` on radio obs is ignored (toggleDim is checkbox-only; the source has a ToDo): the 7 risk dates stay enabled.
//   V3 Low  :94-105,:135-144 EDD scripts included twice in ENTER/EDIT (2nd block has no ifMode): the EDD input gets 4 change handlers, not 2.
//   V4 Low  :1535 `<td id="{regimen}">` repeats initialTreatment/retreatment: ticking a visible regimen also enables the hidden legacy row's
//           inputs; :1854/:1857 `presenting-history` is both the section id and the obs id.
//   V5 Low  :393-397,:463-467 sexual-activity and delivery fieldsets sit outside their includeIf: males and children see two empty headings.
//   V6 Info :1116,:1585 15 radios are required at every age (+ one transmission box over 9): nothing can be saved half-answered.
//   Shared, not repeated: see _shared V1 (tested, test.fixme), V4 (tested, test.fixme), V6 (message visible on load). NOT reproduced here:
//   _shared V2 (HFE clears the treatment-line radio on untick, so a re-tick needs a new choice and then works; tested) and _shared V3
//   (a valid number then cleared leaves no message; tested).

const FORM = 'hiv/section-hiv-history.xml';
const TRANSMISSION_MEN = 'men-trans-date'; // first transmission mode (checkbox toggleDim target)

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
// Calendar date `n` days from today (or from `from`), as yyyy-mm-dd.
const iso = (n: number, from: Date = new Date()): string => {
  const d = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate() + n));
  return d.toISOString().slice(0, 10);
};
const obsDisplays = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> => {
  const res = await api.get(`obs?encounter=${encounterUuid}&v=custom:(display)&limit=200`);
  expect(res.ok()).toBeTruthy();
  return ((await res.json()).results as Array<{ display: string }>).map((o) => o.display.toLowerCase());
};
// Date as the VIEW shows it ("15 Mar 2024").
const viewDate = (isoDate: string): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
};
// Labels for the VIEW check (obs display -> text shown): the TB screening questions show "Yes"/"No" under their own question text, the
// dates are dd MMM yyyy, and the transfer and TB regimen answers use the form's answerCodes.
const viewLabels = async (api: APIRequestContext, encounterUuid: string): Promise<Record<string, string>> => {
  const res = await api.get(`obs?encounter=${encounterUuid}&v=custom:(display)&limit=200`);
  expect(res.ok()).toBeTruthy();
  const labels: Record<string, string> = {};
  for (const { display } of (await res.json()).results as Array<{ display: string }>) {
    const date = display.match(/^[^:]+: (\d{4}-\d{2}-\d{2})$/);
    if (display.startsWith('TB symptom present:')) {
      labels[display] = 'Yes';
    } else if (display.startsWith('TB symptom absent:')) {
      labels[display] = 'No';
    } else if (date) {
      labels[display] = viewDate(date[1]);
    } else if (display.startsWith('Referred from another site:')) {
      labels[display] = 'External';
    } else if (display === 'Infant feeding method: Breastfed exclusively') {
      labels[display] = 'Breastfeed exclusively';
    } else if (display.startsWith('Medication(s) name: Initial TB treatment')) {
      labels[display] = 'Initial treatment: 2HRZE / 4HR';
    }
  }
  return labels;
};
const enrollments = async (api: APIRequestContext, patientUuid: string): Promise<string[]> => {
  const res = await api.get(`programenrollment?patient=${patientUuid}&v=custom:(program:(name))`);
  expect(res.ok()).toBeTruthy();
  return ((await res.json()).results as Array<{ program: { name: string } }>).map((e) => e.program.name);
};
// The answers Save insists on: 7 risk radios (:1116) and 8 TB screening radios (:1585), plus one transmission box for age > 9 (:1024).
const fillRequired = async (page: Page, age: number) => {
  const risk = page.locator('#risk table').first().locator('p.radio');
  for (let i = 0; i < 7; i++) {
    await risk.nth(i).locator('input[type=radio]').nth(i === 0 ? 1 : 0).check(); // first row Yes, the rest No
  }
  const screening = page.locator('#tb-screen .tb-screening-question');
  for (let i = 0; i < 8; i++) {
    await screening.nth(i).locator('input[type=radio]').nth(i === 0 ? 0 : 1).check(); // first Yes (present), the rest No (absent)
  }
  if (age > 9) {
    await page.locator(`input[toggleDim="${TRANSMISSION_MEN}"]`).check();
  }
};
const dimTargetInputs = (page: Page, target: string) => page.locator(`[id="${target}"] input, .${target} input`);

test.describe('section-hiv-history', () => {
  let section: SectionEncounter;

  const url = () => SectionFormPage.editUrl(FORM, section);
  const open = async (page: Page) => {
    await page.goto(url());
    await expect(page.locator('#submit')).toBeVisible();
  };
  const openAs = async (page: Page, create: (o: SectionEncounterOptions) => Promise<SectionEncounter>, gender: 'M' | 'F', age: number) => {
    section = await create({
      encounterTypeUuid: HIV_INTAKE_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoHivHist', familyName: 'Tester', gender, birthdate: birthdateYearsAgo(age) },
    });
    await open(page);
  };
  const save = async (page: Page) => {
    await page.locator('#submit').click();
    await new SectionFormPage(page, FORM).expectSaved();
  };

  // ---- conditions by patient: includeIf age / gender ----
  const profiles: Array<{ name: string; gender: 'M' | 'F'; age: number; present: string[]; absent: string[] }> = [
    { name: 'woman, 30', gender: 'F', age: 30,
      present: ['#hivpregnant', '#hiv-delivery', '#internal-transfer input[type=checkbox]', '#id-breastfeeding', '#transmission', '#risk h3', 'input[toggleDim="Pill-date"]', '#psych'],
      absent: ['#birth-history', '#feeding', '#ARVwithin72hoursOfBirth', '#mother-info', '#hiv-program'] },
    { name: 'man, 30', gender: 'M', age: 30,
      present: ['#transmission', '#risk h3', 'input[toggleDim="Pill-date"]', '#psych'],
      absent: ['#hivpregnant', '#hiv-delivery', '#internal-transfer input[type=checkbox]', '#id-breastfeeding', '#birth-history', '#mother-info', '#hiv-program'] },
    { name: 'boy, 10', gender: 'M', age: 10,
      present: ['#transmission', '#risk h3', 'input[toggleDim="Pill-date"]'],
      absent: ['#hivpregnant', '#hiv-delivery', '#id-breastfeeding', '#psych', '#birth-history', '#mother-info', '#hiv-program'] },
    { name: 'boy, 5', gender: 'M', age: 5, present: [],
      absent: ['#hivpregnant', '#hiv-delivery', '#id-breastfeeding', '#transmission', '#risk h3', 'input[toggleDim="Pill-date"]', '#psych', '#birth-history', '#mother-info', '#hiv-program'] },
    { name: 'girl, 5', gender: 'F', age: 5, present: [],
      absent: ['#hivpregnant', '#hiv-delivery', '#transmission', '#risk h3', 'input[toggleDim="Pill-date"]', '#psych', '#birth-history', '#mother-info', '#hiv-program'] },
    { name: 'infant boy, 1', gender: 'M', age: 1,
      present: ['#birth-history', '#feeding', '#ARVwithin72hoursOfBirth', '#mother-info', '#hiv-program'],
      absent: ['#hivpregnant', '#hiv-delivery', '#id-breastfeeding', '#transmission', '#risk h3', 'input[toggleDim="Pill-date"]', '#psych'] },
  ];
  for (const p of profiles) {
    test(`sections offered to a ${p.name}`, async ({ page, createSectionEncounter }) => {
      // includeIf :95/:135, :232, :397, :467, :499, :526, :683, :745, :1022, :1158, :1768, :1904, :113
      await openAs(page, createSectionEncounter, p.gender, p.age);
      for (const sel of p.present) {
        await expect(page.locator(sel).first(), sel).toBeAttached();
      }
      for (const sel of p.absent) {
        await expect(page.locator(sel), sel).toHaveCount(0);
      }
    });
  }

  test('a girl is not asked "Maternal breastfeeding" (V1, remove test.fixme() when fixed)', async ({ page, createSectionEncounter }) => {
    test.fixme(); // V1 :499-500 gender-only condition
    await openAs(page, createSectionEncounter, 'F', 5);
    await expect(page.locator('#id-breastfeeding')).toHaveCount(0);
  });

  // ---- <when>: answer shows a block ----
  const adultWhens = [
    { name: 'pregnant yes -> #pregnant (:407)', radios: '#hivpregnant', show: 0, target: '#pregnant' },
    { name: 'delivered yes -> #delivery (:479)', radios: '#hiv-delivery', show: 0, target: '#delivery' },
    { name: 'breastfeeding stopped -> #wean-date (:509)', radios: '#breastfeeding-mom', show: 1, target: '#wean-date' },
  ];
  for (const w of adultWhens) {
    test(`woman: ${w.name}`, async ({ page, createSectionEncounter }) => {
      await openAs(page, createSectionEncounter, 'F', 30);
      const radios = page.locator(`${w.radios} input[type=radio]`);
      await expect(page.locator(w.target)).toBeHidden();
      await radios.nth(w.show).check();
      await expect(page.locator(w.target)).toBeVisible();
      await radios.nth(1 - w.show).check();
      await expect(page.locator(w.target)).toBeHidden();
    });
  }

  test('woman: LMP typed under "pregnant" is cleared when the answer changes to No', async ({ page, createSectionEncounter }) => {
    // when :407 hides #pregnant: its inputs must not be submitted
    await openAs(page, createSectionEncounter, 'F', 30);
    await page.locator('#hivpregnant input[type=radio]').first().check();
    await pickDate(page.locator('#lastPeriodDate input[type=text]'), iso(-30));
    await page.locator('#hivpregnant input[type=radio]').nth(1).check();
    await expect(page.locator('#pregnant')).toBeHidden();
    await expect(page.locator('#lastPeriodDate input[type=hidden]')).toHaveValue('');
  });

  test('referral or transfer shows the details; internal/external pick the matching location block', async ({ page, createSectionEncounter }) => {
    // when :208, :209, :221, :222
    await openAs(page, createSectionEncounter, 'F', 30);
    const details = page.locator('#transfer-referral-details');
    await expect(details).toBeHidden();
    const kind = page.locator('#transfer-referral-spots input[type=radio]');
    await kind.nth(0).check();
    await expect(details).toBeVisible();
    await kind.nth(1).check();
    await expect(details).toBeVisible();
    await expect(page.locator('#internal-transfer')).toBeHidden();
    await expect(page.locator('#external-transfer')).toBeHidden();
    await page.locator('#transfer-spots input[type=radio]').nth(0).check();
    await expect(page.locator('#internal-transfer')).toBeVisible();
    await expect(page.locator('#external-transfer')).toBeHidden();
    await page.locator('#transfer-spots input[type=radio]').nth(1).check();
    await expect(page.locator('#external-transfer')).toBeVisible();
    await expect(page.locator('#internal-transfer')).toBeHidden();
  });

  const infantWhens = [
    { name: 'delivered at a health facility -> #birth-zl-site (:585)', radios: '#delivery-locale', target: '#birth-zl-site' },
    { name: 'mother received ARV -> #mom-arv-section (:846)', radios: '#mom-rcvd-arv', target: '#mom-arv-section' },
    { name: 'mother on TB treatment -> #mom-tb-section (:911)', radios: '#mom-tb', target: '#mom-tb-section' },
  ];
  for (const w of infantWhens) {
    test(`infant: ${w.name}`, async ({ page, createSectionEncounter }) => {
      await openAs(page, createSectionEncounter, 'M', 1);
      const radios = page.locator(`${w.radios} input[type=radio]`);
      await expect(page.locator(w.target)).toBeHidden();
      await radios.nth(0).check();
      await expect(page.locator(w.target)).toBeVisible();
      await radios.nth(1).check();
      await expect(page.locator(w.target)).toBeHidden();
    });
  }

  test('infant: only one of the EID / HIV enrollment boxes can be ticked', async ({ page, createSectionEncounter }) => {
    // setupCheckboxRadioGroups() :69 on .checkbox-radio-group (:116)
    await openAs(page, createSectionEncounter, 'M', 1);
    const boxes = page.locator('#hiv-program .checkbox-radio-option input[type=checkbox]');
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await expect(boxes.nth(0)).not.toBeChecked();
    await expect(boxes.nth(1)).toBeChecked();
  });

  // ---- toggle: checkbox enables (dim) or shows (hide) its block ----
  // Each group: the toggle targets (`#id, .id` of the toggle attribute, the checkbox carries it as `toggleDim`/`toggleHide`).
  const dimGroups: Array<{ name: string; age: number; opensTb?: boolean; targets: string[] }> = [
    { name: 'mode of transmission (:1048, :1074)', age: 30, targets: ['men', 'women', 'drugs', 'blood', 'pmtct', 'accident-blood', 'hiv-person', 'with-drug-person', 'with-bisexual', 'with-blood-person', 'other'].map((t) => `${t}-trans-date`) },
    { name: 'other risk factor (:1141)', age: 30, targets: ['other-risk-date'] },
    { name: 'past medical history (:1284)', age: 30, targets: ['pneumonia', 'herpes', 'thrush', 'dermatitis', 'enteropathy', 'diarrhea', 'anemia', 'sti', 'PeripheralNeuropathy', 'seizure', 'OtherNeuroSympt', 'htn', 'otherCardio', 'hepatitis', 'diabetes', 'surgery', 'cholera', 'chikungunya', 'covid-19', 'other'].map((t) => `${t}-mhf-data`) },
    { name: 'TB treatment regimens (:1527)', age: 30, opensTb: true, targets: ['initialTreatment', 'retreatment', 'mdrtbTreatment'] },
    { name: 'prophylaxis (:1631, :1677; isoniazid has its own script)', age: 30, targets: ['Cotrimoxazole-hx', 'Rifapentine-hx', 'Fluconazole-hx', 'Dapsone-hx'] },
    { name: 'HIV regimens (:1722, :1744)', age: 30, targets: ['tdf3tcEfvNvp', 'azt3tcEfvNvp', 'regD4T', 'tdf3tcLpvR', 'otherHivMedHx'] },
    { name: 'family planning (:1799, :1827)', age: 30, targets: ['Pill', 'Depo-provera', 'Condoms', 'Norplant', 'IUD', 'TubalLigation', 'Vasectomy'].map((t) => `${t}-date`).concat('other-fp') },
  ];
  for (const g of dimGroups) {
    test(`ticking a box enables its dates and unticking disables them again: ${g.name}`, async ({ page, createSectionEncounter }) => {
      await openAs(page, createSectionEncounter, 'M', g.age);
      if (g.opensTb) {
        await page.locator('input[toggleHide=activeTB]').check(); // :1454 the regimen table sits in #activeTB
      }
      for (const target of g.targets) {
        const box = page.locator(`input[toggleDim="${target}"]`).first();
        const inputs = dimTargetInputs(page, target);
        const allDisabled = () => inputs.evaluateAll((els) => els.every((e) => (e as HTMLInputElement).disabled));
        expect(await allDisabled(), `${target} starts disabled`).toBe(true);
        await box.check();
        await expect.poll(async () => !(await allDisabled()), { message: `${target} enabled` }).toBe(true);
        await box.uncheck();
        await expect.poll(allDisabled, { message: `${target} disabled again` }).toBe(true);
      }
    });
  }

  test('unticking a past medical history row clears what was typed in it', async ({ page, createSectionEncounter }) => {
    // toggle :1284 "dim" clears the target inputs
    await openAs(page, createSectionEncounter, 'M', 30);
    const box = page.locator('input[toggleDim="pneumonia-mhf-data"]');
    const remark = page.locator('.pneumonia-mhf-data input[type=text]').last();
    await box.check();
    await remark.fill('Mild');
    await box.uncheck();
    await box.check();
    await expect(remark).toHaveValue('');
  });

  test('"hide" toggles: adverse events, active TB and each radiology study show their block only while ticked', async ({ page, createSectionEncounter }) => {
    // toggle :1206 (#ae), :1454 (#activeTB), :1874 (5 radiology studies)
    await openAs(page, createSectionEncounter, 'M', 30);
    for (const target of ['ae', 'activeTB', 'chestXRay', 'chestXRayAP', 'pelvicUS', 'abUS', 'obstetricUS']) {
      const box = page.locator(`input[toggleHide=${target}]`);
      await expect(page.locator(`#${target}`), `${target} hidden`).toBeHidden();
      await box.check();
      await expect(page.locator(`#${target}`), `${target} shown`).toBeVisible();
      await box.uncheck();
      await expect(page.locator(`#${target}`), `${target} hidden again`).toBeHidden();
    }
  });

  test('legacy TB rows (2RHZ/4RH, 2S RHEZ/1RHEZ/5RHE) stay hidden without a saved value; the current rows show', async ({ page, createSectionEncounter }) => {
    // script :58-67 (UHM-5259)
    await openAs(page, createSectionEncounter, 'M', 30);
    await page.locator('input[toggleHide=activeTB]').check();
    await expect(page.locator('tr:has([id="2_RHZE_4_RH"])')).toBeVisible();
    await expect(page.locator('tr:has([id="2hrze_4hr"])')).toBeVisible();
    await expect(page.locator('tr:has([id="2rhz_4rh"])')).toBeHidden();
    await expect(page.locator('tr:has([id="2s_rhez_1rhez_5rhe"])')).toBeHidden();
  });

  // ---- scripts ----
  test.describe('estimated delivery date (mch.js, woman > 8 y)', () => {
    const pregnant = async (page: Page, create: (o: SectionEncounterOptions) => Promise<SectionEncounter>) => {
      await openAs(page, create, 'F', 30);
      await page.locator('#hivpregnant input[type=radio]').first().check();
    };

    test('an LMP fills the EDD (+280 days) and the calculated gestational age block', async ({ page, createSectionEncounter }) => {
      // script :96-103 / setUpEdd
      await pregnant(page, createSectionEncounter);
      await expect(page.locator('#calculated-edd-and-gestational')).toBeHidden();
      await pickDate(page.locator('#lastPeriodDate input[type=text]'), iso(-100));
      await expect(page.locator('#edd input[type=hidden]')).toHaveValue(iso(180));
      await expect(page.locator('#calculated-edd-and-gestational')).toBeVisible();
      // 100 days = 14 weeks + 2 days (an off-by-one day from _shared V7 would read 1/7 or 3/7)
      await expect(page.locator('#calculated-gestational-age-value')).toHaveText(/^14 [123]\/7/);
    });

    test('an LMP 305 or more days back does not fill the EDD', async ({ page, createSectionEncounter }) => {
      await pregnant(page, createSectionEncounter);
      await pickDate(page.locator('#lastPeriodDate input[type=text]'), iso(-330));
      await expect(page.locator('#edd input[type=hidden]')).toHaveValue('');
      await expect(page.locator('#calculated-edd-and-gestational')).toBeHidden();
    });

    test('an EDD more than two weeks in the past is rejected and blocks Save/Next; a valid one clears it', async ({ page, createSectionEncounter }) => {
      // eddCannotBeOlderThanTwoWeeks (shared); boundaries are tested away from the 14-day edge because of _shared V7
      await pregnant(page, createSectionEncounter);
      const edd = page.locator('#edd input[type=text]');
      const message = page.locator('#edd .field-error');
      await pickDate(edd, iso(-5));
      await expect(message).toBeHidden();
      await pickDate(edd, iso(-30));
      await expect(message).toContainText(/older than 2 weeks/i);
      await expect(page.locator('#submit')).toBeDisabled();
      await expect(page.locator('#next')).toBeDisabled();
      await pickDate(edd, iso(100));
      await expect(message).toBeHidden();
      await expect(page.locator('#submit')).toBeEnabled();
    });

    test('an EDD more than 10 months after the encounter is rejected (see _shared V1, remove test.fixme() when fixed)', async ({ page, createSectionEncounter }) => {
      test.fixme(); // _shared V1: the second validator wipes the message and re-enables Save
      await pregnant(page, createSectionEncounter);
      await pickDate(page.locator('#edd input[type=text]'), iso(400));
      await expect(page.locator('#edd .field-error')).toContainText(/10 months/i);
      await expect(page.locator('#submit')).toBeDisabled();
    });
  });

  test.describe('contacts (zl.js setUpExpandableContacts)', () => {
    const visibleContacts = (page: Page) =>
      page.locator('.contacts').evaluateAll((els) => els.map((e) => ((e as HTMLElement).offsetParent !== null ? 1 : 0)).join(''));

    test('only contact 1 shows at first; "show more" adds one, "show less" removes one', async ({ page, createSectionEncounter }) => {
      await openAs(page, createSectionEncounter, 'M', 30);
      expect(await visibleContacts(page)).toBe('1000000000');
      await page.locator('#show-more-contacts-button').click();
      await page.locator('#show-more-contacts-button').click();
      expect(await visibleContacts(page)).toBe('1110000000');
      await page.locator('#show-less-contacts-button').click();
      expect(await visibleContacts(page)).toBe('1100000000');
    });

    test('a malformed phone number shows the message and disables Next/Save; valid formats clear it', async ({ page, createSectionEncounter }) => {
      await openAs(page, createSectionEncounter, 'M', 30);
      const phone = page.locator('#contact-hiv-phone-1 input[type=text]');
      const message = page.locator('#contact-phone-error-message-1');
      for (const [value, valid] of [['abc', false], ['12345678', true], ['1234-5678', true], ['123', false]] as Array<[string, boolean]>) {
        await phone.fill(value);
        await phone.blur();
        if (valid) {
          await expect(message, value).toHaveText('');
          await expect(page.locator('#submit'), value).toBeEnabled();
        } else {
          await expect(message, value).toContainText(/invalid phone number/i);
          await expect(page.locator('#submit'), value).toBeDisabled();
          await expect(page.locator('#next'), value).toBeDisabled();
        }
      }
    });

    test('clearing a valid phone number leaves no message and Save enabled', async ({ page, createSectionEncounter }) => {
      // _shared V3 says an empty value fails both patterns; not reproduced after a valid value (the handler does not flag it).
      await openAs(page, createSectionEncounter, 'M', 30);
      const phone = page.locator('#contact-hiv-phone-1 input[type=text]');
      await phone.fill('12345678');
      await phone.fill('');
      await phone.blur();
      await expect(page.locator('#contact-phone-error-message-1')).toHaveText('');
      await expect(page.locator('#submit')).toBeEnabled();
    });
  });

  test('start and end dates limit each other inside a medication row', async ({ page, createSectionEncounter }) => {
    // setUpDatepickerStartAndEndDateValidation :84 on `.startDateEndDate` rows (Cotrimoxazole, :1627)
    await openAs(page, createSectionEncounter, 'M', 30);
    const row = page.locator('tr.startDateEndDate', { has: page.locator('input[toggleDim="Cotrimoxazole-hx"]') });
    await row.locator('input[toggleDim="Cotrimoxazole-hx"]').check();
    const start = row.locator('.startDate input[type=text]');
    const end = row.locator('.endDate input[type=text]');
    const limit = (input: Locator, option: string) =>
      input.evaluate((el, o) => {
        const d = (window as unknown as { jq: (e: unknown) => { datepicker: (...a: unknown[]) => Date | null } }).jq(el).datepicker('option', o);
        return d ? new Date(d).toDateString() : null;
      }, option);
    await pickDate(start, iso(-10));
    expect(await limit(end, 'minDate')).toBe(new Date(`${iso(-10)}T12:00:00`).toDateString());
    await pickDate(end, iso(-2));
    expect(await limit(start, 'maxDate')).toBe(new Date(`${iso(-2)}T12:00:00`).toDateString());
  });

  test.describe('isoniazid (zl.js manageInputActivationForRadioButton)', () => {
    const box = (page: Page) => page.locator('input[toggleDim="Isoniazide-hx"]');
    const line = (page: Page) => page.locator('#treatmentLine input[type=radio]');
    const startInput = (page: Page) => page.locator('#inhStartDate input[type=text]');

    test('ticking asks for a treatment line, choosing one enables the dates and requires a start date; untick resets; re-tick works', async ({ page, createSectionEncounter }) => {
      await openAs(page, createSectionEncounter, 'M', 30);
      await expect(startInput(page)).toBeDisabled();
      await box(page).check();
      await expect(page.locator('#treatmentLine .field-error')).toBeVisible();
      await expect(startInput(page)).toBeDisabled();
      await line(page).first().check();
      await expect(startInput(page)).toBeEnabled();
      await expect(page.locator('#inhEndDate input[type=text]')).toBeEnabled();
      await expect(page.locator('#inhStartDate .field-error')).toBeVisible();
      await box(page).uncheck();
      await expect(startInput(page)).toBeDisabled();
      await expect(page.locator('#previous-meds .field-error:visible')).toHaveCount(0);
      // _shared V2 is not reproduced: the radio is cleared on untick, so a new choice is needed and then works
      await box(page).check();
      await line(page).first().check();
      await expect(startInput(page)).toBeEnabled();
    });

    test('Save is blocked while the start date is missing', async ({ page, createSectionEncounter }) => {
      await openAs(page, createSectionEncounter, 'M', 30);
      await fillRequired(page, 30);
      await box(page).check();
      await line(page).first().check();
      await page.locator('#submit').click();
      await expect(page.locator('#inhStartDate .field-error')).toBeVisible();
      await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    });

    test('with the start date given, Save stores the isoniazid row', async ({ page, api, createSectionEncounter }) => {
      await openAs(page, createSectionEncounter, 'M', 30);
      await fillRequired(page, 30);
      await box(page).check();
      await line(page).first().check();
      await pickDate(startInput(page), iso(-15));
      await save(page);
      const displays = await obsDisplays(api, section.encounter.uuid);
      expect(displays.some((d) => d.includes('isoniazid')), 'isoniazid').toBeTruthy();
      expect(displays.some((d) => d.includes(`historical drug start date: ${iso(-15)}`)), 'start date').toBeTruthy();
    });
  });

  test.describe('mode of transmission and the required radios', () => {
    test('a patient over 9 must tick a transmission mode: Save shows "required" until one is ticked', async ({ page, createSectionEncounter }) => {
      // script :1024 updateLastCheckboxRequired (_shared V6: the message is already visible on load)
      await openAs(page, createSectionEncounter, 'M', 30);
      const message = page.locator('#trans-required-msg');
      await page.locator('#submit').click();
      await expect(message).toBeVisible();
      await expect(page).not.toHaveURL(VISIT_PAGE_URL);
      await page.locator(`input[toggleDim="${TRANSMISSION_MEN}"]`).check();
      await expect(message).toBeHidden();
    });

    test('Save with the 15 required radios blank shows 7 + 8 "Required" errors and does not save', async ({ page, createSectionEncounter }) => {
      // required="true" :1116 (risk factors) and :1585 (TB screening)
      await openAs(page, createSectionEncounter, 'F', 30);
      await page.locator(`input[toggleDim="${TRANSMISSION_MEN}"]`).check();
      await page.locator('#submit').click();
      await expect(page.locator('#risk span.field-error:visible', { hasText: /required/i })).toHaveCount(7);
      await expect(page.locator('#tb-screen span.field-error:visible', { hasText: /required/i })).toHaveCount(8);
      await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    });
  });

  // ---- save, program enrollment, EDIT ----
  const saveWoman = async (page: Page, api: APIRequestContext, createSectionEncounter: CustomTestFixtures['createSectionEncounter']) => {
    await openAs(page, createSectionEncounter, 'F', 30);
    await fillRequired(page, 30);
    await pickDate(page.locator(`[id="${TRANSMISSION_MEN}"] input[type=text]`).first(), iso(-3));
    await page.locator('#hivpregnant input[type=radio]').first().check();
    await pickDate(page.locator('#lastPeriodDate input[type=text]'), iso(-100));
    await page.locator('#transfer-referral-spots input[type=radio]').first().check(); // referral
    await page.locator('#transfer-spots input[type=radio]').nth(1).check(); // external
    await page.locator('#external-transfer input[type=text]').first().fill('Clinic Elsewhere');
    await page.locator('#chw-name input[type=text]').fill('Auto CHW');
    await page.locator('input[toggleDim="pneumonia-mhf-data"]').check();
    await page.locator('.pneumonia-mhf-data input[type=text]').last().fill('Mild');
    await page.locator('input[toggleHide=activeTB]').check();
    await page.locator('input[toggleDim="initialTreatment"]').first().check();
    await pickDate(page.locator('.initialTreatment .startDate input[type=text]').first(), iso(-20));
    await page.locator('#contact-1 input[type=text]').nth(0).fill('Mimi');
    await page.locator('#contact-hiv-phone-1 input[type=text]').fill('12345678');
    await page.locator('fieldset#presenting-history textarea').fill('Fever for two weeks');
    await save(page);

    const displays = await obsDisplays(api, section.encounter.uuid);
    for (const expected of [
      'pregnancy status: yes', `date of last menstrual period: ${iso(-100)}`, `expected delivery date: ${iso(180)}`,
      'referral or transfer?: referral', 'name of external transfer location: clinic elsewhere', 'name of community health worker: auto chw',
      'past medical history finding: pneumonia', 'past medical history added (text): mild', 'history of tuberculosis: yes',
      `historical drug start date: ${iso(-20)}`, 'first name: mimi', 'telephone number of contact: 12345678', 'presenting history: fever for two weeks',
      'hiv risk factor: sexually active with men', 'history of syphilis: yes', 'tb symptom present: fever and night sweats',
    ]) {
      expect(displays.some((d) => d.includes(expected)), expected).toBeTruthy();
    }
    // age > 1, :108: enrolled in HIV without a checkbox
    expect(await enrollments(api, section.patient.uuid)).toEqual(['HIV']);

    await open(page);
    // when :407, :208, :221 and toggle :1284, :1454, :1527 start from the saved values
    await expect(page.locator('#pregnant')).toBeVisible();
    await expect(page.locator('#edd input[type=hidden]')).toHaveValue(iso(180));
    await expect(page.locator('#transfer-referral-details')).toBeVisible();
    await expect(page.locator('#external-transfer')).toBeVisible();
    await expect(page.locator('#internal-transfer')).toBeHidden();
    await expect(page.locator('#activeTB')).toBeVisible();
    await expect(page.locator('#ae')).toBeHidden();
    await expect(page.locator('input[toggleDim="pneumonia-mhf-data"]')).toBeChecked();
    await expect(page.locator('.pneumonia-mhf-data input[type=text]').last()).toHaveValue('Mild');
    await expect(page.locator('input[toggleDim="initialTreatment"]').first()).toBeChecked();
    await expect(page.locator('#chw-name input[type=text]')).toHaveValue('Auto CHW');
    await expect(page.locator('#contact-1 input[type=text]').nth(0)).toHaveValue('Mimi');
    await expect(page.locator('#submit')).toBeEnabled();
  };

  test('a woman: saves the answers and enrolls in HIV; EDIT starts from the saved values', async ({ page, api, createSectionEncounter }) => {
    await saveWoman(page, api, createSectionEncounter);
  });

  test('VIEW: a woman\'s saved answers (HAI-1278, remove test.fixme() when fixed)', async ({ page, api, createSectionEncounter }) => {
    test.fixme(); // HAI-1278: mch.js setUpEdd calls getField, which the visit page does not define
    await saveWoman(page, api, createSectionEncounter);
    // what was saved is shown under its blocks; what was not answered (delivery, a second contact) is not
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, await viewLabels(api, section.encounter.uuid));
    const shown = await view.valueTexts();
    for (const expected of ['Clinic Elsewhere', 'Auto CHW', 'Mild', 'Mimi', '12345678', 'Fever for two weeks', viewDate(iso(-100)), viewDate(iso(180)), viewDate(iso(-20)), '[X] External']) {
      expect(shown, expected).toContain(expected);
    }
    await expect(view.page.locator('#chw-name .value')).toHaveText('Auto CHW');
    await expect(view.page.locator('#external-transfer .value').first()).toHaveText('Clinic Elsewhere');
    await expect(view.page.locator('#internal-transfer .value')).toHaveCount(0);
    await expect(view.page.locator('#hiv-delivery .value')).toHaveCount(0);
    await expect(view.page.locator('#contact-1 .value').first()).toHaveText('Mimi');
    await expect(view.page.locator('#contact-2 .value')).toHaveCount(0);
    await expect(view.page.locator('fieldset#presenting-history .value')).toHaveText('Fever for two weeks');
    await expect(view.page.locator('#buttons, #submit, #next, #cancel')).toHaveCount(0);
  });

  const enrollmentCases: Array<{ name: string; gender: 'M' | 'F'; age: number; box: number; program: string[] }> = [
    { name: 'a 5-year-old is enrolled in HIV automatically (:108)', gender: 'M', age: 5, box: -1, program: ['HIV'] },
    { name: 'an infant who ticks EID is enrolled in EID (:123)', gender: 'M', age: 1, box: 0, program: ['EID'] },
    { name: 'an infant who ticks HIV is enrolled in HIV (:128)', gender: 'F', age: 1, box: 1, program: ['HIV'] },
    { name: 'an infant who ticks neither is not enrolled', gender: 'M', age: 1, box: -1, program: [] },
  ];
  for (const c of enrollmentCases) {
    test(`program enrollment: ${c.name}`, async ({ page, api, createSectionEncounter }) => {
      await openAs(page, createSectionEncounter, c.gender, c.age);
      await fillRequired(page, c.age);
      if (c.box >= 0) {
        await page.locator('#hiv-program .checkbox-radio-option input[type=checkbox]').nth(c.box).check();
      }
      if (c.age < 2) {
        // :585, :526: a birth-history answer is saved too
        await page.locator('#delivery-locale input[type=radio]').first().check();
        await page.locator('#feeding input[type=radio]').first().check();
      }
      await save(page);
      expect(await enrollments(api, section.patient.uuid)).toEqual(c.program);
      if (c.age < 2) {
        const displays = await obsDisplays(api, section.encounter.uuid);
        expect(displays.some((d) => d.includes('exclusive breastfeeding') || d.includes('feeding')), 'feeding answer').toBeTruthy();
      }
    });
  }

  // VIEW of an infant: the infant blocks carry the saved answers, the adult-only blocks are not rendered.
  test('VIEW: an infant shows the saved birth and feeding answers and none of the adult blocks', async ({ page, api, createSectionEncounter }) => {
    await openAs(page, createSectionEncounter, 'M', 1);
    await fillRequired(page, 1);
    await page.locator('#delivery-locale input[type=radio]').first().check();
    await page.locator('#feeding input[type=radio]').first().check();
    await save(page);

    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, await viewLabels(api, section.encounter.uuid));
    await expect(view.page.locator('#delivery-locale .value')).toHaveCount(1);
    await expect(view.page.locator('#feeding .value')).toHaveCount(1);
    await expect(view.page.locator('#mother-info .value')).toHaveCount(0); // not answered
    await expect(view.page.locator('#hivpregnant, #hiv-delivery, #transmission, #psych')).toHaveCount(0);
    await expect(view.page.locator('#buttons, #submit, #next, #cancel')).toHaveCount(0);
  });

  test('EDIT with a saved first contact: "show more" reveals contact 2 (see _shared V4, remove test.fixme() when fixed)', async ({ page, createSectionEncounter }) => {
    test.fixme(); // _shared V4: the loop skips contact 2 when contact 1 is filled
    await openAs(page, createSectionEncounter, 'M', 30);
    await fillRequired(page, 30);
    await page.locator('#contact-1 input[type=text]').nth(0).fill('Mimi');
    await save(page);
    await open(page);
    await page.locator('#show-more-contacts-button').click();
    await expect(page.locator('#contact-2')).toBeVisible();
  });
});
