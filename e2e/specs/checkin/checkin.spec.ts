import { type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type EntryContext } from '../../core';
import { CHECKIN_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs, VISIT_PAGE_URL, visitPagePath } from '../../pages';

// checkin.xml v4.0: "Checkin" (Check-In encounter: type(s) of visit, payment amount, receipt number). Opened in the
// Simple UI (one question per screen, as production does) with a synthetic patient who has an active visit, through
// the direct URL (local helper openSimple). Who offers it: HSN (enableCheckIn, visit action + registration action);
// at this site (CEN, the local server) the Check-In app opens checkin_v3.5.xml, and checkin.xml is only reached by
// the registration summary's "most recent check-in" edit link (_availability.e2e.md). Availability is not exercised.
//
// Conditions in the form, from documentation inventory (checkin.inv.md):
//   includeIf currentAppId == 'mirebalais.liveCheckin'  :19   redirectOnSave back to the check-in app (archives :21 / :25 pick the target)
//   ifMode VIEW include=false :32  the whole entry form (details, visit types, payment, receipt, script, <submit/>)
//   includeIf age at encounter > 10 and female :136  "Women's health" block (7 type-of-visit checkboxes)
//   ifMode ENTER :300 + includeIf wristband printer configured :303  "print wristband" question
//   ifMode VIEW :331  read-only display (12 repeated typeOfVisit obs, payment, receipt): tested through getAsHtml.action
// Scripts (:39-51, page load): getField('encounterDate.value').datepicker('show') pops the date picker open when the
//   form opens; restrictInputOnlyNumber("receiptNumber") (zl.js, see _shared) makes the receipt input type=number.
// Required: fieldset#payment-amount-question has class="required" (Simple UI navigator: Required), the rest is optional.
// Side effects on save: one Check-In encounter (type 55a0d3ea-...) with Type of HUM visit obs and a Payment construct
//   group; no program, order or disposition. Without the live check-in app session no redirectOnSave: returnUrl is used.
// Not covered here: the check-in-app redirect (:19-27: needs the session attribute set by the circular app), the
//   wristband question (:303: needs a configured wristband printer),
//   provider/location/date widgets (_shared.e2e.md).

const FORM = 'checkin.xml';

// Local helpers.
const openSimple = async (page: Page, context: EntryContext, form = FORM) => {
  await page.goto(EntryFormPage.enterUrl(form, context).replace('enterHtmlFormWithStandardUi', 'enterHtmlFormWithSimpleUi'));
  await expect(page.locator('#save-form')).toBeVisible();
};
// The Simple UI shows one question at a time: 0 details, 1 visit types, 2 payment amount, 3 receipt number.
const goToQuestion = async (page: Page, index: number) => {
  await page.locator('li.question-legend').nth(index).click();
};
const typeOfVisit = (page: Page) => page.locator('#type-of-visit-question input[type=checkbox]');
const newPatient = (createEntryContext: CustomTestFixtures['createEntryContext'], gender: 'M' | 'F', age: number) =>
  createEntryContext({ givenName: 'AutoCheckin', familyName: 'Tester', gender, birthdate: birthdateYearsAgo(age) });

