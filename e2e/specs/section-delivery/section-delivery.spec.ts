import { type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type SectionEncounter } from '../../core';
import { DELIVERY_ENCOUNTER_TYPE_UUID, KLINIK_EKSTEN_LOCATION_UUID, OBGYN_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { SectionFormPage, VISIT_PAGE_URL, expectViewShowsSavedObs } from '../../pages';
import { expectObs, isoDate, obsDisplays, pickDate, pickerDate, viewDate } from '../../pages/form-widgets';

// section-delivery.xml (pihemr, v3.0): "MCH Delivery section": delivery date/time, labor and delivery findings (hemorrhage, placenta, perineum, findings for baby and
// mother), up to four newborns (obsgroup CIEL:1585 each), KPIs, the postpartum exam and the disposition. On the visit page it is the `pihcore-delivery` section of the
// MCH Delivery encounter (00e5ebb2), next to `pihcore-c-section` and `pihcore-diagnosis`; the specs create the parent encounter over REST (female patient) and open the
// section's edit URL directly (skips the gating of _availability.e2e.md). Runs on zl-ci.
//
// Conditions in the form, from documentation inventory (section-delivery.inv.md):
//   when CIEL:147232 (vaginal hemorrhage) = Yes      :313  shows #bleeding-diagnosis (diagnosis checkboxes + blood-loss radios)
//   when CIEL:127592 (retained placenta) = Yes       :394  shows #abNormRetainedPlac (accreta / increta / percreta)
//   when CIEL:161033 (newborn outcome) = Livebirth   :533  shows #baby-alive-N; = Fetal death :534 shows #baby-death-N; Neonatal death shows neither (N = 1..4)
//   when PIH:11663 (type of delivery) = Vaginal      :641  shows #delivery-instrument-N; = Cesarean :642 shows #c-section-reason-N
//   when CIEL:167038 (involution) = Abnormal         :888  shows #abnormal-involution (cm between umbilicus and uterus)
//   includeIf encounterType == MCH Delivery (00e5ebb2) :823 renders the postpartum exam (#postpartum-exam); other encounter types get none
//   ifMode VIEW include=true :23 style; include=false :89 style, :102 and :133 scripts, :992 #buttonsTopRow (Dx / C-section / Delivery buttons), :1027 #buttons (Next, Save, Cancel)
//   required: the delivery date/time (CIEL:5599, :243), validated by the server (the submit is sent and answered with "Required")
// Scripts: :102-130 getBeforeValidation: a disposition picked while one of its visible fields (ward, site, location, death date) is empty -> "Please fill out all fields
//   associated with the selected disposition", save stopped; setUpNextAndSubmitButtons() (see _shared.e2e.md). :133-170 hides #baby-2..4 and shows #show-more-babies-button
//   unless one of them has a `.baby-name input` value (no such class exists: V2); Show more / Show less toggle them. :172-232 on load: the calculated EDD from
//   $fn.latestObsBeforeCurrentEncounter('CIEL:5596') (entered within 305 days before the encounter) in #calculated-edd and a gestational age in
//   #calculated-gestational-age-value; on a change of the delivery date the age = days between the delivery date and (EDD - 280 days), in weeks and days.
// Side effects on save: postSubmissionAction ApplyDispositionAction (the tests save only Discharge) and CleanDiagnosisConstructAction (adds "Diagnosis order: Secondary"
//   to every diagnosis group that lacks one; removes groups without a diagnosis).
// Visit-page display: `pihcore-delivery` has an active templateModelUrl and longTemplate viewSectionWithHtmlFormLong.page, so the visit page shows the form's VIEW
//   (checked on zl-ci): expectViewShowsSavedObs.
// Findings: see pihemr _findings.e2e.md#section-delivery
//   V1 High   :420-426 (with section-c-section.xml:251) both sections save "Procedure performed" (CIEL:1651); saving the c-section REPLACES the delivery's first answer (see
//             section-c-section V1; TESTED in that spec with test.fixme)
//   V2 Medium :133-170 `hasValue` reads `.baby-name input`, which no element has: on EDIT newborns 2-4 are hidden even when saved (TESTED below with test.fixme)
//   V3 Medium :191-211 the calculated EDD is shown one day early in the browsers west of UTC (Haiti) (TESTED with test.fixme)
//   V4 Medium :214 on load the gestational age is computed from the EDD itself, so it always reads 40 weeks (TESTED with test.fixme)
//   V5 Low    :565-579 the Apgar labels are `<uimessage code="1 minute"/>`, "5 minutes", "10 minutes": not message codes, so they are English in every language
//   V6 Low    :518-761 a newborn group saved with newborn 1 empty (only newborn 2, 3 or 4 filled) is not loaded into any newborn on EDIT (checked on zl-ci: it stays saved and
//             a re-save keeps it); a user who fills only the second twin sees an empty form when coming back
// Not covered here: the top-row buttons Dx / C-section / Delivery and #next (they save and navigate to the next section: the visit-page flow), Death / Transfer dispositions
//   (ApplyDispositionAction would mark the patient dead or transferred), the 305-day window of the EDD, the radio pairs that share a <p> (nutrition counselling / family planning).

const FORM = 'section-delivery.xml';
const SAVE = '#submit';

// ---- local helpers ----
// The <p> that holds the question with this label.
const q = (page: Page, text: string): Locator =>
  page
    .locator('p')
    .filter({ has: page.locator('label', { hasText: text }) })
    .first();
const esc = (l: string) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactLabel = (label: string) => new RegExp(`^\\s*${esc(label)}\\s*$`);
// Clicks the radio or checkbox whose label is exactly `label` inside `scope`.
const choose = async (scope: Locator, label: string) => {
  await scope.locator('label', { hasText: exactLabel(label) }).first().click();
};
const tick = async (page: Page, label: string, scope = 'form#htmlform') => {
  await page.locator(`${scope} label`, { hasText: exactLabel(label) }).first().click();
};
const checked = (scope: Locator) => scope.locator('input:checked + label');

const female = { givenName: 'AutoDelivery', familyName: 'Tester', gender: 'F' as const, birthdate: birthdateYearsAgo(28) };
const open = async (page: Page, section: SectionEncounter) => {
  await page.goto(SectionFormPage.editUrl(FORM, section));
  await expect(page.locator(SAVE)).toBeVisible();
  await page.waitForLoadState('networkidle');
};
const save = async (page: Page) => {
  await page.locator(SAVE).click();
  await expect(page).toHaveURL(VISIT_PAGE_URL);
};
const DELIVERED = isoDate(-1); // yesterday: the date widget does not allow a later date
const setDeliveryDate = async (page: Page, iso = DELIVERED, hour?: string, minute?: string) => {
  await pickDate(page.locator('#deliveryDate input[readonly]'), iso);
  if (hour) {
    await page.locator('#deliveryDate select').nth(0).selectOption(hour);
  }
  if (minute) {
    await page.locator('#deliveryDate select').nth(1).selectOption(minute);
  }
};

test.describe('section-delivery layout and conditions', () => {
  let section: SectionEncounter;
  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({ encounterTypeUuid: DELIVERY_ENCOUNTER_TYPE_UUID, patient: female });
    await open(page, section);
  });

  test('ENTER/EDIT shows the next-section buttons, Next, Save and Cancel, and the postpartum exam', async ({ page }) => {
    // ifMode VIEW include=false :992, :1027; includeIf :823 (MCH Delivery encounter)
    await expect(page.locator('#buttonsTopRow button')).toHaveText([/Dx/, /C-section/, /Delivery/]);
    await expect(page.locator('#next')).toBeVisible();
    await expect(page.locator('#submit')).toBeVisible();
    await expect(page.locator('#cancel')).toBeVisible();
    for (const id of ['labor-delivery', 'babies', 'kpi-delivery', 'postpartum-exam', 'disposition-section']) {
      await expect(page.locator(`#${id}`), `section ${id}`).toBeVisible();
    }
    await expect(page.locator('#postpartum-exam')).toContainText('POSTPARTUM EXAM', { ignoreCase: true });
  });

  test('the delivery date is required: saving without it shows the error and stays on the form', async ({ page, api }) => {
    // obs CIEL:5599 required="true" :243 (validated by the server: the submit request is sent and answered with the error)
    await page.locator(SAVE).click();
    await expect(page.locator('#deliveryDate .field-error')).toBeVisible();
    await expect(page.locator('#deliveryDate .field-error')).toHaveText(/required/i);
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    // nothing was saved
    expect(await obsDisplays(api, section.encounter.uuid)).toEqual([]);
  });

  test('vaginal hemorrhage shows the bleeding diagnoses; retained placenta shows the abnormal attachment', async ({ page }) => {
    // when :313, :394
    const bleeding = page.locator('#bleeding-diagnosis');
    await expect(bleeding).toBeHidden();
    await choose(page.locator('#hemLine'), 'Yes');
    await expect(bleeding).toBeVisible();
    await expect(bleeding).toContainText('Postpartum hemorrhage');
    await expect(bleeding).toContainText('Severe (1000+ mL)');
    await choose(page.locator('#hemLine'), 'No');
    await expect(bleeding).toBeHidden();

    const accreta = page.locator('#abNormRetainedPlac');
    await expect(accreta).toBeHidden();
    await choose(page.locator('#retainedPlacQ'), 'Yes');
    await expect(accreta).toBeVisible();
    await expect(accreta).toContainText('Placenta accreta');
    await choose(page.locator('#retainedPlacQ'), 'No');
    await expect(accreta).toBeHidden();
  });

  test('the outcome of a newborn shows the live-birth or the fetal-death block; the delivery type shows the instrument or the c-section reasons', async ({ page }) => {
    // when :533, :534, :641, :642 (newborn 1; the other three are the same <repeat>)
    const alive = page.locator('#baby-alive-1');
    const death = page.locator('#baby-death-1');
    await expect(alive).toBeHidden();
    await expect(death).toBeHidden();
    await choose(page.locator('#baby-live-or-death-1'), 'Livebirth');
    await expect(alive).toBeVisible();
    await expect(death).toBeHidden();
    await choose(page.locator('#baby-live-or-death-1'), 'Fetal death');
    await expect(death).toBeVisible();
    await expect(alive).toBeHidden();
    await choose(page.locator('#baby-live-or-death-1'), 'Neonatal death');
    await expect(alive).toBeHidden();
    await expect(death).toBeHidden();

    const instrument = page.locator('#delivery-instrument-1');
    const reasons = page.locator('#c-section-reason-1');
    await expect(instrument).toBeHidden();
    await expect(reasons).toBeHidden();
    await choose(page.locator('#delivery-type-1'), 'Vaginal delivery');
    await expect(instrument).toBeVisible();
    await expect(instrument).toContainText('Delivery by vacuum extraction');
    await expect(reasons).toBeHidden();
    await choose(page.locator('#delivery-type-1'), 'Delivery by cesarean section');
    await expect(reasons).toBeVisible();
    await expect(reasons).toContainText('Prior cesarean delivery');
    await expect(instrument).toBeHidden();
  });

  test('an abnormal involution of the uterus asks for the distance to the umbilicus', async ({ page }) => {
    // when :888
    const measure = page.locator('#abnormal-involution');
    await expect(measure).toBeHidden();
    await choose(page.locator('#involution'), 'Abnormal');
    await expect(measure).toBeVisible();
    await choose(page.locator('#involution'), 'Normal');
    await expect(measure).toBeHidden();
  });

  test('only newborn 1 is shown at first; Show More shows the others and Show Less hides them again', async ({ page }) => {
    // script :133-170 (no baby has data)
    await expect(page.locator('#baby-1')).toBeVisible();
    for (const n of [2, 3, 4]) {
      await expect(page.locator(`#baby-${n}`)).toBeHidden();
    }
    await expect(page.locator('#show-more-babies-button')).toBeVisible();
    await expect(page.locator('#show-less-babies-button')).toBeHidden();
    await page.locator('#show-more-babies-button').click();
    for (const n of [2, 3, 4]) {
      await expect(page.locator(`#baby-${n}`)).toBeVisible();
    }
    await expect(page.locator('#show-less-babies-button')).toBeVisible();
    await expect(page.locator('#show-more-babies-button')).toBeHidden();
    await page.locator('#show-less-babies-button').click();
    await expect(page.locator('#baby-2')).toBeHidden();
    await expect(page.locator('#show-more-babies-button')).toBeVisible();
  });

  test('each disposition shows its own field; Admission without a ward is rejected, Discharge saves', async ({ page, api }) => {
    // script :102-130 + the shared disposition widget
    const disposition = page.locator('#disposition select').first();
    await setDeliveryDate(page);
    const ward = page.locator('#disposition-emrapi-admittohospital-admissionlocation');
    const dead = page.locator('#disposition-emrapi-death-deathdate');
    await expect(ward).toBeHidden();
    await disposition.selectOption({ label: 'Admission' });
    await expect(ward).toBeVisible();
    await disposition.selectOption({ label: 'Death' });
    await expect(dead).toBeVisible();
    await expect(ward).toBeHidden();

    const submits: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/submit.action')) {
        submits.push(r.url());
      }
    });
    await disposition.selectOption({ label: 'Admission' });
    await page.locator(SAVE).click();
    await expect(page.locator('#disposition .field-error').first()).toHaveText('Please fill out all fields associated with the selected disposition');
    await page.waitForTimeout(1000);
    expect(submits).toEqual([]);

    await disposition.selectOption({ label: 'Discharge' });
    await save(page);
    expectObs(await obsDisplays(api, section.encounter.uuid), 'disposition categories: discharged');
    // ApplyDispositionAction: a Discharge leaves the visit open
    const visit = await api.get(`visit/${section.encounter.visitUuid}?v=custom:(stopDatetime)`);
    expect((await visit.json()).stopDatetime).toBeNull();
  });
});

