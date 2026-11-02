import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type SectionEncounter } from '../../core';
import { EID_FOLLOWUP_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { SectionFormPage, expectViewShowsSavedObs } from '../../pages';

// hiv/section-eid-protection.xml: "Exposed infant protection" section of an EID followup encounter (0f070640): EID
// program enrollment checkbox, feeding (type, breastfeeding duration, weaning date and type, food before 6 months,
// formula training/provided), vaccinations on schedule, a prophylaxis drug order (AZT, NVP, Cotrimoxazole, Isoniazide)
// and a presenting-history text. The specs open its edit URL directly with a one-year-old patient (on the visit page
// it is hidden unless the patient is younger than 24 months, documentation/_availability.e2e.md).
//
// Conditions in the form, from documentation inventory (section-eid-protection.inv.md):
//   ifMode VIEW include=false  :314   the #buttons row (#next, #submit, #cancel) in ENTER/EDIT only
// Scripts: :17-78 and :80-113 are copies of another form's feeding/supplement scripts. They toggle `.ageReceived`
//   inputs and `.yes-feeding` / `.no-feeding` / `.supplement` checkboxes (disable and clear the age box, untick the
//   opposite box), but no element of this form has those classes (:21,:26,:49,:59-68,:101-106), so they do nothing
//   (V1). :76 setUpNextAndSubmitButtons() (see _shared.e2e.md).
// Side effects on save: <enrollInProgram programId="EID" locationTag="Program Location" showCheckbox="true"/> (:118)
//   enrolls the patient in the EID program when its checkbox is ticked (tested); <drugOrder> (:240) saves a drug
//   order (one test; the encounter's void voids the order with it).
// Not covered here: the "Program Location" select of the enrollment, discontinuing or revising an order, the
//   drug-formulation (`drug`) list, #next.
// VIEW (getAsHtml.action on the saved encounter): the feeding answers (with the form's own labels), the vaccination answer and
//   the presenting history are shown, the unfilled ones are not, and the #buttons row (ifMode VIEW include=false :314) is
//   absent. The saved order is not checked: in the test page (HTML loaded with setContent) the
//   prophylaxis section is an empty order template with no value, so the order is not visible there.
//
// Findings:
//   V1 Low :17-113  both scripts are dead code (see above): nothing is hidden, disabled or cleared, and the feeding
//                   fields have no dependent age box. Fix: delete them (and keep only setUpNextAndSubmitButtons()).
//   V2 Info :200-202  "Complete vaccination card" is a label with no input.

const FORM = 'hiv/section-eid-protection.xml';
// Coded answers the form labels differently from the concept name (obs display -> text shown in VIEW): the answerCodes of the feeding
// type and the weaning type.
const VIEW_LABELS: Record<string, string> = {
  'Infant feeding method: Mixed': 'mixed',
  'Weaning speed: Slowly': 'gradual',
};

// Local helper: display of each obs on the (synthetic) encounter.
const obsDisplays = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> => {
  const res = await api.get(`obs?encounter=${encounterUuid}&v=custom:(display)&limit=100`);
  expect(res.ok()).toBeTruthy();
  return ((await res.json()).results as Array<{ display: string }>).map((o) => o.display.toLowerCase());
};

const save = async (page: Page) => {
  await page.locator('#submit').click();
};

test.describe('section-eid-protection', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: EID_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoEidProt', familyName: 'Tester', gender: 'M', birthdate: birthdateYearsAgo(1) },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  test('the feeding fields are independent: no field is hidden, disabled or cleared by the scripts (V1)', async ({ page }) => {
    // scripts :17-113 target classes that do not exist here
    await expect(page.locator('.yes-feeding, .no-feeding, .ageReceived, .supplement')).toHaveCount(0);
    await page.locator('#w4_0').check(); // breastfeed exclusively
    await page.locator('#w6').fill('6');
    await page.locator('#w4_1').check(); // exclusive formula: duration stays
    await expect(page.locator('#w6')).toBeEnabled();
    await expect(page.locator('#w6')).toHaveValue('6');
  });

  test('saves feeding, vaccination and presenting-history answers and enrolls the patient in the EID program', async ({ page, api }) => {
    const enrollmentsUrl = `programenrollment?patient=${section.patient.uuid}&v=custom:(program:(name),dateCompleted)`;
    expect(((await (await api.get(enrollmentsUrl)).json()).results as unknown[]).length).toBe(0);

    // enrollInProgram :118
    await page.locator('#w1').check();
    await page.locator('#w4_2').check(); // mixed feeding
    await page.locator('#w10_1').check(); // weaned: gradual
    await page.locator('#w12_0').check(); // food before 6 months: yes
    await page.locator('#w18_0').check(); // vaccinations on schedule: yes
    await page.locator('#w74').fill('Exposed at birth');
    await save(page);
    await new SectionFormPage(page, FORM).expectSaved();

    const displays = await obsDisplays(api, section.encounter.uuid);
    for (const expected of ['infant feeding method: mixed', 'weaning speed: slowly', 'child fed other food: yes', 'immunizations up to date: yes', 'presenting history: exposed at birth']) {
      expect(displays.some((d) => d.includes(expected)), expected).toBeTruthy();
    }
    const enrollments = (await (await api.get(enrollmentsUrl)).json()).results as Array<{ program: { name: string } }>;
    expect(enrollments.map((e) => e.program.name)).toEqual(['EID']);

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#w4_2')).toBeChecked();
    await expect(page.locator('#w74')).toHaveValue('Exposed at birth');
  });

  // Saves one drug order (Cotrimoxazole prophylaxis): the cleanup voids the encounter, and the order with it.
  test('saves a prophylaxis drug order', async ({ page, api }) => {
    // <drugOrder> :240
    await page.locator('#order-action-button-NEW').click();
    const form = page.locator('.orderwidget-order-form:visible');
    await form.locator('.order-concept select').selectOption({ label: 'Cotrimoxazole' });
    await form.locator('.order-dose input').fill('120');
    await form.locator('.order-doseUnits select').selectOption({ index: 1 });
    await form.locator('.order-frequency select').selectOption({ index: 1 });
    await form.locator('.order-route select').selectOption({ index: 1 });
    await form.locator('.order-duration input').fill('30');
    await form.locator('.order-durationUnits select').selectOption({ index: 1 });
    await form.locator('.order-quantity input').fill('60');
    await form.locator('.order-quantityUnits select').selectOption({ index: 1 });
    await save(page);
    await new SectionFormPage(page, FORM).expectSaved();

    const res = await api.get(`order?patient=${section.patient.uuid}&v=custom:(action,concept:(display),dose,quantity)`);
    expect(res.ok()).toBeTruthy();
    const orders = (await res.json()).results as Array<{ action: string; concept: { display: string }; dose: number; quantity: number }>;
    expect(orders).toHaveLength(1);
    expect(orders[0].action).toBe('NEW');
    expect(orders[0].concept.display.toLowerCase()).toContain('cotrimoxazole');
    expect(orders[0].dose).toBe(120);
    expect(orders[0].quantity).toBe(60);
  });

  // VIEW: the saved feeding and vaccination answers and the history; the unfilled questions show no value.
  test('VIEW: shows the feeding answers by their labels, the vaccination answer and the history, and no buttons', async ({ page, api }) => {
    await page.locator('#w4_2').check(); // mixed feeding
    await page.locator('#w10_1').check(); // weaned: gradual
    await page.locator('#w12_0').check(); // food before 6 months: yes
    await page.locator('#w18_0').check(); // vaccinations on schedule: yes
    await page.locator('#w74').fill('Exposed at birth');
    await save(page);
    await new SectionFormPage(page, FORM).expectSaved();

    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, VIEW_LABELS);
    const shown = await view.valueTexts();
    for (const expected of ['[X] mixed', '[X] gradual', 'Exposed at birth']) {
      expect(shown.some((t) => t.toLowerCase().includes(expected.toLowerCase())), expected).toBeTruthy();
    }
    expect(shown.filter((t) => t.startsWith('[X]'))).toHaveLength(4); // feeding, weaning, food before 6 months, vaccinations
    await expect(view.page.locator('#feeding .value')).toHaveCount(4);
    await expect(view.page.locator('#chief-complaint .value')).toHaveText('Exposed at birth');
    await expect(view.page.locator('#id-treatment-prophylaxis .value')).toHaveCount(0); // no order saved
    await expect(view.page.locator('#buttons, #submit, #next, #cancel')).toHaveCount(0);
  });
});