test.describe('checkin', () => {
  // includeIf :136: ($patient.getAge(encounter date) > 10) && gender == 'F' adds 7 checkboxes to the 29 others
  const profiles = [
    { name: 'adult woman', gender: 'F', age: 30, boxes: 36 },
    { name: '11 year old girl', gender: 'F', age: 11, boxes: 36 },
    { name: '10 year old girl', gender: 'F', age: 10, boxes: 29 },
    { name: 'adult man', gender: 'M', age: 30, boxes: 29 },
  ] as const;

  for (const p of profiles) {
    test(`women's health visit types for the ${p.name}`, async ({ page, createEntryContext }) => {
      const context = await newPatient(createEntryContext, p.gender, p.age);
      await openSimple(page, context);
      await expect(typeOfVisit(page)).toHaveCount(p.boxes);
    });
  }

  test('page-load script: the date picker opens and the receipt number accepts digits only', async ({ page, createEntryContext }) => {
    // :41 datepicker('show'), :44 restrictInputOnlyNumber
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await expect(page.locator('#ui-datepicker-div')).toBeVisible();
    await expect(page.locator('#receiptNumber input')).toHaveAttribute('type', 'number');
  });

  test('Save Form is refused while the required payment amount is blank', async ({ page, api, createEntryContext }) => {
    // fieldset#payment-amount-question class="required" :266
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await page.locator('#save-form').click();
    await expect(page.locator('span.field-error', { hasText: 'Required' }).first()).toBeVisible();
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('saves the visit types, payment and receipt as one Check-In encounter', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await goToQuestion(page, 1);
    await typeOfVisit(page).nth(0).check(); // General consult
    await typeOfVisit(page).nth(1).check(); // Pediatric consult
    await goToQuestion(page, 2);
    await page.locator('#paymentAmount input').fill('50');
    await goToQuestion(page, 3);
    await page.locator('#receiptNumber input').fill('12345');
    await page.locator('#save-form').click(); // confirmation screen
    await page.locator('button.submitButton:visible').click();
    await new EntryFormPage(page, FORM).expectSaved();

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([CHECKIN_ENCOUNTER_TYPE_UUID]);
    const displays = (await getEncounterObs(api, encounters[0].uuid)).map((o) => o.display);
    expect(displays).toEqual(
      expect.arrayContaining([
        'Type of outpatient visit: Standard outpatient visit',
        'Type of outpatient visit: Pediatrics',
        'Amount patient paid: 50',
        'Receipt number (text): 12345',
      ]),
    );
    expect(displays.filter((d) => d.startsWith('Type of outpatient visit'))).toHaveLength(2);

    // VIEW :331-390 (read-only display; 12 repeated typeOfVisit obs share one id, so they are read through their fieldset)
    const view = (await expectViewShowsSavedObs(page, api, FORM, encounters[0].uuid)).page;
    await expect(view.locator('#type-of-visit-question .value')).toHaveCount(2);
    await expect(view.locator('#paymentAmount .value')).toContainText('50');
    await expect(view.locator('#receiptNumber .value')).toContainText('12345');
    // ifMode VIEW include=false :32: the entry form (checkboxes, inputs, Save) is not in the VIEW
    await expect(view.locator('input[type=checkbox], #paymentAmount input, #save-form, input.submitButton')).toHaveCount(0);
  });

  test('EDIT starts from the saved values and a re-save replaces the payment', async ({ page, api, createEntryContext }) => {
    // ifMode VIEW include=false :32 also covers EDIT (Simple UI, as the registration summary's edit link opens it)
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await goToQuestion(page, 1);
    await typeOfVisit(page).nth(0).check();
    await goToQuestion(page, 2);
    await page.locator('#paymentAmount input').fill('50');
    await page.locator('#save-form').click();
    await page.locator('button.submitButton:visible').click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const params = new URLSearchParams({
      patientId: context.patient.uuid,
      encounterId: encounter.uuid,
      definitionUiResource: `file:configuration/pih/htmlforms/${FORM}`,
      returnUrl: visitPagePath(context.visitUuid),
    });
    await page.goto(`htmlformentryui/htmlform/editHtmlFormWithSimpleUi.page?${params.toString()}`);
    await expect(page.locator('#save-form')).toBeVisible();
    await expect(page.locator('#type-of-visit-question input[type=checkbox]:checked')).toHaveCount(1);
    await expect(page.locator('#paymentAmount input')).toHaveValue('50');

    await goToQuestion(page, 2);
    await page.locator('#paymentAmount input').fill('75');
    await page.locator('#save-form').click();
    await page.locator('button.submitButton:visible').click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    await expect
      .poll(async () => (await getEncounterObs(api, encounter.uuid)).map((o) => o.display))
      .toEqual(expect.arrayContaining(['Amount patient paid: 75']));
    const displays = (await getEncounterObs(api, encounter.uuid)).map((o) => o.display);
    expect(displays).not.toContain('Amount patient paid: 50');

    // VIEW after the re-save: the new payment, the first visit type, and no receipt number (never entered)
    const view = (await expectViewShowsSavedObs(page, api, FORM, encounter.uuid)).page;
    await expect(view.locator('#paymentAmount .value')).toHaveText(/^75\b/);
    await expect(view.locator('#type-of-visit-question .value')).toHaveCount(1);
    await expect(view.locator('#receiptNumber .value')).toHaveCount(0);
  });
});