test.describe('section-delivery under another encounter type', () => {
  test('the postpartum exam is not offered under OB/GYN (direct URL)', async ({ page, createSectionEncounter }) => {
    // includeIf :823, other state
    const section = await createSectionEncounter({ encounterTypeUuid: OBGYN_ENCOUNTER_TYPE_UUID, patient: female });
    await open(page, section);
    await expect(page.locator('#postpartum-exam')).toHaveCount(0);
    await expect(page.locator('#postpartum')).toHaveCount(0);
    await expect(page.locator('#labor-delivery')).toBeVisible();
    await expect(page.locator('#disposition-section')).toBeVisible();
  });
});

// Fills one value of every kind: a date/time, radios, checkboxes, text and number fields, two newborns (live birth with a vaginal delivery, fetal death by
// caesarean), a repeated obsgroup (pads), the disposition and the return date. Returns what the tests assert.
const RETURN = isoDate(14);
// Coded answers the form labels differently from the concept name (answerCodes): obs display -> text shown.
const VIEW_LABELS: Record<string, string> = {
  'Diagnosis order: Secondary': '', // added by CleanDiagnosisConstructAction, not a field of the form
  'Findings on palpation of uterus: Tender uterus': 'Sensitive uterus',
  'Complications at delivery set: Sexually transmitted infection': 'Other STI',
  'Disposition categories: Discharged': 'Discharge',
  'Medication(s) name: Phytomenadione (K1)': 'Vitamin K received',
  'Dystocia type: Mechanical dystocia': 'Mechanical',
  'Breast exam findings: Sufficient milk production': 'Good milk production',
  'Breast exam findings: Mastitis-Postpartum': 'Mastitis',
  'Time units: Days': 'per day',
};
const fillEverything = async (page: Page) => {
  await setDeliveryDate(page, DELIVERED, '10', '30');
  await choose(q(page, 'Partogram'), 'Yes');
  await choose(q(page, 'Dystocia'), 'Mechanical');
  await choose(q(page, 'Prolapsed cord'), 'No');
  await choose(page.locator('#hemLine'), 'Yes');
  await tick(page, 'Postpartum hemorrhage', '#bleeding-diagnosis');
  await tick(page, 'Placental abruption', '#bleeding-diagnosis');
  await choose(page.locator('#bleeding-diagnosis'), 'Severe (1000+ mL)');
  await choose(q(page, 'Transfusion'), 'No');
  await choose(q(page, 'Late cord clamping'), 'Yes');
  await choose(q(page, 'Placenta delivery'), 'Natural');
  await choose(page.locator('#retainedPlacQ'), 'Yes');
  await tick(page, 'Placenta accreta', '#abNormRetainedPlac');
  await tick(page, 'Suture of female perineum');
  await tick(page, 'Episiotomy');
  await tick(page, 'Fetal distress');
  await tick(page, 'Hypertension');
  await tick(page, 'Other STI');
  await tick(page, 'Depression');
  // newborn 1: live birth, vaginal delivery. Text inputs of #baby-1 in order: birth order (hidden), weight, Apgar 1 / 5 / 10 minutes, height, head circumference
  await choose(page.locator('#baby-live-or-death-1'), 'Livebirth');
  await choose(page.locator('#baby-1 p').filter({ hasText: 'Gender' }).first(), 'Feminine');
  const texts = page.locator('#baby-1 input[type=text]');
  await texts.nth(1).fill('3.2');
  await texts.nth(2).fill('8');
  await texts.nth(3).fill('9');
  await texts.nth(4).fill('10');
  await texts.nth(5).fill('50');
  await texts.nth(6).fill('34');
  await tick(page, 'Vitamin K received', '#baby-1');
  await choose(page.locator('#baby-1 p').filter({ hasText: 'Neonatal resuscitation' }).first(), 'No');
  await choose(page.locator('#delivery-type-1'), 'Vaginal delivery');
  // newborn 2: fetal death, macerated, caesarean for a prior caesarean
  await page.locator('#show-more-babies-button').click();
  await choose(page.locator('#baby-live-or-death-2'), 'Fetal death');
  await choose(page.locator('#baby-death-2'), 'Macerated');
  await choose(page.locator('#delivery-type-2'), 'Delivery by cesarean section');
  await tick(page, 'Prior cesarean delivery', '#c-section-reason-2');
  // KPIs and postpartum exam
  await q(page, '# of prenatal visits').locator('input[type=text]').fill('4');
  await tick(page, 'Traditional birth attendant (TBA)');
  await choose(q(page, 'Lochia color'), 'Lochia rubra');
  await choose(q(page, 'Lochia odor'), 'Normal');
  await choose(q(page, 'Lochia quantity'), '++');
  const pads = q(page, 'Number of pads used');
  await pads.locator('input[type=text]').fill('3');
  await choose(pads, 'per day');
  await choose(page.locator('#involution'), 'Abnormal');
  await page.locator('#abnormal-involution input[type=text]').fill('3');
  await choose(q(page, 'Palpation of abdomen'), 'Sensitive uterus');
  await page.locator('p.comment-field textarea').fill('Post partum note');
  await choose(q(page, 'Intact perineum'), 'Yes');
  await tick(page, 'Good milk production');
  await tick(page, 'Mastitis');
  // disposition
  await page.locator('#disposition select').first().selectOption({ label: 'Discharge' });
  await page.locator('#disposition-section input[type=text]:not([readonly])').first().fill('Back if worse');
  await pickDate(page.locator('#apptDate input[readonly]'), RETURN);
};

