import { type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type SectionEncounter } from '../../core';
import { PMTCT_INTAKE_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { SectionFormPage, expectViewShowsSavedObs } from '../../pages';

// hiv/section-pmtct-history.xml v1.0 "PMTCT History": the history part of a PMTCT intake: CHW, transfer/referral in, HIV
// serology, up to 10 contacts, mode of transmission, risk factors, syphilis, Ob/Gyn (pregnancy, EDD), adverse events,
// past medical/family/TB history, TB screening, previous prophylaxis and ARV regimens, family planning, presenting history,
// radiology, counselling, ARV adherence, breastfeeding. Section of the PMTCT intake encounter (584124b9); the specs open its
// edit URL directly with an adult female (the visit-page gate is female and age >= 10, documentation/_availability.e2e.md).
// There is no Next/Save split to test: `#submit` is a native submit button (`SectionFormPage.save()`); `#next` needs the visit page.
//
// Conditions in the form, from documentation inventory (section-pmtct-history.inv.md):
//   ifMode VIEW include=false  :7, :73, :276, :1302   CSS, heading + script, show-more/less buttons, the #buttons row (ENTER/EDIT only)
//   when Referral/Transfer (PIH:REFERRAL OR TRANSFER)  :127/:128  show #transfer-referral-details
//   when Internal/External (PIH:REFERRED FROM ANOTHER SITE)  :140/:141  show #internal-transfer / #external-transfer
//   includeIf $patient.gender == 'F'  :151   the "Referred by Women's Health" checkbox (fixtures: female and male patient)
//   toggle (show/hide, plain): syphilis screening :423 -> #syph-screen; syphilis treatment mother/partner :442/:456 ->
//     #mom-syph-treat / #partner-syph-treat; Pregnant :478 -> #pregnant (LMP + EDD); adverse event :599 -> #ae; active TB :758
//     -> #activeTB; radiology :1147 -> #chestXRay / #pelvicUS / #abUS
//   toggle style dim (the row's inputs are DISABLED, not hidden, until the box is ticked): transmission :306, :332
//     (10 modes + Other), past medical history :677 (20 rows), TB treatment :830 (3, inside #activeTB), previous meds
//     :932/:953/:978/:1022/:1044 (prophylaxis 4, ARV regimens 4 + Other; Other also enables the "specify" text)
//   toggle on the risk radios :373 (8 rows) and :398 (Other): see V3
//   when :1185 post-test counselling Yes -> #post-test-counseling-date; :1237 daily ARV dose No -> #side-by-side-reason;
//     :1279 breastfed since last visit Yes -> #bf-status; :1288 stopped breastfeeding -> #wean-date
// Scripts (:78-91, jq ready): setUpEdd (LMP -> EDD = LMP + 280 d, GA "N M/7 weeks", box #calculated-edd-and-gestational),
//   validateEstimatedDeliveryDate + eddCannotBeOlderThanTwoWeeks on #edd (see _shared V1, V7), setUpExpandableContacts
//   (show more/less, phone pattern; see _shared V3, V4), setUpDatepickerStartAndEndDateValidation (.startDate/.endDate pairs),
//   setUpObsWithObsDateTime('syph-checkbox') (date max = now), setUpNextAndSubmitButtons, manageInputActivationForRadioButton
//   for isoniazid (see _shared V2), updateLastCheckboxRequired on #transmission (at least one mode; see _shared V6).
// Required: 8 risk radios (:373), gravida/para/abortus/living (:530-548), 8 TB screening questions (:886), one transmission mode.
// Side effects on save: <enrollInProgram programId="HIV" locationTag="Program Location"> :97 (tested); postSubmissionAction
//   CleanDiagnosisConstructAction :4 (Dysmenorrhea sits in a PIH:Visit Diagnoses group; saved, see the save test).
// Hidden fields typed and then hidden (external transfer location, LMP) are not submitted (tested).
// Date widgets are readonly datepickers: the helper `pickDate` sets them through jQuery UI and fires `change` on the hidden
//   input that carries the value (that is what the EDD validators listen to).
// VIEW (getAsHtml.action on the saved encounter, end of the save test): every saved obs is shown (dates as dd MMM yyyy), blocks
//   that were not answered show no value, and #buttons (:1302) is absent.
// Not covered here: #next (needs the visit page), the family-history widget rows, radiology "other" select, each of the
//   10 contacts, per-row obs of the 20 history rows beyond the dim-state check.
//
// Findings (V1.. numbered High -> Low -> Info; see "Verify mode"):
//   V1 Medium (see _shared V1)  EDD more than 305 days in the future is not flagged  (TESTED below with test.fixme)
//   V2 Medium (see _shared V2)  untick/re-tick of #Isoniazide leaves the date widgets disabled  (TESTED below with test.fixme)
//   V3 Low :373, :398  `toggle` on the risk radios (answers No/Yes/Unknown) has no effect: the date inputs are enabled from the
//     start (observed), so a date can be entered next to "No". Fix: drop the toggle or enable the date only for Yes
//   V4 Low :1126-1130  `id="presenting-history"` on both the <section> and the textarea obs. Fix: rename one

const FORM = 'hiv/section-pmtct-history.xml';

test.use({ timezoneId: 'America/Port-au-Prince' });

const save = async (page: Page) => {
  await page.locator('#submit').click();
};

// True while the browser is still on the edit form (the return URL is a parameter of it, so use the path).
const onForm = (page: Page): boolean => new URL(page.url()).pathname.includes('editHtmlFormWithStandardUi');

// Local helper: display of each obs on the (synthetic) encounter (group parents included), lower case.
const obsDisplays = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> => {
  const res = await api.get(`obs?encounter=${encounterUuid}&v=custom:(display)&limit=300`);
  expect(res.ok()).toBeTruthy();
  return ((await res.json()).results as Array<{ display: string }>).map((o) => o.display.toLowerCase());
};

// Local helper: labels for the VIEW check (obs display -> text shown): dates are dd MMM yyyy, coded answers use the form's answerCodes.
const viewLabels = async (api: APIRequestContext, encounterUuid: string): Promise<Record<string, string>> => {
  const res = await api.get(`obs?encounter=${encounterUuid}&v=custom:(display)&limit=300`);
  expect(res.ok()).toBeTruthy();
  const labels: Record<string, string> = {};
  for (const { display } of (await res.json()).results as Array<{ display: string }>) {
    const date = display.match(/^[^:]+: (\d{4})-(\d{2})-(\d{2})$/);
    if (date) {
      const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(date[2]) - 1];
      labels[display] = `${date[3]} ${month} ${date[1]}`;
    } else if (display === 'Diagnosis order: Secondary') {
      labels[display] = ''; // written by CleanDiagnosisConstructAction next to the Dysmenorrhea checkbox, no field of the form shows it
    } else if (display.startsWith('Referred from another site:')) {
      labels[display] = 'External'; // answerCodes pihcore.internal/external
    } else if (display.startsWith('Feeding plan: Breastfed exclusively')) {
      labels[display] = 'Exclusively'; // answerCodes pihcore.exclusively
    } else if (display.startsWith('TB symptom absent:')) {
      labels[display] = 'No';
    } else if (display.startsWith('TB symptom present:')) {
      labels[display] = 'Yes';
    }
  }
  return labels;
};

