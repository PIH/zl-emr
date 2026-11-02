import { type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type EntryContext } from '../../core';
import { CHECKIN_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs, VISIT_PAGE_URL, visitPagePath } from '../../pages';

// checkin_v3.5.xml: "Checkin" (Check-In encounter: type of visit, payment amount, receipt number). This is the version
// the ZL site runs at CEN (enableCheckIn opens it for every Haiti site except HSN, which gets checkin.xml v4.0).
// Opened in the Simple UI (one question per screen: details, visit type, payment amount, receipt number) by direct URL
// with a synthetic patient who has an active visit (local helper openSimple). Availability (visit action / check-in
// app, session location and privilege) is not exercised: the form is opened directly, as in the checkin spec.
// Depends on: global property haiti.checkIn.reasonsForVisit (the options of the visit-type dropdown); the form has no
// age or gender gate and no location tag condition other than the shared Check-In Location filter of the location widget.
//
// Differences from v4.0 (specs/checkin): ONE visit type in a dropdown fed by the global property (v4.0: fixed
// checkboxes, 29 or 36 depending on age/sex); no "women's health" includeIf; same payment group and receipt script.
// Conditions in the form (documentation inventory checkin_v3.5.inv.md):
//   includeIf currentAppId == 'mirebalais.liveCheckin' :19  redirectOnSave to the check-in app (archives :21 / :25 pick the target)
//   ifMode VIEW include=false :36  the whole entry form (details, visit type, payment, receipt, script, <submit/>)
//   ifMode ENTER :129 + includeIf wristband printer configured :132  "print wristband" question
//   ifMode VIEW :160  read-only display (typeOfVisit repeated 12x, payment, receipt): tested through getAsHtml.action
// Script (:38-50, page load): getField('encounterDate.value').datepicker('show') opens the date picker when the form
//   opens; restrictInputOnlyNumber("receiptNumber") (zl.js, see _shared) makes the receipt input type=number.
// Validation: fieldset#payment-amount-question has class="required" (:96); the payment amount obs is a whole number >= 0.
// Side effects on save: one Check-In encounter (type 55a0d3ea-...) with Type of HUM visit (0 or 1) and a Payment construct
//   group (payment amount + receipt number); no program, order or disposition.
// Not covered here: the check-in-app redirect (:19-27, needs the session attribute set by the circular app), the
//   wristband question (:132, needs a configured wristband printer),
//   an encounter saved with several type-of-visit obs (v4.0 checkboxes) edited here (unverified), the provider /
//   location / date widgets (_shared.e2e.md).
// Findings:
//   V1 Low  :88-90 style="dropdown" together with size="999" renders the select as a 13-row list box (size attribute 13), not a collapsed dropdown.
//   V2 Low  :172-183 the VIEW half repeats <obs id="typeOfVisit"> 12 times (a leftover from the multi-checkbox versions: this entry form
//           saves at most one) and :216 puts style="dropdown" on the receipt-number obs; duplicate ids typeOfVisit x12, paymentAmount x2.
//   V3 Info the Simple UI navigator will not open the receipt question while the required payment amount is blank (covered below).

const FORM = 'checkin_v3.5.xml';

// Local helpers.
const openSimple = async (page: Page, context: EntryContext) => {
  await page.goto(EntryFormPage.enterUrl(FORM, context).replace('enterHtmlFormWithStandardUi', 'enterHtmlFormWithSimpleUi'));
  await expect(page.locator('#save-form')).toBeVisible();
};
// The Simple UI shows one question at a time: 0 details, 1 visit type, 2 payment amount, 3 receipt number.
const goToQuestion = async (page: Page, index: number) => {
  await page.locator('li.question-legend').nth(index).click();
};
const visitType = (page: Page) => page.locator('#typeOfVisit select');
const payment = (page: Page) => page.locator('#paymentAmount input');
const receipt = (page: Page) => page.locator('#receiptNumber input');
const save = async (page: Page) => {
  await page.locator('#save-form').click(); // confirmation screen
  await page.locator('button.submitButton:visible').click();
};
const newPatient = (createEntryContext: CustomTestFixtures['createEntryContext'], gender: 'M' | 'F', age: number) =>
  createEntryContext({ givenName: 'AutoCheckinThreeFive', familyName: 'Tester', gender, birthdate: birthdateYearsAgo(age) });
const displaysOf = async (api: Parameters<typeof getEncounterObs>[0], encounterUuid: string) =>
  (await getEncounterObs(api, encounterUuid)).map((o) => o.display);