test.describe('section-delivery saves', () => {
  let section: SectionEncounter;
  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({ encounterTypeUuid: DELIVERY_ENCOUNTER_TYPE_UUID, patient: female });
    await open(page, section);
  });

  test('saves the delivery, two newborns, the postpartum exam and the disposition; EDIT starts from them and VIEW shows them', async ({ page, api }) => {
    test.slow();
    await fillEverything(page);
    await save(page);

    const displays = await obsDisplays(api, section.encounter.uuid);
    expectObs(
      displays,
      'date of confinement',
      'partogram completed at delivery: yes',
      'dystocia type: mechanical dystocia',
      'prolapsed umbilical cord: no',
      'vaginal bleeding: yes',
      'diagnosis: postpartum hemorrhage',
      'diagnosis: placental abruption',
      'estimated maternal blood loss (qualitative): severe',
      'blood transfusion: no',
      'late umbilical cord clamping: yes',
      'abnormal placental attachment: placenta accreta',
      'procedure performed: suture of female perineum',
      'procedure performed: episiotomy',
      'diagnosis: fetal distress',
      'diagnosis: hypertension',
      'complications at delivery set: sexually transmitted infection',
      'mental health diagnosis: depression',
      'birth weight (kg): 3.2',
      'apgar score: 9',
      'pregnancy outcome: livebirth',
      'pregnancy outcome: fetal death',
      'macerated fetus: yes',
      'maternal reason for c-section: prior cesarean delivery',
      'number of antenatal visits for current pregnancy: 4',
      'type of referral role: traditional birth attendant',
      'lochia type: lochia rubra',
      'quantity of lochia (qualitative): ++',
      'number of vaginal pads: 3',
      'time units: days',
      'involution of uterus: abnormal',
      'uterus level from umbilicus during postpartum involution (cm): 3',
      'postpartum examination (text): post partum note',
      'intact perineum, on exam: yes',
      'breast exam findings: mastitis',
      'disposition categories: discharged',
      'disposition comment: back if worse',
      'return visit date: ' + RETURN,
    );
    // CleanDiagnosisConstructAction: every diagnosis got "Diagnosis order: Secondary"
    expect(displays.filter((d) => d === 'diagnosis order: secondary').length).toBeGreaterThanOrEqual(3);
    // two newborn groups (CIEL:1585)
    expect(displays.filter((d) => d.startsWith('newborn details')).length).toBe(2);

    // EDIT starts from the saved values (the conditional blocks follow them)
    await open(page, section);
    await expect(page.locator('#deliveryDate input[readonly]')).toHaveValue(pickerDate(DELIVERED));
    await expect(page.locator('#deliveryDate select').nth(0)).toHaveValue('10');
    await expect(page.locator('#deliveryDate select').nth(1)).toHaveValue('30');
    await expect(checked(page.locator('#hemLine'))).toHaveText('Yes');
    await expect(page.locator('#bleeding-diagnosis')).toBeVisible();
    await expect(checked(page.locator('#bleeding-diagnosis'))).toHaveText(['Postpartum hemorrhage', 'Placental abruption', 'Severe (1000+ mL)']);
    await expect(page.locator('#abNormRetainedPlac')).toBeVisible();
    await expect(checked(page.locator('#abNormRetainedPlac'))).toHaveText('Placenta accreta');
    await expect(page.locator('#baby-alive-1')).toBeVisible();
    await expect(page.locator('#baby-1 input[type=text]').nth(1)).toHaveValue('3.2');
    await expect(page.locator('#baby-1 input[type=text]').nth(2)).toHaveValue('8');
    await expect(checked(page.locator('#delivery-type-1'))).toHaveText('Vaginal delivery');
    await expect(page.locator('#delivery-instrument-1')).toBeVisible();
    await expect(page.locator('#abnormal-involution')).toBeVisible();
    await expect(page.locator('#abnormal-involution input[type=text]')).toHaveValue('3');
    await expect(page.locator('p.comment-field textarea')).toHaveValue('Post partum note');
    await expect(page.locator('#disposition select').first().locator('option:checked')).toHaveText('Discharge');
    await expect(page.locator('#apptDate input[readonly]')).toHaveValue(pickerDate(RETURN));

    // EDIT round trip: change one answer and save again; the VIEW shows the new value and the rest
    await choose(page.locator('#involution'), 'Normal');
    await save(page);
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, VIEW_LABELS);
    const shown = (await view.valueTexts()).join(' | ');
    expect(shown).toContain('Back if worse');
    expect(shown).toContain('Post partum note');
    expect(shown).toContain(viewDate(RETURN));
    expect(shown).toContain('3.2');
    await expect(view.root.locator('#involution')).toContainText('Normal');
    await expect(view.root.locator('#buttons, #buttonsTopRow, #submit, #next')).toHaveCount(0);
  });
});

