import { type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type EntryContext } from '../../core';
import { CHECKIN_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs } from '../../pages';

// liveCheckin.xml v3.0: "LiveCheckin", the older check-in form (same Check-In encounter type as checkin.xml, fewer visit
// types, no women's-health block). Opened in the Simple UI (one question per screen) with a synthetic patient who has an
// active visit, through the direct URL (local helper openSimple). Who offers it: nobody. `mirebalais.liveCheckin` is the id
// of the circular check-in app, not this file, and no app-loader entry names liveCheckin.xml (_availability.e2e.md), so the
// spec is the only way to exercise it. Its date, provider and location sit in a hidden div (defaults: today, current user,
// session location), so there is no "details" question.
//
// Conditions in the form, from documentation inventory (liveCheckin.inv.md):
//   includeIf archives component / not  :19, :24   redirectOnSave target (requestPaperRecord page / currentAppRouter page)
//   ifMode VIEW (+ include=false)       :31, :97, :142, :161, :381   view-only styling and display vs the entry form (VIEW: getAsHtml.action, see the save test)
//   includeIf female or age < 10        :190   "gynecological" block (5 checkboxes: curettage ... C-section)
//   ifMode ENTER + includeIf wristband printer configured :346, :349   "print wristband" question
// Scripts: :100-138 beforeSubmit: if #print-wristband == 'true', a synchronous ajax call prints the wristband and a failure
//   steps back one question with an error; with no wristband question (no printer) it returns true.
// Required: fieldset#payment-amount-question class="required" (Simple UI navigator). <appointmentCheckIn/> (:373) checks the
//   patient in for a valid appointment; the synthetic patient has none, so nothing happens.
// Side effects on save: one Check-In encounter (type 55a0d3ea-...) with Type of HUM visit obs and a Payment construct group;
//   redirectOnSave leaves the form (target depends on archives, not followed by the tests).
// Not covered here: the wristband question and script (needs a configured printer), the archives redirect targets (the pages
//   belong to other modules), EDIT.
//
// Findings:
//   V1 Low :190 `gender == 'F' || age < 10` shows the gynecological procedures (curettage, hysterectomy, C-section...) to
//                every girl and to boys under 10, and hides them from boys 10+ (checkin.xml uses age > 10 && F). Fix: `&&` with
//                the intended age rule. TESTED below (documents the current behaviour).
//   V2 Low :202, :278  `answerCodeXX` is not an HFE attribute (typo of answerCode): the gynecological block (:202) and the minor-
//                surgery block (:278) show the concept's English name instead of a translated message. Fix: answerCode.

const FORM = 'liveCheckin.xml';

// Local helpers.
const openSimple = async (page: Page, context: EntryContext) => {
  await page.goto(EntryFormPage.enterUrl(FORM, context).replace('enterHtmlFormWithStandardUi', 'enterHtmlFormWithSimpleUi'));
  await expect(page.locator('#save-form')).toBeVisible();
};
// The Simple UI shows one question at a time: 0 visit types, 1 payment amount, 2 receipt number.
const goToQuestion = async (page: Page, index: number) => {
  await page.locator('li.question-legend').nth(index).click();
};
const typeOfVisit = (page: Page) => page.locator('#type-of-visit-question input[type=checkbox]');
const newPatient = (createEntryContext: CustomTestFixtures['createEntryContext'], gender: 'M' | 'F', age: number) =>
  createEntryContext({ givenName: 'AutoLive', familyName: 'Tester', gender, birthdate: birthdateYearsAgo(age) });

test.describe('liveCheckin', () => {
  // includeIf :190: gender == 'F' || age < 10 adds 5 checkboxes to the 22 others (V1)
  const profiles = [
    { name: 'adult woman', gender: 'F', age: 30, boxes: 27 },
    { name: 'girl of 5', gender: 'F', age: 5, boxes: 27 },
    { name: 'boy of 5', gender: 'M', age: 5, boxes: 27 },
    { name: 'boy of 10', gender: 'M', age: 10, boxes: 22 },
    { name: 'adult man', gender: 'M', age: 30, boxes: 22 },
  ] as const;

  for (const p of profiles) {
    test(`gynecological visit types for the ${p.name}`, async ({ page, createEntryContext }) => {
      const context = await newPatient(createEntryContext, p.gender, p.age);
      await openSimple(page, context);
      await expect(typeOfVisit(page)).toHaveCount(p.boxes);
    });
  }

  test('Save Form is refused while the required payment amount is blank', async ({ page, api, createEntryContext }) => {
    // fieldset#payment-amount-question class="required" :319
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await page.locator('#save-form').click();
    await expect(page.locator('span.field-error', { hasText: 'Required' }).first()).toBeVisible();
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('saves the visit types, payment and receipt as one Check-In encounter and leaves the form', async ({
    page,
    api,
    createEntryContext,
  }) => {
    // beforeSubmit :100 returns true without a wristband question; redirectOnSave :19/:24
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await typeOfVisit(page).nth(5).check(); // Health certificate
    await typeOfVisit(page).nth(9).check(); // General consult
    await goToQuestion(page, 1);
    await page.locator('#paymentAmount input').fill('50');
    await goToQuestion(page, 2);
    await page.locator('#receiptNumber input').fill('R-12345');
    await page.locator('#save-form').click(); // confirmation screen
    await page.locator('button.submitButton:visible').click();

    await expect
      .poll(async () => (await getPatientEncounters(api, context.patient.uuid)).map((e) => e.encounterType.uuid))
      .toEqual([CHECKIN_ENCOUNTER_TYPE_UUID]);
    await expect(page).not.toHaveURL(/enterHtmlFormWithSimpleUi/);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    const displays = (await getEncounterObs(api, encounter.uuid)).map((o) => o.display);
    expect(displays).toEqual(
      expect.arrayContaining([
        'Type of outpatient visit: Medical certificate',
        'Type of outpatient visit: Standard outpatient visit',
        'Amount patient paid: 50',
        'Receipt number (text): R-12345',
      ]),
    );

    // VIEW :381-438 (read-only display; the 12 repeated typeOfVisit obs share one id, so they are read through their fieldset)
    const view = (await expectViewShowsSavedObs(page, api, FORM, encounter.uuid)).page;
    await expect(view.locator('#type-of-visit-question .value')).toHaveCount(2);
    await expect(view.locator('#paymentAmount .value')).toContainText('50');
    await expect(view.locator('#receiptNumber .value')).toContainText('R-12345');
    // ifMode VIEW include=false :97: the entry form (checkboxes, inputs, Save) is not in the VIEW
    await expect(view.locator('input[type=checkbox], #paymentAmount input, #save-form, input.submitButton')).toHaveCount(0);
  });
});
