import { type Page } from '@playwright/test';
import { test, expect, type SectionEncounter } from '../../core';
import {
  PRIMARY_CARE_ADULT_FOLLOWUP_ENCOUNTER_TYPE_UUID,
  PRIMARY_CARE_PEDS_FOLLOWUP_ENCOUNTER_TYPE_UUID,
} from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage, ViewFormPage, expectViewShowsSavedObs } from '../../pages';

// section-chief-complaint.xml (pihemr): "Chief Complaint" section, one free-text obs (CIEL:160531, `#chief-complaint`). On the
// visit page it is the `pihcore-chief-complaint` section of the primary care adult and peds FOLLOWUP encounters; the specs create
// the parent encounter over REST (so it has no `form`) and open the section's edit URL directly (skips the gating of
// _availability.e2e.md). Runs on zl-ci.
//
// Conditions in the form, from documentation inventory (section-chief-complaint.inv.md):
//   ifMode VIEW include=false :16, :37   heading + script, and the #buttons row (Next, Save, Cancel); absent in VIEW
// Scripts: :21 setUpNextAndSubmitButtons() only (see _shared.e2e.md). No validation, default or derived value; nothing is required.
// Side effects on save: none (no postSubmissionAction, program, order).
// VIEW is tested on the visit page, which shows the section's own VIEW (`pihcore-chief-complaint` has an active templateModelUrl in
//   encounterTypeConfig.js :26): expectViewShowsSavedObs.
// Not covered here: #next (moves to the next section of the parent entry form; needs the entry form, see _shared.e2e.md).

const FORM = 'section-chief-complaint.xml';
const COMPLAINT = 'Fever and headache for three days';

const PARENTS = [
  { name: 'primary care adult followup', uuid: PRIMARY_CARE_ADULT_FOLLOWUP_ENCOUNTER_TYPE_UUID },
  { name: 'primary care peds followup', uuid: PRIMARY_CARE_PEDS_FOLLOWUP_ENCOUNTER_TYPE_UUID },
];

const complaint = (page: Page) => page.locator('#chief-complaint textarea');

for (const parent of PARENTS) {
  test.describe(`section-chief-complaint under ${parent.name}`, () => {
    let section: SectionEncounter;

    test.beforeEach(async ({ page, createSectionEncounter }) => {
      section = await createSectionEncounter({
        encounterTypeUuid: parent.uuid,
        patient: { givenName: 'AutoChiefComplaint', familyName: 'Tester', gender: 'F' },
      });
      await SectionFormPage.openEdit(page, FORM, section);
    });

    test('ENTER/EDIT shows the textarea and the Next, Save and Cancel buttons', async ({ page }) => {
      // ifMode VIEW include=false :16, :37
      await expect(complaint(page)).toBeVisible();
      await expect(page.locator('#next')).toBeVisible();
      await expect(page.locator('#submit')).toBeVisible();
      await expect(page.locator('#cancel')).toBeVisible();
    });

    test('saves with the complaint blank (nothing is required) and records no obs', async ({ page, api }) => {
      await new SectionFormPage(page, FORM).save();
      await new SectionFormPage(page, FORM).expectSaved();
      expect(await getEncounterObs(api, section.encounter.uuid)).toEqual([]);
    });

    test('saves the complaint, EDIT shows it again, VIEW shows it on the visit page', async ({ page, api }) => {
      await complaint(page).fill(COMPLAINT);
      await new SectionFormPage(page, FORM).save();
      await new SectionFormPage(page, FORM).expectSaved();

      const obs = await getEncounterObs(api, section.encounter.uuid);
      expect(obs).toHaveLength(1);
      expect(obs[0].concept.display).toBe('Chief complaint (text)');
      expect(obs[0].value).toBe(COMPLAINT);

      // EDIT starts from the saved value
      await SectionFormPage.openEdit(page, FORM, section);
      await expect(complaint(page)).toHaveValue(COMPLAINT);

      // VIEW (ifMode VIEW include=false :16, :37: no heading script, no buttons)
      const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid);
      expect(await view.valueTexts()).toContain(COMPLAINT);
      await expect(view.page.locator('#buttons, #submit, #next, #cancel')).toHaveCount(0);
    });

    test('blanking the complaint in EDIT voids the obs, and VIEW then shows no value', async ({ page, api }) => {
      await complaint(page).fill(COMPLAINT);
      await new SectionFormPage(page, FORM).save();
      await new SectionFormPage(page, FORM).expectSaved();
      await SectionFormPage.openEdit(page, FORM, section);
      await complaint(page).fill('');
      await new SectionFormPage(page, FORM).save();
      await new SectionFormPage(page, FORM).expectSaved();
      expect(await getEncounterObs(api, section.encounter.uuid)).toEqual([]);

      const view = await ViewFormPage.open(page, FORM, section.encounter.uuid);
      await expect(view.values).toHaveCount(0);
      await expect(view.root.locator('#chief-complaint .emptyValue')).toHaveCount(1);
    });
  });
}