test.describe('section-delivery VIEW of a small save', () => {
  test('VIEW shows only what was answered: the date, the time and one answer', async ({ page, api, createSectionEncounter }) => {
    const section = await createSectionEncounter({ encounterTypeUuid: DELIVERY_ENCOUNTER_TYPE_UUID, patient: female });
    await open(page, section);
    await setDeliveryDate(page);
    await choose(page.locator('#hemLine'), 'No');
    await save(page);
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {});
    // the two empty spans are the calculated EDD and gestational age (no prior EDD)
    expect((await view.valueTexts()).filter((t) => t !== '')).toEqual([pickerDate(DELIVERED), '12:00 AM', '[X] No']);
    await expect(view.root.locator('#hemLine')).toContainText('[ ] Yes');
    // newborn and postpartum blocks without data show nothing
    await expect(view.root.locator('#baby-1 .value, #postpartum .value, #disposition-section .value')).toHaveCount(0);
    // ifMode VIEW include=false :992, :1027
    await expect(view.root.locator('#buttonsTopRow, #buttons, #next, #submit, #show-less-babies-button:visible')).toHaveCount(0);
  });
});

test.describe('section-delivery hidden answers and saved newborns', () => {
  let section: SectionEncounter;
  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({ encounterTypeUuid: DELIVERY_ENCOUNTER_TYPE_UUID, patient: female });
    await open(page, section);
  });

  test('answers typed under a Yes and then hidden by answering No are not saved', async ({ page, api }) => {
    // when :313 and :888 only hide their target; HFE does not submit a hidden obs
    await setDeliveryDate(page);
    await choose(page.locator('#hemLine'), 'Yes');
    await tick(page, 'Postpartum hemorrhage', '#bleeding-diagnosis');
    await choose(page.locator('#bleeding-diagnosis'), 'Severe (1000+ mL)');
    await choose(page.locator('#hemLine'), 'No');
    await choose(page.locator('#involution'), 'Abnormal');
    await page.locator('#abnormal-involution input[type=text]').fill('4');
    await choose(page.locator('#involution'), 'Normal');
    await save(page);
    const displays = await obsDisplays(api, section.encounter.uuid);
    expectObs(displays, 'vaginal bleeding: no', 'involution of uterus: normal');
    expect(displays.filter((d) => d.includes('postpartum hemorrhage') || d.includes('blood loss') || d.includes('uterus level')), displays.join(' | ')).toEqual([]);
  });

  test.fixme('V2: newborn 2 saved earlier is shown when the form is opened again', async ({ page }) => {
    // remove test.fixme() when fixed. script :133-170: hasValue() reads `.baby-name input`, which does not exist, so #baby-2..4 are hidden on every load, saved or not
    await setDeliveryDate(page);
    await choose(page.locator('#baby-live-or-death-1'), 'Livebirth');
    await page.locator('#show-more-babies-button').click();
    await choose(page.locator('#baby-live-or-death-2'), 'Fetal death');
    await save(page);
    await open(page, section);
    // the saved answer is loaded into the (hidden) newborn 2 ...
    await expect(checked(page.locator('#baby-live-or-death-2'))).toHaveText('Fetal death');
    // ... which the user does not see
    await expect(page.locator('#baby-2')).toBeVisible();
  });
});

