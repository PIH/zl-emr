import { type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type EntryContext } from '../../core';
import { CHECKIN_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, VisitPage } from '../../pages';

// liveCheckin.xml v3.0: "LiveCheckin", the older check-in form (same Check-In encounter type as checkin.xml, fewer visit
// types, no women's-health block). Opened in the Simple UI (one question per screen) with a synthetic patient who has an
// active visit, through the direct URL (local helper openSimple). Who offers it: nobody. `mirebalais.liveCheckin` is the id
// of the circular check-in app, not this file, and no app-loader entry names liveCheckin.xml (_availability.e2e.md), so the
// spec is the only way to exercise it. Its date, provider and location sit in a hidden div (defaults: today, current user,
// session location), so there is no "details" question.
//
// Conditions in the form, from documentation inventory (liveCheckin.inv.md):
//   includeIf archives component / not  :19, :24   redirectOnSave target (requestPaperRecord page / currentAppRouter page)
//   ifMode VIEW (+ include=false)       :31, :97, :142, :161, :381   view-only styling and display vs the entry form (the form's own VIEW is not tested, see Visit-page display)
//   includeIf female or age < 10        :190   "gynecological" block (5 checkboxes: curettage ... C-section)
//   ifMode ENTER + includeIf wristband printer configured :346, :349   "print wristband" question
// Scripts: :100-138 beforeSubmit: if #print-wristband == 'true', a synchronous ajax call prints the wristband and a failure
//   steps back one question with an error; with no wristband question (no printer) it returns true.
// Required: fieldset#payment-amount-question class="required" (Simple UI navigator). <appointmentCheckIn/> (:373) checks the
//   patient in for a valid appointment; the synthetic patient has none, so nothing happens.
// Side effects on save: one Check-In encounter (type 55a0d3ea-...) with Type of HUM visit obs and a Payment construct group;
//   redirectOnSave leaves the form (target depends on archives, not followed by the tests).
// Visit-page display: the visit page does NOT show this form's VIEW. The Check-In entry of encounterTypeConfig.js (`// checkIn`, :818)
//   has `templateModelUrl: /module/htmlformentry/encounter.json?...` (not getAsHtml.action), `shortTemplate: checkInShort.page` and
//   `longTemplate: defaultHtmlFormEncounterLong.page` (one label + .obs-value row per saved field). The VIEW test asserts that
//   card and its expanded rows (VisitPage); the form's own VIEW (ifMode VIEW :381-438) is therefore not tested. Unverified here:
//   the save test it sits in is one of the known failures of this server (the redirect after save).
// UNREACHABLE: no app-loader entry names liveCheckin.xml (`mirebalais.liveCheckin` is the id of the circular check-in app, not this
//   form; documentation/_availability.e2e.md "Not reachable"). Tests open it by direct URL.
// Search scope: no reference found by name, formUuid or encounter type in pihcore, coreapps, htmlformentry(ui), registrationapp, pihemr and the zl/sl/liberia config repos; NOT searched: openmrs-module-mirebalais, the ADT/O2 modules, and the deployed server's app definitions / global properties. "Unreachable" here means not found, not proven.
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

test.describe('liveCheckin @unreachable', () => {
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
    // beforeSubmit :100 returns true when the wristband question is answered No (or absent); redirectOnSave :19/:24
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await typeOfVisit(page).nth(5).check(); // Health certificate
    await typeOfVisit(page).nth(9).check(); // General consult
    await goToQuestion(page, 1);
    await page.locator('#paymentAmount input').fill('50');
    await goToQuestion(page, 2);
    await page.locator('#receiptNumber input').fill('R-12345');
    // Where a wristband printer is configured at the session location (:349; zl-ci's has one) the form asks "Print Wristband", defaulting to Yes:
    // Yes calls the printer, and without one the form steps back with an error and does not submit. Answer No.
    if ((await page.locator('#print-wristband').count()) > 0) {
      await goToQuestion(page, 3);
      await page.locator('#print-wristband').selectOption('false');
    }
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

    // Visit-page display (header): the card lists both visit types; expanded, the rows show them, the payment and the receipt number
    const visit = await VisitPage.open(page, context.visitUuid);
    const card = visit.encounterOfType(CHECKIN_ENCOUNTER_TYPE_UUID);
    await expect(card.locator('.row.col-12 .encounter-card-summary:visible')).toContainText('Medical certificate');
    await expect(card.locator('.row.col-12 .encounter-card-summary:visible')).toContainText('Standard outpatient visit');
    const long = await visit.expand(card);
    const shown = (label: string) => long.locator(`p:visible:has(> label:text-is("${label}")) > .obs-value`);
    // both visit types are listed, in the order the server returns the obs (not fixed): one label per row, so look at the whole long view
    await expect(shown('Type of outpatient visit').first()).toBeVisible();
    await expect(long).toContainText('Medical certificate');
    await expect(long).toContainText('Standard outpatient visit');
    await expect(shown('Amount patient paid')).toHaveText(/^50(\.0)?$/);
    await expect(shown('Receipt number (text)')).toHaveText('R-12345');
  });
});
