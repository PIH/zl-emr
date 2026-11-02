import { type Page, type Locator } from '@playwright/test';
import { test, expect, birthdateYearsAgo } from '../../core';
import { VCT_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs, VISIT_PAGE_URL } from '../../pages';

// hiv/vct.xml: "HIV Counseling and Testing (CT)" in one page: screening reasons (checkboxes with sub-options), HIV / RPR /
// hepatitis B test results (obs groups), TB evaluation, plan dates and comments. Top-level form with its own
// provider/location/date (shared subform, default tag "Consult Note Location"). The specs open enterHtmlFormWithStandardUi
// inside a visit they create (EntryFormPage); availability (documentation/_availability.e2e.md: VCT component,
// "Task: emr.enterVCT", not in a visit that already has a VCT encounter) is not exercised. The form uses <submit>, so there
// is no #submit: the specs click `#buttons input.submitButton`.
//
// Conditions in the form, from documentation inventory (vct.inv.md). All are `toggle=` on a checkbox obs: the target
// (`#id`) is hidden until the box is ticked, and HFE clears the ticked sub-options when the box is unticked (tested):
//   toggle CIEL:164082=PIH:11518 :73  #wantstoknow   (partner HIV status)     =PIH:174   :112  #sti        (syphilis / other STI)
//   toggle CIEL:164082=PIH:11519 :133 #risky         (risky activities)       =CIEL:163274 :173 #blood     (health worker / other)
//   toggle CIEL:164082=PIH:11521 :210 #refer         (confirmation/verification test)
//   toggle CIEL:164082=PIH:11557 :231 #contactindex  (index case)             =PIH:11559 :246  #recommend  (services)
//   toggle CIEL:164082=PIH:5622  :305 #otherReason   (blood transfusion, marriage, other + text)
//   toggle PIH:11541=PIH:YES     :440 #tbEval        (five TB symptoms, "yes" and "no" columns)
//   ifMode VIEW include=false :56, :535 header + provider/location/date block, and the buttons (VIEW tested in the save test).
// Scripts: none in the file (only the shared subform's, see _shared.e2e.md).
// Side effects on save: none (no program, order or disposition). No required field apart from provider and location.
// Not covered here: EDIT mode, retro-entry gating of provider/date (_shared.e2e.md), the other result rows
//   (RPR and hepatitis B groups are only touched through the save test), the plan date fields.
//
// Findings:
//   V1 Low :448-461  the TB symptom "yes" (PIH:11563) and "no" (PIH:11564) are independent checkboxes, so both can be ticked for
//                    one symptom and both are saved ("TB symptom present" and "TB symptom absent"). Fix: radios, or script
//                    that unticks the other. (confirmed in the browser; intended exclusivity assumed)

const FORM = 'hiv/vct.xml';
// What the VIEW shows for answers the form labels differently from the concept (answerCode / answerCodes) and for dates
// (the helper does not compare date obs: the dates are given here as the VIEW prints them).
const VIEW_LABELS = {
  'Category of HIV screening: Wants to know test results': 'Patient wants to know his/her status',
  'Category of HIV screening: Reports risky sexual activity': 'Risky sexual activity',
  'Reason for HIV screening note (coded): Sexual activity without condom': 'Without condom',
  'Rapid test for HIV: Negative': '-',
  'TB symptom present: Cough > 2 weeks': 'Yes',
  'HIV test date: 2026-10-01': '01 Oct 2026',
  'Date of pre-test counseling: 2026-10-01': '01 Oct 2026',
  'Date of post-test counseling: 2026-10-02': '02 Oct 2026',
};

// Local helpers.
// <submit/> renders input.submitButton (no #submit). The location select must have a value or "Required" blocks the save.
const save = async (page: Page) => {
  await expect(page.locator('#encounterLocation select')).not.toHaveValue('');
  await page.locator('#buttons input.submitButton').click();
  await expect(page).toHaveURL(VISIT_PAGE_URL);
};
const pickDate = async (input: Locator, isoDate: string) => {
  await input.evaluate((el, iso) => {
    const j = (window as unknown as { jq: (e: unknown) => { datepicker: (...a: unknown[]) => void; trigger: (n: string) => void } }).jq;
    j(el).datepicker('setDate', new Date(`${iso}T12:00:00`));
    j(el).trigger('change');
  }, isoDate);
};