// A prior encounter of the patient carrying an estimated delivery date (CIEL:5596), dated before the delivery encounter. The visit is moved back first so
// that the prior encounter can lie inside it.
const addPriorEdd = async (api: APIRequestContext, s: SectionEncounter, eddIso: string) => {
  const conceptRes = await api.get('concept/CIEL:5596?v=custom:(uuid)');
  expect(conceptRes.ok(), `get concept CIEL:5596: ${conceptRes.status()}`).toBeTruthy();
  const visit = await api.post(`visit/${s.encounter.visitUuid}`, { data: { startDatetime: new Date(Date.now() - 10 * 86_400_000).toISOString() } });
  expect(visit.ok(), `move visit start: ${visit.status()}`).toBeTruthy();
  const res = await api.post('encounter', {
    data: {
      patient: s.patient.uuid,
      encounterType: OBGYN_ENCOUNTER_TYPE_UUID,
      location: KLINIK_EKSTEN_LOCATION_UUID,
      encounterDatetime: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      visit: s.encounter.visitUuid,
      obs: [{ concept: (await conceptRes.json()).uuid, value: `${eddIso}T12:00:00.000+0000` }],
    },
  });
  expect(res.ok(), `create prior encounter with an EDD: ${res.status()}`).toBeTruthy();
};