test.describe('checkin_v3.5', () => {
  const profiles = [
    { name: 'adult woman', gender: 'F', age: 30 },
    { name: 'adult man', gender: 'M', age: 30 },
    { name: '5 year old girl', gender: 'F', age: 5 },
  ] as const;

  for (const p of profiles) {
    test(`visit type is one dropdown fed by haiti.checkIn.reasonsForVisit, same for the ${p.name}`, async ({
      page,
      api,
      createEntryContext,
    }) => {
      // :88-90 (v4.0 has age/sex dependent checkboxes; here there is no gate)
      const res = await api.get('systemsetting?q=haiti.checkIn.reasonsForVisit&v=custom:(property,value)');
      expect(res.ok()).toBeTruthy();
      const setting = (await res.json()).results.find(
        (s: { property: string }) => s.property === 'haiti.checkIn.reasonsForVisit',
      );
      const reasons = (setting.value as string).split(',').filter((r) => r.trim() !== '');

      const context = await newPatient(createEntryContext, p.gender, p.age);
      await openSimple(page, context);
      await goToQuestion(page, 1);
      await expect(page.locator('input[type=checkbox]')).toHaveCount(0);
      await expect(visitType(page)).toBeVisible();
      await expect(visitType(page)).not.toHaveAttribute('multiple', /.*/);
      // a blank first option plus one option per concept of the global property
      await expect(visitType(page).locator('option')).toHaveCount(reasons.length + 1);
      await expect(visitType(page).locator('option').first()).toHaveText('');
      await expect(visitType(page)).toHaveValue('');
    });
  }

  test('page-load script: the date picker opens and the receipt number accepts digits only', async ({ page, createEntryContext }) => {
    // :41 datepicker('show'), :44 restrictInputOnlyNumber
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await expect(page.locator('#ui-datepicker-div')).toBeVisible();
    await expect(receipt(page)).toHaveAttribute('type', 'number');
    await goToQuestion(page, 2);
    await payment(page).fill('10');
    await goToQuestion(page, 3);
    await receipt(page).pressSequentially('12ab3');
    await expect(receipt(page)).toHaveValue('123');
  });

  test('payment amount must be a whole number, 0 or more', async ({ page, api, createEntryContext }) => {
    // the obs is an integer concept with min 0 (class="integer numeric-range", min="0.0")
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await goToQuestion(page, 2);
    const rejected = [
      { value: '50.5', error: 'Must be a whole number' },
      { value: 'abc', error: 'Must be a whole number' },
      { value: '-5', error: 'Minimum: 0' },
    ];
    for (const r of rejected) {
      await payment(page).fill(r.value);
      await page.locator('#save-form').click();
      await expect(page.locator('span.field-error:visible', { hasText: r.error })).toBeVisible();
      await expect(page.locator('button.submitButton:visible')).toHaveCount(0);
    }
    await payment(page).fill('0'); // zero is a valid payment
    await page.locator('#save-form').click();
    await expect(page.locator('button.submitButton:visible')).toHaveCount(1);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('Save Form is refused while the required payment amount is blank, and the receipt question stays closed', async ({
    page,
    api,
    createEntryContext,
  }) => {
    // fieldset#payment-amount-question class="required" :96
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await goToQuestion(page, 1);
    await visitType(page).selectOption({ index: 1 });
    await goToQuestion(page, 3); // the navigator refuses to skip the required question
    await expect(receipt(page)).toBeHidden();
    await expect(page.locator('span.field-error:visible', { hasText: 'Required' }).first()).toBeVisible();
    await page.locator('#save-form').click();
    await expect(page.locator('span.field-error:visible', { hasText: 'Required' }).first()).toBeVisible();
    await expect(page.locator('button.submitButton:visible')).toHaveCount(0);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('saves the visit type, payment and receipt as one Check-In encounter', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await goToQuestion(page, 1);
    const label = (await visitType(page).locator('option').nth(2).textContent()) ?? '';
    await visitType(page).selectOption({ index: 2 });
    await goToQuestion(page, 2);
    await payment(page).fill('50');
    await goToQuestion(page, 3);
    await receipt(page).fill('12345');
    await save(page);
    await new EntryFormPage(page, FORM).expectSaved();

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([CHECKIN_ENCOUNTER_TYPE_UUID]);
    const displays = await displaysOf(api, encounters[0].uuid);
    expect(displays).toEqual(
      expect.arrayContaining([
        `Type of outpatient visit: ${label}`,
        'Amount patient paid: 50',
        'Receipt number (text): 12345',
      ]),
    );
    expect(displays.filter((d) => d.startsWith('Type of outpatient visit'))).toHaveLength(1);
    expect(displays.filter((d) => d.startsWith('Payment information'))).toHaveLength(1); // the construct group

    // VIEW :159-226 (read-only display; the 12 repeated typeOfVisit obs share one id, so they are read through their fieldset)
    const view = (await expectViewShowsSavedObs(page, api, FORM, encounters[0].uuid)).page;
    await expect(view.locator('#type-of-visit-question .value')).toHaveCount(1);
    await expect(view.locator('#type-of-visit-question .value')).toContainText(label.trim());
    await expect(view.locator('#paymentAmount .value')).toContainText('50');
    await expect(view.locator('#receiptNumber .value')).toContainText('12345');
    // ifMode VIEW include=false :36: the entry form (dropdown, inputs, Save) is not in the VIEW
    await expect(view.locator('select, #paymentAmount input, #save-form, input.submitButton')).toHaveCount(0);
  });

  test('the visit type is optional: payment alone saves with no visit-type obs', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext, 'M', 30);
    await openSimple(page, context);
    await goToQuestion(page, 2);
    await payment(page).fill('25');
    await save(page);
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    const displays = await displaysOf(api, encounter.uuid);
    expect(displays).toContain('Amount patient paid: 25');
    expect(displays.filter((d) => d.startsWith('Type of outpatient visit'))).toHaveLength(0);
    expect(displays.filter((d) => d.startsWith('Receipt number'))).toHaveLength(0);

    // VIEW: only the payment is shown; the visit type and receipt number that were not entered are not shown as values
    const view = (await expectViewShowsSavedObs(page, api, FORM, encounter.uuid)).page;
    await expect(view.locator('#paymentAmount .value')).toContainText('25');
    await expect(view.locator('#type-of-visit-question .value, #receiptNumber .value')).toHaveCount(0);
  });

  test('EDIT starts from the saved values; changing and clearing them replaces the obs', async ({ page, api, createEntryContext }) => {
    // ifMode VIEW include=false :36 also covers EDIT (Simple UI, as the encounter's edit link opens it)
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await goToQuestion(page, 1);
    const label = (await visitType(page).locator('option').nth(1).textContent()) ?? '';
    await visitType(page).selectOption({ index: 1 });
    await goToQuestion(page, 2);
    await payment(page).fill('50');
    await goToQuestion(page, 3);
    await receipt(page).fill('777');
    await save(page);
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    expect(await displaysOf(api, encounter.uuid)).toContain(`Type of outpatient visit: ${label}`);

    const editUrl = () => {
      const params = new URLSearchParams({
        patientId: context.patient.uuid,
        encounterId: encounter.uuid,
        definitionUiResource: `file:configuration/pih/htmlforms/${FORM}`,
        returnUrl: visitPagePath(context.visitUuid),
      });
      return `htmlformentryui/htmlform/editHtmlFormWithSimpleUi.page?${params.toString()}`;
    };
    await page.goto(editUrl());
    await expect(page.locator('#save-form')).toBeVisible();
    await expect(page.locator('#ui-datepicker-div')).toBeVisible(); // the page-load script runs in EDIT too
    await goToQuestion(page, 1);
    await expect(visitType(page).locator('option:checked')).toHaveText(label);
    await goToQuestion(page, 2);
    await expect(payment(page)).toHaveValue('50');
    await goToQuestion(page, 3);
    await expect(receipt(page)).toHaveValue('777');

    // change the payment, clear the visit type and the receipt number
    await goToQuestion(page, 1);
    await visitType(page).selectOption({ index: 0 });
    await goToQuestion(page, 2);
    await payment(page).fill('75');
    await goToQuestion(page, 3);
    await receipt(page).fill('');
    await save(page);
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    await expect
      .poll(async () => (await displaysOf(api, encounter.uuid)).filter((d) => !d.startsWith('Payment information')).sort())
      .toEqual(['Amount patient paid: 75']);

    // VIEW after the re-save: the new payment replaces the 50, and the cleared visit type and receipt number show no value
    const view = (await expectViewShowsSavedObs(page, api, FORM, encounter.uuid)).page;
    await expect(view.locator('#paymentAmount .value')).toHaveText(/^75\b/);
    await expect(view.locator('#type-of-visit-question .value, #receiptNumber .value')).toHaveCount(0);
  });
});