// Local helper: the date widgets are readonly jQuery UI datepickers; set the date and fire `change` on the display and hidden inputs.
const pickDate = async (input: Locator, daysFromNow: number) => {
  await input.evaluate((el, ms) => {
    const j = (window as any).jq;
    j(el).datepicker('setDate', new Date(ms));
    j(el).trigger('change');
    j(el).closest('span').find('input[type=hidden]').trigger('change');
  }, Date.now() + daysFromNow * 86400000);
};

// Fills everything the form requires, so that a test can focus on one more thing before saving.
const fillRequired = async (page: Page) => {
  await page.locator('#transmission').getByLabel('Blood transfusion', { exact: true }).check();
  for (const row of await page.locator('#risk p.radio').all()) {
    await row.locator('input[type=radio]').first().check(); // No
  }
  for (const row of await page.locator('#tb-screen .tb-screening-question').all()) {
    await row.locator('input[type=radio]').nth(1).check(); // No
  }
  const ob = page.locator('#obgyn-section .four-columns input[type=text]');
  for (const [i, v] of ['2', '1', '0', '1'].entries()) {
    await ob.nth(i).fill(v);
  }
};

test.describe('section-pmtct-history', () => {
  let section: SectionEncounter;

  const open = async (page: Page) => {
    await SectionFormPage.openEdit(page, FORM, section);
  };

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: PMTCT_INTAKE_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoPmtctHx', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(28) },
    });
    await open(page);
  });

  test('referral/transfer, then internal/external, show their blocks', async ({ page }) => {
    // when :127/:128 and :140/:141
    const details = page.locator('#transfer-referral-details');
    const internal = page.locator('#internal-transfer');
    const external = page.locator('#external-transfer');
    await expect(details).toBeHidden();
    await page.locator('#transferIn').getByLabel('Referral', { exact: true }).check();
    await expect(details).toBeVisible();
    await expect(internal).toBeHidden();
    await expect(external).toBeHidden();
    await page.locator('#transferIn').getByLabel('Transfer', { exact: true }).check();
    await expect(details).toBeVisible();
    await page.locator('#transferIn').getByLabel('Internal', { exact: true }).check();
    await expect(internal).toBeVisible();
    await expect(external).toBeHidden();
    await page.locator('#transferIn').getByLabel('External', { exact: true }).check();
    await expect(external).toBeVisible();
    await expect(internal).toBeHidden();
  });

  test('the "Referred by Women\'s Health" checkbox exists for a female patient only', async ({ page, createSectionEncounter }) => {
    // includeIf :151: female (the beforeEach patient) and male
    await expect(page.locator('#transferIn').getByLabel(/^Referred by/)).toHaveCount(1);
    const male = await createSectionEncounter({
      encounterTypeUuid: PMTCT_INTAKE_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoPmtctHxM', familyName: 'Tester', gender: 'M', birthdate: birthdateYearsAgo(30) },
    });
    await SectionFormPage.openEdit(page, FORM, male);
    await expect(page.locator('#internal-transfer')).toHaveCount(1);
    await expect(page.locator('#transferIn').getByLabel(/^Referred by/)).toHaveCount(0);
  });

  // [section, checkbox label, target] for the plain (show/hide) toggles
  const showToggles: Array<[string, string | RegExp, string]> = [
    ['#syphilis-section', 'Screening for syphilis', '#syph-screen'], // :423
    ['#syphilis-section', /^Syphilis treatment for pregnant/, '#mom-syph-treat'], // :442
    ['#syphilis-section', /^Syphilis treatment for partner/, '#partner-syph-treat'], // :456
    ['#obgyn-section', 'Pregnant', '#pregnant'], // :478
    ['#hiv-adverse-event', 'Yes', '#ae'], // :599
    ['#tb-history', 'Yes', '#activeTB'], // :758
    ['#radiology-findings', 'Chest X-ray', '#chestXRay'], // :1147
    ['#radiology-findings', 'Pelvic Ultrasound', '#pelvicUS'],
    ['#radiology-findings', 'Abdominal Ultrasound', '#abUS'],
  ];
  for (const [sec, label, target] of showToggles) {
    test(`checkbox ${String(label)} shows ${target}`, async ({ page }) => {
      const box = page.locator(sec).getByLabel(label, { exact: typeof label === 'string' });
      await expect(page.locator(target)).toBeHidden();
      await box.check();
      await expect(page.locator(target)).toBeVisible();
      await box.uncheck();
      await expect(page.locator(target)).toBeHidden();
    });
  }

  // [section, row labels, dependents inside the row, pre-step]: toggle style "dim" disables, it does not hide
  const dimTables: Array<[string, string, Array<string | RegExp>, string]> = [
    [
      'mode of transmission (:306, :332)',
      '#transmission',
      [
        'Sexually active with men', 'Sexually active with women', 'Intravenous drug use', 'Blood transfusion',
        /^Maternal to fetal transmission/, /^Accidental exposure to blood/, /^Sex with person known/,
        /^Sex with injectable drug/, /^Heterosexual sex with bisexual/, /^Heterosexual sex with person/, 'Other',
      ],
      'input.hasDatepicker',
    ],
    [
      'past medical history (:677)',
      '#patient-history',
      [
        'Pneumonia', 'Herpes Zoster', 'Oral candidiasis', 'Dermatitis', 'Enteropathy', 'Diarrhea', 'Anemia', 'Sexually transmitted infection',
        'Neuropathy', 'Seizure', 'Other neurological symptoms', 'Hypertension', 'Cardiovascular disease', 'Hepatitis', 'Diabetes', 'Surgery',
        'Cholera', 'Chikungunya', 'Disease due to COVID-19', 'Other',
      ],
      'input:not([type=checkbox]):not([type=hidden])',
    ],
    [
      'TB treatment history (:830)',
      '#tb-history',
      ['Initial treatment: 2HRZE / 4HR', 'Retreatment: 2HRZE / 4HR', 'MDR TB treatment'],
      'input:not([type=checkbox]):not([type=hidden])',
    ],
    [
      'previous prophylaxis and ARV regimens (:932-:1044; isoniazid has its own test)',
      '#previous-meds',
      [
        'Cotrimoxazole', 'Fluconazole', 'Dapsone', 'TDF + 3TC + (EFV or NVP)', 'AZT + 3TC + (EFV or NVP)',
        'Regimen with D4T', 'TDF + 3TC + LPV/r', 'Other',
      ],
      'input:not([type=checkbox]):not([type=hidden])',
    ],
  ];
  for (const [title, sec, labels, dependents] of dimTables) {
    test(`dim toggles: ${title} enable the row only while ticked`, async ({ page }) => {
      if (sec === '#patient-history') {
        test.setTimeout(60_000); // 20 labels at ~1.3s each: over the default 30s
      }
      if (sec === '#tb-history') {
        await page.locator(sec).getByLabel('Yes', { exact: true }).check(); // the rows live in #activeTB
      }
      const root = page.locator(sec);
      for (const label of labels) {
        const exact = typeof label === 'string';
        const box = root.getByLabel(label, { exact });
        // `has` is evaluated inside the row, so it takes a locator that is not rooted at the section
        const inputs = root.locator('tr').filter({ has: page.getByLabel(label, { exact }) }).locator(dependents);
        const n = await inputs.count();
        expect(n, String(label)).toBeGreaterThan(0);
        for (let i = 0; i < n; i++) {
          await expect(inputs.nth(i), `${String(label)} #${i} before`).toBeDisabled();
        }
        await box.check();
        for (let i = 0; i < n; i++) {
          await expect(inputs.nth(i), `${String(label)} #${i} ticked`).toBeEnabled();
        }
        await box.uncheck();
        await expect(inputs.first(), `${String(label)} unticked`).toBeDisabled();
      }
    });
  }

  test('ticking "Other" in the ARV regimens also enables the "specify" text', async ({ page }) => {
    // toggle :1044 (class otherHivMedHx on the specify row)
    const specify = page.locator('#previous-meds tr', { hasText: 'specify' }).locator('input[type=text]').last();
    await expect(specify).toBeDisabled();
    await page.locator('#previous-meds').getByLabel('Other', { exact: true }).check();
    await expect(specify).toBeEnabled();
  });

  // [radio wrapper, trigger label, other label, target]
  const whenRows: Array<[string, string, string, string]> = [
    ['#post-test-counseling', 'Yes', 'No', '#post-test-counseling-date'], // :1185
    ['#daily-dose-arv', 'No', 'Yes', '#side-by-side-reason'], // :1237
    ['#breast-since-visit', 'Yes', 'No', '#bf-status'], // :1279
  ];
  for (const [wrapper, trigger, other, target] of whenRows) {
    test(`${wrapper}: ${trigger} shows ${target}, ${other} hides it`, async ({ page }) => {
      const radios = page.locator(wrapper);
      await expect(page.locator(target)).toBeHidden();
      await radios.getByLabel(trigger, { exact: true }).check();
      await expect(page.locator(target)).toBeVisible();
      await radios.getByLabel(other, { exact: true }).check();
      await expect(page.locator(target)).toBeHidden();
    });
  }

  test('"Stopped breastfeeding" shows the wean date', async ({ page }) => {
    // when :1288, nested in #bf-status (:1279)
    await page.locator('#breast-since-visit').getByLabel('Yes', { exact: true }).check();
    await expect(page.locator('#wean-date')).toBeHidden();
    await page.locator('#breastfeeding-mom').getByLabel('Mixed', { exact: true }).check();
    await expect(page.locator('#wean-date')).toBeHidden();
    await page.locator('#breastfeeding-mom').getByLabel('Stopped breastfeeding', { exact: true }).check();
    await expect(page.locator('#wean-date')).toBeVisible();
  });

  test('LMP computes the EDD (+280 days) and the gestational age', async ({ page }) => {
    // setUpEdd :81, mch.js (see _shared): LMP 60 days ago = 8 weeks 4 days
    await page.locator('#obgyn-section').getByLabel('Pregnant', { exact: true }).check();
    await expect(page.locator('#calculated-edd-and-gestational')).toBeHidden();
    await pickDate(page.locator('#lastPeriodDate input.hasDatepicker'), -60);
    const lmp = await page.locator('#lastPeriodDate input[type=hidden]').inputValue();
    const [y, m, d] = lmp.split('-').map(Number);
    const expectedEdd = new Date(Date.UTC(y, m - 1, d + 280)).toISOString().slice(0, 10);
    await expect(page.locator('#edd input[type=hidden]')).toHaveValue(expectedEdd);
    await expect(page.locator('#calculated-edd-and-gestational')).toBeVisible();
    await expect(page.locator('#calculated-gestational-age-value')).toContainText('8 4/7');
  });

  test('an EDD older than two weeks shows a message and disables Save until it is corrected', async ({ page }) => {
    // eddCannotBeOlderThanTwoWeeks :83 (+ _shared V7 for the boundary: test far from it)
    await page.locator('#obgyn-section').getByLabel('Pregnant', { exact: true }).check();
    const edd = page.locator('#edd input.hasDatepicker');
    await pickDate(edd, -30);
    await expect(page.locator('#edd .field-error')).toContainText('older than 2 weeks');
    await expect(page.locator('#submit')).toBeDisabled();
    await expect(page.locator('#next')).toBeDisabled();
    await pickDate(edd, 100);
    await expect(page.locator('#edd .field-error')).toBeHidden();
    await expect(page.locator('#submit')).toBeEnabled();
  });

  test.fixme('V1 an EDD more than 10 months in the future shows a message and disables Save (see _shared V1)', async ({ page }) => {
    // validateEstimatedDeliveryDate :82; remove test.fixme() when fixed (the second validator re-enables Save and clears the message)
    await page.locator('#obgyn-section').getByLabel('Pregnant', { exact: true }).check();
    await pickDate(page.locator('#edd input.hasDatepicker'), 400);
    await expect(page.locator('#edd .field-error')).toContainText('10 months');
    await expect(page.locator('#submit')).toBeDisabled();
  });

  test('contacts: "show more" reveals the next contact and a bad phone number blocks Save and Next', async ({ page }) => {
    // setUpExpandableContacts :84 (zl.js, see _shared V3/V4 for its defects); contact 2..10 hidden on load
    await expect(page.locator('#contact-1')).toBeVisible();
    await expect(page.locator('#contact-2')).toBeHidden();
    await page.locator('#show-more-contacts-button').click();
    await expect(page.locator('#contact-2')).toBeVisible();
    const phone = page.locator('#contact-hiv-phone-1 input');
    await phone.fill('12ab');
    await phone.blur();
    await expect(page.locator('#contact-phone-error-message-1')).toContainText('Invalid phone number');
    await expect(page.locator('#submit')).toBeDisabled();
    await expect(page.locator('#next')).toBeDisabled();
    await phone.fill('1234 5678');
    await phone.blur();
    await expect(page.locator('#contact-phone-error-message-1')).toBeEmpty();
    await expect(page.locator('#submit')).toBeEnabled();
  });

  test('a treatment end date is limited by its start date and the syphilis screening date by today', async ({ page }) => {
    // setUpDatepickerStartAndEndDateValidation :85 (mother's syphilis treatment pair), setUpObsWithObsDateTime :86
    await page.locator('#syphilis-section').getByLabel(/^Syphilis treatment for pregnant/).check();
    const start = page.locator('#mom-syph-treat-start input.hasDatepicker');
    const end = page.locator('#mom-syph-treat-end input.hasDatepicker');
    await pickDate(start, -10);
    const startValue = await page.locator('#mom-syph-treat-start input[type=hidden]').inputValue();
    const minEnd = await end.evaluate((el) => {
      const d = (window as any).jq(el).datepicker('option', 'minDate') as Date | string | null;
      return d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : String(d);
    });
    expect(minEnd).toBe(startValue);
    const maxScreen = await page.locator('#syphilis-section input.hasDatepicker').first().evaluate((el) => {
      const d = (window as any).jq(el).datepicker('option', 'maxDate') as Date | string | null;
      return d instanceof Date && d.toDateString() === new Date().toDateString();
    });
    expect(maxScreen).toBe(true);
  });

  test('isoniazid: the radio is required once ticked, the dates follow the radio and the start date is required', async ({ page }) => {
    // manageInputActivationForRadioButton :90 (zl.js, _shared V2); fixture: everything else valid
    await fillRequired(page);
    const meds = page.locator('#previous-meds');
    const start = page.locator('#inhStartDate input.hasDatepicker');
    await meds.getByLabel('Isoniazide', { exact: true }).check();
    await expect(page.locator('#treatmentLine').locator('xpath=..').locator('.field-error')).toContainText('required');
    await expect(start).toBeDisabled();
    await save(page);
    await expect(page.locator('#treatmentLine').locator('xpath=..').locator('.field-error')).toBeVisible();
    expect(onForm(page)).toBe(true);
    await meds.getByLabel('Primary', { exact: true }).check();
    await expect(start).toBeEnabled();
    await expect(page.locator('#inhEndDate input.hasDatepicker')).toBeEnabled();
    await save(page);
    await expect(page.locator('#inhStartDate .field-error')).toBeVisible(); // start date required
    expect(onForm(page)).toBe(true);
    await pickDate(start, -30);
    await save(page);
    await new SectionFormPage(page, FORM).expectSaved();
  });

  test.fixme('V2 re-ticking isoniazid with a radio chosen re-enables the date widgets (see _shared V2)', async ({ page }) => {
    // remove test.fixme() when fixed: the untick handler reads the checkbox instead of the radio
    const meds = page.locator('#previous-meds');
    await meds.getByLabel('Isoniazide', { exact: true }).check();
    await meds.getByLabel('Primary', { exact: true }).check();
    await expect(page.locator('#inhStartDate input.hasDatepicker')).toBeEnabled();
    await meds.getByLabel('Isoniazide', { exact: true }).uncheck();
    await meds.getByLabel('Isoniazide', { exact: true }).check();
    await expect(page.locator('#inhStartDate input.hasDatepicker')).toBeEnabled();
  });

  test('at least one mode of transmission is required (client rule), then the server-side required fields', async ({ page }) => {
    // updateLastCheckboxRequired :91 and required="true" at :373, :530-548, :886
    await expect(page.locator('#trans-required-msg')).toContainText('required'); // shown on load (_shared V6)
    await save(page);
    expect(onForm(page)).toBe(true);
    await expect(page.locator('#risk span.field-error:visible')).toHaveCount(0); // blocked before the server validated
    await page.locator('#transmission').getByLabel('Intravenous drug use', { exact: true }).check();
    await expect(page.locator('#trans-required-msg')).toBeHidden();
    await save(page);
    await expect(page.locator('#risk span.field-error:visible')).toHaveCount(8);
    await expect(page.locator('#obgyn-section span.field-error:visible')).toHaveCount(4);
    await expect(page.locator('#tb-screen span.field-error:visible')).toHaveCount(8);
    expect(onForm(page)).toBe(true);
  });

  test('an external transfer location typed and then hidden by choosing Internal is not saved', async ({ page, api }) => {
    // when :140/:141 only hide the blocks; hidden inputs are still submitted unless the toggle clears them
    await fillRequired(page);
    await page.locator('#transferIn').getByLabel('Transfer', { exact: true }).check();
    await page.locator('#transferIn').getByLabel('External', { exact: true }).check();
    await page.locator('#external-transfer input[type=text]').fill('Typed then hidden');
    await page.locator('#transferIn').getByLabel('Internal', { exact: true }).check();
    await expect(page.locator('#external-transfer')).toBeHidden();
    await save(page);
    await new SectionFormPage(page, FORM).expectSaved();
    expect((await obsDisplays(api, section.encounter.uuid)).some((d) => d.includes('typed then hidden'))).toBeFalsy();
  });

  test('a last menstrual period typed and then hidden by unticking Pregnant is not saved', async ({ page, api }) => {
    // toggle :478
    await fillRequired(page);
    const pregnant = page.locator('#obgyn-section').getByLabel('Pregnant', { exact: true });
    await pregnant.check();
    await pickDate(page.locator('#lastPeriodDate input.hasDatepicker'), -60);
    await pregnant.uncheck();
    await expect(page.locator('#pregnant')).toBeHidden();
    await save(page);
    await new SectionFormPage(page, FORM).expectSaved();
    const displays = await obsDisplays(api, section.encounter.uuid);
    expect(displays.some((d) => d.includes('menstrual') || d.includes('delivery')), displays.join(' | ')).toBeFalsy();
  });

  test('saves history, enrols the patient in the HIV program, and EDIT shows the saved state', async ({ page, api }) => {
    test.setTimeout(60_000); // save + EDIT + VIEW page loads each take several seconds on the server: over the default 30s
    await fillRequired(page);
    await page.locator('#chwName input').fill('Agent Tester');
    await page.locator('#transferIn').getByLabel('Transfer', { exact: true }).check();
    await page.locator('#transferIn').getByLabel('External', { exact: true }).check();
    await page.locator('#external-transfer input[type=text]').fill('Clinic Elsewhere');
    await page.locator('#contact-first-name-1 input').fill('Contactfirst');
    await page.locator('#contact-hiv-phone-1 input').fill('12345678');
    await pickDate(page.locator('#transmission tr', { has: page.getByLabel('Blood transfusion', { exact: true }) }).locator('input.hasDatepicker'), -400);
    await page.locator('#obgyn-section').getByLabel('Pregnant', { exact: true }).check();
    await pickDate(page.locator('#lastPeriodDate input.hasDatepicker'), -60);
    await page.locator('#obgyn-section').getByLabel('Dysmenorrhea', { exact: true }).check();
    await page.locator('#hiv-adverse-event').getByLabel('Yes', { exact: true }).check();
    await page.locator('#ae-1 input[type=checkbox]').first().check(); // Rash
    const history = page.locator('#patient-history');
    await history.getByLabel('Pneumonia', { exact: true }).check();
    await history.locator('tr', { has: page.getByLabel('Pneumonia', { exact: true }) }).locator('input[type=radio]').nth(1).check(); // yes
    await page.locator('#previous-meds').getByLabel('Cotrimoxazole', { exact: true }).check();
    await page.locator('#presenting-history textarea').fill('Cough for two weeks');
    await page.locator('#daily-dose-arv').getByLabel('No', { exact: true }).check();
    await page.locator('#side-by-side-reason input[type=text]').fill('Ran out of pills');
    await page.locator('#breast-since-visit').getByLabel('Yes', { exact: true }).check();
    await page.locator('#breastfeeding-mom').getByLabel('Exclusively', { exact: true }).check();
    await save(page);
    await new SectionFormPage(page, FORM).expectSaved();

    const displays = await obsDisplays(api, section.encounter.uuid);
    for (const expected of [
      'agent tester', 'clinic elsewhere', 'contactfirst', '12345678', 'blood transfusion', 'cough for two weeks', 'ran out of pills', 'rash',
      'pneumonia', 'cotrimoxazole', 'exclusive', 'dysmenorrhea', 'menstrual', 'delivery',
    ]) {
      expect(displays.some((d) => d.includes(expected)), `${expected} in ${displays.join(' | ')}`).toBeTruthy();
    }

    // enrollInProgram :97
    const res = await api.get(`programenrollment?patient=${section.patient.uuid}&v=custom:(program:(name))`);
    expect(res.ok()).toBeTruthy();
    const programs = ((await res.json()).results as Array<{ program: { name: string } }>).map((e) => e.program.name);
    expect(programs.some((n) => /hiv/i.test(n)), programs.join(',')).toBeTruthy();

    await open(page);
    // when/toggle in EDIT start from the saved values
    await expect(page.locator('#transfer-referral-details')).toBeVisible();
    await expect(page.locator('#external-transfer')).toBeVisible();
    await expect(page.locator('#internal-transfer')).toBeHidden();
    await expect(page.locator('#pregnant')).toBeVisible();
    await expect(page.locator('#ae')).toBeVisible();
    await expect(page.locator('#side-by-side-reason')).toBeVisible();
    await expect(page.locator('#bf-status')).toBeVisible();
    await expect(page.locator('#wean-date')).toBeHidden();
    const pneumonia = history.locator('tr', { has: page.getByLabel('Pneumonia', { exact: true }) }).locator('input[type=radio]');
    await expect(pneumonia.first()).toBeEnabled();
    await expect(page.locator('#presenting-history textarea')).toHaveValue('Cough for two weeks');
    await expect(page.locator('#side-by-side-reason input[type=text]')).toHaveValue('Ran out of pills');
    await expect(page.locator('#previous-meds tr', { has: page.getByLabel('Cotrimoxazole', { exact: true }) }).locator('input.hasDatepicker').first()).toBeEnabled();

    // VIEW: the saved answers appear under their blocks; what was not answered (internal transfer, the wean date) shows no value
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, await viewLabels(api, section.encounter.uuid));
    const shown = await view.valueTexts();
    for (const expected of ['Agent Tester', 'Clinic Elsewhere', 'Contactfirst', '12345678', 'Cough for two weeks', 'Ran out of pills']) {
      expect(shown, expected).toContain(expected);
    }
    expect(shown).toEqual(expect.arrayContaining(['[X] Exclusively', '[X] External', '[X] Dysmenorrhea']));
    await expect(view.page.locator('#chwName .value')).toHaveText('Agent Tester');
    await expect(view.page.locator('#external-transfer .value').first()).toHaveText('Clinic Elsewhere');
    await expect(view.page.locator('#internal-transfer .value')).toHaveCount(0);
    await expect(view.page.locator('#side-by-side-reason .value')).toHaveText('Ran out of pills');
    await expect(view.page.locator('#wean-date .value')).toHaveCount(0);
    await expect(view.page.locator('#presenting-history .value')).toHaveText('Cough for two weeks');
    await expect(view.page.locator('#buttons, #submit, #next, #cancel')).toHaveCount(0);
  });
});