test.describe('section-delivery calculated EDD and gestational age', () => {
  // The browsers of the users are in Haiti (UTC-5/-4): the script parses 'yyyy-MM-dd' as UTC midnight and reads local date parts.
  test.use({ timezoneId: 'America/Port-au-Prince' });
  const EDD = isoDate(30);
  let section: SectionEncounter;
  test.beforeEach(async ({ page, api, createSectionEncounter }) => {
    section = await createSectionEncounter({ encounterTypeUuid: DELIVERY_ENCOUNTER_TYPE_UUID, patient: female });
    await addPriorEdd(api, section, EDD);
    await open(page, section);
  });

  test('a prior EDD is shown as the calculated EDD and the gestational age follows the delivery date', async ({ page }) => {
    // script :172-232: EDD from the latest CIEL:5596 obs before this encounter, entered within 305 days; on a delivery-date change GA = days from EDD-280 to the date
    await expect(page.locator('#calculated-edd')).toHaveText(/^\d{1,2} \w{3} \d{4}$/);
    // EDD = today + 30 days, delivered yesterday: 280 - 31 = 249 days = 35 weeks 4 days
    await setDeliveryDate(page, isoDate(-1));
    await expect(page.locator('#calculated-gestational')).toBeVisible();
    await expect(page.locator('#calculated-gestational-age-value')).toHaveText(/35\s+4\/7\s+weeks/);
    // delivered 34 days ago, 64 days before the EDD: 216 days = 30 weeks 6 days
    await setDeliveryDate(page, isoDate(-34));
    await expect(page.locator('#calculated-gestational-age-value')).toHaveText(/30\s+6\/7\s+weeks/);
  });

  test('no prior EDD: nothing is calculated', async ({ page, createSectionEncounter }) => {
    // script :207 needs lastEddDate and lastEnteredEDDDate
    const other = await createSectionEncounter({ encounterTypeUuid: DELIVERY_ENCOUNTER_TYPE_UUID, patient: female });
    await open(page, other);
    await expect(page.locator('#calculated-edd')).toHaveText('');
    await setDeliveryDate(page, isoDate(-1));
    await expect(page.locator('#calculated-gestational')).toBeHidden();
  });

  test.fixme('V3: the calculated EDD is the saved EDD', async ({ page }) => {
    // remove test.fixme() when fixed. script :191-211 parses 'yyyy-MM-dd' (UTC midnight) and reads the LOCAL date parts, so the EDD shows one day early in the browsers
    // west of UTC (Haiti): saved 6 Dec 2026, shown 5 Dec 2026 (checked on zl-ci with the browser in America/Port-au-Prince)
    await expect(page.locator('#calculated-edd')).toHaveText(viewDate(EDD));
  });

  test.fixme('V4: on load the gestational age is the one of the saved delivery date', async ({ page }) => {
    // remove test.fixme() when fixed. script :214 passes the calculated EDD itself to displayGestationalAge as the delivery date, so on load the age is always 40 weeks
    // whatever the saved delivery date; it is right only after the delivery date is changed
    await setDeliveryDate(page, isoDate(-1));
    await save(page);
    await open(page, section);
    await expect(page.locator('#calculated-gestational-age-value')).toHaveText(/35\s+4\/7\s+weeks/);
  });
});