test.describe('vct', () => {
  let patientUuid: string;

  test.beforeEach(async ({ page, createEntryContext }) => {
    const context = await createEntryContext({ givenName: 'AutoVct', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(30) });
    patientUuid = context.patient.uuid;
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#vct-screening')).toBeVisible();
  });

  // toggle :73, :112, :133, :173, :210, :231, :246, :305, :440
  const toggles = [
    { box: 'Patient wants to know his/her status', target: '#wantstoknow' },
    { box: 'Patient has STI', target: '#sti' },
    { box: 'Risky sexual activity', target: '#risky' },
    { box: 'Accident/exposure to blood', target: '#blood', exact: false },
    { box: 'Client referral', target: '#refer' },
    { box: 'Reference partners and families', target: '#contactindex' },
    { box: 'On recommendation by provider', target: '#recommend' },
    { box: 'Other', target: '#otherReason' }, // first "Other" in the DOM is the toggle (the sub-option comes after it)
    { box: 'TB evaluation', target: '#tbEval' },
  ];
  for (const { box, target, exact = true } of toggles) {
    test(`"${box}" shows ${target} only while ticked`, async ({ page }) => {
      const checkbox = page.getByLabel(box, { exact }).first();
      await expect(page.locator(target)).toBeHidden();
      await checkbox.check();
      await expect(page.locator(target)).toBeVisible();
      await checkbox.uncheck();
      await expect(page.locator(target)).toBeHidden();
    });
  }

  test('unticking a toggle clears the sub-options that were ticked under it', async ({ page }) => {
    // toggle :112: HFE clears the hidden children, so they are not saved
    const sti = page.getByLabel('Patient has STI', { exact: true });
    const syphilis = page.getByLabel('Presence/History of syphilis', { exact: true });
    await sti.check();
    await syphilis.check();
    await expect(syphilis).toBeChecked();
    await sti.uncheck();
    await sti.check();
    await expect(syphilis).not.toBeChecked();
  });

  test('saves the screening reasons, the HIV and RPR results with dates, counselling dates, TB evaluation and comments', async ({ page, api }) => {
    await page.getByLabel('Patient wants to know his/her status', { exact: true }).check();
    await page.getByLabel('Partner suspected HIV+', { exact: true }).check();
    await page.getByLabel('Risky sexual activity', { exact: true }).check();
    await page.getByLabel('Without condom', { exact: true }).check();

    const hivRow = page.locator('#vct-test table tr').nth(1);
    await pickDate(hivRow.locator('input.hasDatepicker').first(), '2026-10-01');
    await hivRow.locator('input[type=radio]').nth(1).check(); // negative
    const rprRow = page.locator('#vct-test table tr').nth(2);
    await rprRow.locator('input[type=radio]').first().check(); // reactive

    await pickDate(page.locator('p', { hasText: 'Pre-test counseling date' }).locator('input.hasDatepicker'), '2026-10-01');
    await pickDate(page.locator('p', { hasText: 'Post-test counseling date' }).locator('input.hasDatepicker'), '2026-10-02');
    await page.getByLabel('TB evaluation', { exact: true }).check();
    await page.locator('#tbEval tr').nth(2).locator('input[type=checkbox]').first().check(); // cough: yes
    await page.locator('#vct-plan textarea').fill('AutoVct comment');
    await save(page);

    await expect.poll(async () => (await getPatientEncounters(api, patientUuid)).length).toBe(1);
    const [encounter] = await getPatientEncounters(api, patientUuid);
    expect(encounter.encounterType.uuid).toBe(VCT_ENCOUNTER_TYPE_UUID);
    const displays = (await getEncounterObs(api, encounter.uuid)).map((o) => o.display);
    const joined = displays.join(' | ');
    for (const expected of ['Wants to know test results', 'Partner suspected HIV+', 'Rapid test for HIV: Negative', 'HIV test date: 2026-10-01', 'RPR: Reactive', 'AutoVct comment', 'TB evaluation: Yes']) {
      expect(joined, expected).toContain(expected);
    }
    expect(displays.some((d) => d.startsWith('TB symptom present'))).toBeTruthy();

    // VIEW: checkboxes show "[X] <their own label>" (answerCode), the HIV result its sign, dates dd MMM yyyy
    const view = (await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, VIEW_LABELS)).page;
    const hivResult = view.locator('#vct-test table tr').nth(1);
    await expect(hivResult.locator('.value')).toHaveText(['01 Oct 2026', '[X] -']);
    await expect(view.locator('#vct-test table tr').nth(2).locator('.value')).toHaveText(['[X] reactive']); // RPR, no date entered
    await expect(view.locator('#wantstoknow .value')).toHaveText(['[X] Partner suspected HIV+']);
    await expect(view.locator('#risky .value')).toHaveText(['[X] Without condom']);
    await expect(view.locator('#tbEval .value')).toHaveText(['[X] Yes']); // cough: yes (its "no" box is a separate obs)
    await expect(view.locator('#vct-plan .value')).toHaveText(['AutoVct comment']);
    // not filled in: the other toggled blocks, the hepatitis B row (third result row)
    await expect(view.locator('#sti .value, #blood .value, #refer .value, #contactindex .value, #recommend .value, #otherReason .value')).toHaveCount(0);
    await expect(view.locator('#vct-test table tr').nth(3).locator('.value')).toHaveCount(0);
    // ifMode VIEW include=false :56, :535: heading, provider/location/date block and the Save / Cancel buttons are not in the VIEW
    await expect(view.locator('h2, #encounterLocation, #buttons, input.submitButton')).toHaveCount(0);
  });
});
