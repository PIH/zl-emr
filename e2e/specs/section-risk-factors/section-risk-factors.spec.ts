import { type APIRequestContext } from '@playwright/test';
import { test, expect, type SectionEncounter } from '../../core';
import { HIV_INTAKE_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { SectionFormPage, expectViewShowsSavedObs } from '../../pages';

// hiv/section-risk-factors.xml: HIV risk factors, nine No/Yes/Unknown radio questions (syphilis, other STI, sexual
// aggression, multiple partners, sex without condom, anal sex, sex with a sex worker, sex worker, other + "specify")
// and a free-text remark. Unreferenced (documentation/_availability.e2e.md: not in encounterTypeConfig.js, no
// <subform>): the specs open the edit URL directly on an HIV intake encounter (any type would do).
//
// Conditions in the form, from documentation inventory (section-risk-factors.inv.md): none besides
//   ifMode VIEW include=false  :5, :18, :158   CSS, heading + script, and the #buttons row in ENTER/EDIT only
// Scripts: :31 setUpNextAndSubmitButtons() only (see _shared.e2e.md). No validation, message, default or derived value.
// Side effects on save: none. No required field.
// VIEW (getAsHtml.action on the saved encounter): the answered radios, the "specify" comment and the remark are shown;
// unanswered questions are not shown as values; the button row (ifMode VIEW include=false :158) is absent.
// Not covered here: #next (needs the visit page).
//
// Findings:
//   V1 Info :73-77  "Reports heterosexual" is a label with no obs (the ToDo at :76 says so): the three questions
//                   under it look like sub-questions but are independent radios, always visible.
//   V2 Info (form) the section is not offered anywhere (see _availability), so these radios cannot be reached from the UI.

const FORM = 'hiv/section-risk-factors.xml';
// The answers are labelled by answerCodes pihcore.{yes,no,unknown}.oneChar ("y", "n", "u"), not by the concept names (obs display -> text shown).
const VIEW_LABELS: Record<string, string> = {
  'History of syphilis: Yes': 'y',
  'Patient with multiple sexual partners: No': 'n',
  'Client of sex worker: Unknown': 'u',
  'Other risk factor: Yes': 'y',
};

// Local helper: display, comment and text value of each obs on the (synthetic) encounter.
const obsOf = async (api: APIRequestContext, encounterUuid: string) => {
  const res = await api.get(`obs?encounter=${encounterUuid}&v=custom:(display,comment,value:(display))&limit=100`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).results as Array<{ display: string; comment: string | null }>;
};

test.describe('section-risk-factors', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: HIV_INTAKE_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoRisk', familyName: 'Tester', gender: 'M' },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  test('renders nine unanswered No/Yes/Unknown questions, a specify field and a remark', async ({ page }) => {
    // w2..w18: nine radio groups of three (n, y, u), none preselected
    await expect(page.locator('input[type=radio]')).toHaveCount(27);
    await expect(page.locator('input[type=radio]:checked')).toHaveCount(0);
    await expect(page.locator('#w19')).toBeVisible(); // "specify" comment of the Other question
    await expect(page.locator('#w21')).toBeVisible(); // remark
  });

  test('a radio question takes one answer at a time', async ({ page }) => {
    const yes = page.locator('#w2_1');
    await page.locator('#w2_0').check();
    await yes.check();
    await expect(page.locator('#w2_0')).not.toBeChecked();
    await page.locator('#w2_2').check();
    await expect(yes).not.toBeChecked();
    await expect(page.locator('#w2_2')).toBeChecked();
  });

  test('saves the answers, the specify text and the remark, and EDIT shows them again', async ({ page, api }) => {
    await page.locator('#w2_1').check(); // syphilis: yes
    await page.locator('#w8_0').check(); // multiple partners: no
    await page.locator('#w14_2').check(); // sex with a sex worker: unknown
    await page.locator('#w18_1').check(); // other risk factor: yes
    await page.locator('#w19').fill('Shared needles');
    await page.locator('#w21').fill('Counselled');
    await new SectionFormPage(page, FORM).save();
    await new SectionFormPage(page, FORM).expectSaved();

    const obs = await obsOf(api, section.encounter.uuid);
    // 4 answered radios + the remark (comment obs inside the CIEL:163288 group, whose display is the text)
    expect(obs.filter((o) => /: (Yes|No|Unknown)$/i.test(o.display)).length).toBe(4);
    expect(obs.some((o) => o.display.includes('Counselled'))).toBeTruthy();
    // commentFieldLabel/showCommentField on the Other question stores the text as the obs comment
    expect(obs.some((o) => o.comment === 'Shared needles')).toBeTruthy();

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#w2_1')).toBeChecked();
    await expect(page.locator('#w8_0')).toBeChecked();
    await expect(page.locator('#w14_2')).toBeChecked();
    await expect(page.locator('#w18_1')).toBeChecked();
    await expect(page.locator('#w21')).toHaveValue('Counselled');
  });

  // VIEW: answered questions show their answer, the other five show none, and no button row.
  test('VIEW: shows the answers, the specify text and the remark, and no buttons', async ({ page, api }) => {
    await page.locator('#w2_1').check(); // syphilis: yes
    await page.locator('#w8_0').check(); // multiple partners: no
    await page.locator('#w14_2').check(); // sex with a sex worker: unknown
    await page.locator('#w18_1').check(); // other risk factor: yes
    await page.locator('#w19').fill('Shared needles');
    await page.locator('#w21').fill('Counselled');
    await new SectionFormPage(page, FORM).save();
    await new SectionFormPage(page, FORM).expectSaved();

    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, VIEW_LABELS);
    const shown = await view.valueTexts();
    expect(shown).toContain('Counselled');
    expect(shown.filter((t) => t.startsWith('[X]')).sort()).toEqual(['[X] n', '[X] u', '[X] y', '[X] y']);
    expect(shown.some((t) => t.includes('Shared needles'))).toBeTruthy(); // the specify comment
    await expect(view.page.locator('#buttons, #submit, #next, #cancel')).toHaveCount(0);
  });
});
