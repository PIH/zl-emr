import { type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { HIV_DRUG_ORDER_DOCUMENTATION_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getPatientEncounters } from '../../commands';
import { EntryFormPage, SectionFormPage, VISIT_PAGE_URL, VisitPage } from '../../pages';

// hiv/hiv-drug-order-documentation.xml: "HIV Drug Order Documentation" (encounter date and one <drugOrder format="select">:
// drug concept, formulation, order reason ART/PTME/Prophylaxis/TB/STI, dose, frequency, route, duration, quantity, refills;
// urgency ROUTINE and care setting OUTPATIENT are fixed). In the app it is only reached in EDIT, from the "medication list"
// page (drugOrders.gsp), on the encounter holding an existing order (documentation/_availability.e2e.md; no ENTER entry).
// The specs open the ENTER URL (EntryFormPage) to create the order through the form and then the EDIT URL on the encounter it
// saved (SectionFormPage.editUrl; the form has no #submit, the specs click `#buttons input.submitButton`). There is no provider
// or location widget: the encounter takes the session's.
//
// Conditions in the form, from documentation inventory (hiv-drug-order-documentation.inv.md):
//   ifMode VIEW include=false  :132  Save/Cancel buttons (absent in the VIEW; not tested, see Visit-page display)
// Scripts: none. The order widget is HFE's: NEW, and in EDIT REVISE_0 / DISCONTINUE_0 per order of the encounter.
// Side effects on save: a drug order (action NEW, outpatient, routine) on the encounter. The cleanup voids the encounter, and the
//   order with it.
// Visit-page display: no VIEW of this form. The entry of encounterTypeConfig.js for this encounter type (:2685, 0b242b71-...) has
//   `defaultEncounterShort` / `defaultEncounterLong` and no templateModelUrl, so the visit page renders the encounter itself: its long view
//   (defaultEncounterLong) lists each obs and each order as `p.aligned` rows (order number, the order's display, timing); the form saves no
//   obs, so the order-save test asserts the order row (the drug) on the visit page. Written from the templates; NOT yet run
//   (the hiv-ci server was down). The ifMode VIEW include=false :132 blocks stay untested: the form's own VIEW is shown nowhere.
// Not covered here: saving a revision or a discontinuation (another order save), the other concepts/formulations.
//
// Findings:
//   V1 Low  :68-82   the orderProperty labels "Drug", "Formulation", "Non-coded Formulation", "Order Reason" and the option labels
//                    ART/PTME/Prophylaxis/TB/STI are hard-coded English (the other labels are message codes). Fix: use codes.
//   V2 Info :64      nothing requires an order: saving with none creates an empty documentation encounter (tested).

const FORM = 'hiv/hiv-drug-order-documentation.xml';

// Local helpers.
// <submit/> renders input.submitButton (no #submit).
const clickSave = (page: Page) => page.locator('#buttons input.submitButton').click();

test.describe('hiv-drug-order-documentation @hiv-ci', () => {
  let context: EntryContext;

  test.beforeEach(async ({ page, createEntryContext }) => {
    context = await createEntryContext({ givenName: 'AutoDrugOrderDoc', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(30) });
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#order-action-button-NEW')).toBeVisible();
  });

  test('an order started with the concept only is not saved', async ({ page, api }) => {
    // the HFE order widget requires the dose, frequency, route ... of a started order
    await page.locator('#order-action-button-NEW').click();
    const form = page.locator('.orderwidget-order-form').first();
    await form.locator('.order-concept select').selectOption({ label: 'ABC + 3TC' });
    await clickSave(page);
    await expect(page.locator('.field-error:visible').first()).toBeVisible();
    await expect(page).toHaveURL(/enterHtmlFormWithStandardUi/);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('saving without an order creates an empty encounter (V2)', async ({ page, api }) => {
    await clickSave(page);
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    await expect.poll(async () => (await getPatientEncounters(api, context.patient.uuid)).length).toBe(1);
    const res = await api.get(`order?patient=${context.patient.uuid}&t=drugorder`);
    expect((await res.json()).results).toHaveLength(0);
  });

  test('saves a NEW drug order; EDIT of the encounter shows it with Revise and Discontinue', async ({ page, api }) => {
    // the one order save of this spec (the patient is left behind, see the header)
    await page.locator('#order-action-button-NEW').click();
    const form = page.locator('.orderwidget-order-form').first();
    await form.locator('.order-concept select').selectOption({ label: 'ABC + 3TC' });
    await form.locator('.order-drug select').selectOption({ label: 'Abacavir (ABC) sulfate 600mg + Lamivudine (3TC) 300mg tablet' });
    await form.locator('.order-orderReason select').selectOption({ label: 'ART' });
    await form.locator('.order-dose input').fill('1');
    await form.locator('.order-doseUnits select').selectOption({ label: 'Tablet' });
    await form.locator('.order-frequency select').selectOption({ label: 'OD (once daily)' });
    await form.locator('.order-route select').selectOption({ label: 'Oral' });
    await form.locator('.order-duration input').fill('30');
    await form.locator('.order-durationUnits select').selectOption({ label: 'Days' });
    await form.locator('.order-quantity input').fill('30');
    await form.locator('.order-quantityUnits select').selectOption({ label: 'Each' });
    await clickSave(page);
    await expect(page).toHaveURL(VISIT_PAGE_URL);

    await expect.poll(async () => (await getPatientEncounters(api, context.patient.uuid)).length).toBe(1);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    expect(encounter.encounterType.uuid).toBe(HIV_DRUG_ORDER_DOCUMENTATION_ENCOUNTER_TYPE_UUID);

    const res = await api.get(`order?patient=${context.patient.uuid}&t=drugorder&v=custom:(action,dose,duration,quantity,urgency,drug:(display),concept:(display),encounter:(uuid))`);
    expect(res.ok()).toBeTruthy();
    const orders = (await res.json()).results as { action: string; dose: number; duration: number; quantity: number; urgency: string; drug: { display: string }; concept: { display: string }; encounter: { uuid: string } }[];
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      action: 'NEW',
      dose: 1,
      duration: 30,
      quantity: 30,
      urgency: 'ROUTINE',
      concept: { display: 'ABC + 3TC' },
      drug: { display: 'Abacavir (ABC) sulfate 600mg + Lamivudine (3TC) 300mg tablet' },
      encounter: { uuid: encounter.uuid },
    });

    // Visit page (the save lands there): the encounter is listed and its long view shows the order, with the drug
    const visit = await VisitPage.open(page, context.visitUuid);
    const long = await visit.expand(visit.encounterOfType(HIV_DRUG_ORDER_DOCUMENTATION_ENCOUNTER_TYPE_UUID));
    const orderRow = long.locator('p.aligned').filter({ hasText: 'Abacavir' });
    await expect(orderRow).toHaveCount(1);
    await expect(orderRow).toContainText('Lamivudine');

    // EDIT (the app's entry): the order of the encounter is listed with the revise and discontinue actions
    await page.goto(SectionFormPage.editUrl(FORM, { patient: context.patient, encounter: { uuid: encounter.uuid, visitUuid: context.visitUuid } }));
    const history = page.locator('.orderwidget-history-section .order-view-current-encounter');
    await expect(history).toHaveCount(1);
    await expect(history).toContainText('ABC + 3TC');
    await expect(page.locator('#order-action-button-REVISE_0')).toBeVisible();
    await expect(page.locator('#order-action-button-DISCONTINUE_0')).toBeVisible();
  });
});
