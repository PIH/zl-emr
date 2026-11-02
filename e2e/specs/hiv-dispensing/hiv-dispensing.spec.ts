import { type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { HIV_DISPENSING_ENCOUNTER_TYPE_UUID, HIV_FOLLOWUP_ENCOUNTER_TYPE_UUID, KLINIK_EKSTEN_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, SectionFormPage, ViewFormPage, viewMismatches, VISIT_PAGE_URL } from '../../pages';

// hiv/hiv-dispensing.xml: "HIV Dispensing" (dispensed to patient / CHW / community, treatment line, last prescribed regimen,
// allergy table, drug + quantity rows for ARV 1-3, TMS/dapsone, INH/RPT primary and secondary, B6, months dispensed and next
// dispensing date). Top-level form with its own provider/location/date (shared subform, tag "HIV Consult Location"). The specs
// open enterHtmlFormWithStandardUi inside a visit they create (EntryFormPage) and editHtmlFormWithStandardUi on the saved
// encounter for EDIT; the four entry points of _availability.e2e.md (component `hiv`, not offered on the CEN test server)
// are not exercised. The form uses <submit>, so there is no #submit: the specs click `#buttons input.submitButton`.
//
// Conditions in the form, from documentation inventory (hiv-dispensing.inv.md):
//   when #dispensedTo = CIEL:1555 (CHW)         :503  show #medPickupChwId (CHW name)
//   when #dispensedTo = PIH:9361 (community)    :504  show #medPickupComId (community name)
//   ifMode VIEW include=true                    :442  script checkFieldsEditMode() (zl.js; VIEW tested, see below)
//   ifMode VIEW include=false                   :462, :891  heading, confirm overlay, provider/location/date, buttons
// Scripts (one ready handler :102-440, i18n :97, VIEW script :443):
//   :205-231 click on #dispensedTo: patient -> clears and disables the CHW name, hides both; CHW -> shows the CHW name; community
//     -> clears the community name and shows it. :203 checkFields() (zl.js) sets the same visibility from saved names.
//   :257-267 #monthsDispensed change: next dispensing date = encounter date + 28 x months, then validateNextDispensingDate (:173,
//     also on change of the date): valid iff 1..364 days after the encounter, else "Next dispensing date has to be within a year".
//   :279-356 beforeValidation: (1) at least one drug ("Please select a drug"), (2) CHW name required, (3) community name
//     required ("Required"), (4) next date required ("Please select date") and valid, (5) each drug row has drug and quantity or
//     neither ("Make sure each selected drug has a corresponding quantity entered"). :358 beforeSubmit sets the hidden obs
//     inhP / inhS (PIH:13786 = CIEL:159943 / CIEL:159944) from the INH rows.
//   :104-166, :407-421 ART treatment line (concept 0c709500) read over REST: the latest obs on or before the encounter date fills
//     "Previous regimen" (date, line), pre-selects the matching radio and stores the line in localStorage; changing the radio then asks
//     to confirm (#confirmOverlay, "Previous value was X. Do you really want to change the treatment line to Y?"; No restores).
// Side effects on save: obs only (obsgroups CIEL:1442 with drug CIEL:1282 + quantity CIEL:1443 + hidden PIH:1535). No order, no
//   program enrollment, no stock or post-submission action, so the cleanup has nothing special to void.
// VIEW (getAsHtml.action with this form's file; the end of the two save tests): every saved value is shown under the form's
//   answerLabels / answerCodes (drug rows, "to patient", the equivalent-ART checkbox), the date as "dd MMM yyyy", the community name, and
//   the CHW name, unfilled rows and the ifMode VIEW include=false parts (:462, :891) are absent. The hidden grouping obs are not compared.
// Not covered here: the allergy table (shared, _shared.e2e.md), provider/date retro gating, the drug option lists.
//
// Findings:
//   V1 Medium :274-277  in EDIT of an encounter dispensed to a CHW the ready handler throws: getField('dispensedInCommunity.value')
//                       is null (that obs is commented out, :521-528). Everything registered after it is lost: the beforeValidation
//                       rules (CHW name, next date, drug/quantity pairing), the inhP/inhS beforeSubmit and the treatment-line
//                       prompt. Fix: delete the branch. TESTED below (test.fixme).
//   V2 Medium :280-291, :358-373, :786-840  the "at least one drug" rule omits inhP2Drug and inhS2Drug, so a dispensing of RPT 150 mg
//                       alone is refused with "Please select a drug"; beforeSubmit never sets inhP2/inhS2 (PIH:21123/21124), so
//                       those flags are never saved (by reading). Fix: add both drugs to the rule and to beforeSubmit.
//                       TESTED below (test.fixme, first part).
//   V3 Medium :416, :380  the treatment line is kept in localStorage ('previousTreatmentLineValue') and only overwritten when the
//                       next patient has a regimen: for a patient without one the previous patient's line is offered as "Previous
//                       value", and "No" selects it. Fix: removeItem when there is no regimen. TESTED below (test.fixme).
//   V4 Low    :394-401  getStringValue lists each key twice, the French labels win: the English prompt reads "...to 2ème?" (seen).
//   V5 Low    :293      jq("missingMedsError") lacks the '#', so the error is not hidden by that branch (the change handlers :145-153 do).
//   V6 Low    :263      toISOString().slice(0,10) on a local-midnight date shifts the next date one day early in time zones ahead of
//                       UTC (Haiti, UTC-5/-4, is fine). (unconfirmed)
//   V7 Low    :407-421  the prefill matches the concept's display name against "1st/2nd/3rd/1ère/2ème/3ème" (a ht name would pre-select
//                       nothing and "No" could not restore). (unconfirmed)
//   V8 Info   :205-231  the handler clears only one name, yet a hidden CHW/community name is not saved (tested): <when> drops it.

const FORM = 'hiv/hiv-dispensing.xml';
const ART_TREATMENT_LINE_UUID = '0c709500-0cf8-4959-b244-3e9d24dcacc0'; // the concept the form's script reads
const CHW_NAME_CONCEPT_UUID = 'c29f0c91-0128-445d-a64b-1f85498c5752'; // $medPickupChw
// VIEW: the drug rows show the form's answerLabels, not the drug names. The hidden grouping obs ("Medication category", PIH:1535) are
// not form fields and the date has no fixed text: both are left out of the generic check, the date is asserted by locator.
const VIEW_LABELS: Record<string, string> = {
  'Medication(s) name: Tenofovir disoproxil fumarate (TDF) 300mg + Lamivudine (3TC) 300mg tablet (TDF + 3TC)': 'TDF/3TC 300/300mg',
  'Medication(s) name: Cotrimoxazole (Sulfamethoxazole/Trimethoprim), 400mg/80mg tablet (Cotrimoxazole)': 'TMS 480 mg',
  'Medication(s) name: Isoniazid (H), 300mg tablet (Isoniazid)': 'INH 300 mg',
  'Medication(s) name: Pyridoxine (Vitamin B6), 50mg tablet (Pyridoxine (B6))': 'B6',
  'Equivalent: Yes': 'Dispensed ART regimen equivalent to most recent prescribed ART',
};
const NEXT_DATE_ERROR = 'Next dispensing date has to be within a year of the encounter date';

// Behaviour is checked in Haiti's time zone (the form builds dates with local getters).
test.use({ timezoneId: 'America/Port-au-Prince' });

// Local helpers.
// <submit/> renders input.submitButton (no #submit). The location select must have a value or "Required" blocks the save.
const save = async (page: Page) => {
  await expect(page.locator('#encounterLocation select')).not.toHaveValue('');
  await page.locator('#buttons input.submitButton').click();
  await expect(page).toHaveURL(VISIT_PAGE_URL);
};
const clickSave = async (page: Page) => {
  await expect(page.locator('#encounterLocation select')).not.toHaveValue('');
  await page.locator('#buttons input.submitButton').click();
};
// radios of #dispensedTo, in form order
const DISPENSED_TO = { patient: 0, chw: 1, community: 2 } as const;
const dispensedTo = (page: Page, to: keyof typeof DISPENSED_TO) => page.locator('#dispensedTo input[type=radio]').nth(DISPENSED_TO[to]);
// a drug row of #medsTable, found by the id of its drug obs (arv1Drug, tmsDrug, inhPDrug, inhP2Drug, b6Drug, ...)
const row = (page: Page, drugId: string) => page.locator(`#medsTable tr:has(#${drugId})`);
const dispense = async (page: Page, drugId: string, label: string, quantity?: string) => {
  await row(page, drugId).locator('select').selectOption({ label });
  if (quantity) {
    await row(page, drugId).locator('.drugQty input').fill(quantity);
  }
};
// numeric text input: the form's handlers listen to `change`, which fires on blur
const typeNumber = async (input: Locator, value: string) => {
  await input.fill(value);
  await input.blur();
};
const monthsInput = (page: Page) => page.locator('#monthsDispensed input');
const nextDate = (page: Page) => page.locator('#nextDispenseDate input[type=hidden]');
const nextDateError = (page: Page) => page.locator('td:has(#nextDispenseDate) .field-error');
const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const encounterDate = (page: Page) => page.locator('#encounterDate input[type=hidden]').inputValue();
const hasObs = (obs: { display: string }[], text: string) => obs.some((o) => o.display.includes(text));

// A follow-up encounter (2 days ago) carrying the ART treatment line "1st", which the form reads as the previous regimen.
const createPriorRegimen = async (api: APIRequestContext, context: EntryContext) => {
  const when = new Date(Date.now() - 2 * 86400000).toISOString();
  const res = await api.post('encounter', {
    data: {
      patient: context.patient.uuid,
      encounterType: HIV_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      location: KLINIK_EKSTEN_LOCATION_UUID,
      encounterDatetime: when,
      visit: context.visitUuid,
      obs: [{ concept: ART_TREATMENT_LINE_UUID, value: 'CIEL:166074', obsDatetime: when }],
    },
  });
  expect(res.ok(), `create prior regimen: ${res.status()}`).toBeTruthy();
  return when;
};
const savedEncounterUuid = async (api: APIRequestContext, patientUuid: string) => {
  await expect.poll(async () => (await getPatientEncounters(api, patientUuid)).length).toBe(1);
  return (await getPatientEncounters(api, patientUuid))[0].uuid;
};
const openEdit = async (page: Page, context: EntryContext, encounterUuid: string) => {
  await page.goto(SectionFormPage.editUrl(FORM, { patient: context.patient, encounter: { uuid: encounterUuid, visitUuid: context.visitUuid } }));
  await expect(page.locator('#buttons input.submitButton')).toBeVisible();
};

test.describe('hiv-dispensing', () => {
  let context: EntryContext;

  test.beforeEach(async ({ page, createEntryContext }) => {
    context = await createEntryContext({ givenName: 'AutoDispensing', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(30) });
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#medsTable')).toBeVisible();
  });

  test('the CHW and community names show for their answer only; "to patient" clears and disables the CHW name', async ({ page }) => {
    // when :503-504, click handler :205-231
    const chw = page.locator('#medPickupChwId');
    const com = page.locator('#medPickupComId');
    await expect(chw).toBeHidden();
    await expect(com).toBeHidden();

    await dispensedTo(page, 'chw').check();
    await expect(chw).toBeVisible();
    await expect(com).toBeHidden();
    await chw.locator('input').fill('AutoChw');

    await dispensedTo(page, 'community').check();
    await expect(com).toBeVisible();
    await expect(chw).toBeHidden();

    await dispensedTo(page, 'chw').check();
    await expect(chw).toBeVisible();
    await expect(com).toBeHidden();

    await dispensedTo(page, 'patient').check();
    await expect(chw).toBeHidden();
    await expect(com).toBeHidden();
    await expect(chw.locator('input')).toBeDisabled();
    await expect(chw.locator('input')).toHaveValue(''); // :212

    await dispensedTo(page, 'chw').check();
    await expect(chw.locator('input')).toBeEnabled();
  });

  test('a months value sets the next dispensing date 28 days per month after the encounter date', async ({ page }) => {
    // :257-267
    const encDate = await encounterDate(page);
    await typeNumber(monthsInput(page), '3');
    await expect(nextDate(page)).toHaveValue(addDays(encDate, 84));
    await expect(nextDateError(page)).toBeHidden();
    await typeNumber(monthsInput(page), '1');
    await expect(nextDate(page)).toHaveValue(addDays(encDate, 28));
  });

  for (const { months, shown } of [
    { months: '0', shown: true }, // same day as the encounter
    { months: '14', shown: true }, // 392 days
    { months: '12', shown: false }, // 336 days
  ]) {
    test(`${months} months dispensed ${shown ? 'shows' : 'does not show'} the "within a year" message`, async ({ page }) => {
      // validateNextDispensingDate :173-186: valid iff 1..364 days after the encounter
      await typeNumber(monthsInput(page), months);
      if (shown) {
        await expect(nextDateError(page)).toHaveText(NEXT_DATE_ERROR);
      } else {
        await expect(nextDate(page)).not.toHaveValue('');
        await expect(nextDateError(page)).toBeHidden();
      }
    });
  }

  // beforeValidation :279-356. Each row starts from a valid form (patient, ARV 1 with quantity, 1 month) and breaks one thing.
  for (const { title, setup, error, text } of [
    { title: 'no drug selected', setup: async (p: Page) => { await typeNumber(monthsInput(p), '1'); }, error: (p: Page) => p.locator('#missingMedsError'), text: 'Please select a drug' },
    {
      title: 'a drug without a quantity',
      setup: async (p: Page) => { await dispense(p, 'arv1Drug', 'TDF/3TC 300/300mg'); await typeNumber(monthsInput(p), '1'); },
      error: (p: Page) => p.locator('#missingMedsError'),
      text: 'Make sure each selected drug has a corresponding quantity entered',
    },
    { title: 'no next dispensing date', setup: async (p: Page) => { await dispense(p, 'arv1Drug', 'TDF/3TC 300/300mg', '30'); }, error: nextDateError, text: 'Please select date' },
    {
      title: 'a next date more than a year away',
      setup: async (p: Page) => { await dispense(p, 'arv1Drug', 'TDF/3TC 300/300mg', '30'); await typeNumber(monthsInput(p), '14'); },
      error: nextDateError,
      text: NEXT_DATE_ERROR,
    },
    {
      title: 'a CHW without a name',
      setup: async (p: Page) => { await dispense(p, 'arv1Drug', 'TDF/3TC 300/300mg', '30'); await typeNumber(monthsInput(p), '1'); await dispensedTo(p, 'chw').check(); },
      error: (p: Page) => p.locator('#medPickupChwId .field-error'),
      text: /^required$/i,
    },
    {
      title: 'a community dispensing without a name',
      setup: async (p: Page) => { await dispense(p, 'arv1Drug', 'TDF/3TC 300/300mg', '30'); await typeNumber(monthsInput(p), '1'); await dispensedTo(p, 'community').check(); },
      error: (p: Page) => p.locator('#medPickupComId .field-error'),
      text: /^required$/i,
    },
  ] as { title: string; setup: (p: Page) => Promise<void>; error: (p: Page) => Locator; text: string | RegExp }[]) {
    test(`saving with ${title} is refused`, async ({ page, api }) => {
      await setup(page);
      await clickSave(page);
      await expect(error(page)).toHaveText(text);
      await expect(page).toHaveURL(/enterHtmlFormWithStandardUi/);
      expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
    });
  }

  test('the last prescribed regimen fills the previous-regimen box and the treatment line; changing the line asks to confirm', async ({ page, api, createEntryContext }) => {
    // script :104-166 (REST read), :407-421, confirm handler :380-392; the fixture's beforeEach form has no regimen, so open a new one
    const other = await createEntryContext({ givenName: 'AutoDispensingPrior', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(30) });
    const when = await createPriorRegimen(api, other);
    await EntryFormPage.open(page, FORM, other);

    await expect(page.locator('#lastPrescribedTreatmentLine')).toHaveText(/^1(st|ère)$/);
    const expectedDate = await page.evaluate((iso) => new Date(iso).toDateString(), when);
    await expect(page.locator('#lastPrescribedRegimenDate')).toHaveText(expectedDate);
    const radios = page.locator('#treatmentLine input[type=radio]');
    await expect(radios.nth(0)).toBeChecked();

    const overlay = page.locator('#confirmOverlay');
    await radios.nth(1).check();
    await expect(overlay).toBeVisible();
    await expect(page.locator('#confirmText')).toContainText(/^Previous value was 1(st|ère)\./);
    await page.locator('#confirmNo').click();
    await expect(overlay).toBeHidden();
    await expect(radios.nth(0)).toBeChecked();

    await radios.nth(1).check();
    await page.locator('#confirmYes').click();
    await expect(overlay).toBeHidden();
    await expect(radios.nth(1)).toBeChecked();
  });

  test('without a previous regimen nothing is prefilled and changing the treatment line asks nothing', async ({ page }) => {
    // :104-166: no obs -> the box stays empty, no localStorage value
    await expect(page.locator('#lastPrescribedTreatmentLine')).toBeEmpty();
    await expect(page.locator('#lastPrescribedRegimenDate')).toBeEmpty();
    await page.locator('#treatmentLine input[type=radio]').nth(1).check();
    await expect(page.locator('#confirmOverlay')).toBeHidden();
  });

  test('V3: a patient without a regimen is not asked about the previous patient\'s treatment line', async ({ page, api, createEntryContext }) => {
    test.fixme(true, 'V3: localStorage previousTreatmentLineValue is never cleared; remove test.fixme() when fixed');
    const first = await createEntryContext({ givenName: 'AutoDispensingPriorA', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(30) });
    await createPriorRegimen(api, first);
    await EntryFormPage.open(page, FORM, first);
    await expect(page.locator('#lastPrescribedTreatmentLine')).toHaveText(/^1(st|ère)$/); // stored in localStorage now

    await EntryFormPage.open(page, FORM, context); // patient without a regimen, same browser
    await expect(page.locator('#medsTable')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.locator('#treatmentLine input[type=radio]').nth(1).check();
    await expect(page.locator('#confirmOverlay')).toBeHidden();
  });

  test('saves a dispensing to the patient: drugs with quantities, treatment line, months and next date', async ({ page, api }) => {
    await dispensedTo(page, 'patient').check();
    await page.locator('#treatmentLine input[type=radio]').nth(1).check();
    await page.locator('table:has(#lastPrescribedRegimenDate) input[type=checkbox]').check(); // equivalent ART
    await dispense(page, 'arv1Drug', 'TDF/3TC 300/300mg', '30');
    await dispense(page, 'tmsDrug', 'TMS 480 mg', '60');
    await dispense(page, 'inhPDrug', 'INH 300 mg', '90');
    await dispense(page, 'b6Drug', 'B6', '45'); // answerLabels="B6, 50mg" is split at the comma: one drug, labels "B6" and "50mg"
    const encDate = await encounterDate(page);
    await typeNumber(monthsInput(page), '2');
    await expect(nextDate(page)).toHaveValue(addDays(encDate, 56));
    await save(page);

    const encounterUuid = await savedEncounterUuid(api, context.patient.uuid);
    expect((await getPatientEncounters(api, context.patient.uuid))[0]).toMatchObject({ encounterType: { uuid: HIV_DISPENSING_ENCOUNTER_TYPE_UUID } });
    const obs = await getEncounterObs(api, encounterUuid);
    for (const quantity of [30, 60, 90, 45]) {
      expect(obs.filter((o) => o.value === quantity), `quantity ${quantity}`).toHaveLength(1);
    }
    expect(obs.filter((o) => o.value === 2), 'months dispensed').toHaveLength(1);
    expect(obs.filter((o) => o.concept.uuid === CHW_NAME_CONCEPT_UUID)).toHaveLength(0);
    expect(hasObs(obs, 'Tenofovir'), 'ARV 1 drug').toBe(true);
    expect(hasObs(obs, 'Primary'), 'beforeSubmit set the hidden INH primary obs (:358)').toBe(true);

    // side effect: dispensing saves obs only, no drug order
    const orders = await api.get(`order?patient=${context.patient.uuid}&t=drugorder`);
    expect((await orders.json()).results).toHaveLength(0);

    // VIEW: every saved value is shown; the hidden grouping obs (PIH:1535) are not form fields, so they are not compared
    const view = await ViewFormPage.open(page, FORM, encounterUuid);
    const missing = await viewMismatches(api, view, encounterUuid, VIEW_LABELS);
    expect(missing.filter((m) => !m.startsWith('Medication category') && !m.startsWith('Return visit date'))).toEqual([]);
    const shown = await view.valueTexts();
    for (const expected of ['30', '60', '90', '45', '2']) {
      expect(shown, `quantity or months ${expected}`).toContain(expected);
    }
    await expect(page.locator('#dispensedTo .value')).toHaveText('[X] to patient');
    await expect(page.locator('#arv1Drug .value')).toHaveCount(1);
    await expect(page.locator('#arv1DrugQty .value')).toHaveText('30');
    await expect(page.locator('#monthsDispensed .value')).toHaveText('2');
    await expect(page.locator('#nextDispenseDate .value')).toHaveText(/^\d{2} \w{3} \d{4}$/); // "dd MMM yyyy"
    // not filled: the CHW and community names, ARV 2 and the secondary INH row (the <when> that hides them does not run in VIEW)
    await expect(page.locator('#medPickupChwId .value, #medPickupComId .value, #arv2Drug .value, #arv2DrugQty .value, #inhSDrug .value')).toHaveCount(0);
    // ifMode VIEW include=false :462, :891: heading, confirm overlay, provider/location/date and buttons
    await expect(page.locator('h2, #confirmOverlay, #encounterLocation, #buttons, input.submitButton')).toHaveCount(0);
  });

  test('a dispensing to the community saves the name; EDIT shows it again and keeps the INH rows', async ({ page, api }) => {
    // checkFields() :203 and the when handlers in EDIT; four TB rows share one grouping concept (CIEL:1442) and hidden answer
    await dispensedTo(page, 'community').check();
    await page.locator('#medPickupComId input').fill('AutoCommunity');
    await dispense(page, 'arv2Drug', 'DTG 50mg', '30');
    await dispense(page, 'inhPDrug', 'INH 100 mg', '10');
    await dispense(page, 'inhP2Drug', 'RPT 150 mg', '20');
    await typeNumber(monthsInput(page), '1');
    await save(page);

    const encounterUuid = await savedEncounterUuid(api, context.patient.uuid);
    const obs = await getEncounterObs(api, encounterUuid);
    expect(hasObs(obs, 'AutoCommunity')).toBe(true);

    await openEdit(page, context, encounterUuid);
    await expect(page.locator('#medPickupComId')).toBeVisible();
    await expect(page.locator('#medPickupComId input')).toHaveValue('AutoCommunity');
    await expect(page.locator('#medPickupChwId')).toBeHidden();
    await expect(monthsInput(page)).toHaveValue('1');
    await expect(row(page, 'arv2Drug').locator('.drugQty input')).toHaveValue('30');
    await expect(row(page, 'inhPDrug').locator('.drugQty input')).toHaveValue('10');
    await expect(row(page, 'inhP2Drug').locator('.drugQty input')).toHaveValue('20');
    await expect(row(page, 'inhSDrug').locator('.drugQty input')).toHaveValue('');
    await expect(row(page, 'inhS2Drug').locator('.drugQty input')).toHaveValue('');

    // VIEW of the same encounter: the community name and the filled rows show, the CHW name and the unfilled rows do not
    const view = await ViewFormPage.open(page, FORM, encounterUuid);
    expect(await view.valueTexts()).toEqual(expect.arrayContaining(['AutoCommunity', '[X] in community', '10', '20', '1']));
    await expect(page.locator('#comName .value')).toHaveText('AutoCommunity');
    await expect(page.locator('#inhPDrug .value')).toHaveText('INH 100 mg');
    await expect(page.locator('#inhP2Drug .value')).toHaveText('RPT 150 mg');
    await expect(page.locator('#chwName .value, #inhSDrug .value, #inhS2Drug .value, #b6Drug .value, #tmsDrug .value')).toHaveCount(0);
  });

  test('the CHW name of a dispensing switched to the community is not saved', async ({ page, api }) => {
    // click handler :205-231 clears only the community name, yet the hidden CHW name is not saved (V8)
    await dispensedTo(page, 'chw').check();
    await page.locator('#medPickupChwId input').fill('AutoChw');
    await dispensedTo(page, 'community').check();
    await page.locator('#medPickupComId input').fill('AutoCommunity');
    await dispense(page, 'arv1Drug', 'TDF/3TC 300/300mg', '30');
    await typeNumber(monthsInput(page), '1');
    await save(page);

    const obs = await getEncounterObs(api, await savedEncounterUuid(api, context.patient.uuid));
    expect(obs.filter((o) => o.concept.uuid === CHW_NAME_CONCEPT_UUID)).toHaveLength(0);
  });

  test('V2: a dispensing of RPT 150 mg alone can be saved', async ({ page, api }) => {
    test.fixme(true, 'V2: "at least one drug" ignores inhP2Drug/inhS2Drug; remove test.fixme() when fixed');
    await dispense(page, 'inhP2Drug', 'RPT 150 mg', '20');
    await typeNumber(monthsInput(page), '1');
    await clickSave(page);
    await expect(page.locator('#missingMedsError')).toBeHidden();
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    await savedEncounterUuid(api, context.patient.uuid);
  });

  test('V1: in EDIT of a CHW dispensing the CHW name is still required', async ({ page, api }) => {
    test.fixme(true, 'V1: the EDIT ready handler throws on getField(dispensedInCommunity), the validators are lost; remove test.fixme() when fixed');
    await dispensedTo(page, 'chw').check();
    await page.locator('#medPickupChwId input').fill('AutoChw');
    await dispense(page, 'arv1Drug', 'TDF/3TC 300/300mg', '30');
    await typeNumber(monthsInput(page), '1');
    await save(page);
    const encounterUuid = await savedEncounterUuid(api, context.patient.uuid);

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.name));
    await openEdit(page, context, encounterUuid);
    await expect(page.locator('#chwName input')).toHaveValue('AutoChw');
    await page.locator('#chwName input').fill('');
    await clickSave(page);
    await expect(page.locator('#medPickupChwId .field-error')).toHaveText(/^required$/i);
    expect(errors).toHaveLength(0);
  });
});
