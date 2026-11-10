import { type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test, expect, type SectionEncounter } from '../../core';
import { HIV_FOLLOWUP_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { SectionFormPage, VisitPage } from '../../pages';

// section-dx.xml (top level of htmlforms/, not hiv/): "Diagnostic" section: coded diagnoses (encounterDiagnosesByObs,
// allowNonCoded=false), a non-coded diagnosis checkbox + text, and free-text comments. On the visit page it is the
// `pihcore-diagnosis` section of the HIV and PMTCT followup encounters (and of other encounter types outside this
// config, documentation/_availability.e2e.md); the specs open the edit URL directly on an HIV followup encounter.
//
// Conditions in the form, from documentation inventory (section-dx.inv.md):
//   ifMode VIEW include=false  :4, :36   heading + script, and the #buttons row in ENTER/EDIT only
//   toggle PIH:20580 checkbox  :20       shows #nonCodedDiagnosis (the "if non-coded, specify" textarea)
//   includeIf encounterType != 00e5ebb2-90ec-11e8-9eb6-529269fb1459 (delivery)  :38   renders #next; for a delivery
//                                        encounter only Save and Cancel exist
// Scripts: :7 setUpNextAndSubmitButtons() only (see _shared.e2e.md). No validation, message, default or derived value.
// Side effects on save: none from the form itself (no postSubmissionAction here).
// The non-coded text hidden by unticking the checkbox is not submitted (tested).
// Visit-page display: the visit page does NOT show this form's VIEW, although the `pihcore-diagnosis` entry of encounterTypeConfig.js
//   (:115) has an active templateModelUrl naming section-dx.xml: its `longTemplate` is templates/sections/dxLong.page, which never binds
//   the fetched HTML and renders the encounter's obs itself (rows Diagnoses, Non-Coded Diagnoses, Clinical Note; short card:
//   dxSectionShort.page). So the VIEW tests below assert those rows (VisitPage), and the form's own VIEW (ifMode VIEW :4, :36)
//   is therefore not tested.
// Not covered here: picking a coded diagnosis in the diagnosis widget (autocomplete backed by concept search and an
// Angular widget, shared), #next (needs the visit page).

const FORM = 'section-dx.xml';
// Delivery encounter type (j9CaseRegistration.sql names it @delEncId); :38 hides Next for it.
const DELIVERY_ENCOUNTER_TYPE_UUID = '00e5ebb2-90ec-11e8-9eb6-529269fb1459';


// Local helper: display and text value of each obs on the (synthetic) encounter.
const obsOf = async (api: APIRequestContext, encounterUuid: string) => {
  const res = await api.get(`obs?encounter=${encounterUuid}&v=custom:(display)&limit=100`);
  expect(res.ok()).toBeTruthy();
  return ((await res.json()).results as Array<{ display: string }>).map((o) => o.display);
};

test.describe('section-dx', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: HIV_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoDx', familyName: 'Tester', gender: 'F' },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  test('the non-coded diagnosis text shows only while its checkbox is ticked', async ({ page }) => {
    // toggle :20
    const text = page.locator('#nonCodedDiagnosis');
    await expect(text).toBeHidden();
    await page.locator('#w4').check();
    await expect(text).toBeVisible();
    await page.locator('#w4').uncheck();
    await expect(text).toBeHidden();
  });

  test('Next is offered for an HIV followup encounter', async ({ page }) => {
    // includeIf :38, state "not a delivery encounter"
    await expect(page.locator('#next')).toBeVisible();
    await expect(page.locator('#submit')).toBeVisible();
  });

  test('Next is not offered for a delivery encounter', async ({ page, createSectionEncounter }) => {
    // includeIf :38, state "delivery encounter"
    const delivery = await createSectionEncounter({
      encounterTypeUuid: DELIVERY_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoDx', familyName: 'Tester', gender: 'F' },
    });
    await SectionFormPage.openEdit(page, FORM, delivery);
    await expect(page.locator('#next')).toHaveCount(0);
    await expect(page.locator('#cancel')).toBeVisible();
  });

  test('saves a non-coded diagnosis and the comments, and EDIT shows the text again', async ({ page, api }) => {
    await page.locator('#w4').check();
    await page.locator('#w6').fill('Chronic cough');
    await page.locator('#w8').fill('Reviewed in clinic');
    await new SectionFormPage(page, FORM).save();
    await new SectionFormPage(page, FORM).expectSaved();

    const displays = await obsOf(api, section.encounter.uuid);
    expect(displays.some((d) => d.includes('Chronic cough'))).toBeTruthy();
    expect(displays.some((d) => d.includes('Reviewed in clinic'))).toBeTruthy();

    // toggle :20 in EDIT starts from the saved value
    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#w4')).toBeChecked();
    await expect(page.locator('#nonCodedDiagnosis')).toBeVisible();
    await expect(page.locator('#w6')).toHaveValue('Chronic cough');
  });

  test('a non-coded diagnosis text typed and then hidden by unticking the checkbox is not saved', async ({ page, api }) => {
    // toggle :20 only hides #nonCodedDiagnosis; the textarea keeps its value and is submitted
    await page.locator('#w4').check();
    await page.locator('#w6').fill('Typed then hidden');
    await page.locator('#w4').uncheck();
    await expect(page.locator('#nonCodedDiagnosis')).toBeHidden();
    await new SectionFormPage(page, FORM).save();
    await new SectionFormPage(page, FORM).expectSaved();
    expect((await obsOf(api, section.encounter.uuid)).some((d) => d.includes('Typed then hidden'))).toBeFalsy();
  });

  // Visit-page display (dxLong.page): one row per heading, the saved values in its right column.
  const dxRow = (long: Locator, heading: string) =>
    long.locator(`div:has(> .left-column > h3:text-is("${heading}")) > .right-column`);
  const openLong = async (page: Page) => {
    const visit = await VisitPage.open(page, section.encounter.visitUuid);
    return visit.expand(visit.section('pihcore-diagnosis'));
  };

  test('the visit page shows the saved non-coded diagnosis and the comments in the diagnosis section', async ({ page }) => {
    await page.locator('#w4').check();
    await page.locator('#w6').fill('Chronic cough');
    await page.locator('#w8').fill('Reviewed in clinic');
    await new SectionFormPage(page, FORM).save();
    await new SectionFormPage(page, FORM).expectSaved();

    const long = await openLong(page);
    await expect(dxRow(long, 'Non-Coded Diagnoses')).toHaveText('Chronic cough');
    await expect(dxRow(long, 'Clinical Note')).toHaveText('Reviewed in clinic');
    await expect(dxRow(long, 'Diagnoses').locator('p.diagnosis')).toHaveCount(0); // no coded diagnosis was picked
  });

  test('the visit page shows no non-coded diagnosis when only the comments were saved', async ({ page }) => {
    await page.locator('#w8').fill('Only a comment');
    await new SectionFormPage(page, FORM).save();
    await new SectionFormPage(page, FORM).expectSaved();

    const long = await openLong(page);
    await expect(dxRow(long, 'Clinical Note')).toHaveText('Only a comment');
    await expect(dxRow(long, 'Non-Coded Diagnoses')).toHaveText('');
  });
});
