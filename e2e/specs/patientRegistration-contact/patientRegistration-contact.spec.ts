import { type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test, expect, type SectionEncounter } from '../../core';
import { RegistrationSummaryPage, SectionFormPage, VisitPage, buttonsSubmit, openEditWithButtonsSubmit } from '../../pages';

// patientRegistration-contact.xml: the contact person of the patient (name, relationship, address, phone), one
// obs group "PATIENT CONTACTS CONSTRUCT". It is not a wizard fragment: the registration summary page shows it as
// the "most recent encounter" widget (editable; skipped in Liberia) and opens it for editing, so the specs
// create an empty Patient Registration encounter over REST (createSectionEncounter) and open the edit URL
// directly. That skips the summary-page widget gating. Run on a ZL server with the Haiti address hierarchy.
//
// Conditions in the form, from documentation inventory (patientRegistration-contact.inv.md):
//   ifMode VIEW include=false  :3, :39, :53, :87, :151   script, h2, edit fields, address widget, Save/Cancel (ENTER/EDIT only)
//   ifMode VIEW include=true   :70, :124                 read-only copies of the same obs (VIEW only: checked on the registration summary page, see below)
//   The ifMode pairs reuse ids (contactRelationship, contactAddress-*) but never render together: no duplicate ids.
// Required (HFE): name, relationship, country, department, commune, section communale, phone. Address1/address2 optional.
// Scripts (:6-35, :8-18 / :21-26 / :28 / :30-32): (1) registrationapp PersonAddressWithHierarchy on #contactAddress-container: each level is an
//   autocomplete over the address hierarchy (free text is cleared on blur), the "quick search" input (shortcutFor
//   address1) picks a locality and fills the levels above it; address2 is free text. (2) removes the generated
//   title span and hides every `.required` "*". (3) setUpPhoneNumberRegex (zl.js:128): on change of `.phoneRegex` the
//   first span of the wrapper (the hidden `span.required`) shows the "invalid phone number" message unless the value
//   matches ^\d{8}$, ^\d{4}[)-\s]?\s*\d{4}$ or ^\+?(\d ?){6,14}\d$. (4) beforeSubmit blocks Save while the phone does not match.
// Side effects on save: none (one obs group of 8 text obs). Encounter type Patient Registration.
// Visit-page display: the Patient Registration entry of encounterTypeConfig.js (:743) has no templateModelUrl, so the visit page shows no
//   VIEW of this form; `showOnVisitList: false` only keeps the type out of the visit list's type summary, the encounter itself is
//   shown with defaultEncounterLong: one `p.aligned` row for the contact group (label, the group's values).
//   The test asserts that row.
// Registration summary page: the "CONTACT PERSON" widget (coreapps-mostRecentRegistrationContact, every site but Liberia) renders this form
//   in VIEW (getAsHtml): name, relationship, the address levels and the phone each in span.value under their own ids (the VIEW ids,
//   :74 ff.), the unfilled address1 as span.emptyValue, no h2 or #buttons (ifMode VIEW include=false), and an edit pencil to this form.
//   The tests read it through RegistrationSummaryPage.
// Not covered here: the cancel button,
//   hierarchy contents (server data), the other two phone patterns' edge cases (zl.js:145-153, shared).
//
// Findings:
//   V1 Medium :30-32  beforeSubmit returns phoneNumberRegex(value), which is null for a blank phone (the field is required):
//                     Save does nothing (no request, no message) and the "Required" errors of the other blank fields never
//                     appear. Fix: `var v = getValue(...); return !v || phoneNumberRegex(v);` and let `required` report it.
//                     (TESTED below with test.fixme)
//   V2 Info (registrationapp, unverified) changing a higher level of the address leaves the lower levels' old values
//                     in the fields; nothing re-validates them against the new parent.
//   V3 Info :28       the invalid-phone message is hidden on change, which moves the Save button up: a click made right
//                     after correcting the phone (without leaving the field first) can be lost. Tests blur first.

const FORM = 'patientRegistration-contact.xml';
const PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID = '873f968a-73a8-4f9c-ac78-9f4778b751b6';

// The form has its own Save button (`#buttons button.submitButton`), not the standard `#submit`.
const openForm = (page: Page, section: SectionEncounter) => openEditWithButtonsSubmit(page, FORM, section);
const save = async (page: Page) => {
  await buttonsSubmit(page).click();
};
const expectSaved = async (page: Page) => {
  await new SectionFormPage(page, FORM).expectSaved();
  await page.waitForLoadState('load');
};
// Count of requests that reach the server's submit action (a client-side block sends none).
const countSubmits = (page: Page) => {
  const state = { n: 0 };
  page.on('request', (r) => {
    if (r.url().includes('enterHtmlForm/submit.action') || r.url().includes('editHtmlForm/submit.action')) {
      state.n++;
    }
  });
  return state;
};

const input = (page: Page, id: string) => page.locator(`#${id} input`);
const LEVELS = ['country', 'stateProvince', 'cityVillage', 'address3'] as const;

// Picks the first non-blank suggestion of an address-hierarchy autocomplete (clicking the empty field lists all).
const pickFirstSuggestion = async (page: Page, field: Locator, typed = '') => {
  await field.click();
  if (typed) {
    await field.pressSequentially(typed, { delay: 40 });
  }
  const first = page.locator('ul.ui-autocomplete li:visible').filter({ hasText: /\S/ }).first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(field).not.toHaveValue('');
};
const fillHierarchy = async (page: Page) => {
  for (const level of LEVELS) {
    await pickFirstSuggestion(page, input(page, `contactAddress-${level}`));
  }
};

interface ContactValues {
  name: string;
  relationship: string;
  address2: string;
  phone: string;
}
const fillContact = async (page: Page, v: ContactValues) => {
  await input(page, 'contactName').fill(v.name);
  await input(page, 'contactRelationship').fill(v.relationship);
  await fillHierarchy(page);
  await input(page, 'contactAddress-address2').fill(v.address2);
  await input(page, 'contactPhoneNumber').fill(v.phone);
};

// Local helper: text obs inside the contact group of the (synthetic) encounter, by concept name.
const contactGroups = async (api: APIRequestContext, encounterUuid: string) => {
  const res = await api.get(
    `encounter/${encounterUuid}?v=custom:(obs:(display,groupMembers:(concept:(display),value:(display))))`,
  );
  expect(res.ok()).toBeTruthy();
  const obs = (await res.json()).obs as Array<{
    display: string;
    groupMembers: Array<{ concept: { display: string }; value: unknown }> | null;
  }>;
  return {
    topLevelWithoutGroup: obs.filter((o) => !o.groupMembers || o.groupMembers.length === 0).length,
    groups: obs
      .filter((o) => o.groupMembers && o.groupMembers.length > 0)
      .map((o) => {
        const m: Record<string, string> = {};
        for (const g of o.groupMembers ?? []) {
          m[g.concept.display] = typeof g.value === 'string' ? g.value : String((g.value as { display?: string }).display);
        }
        return m;
      }),
  };
};

test.describe('patientRegistration-contact', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoContact', familyName: 'Tester', gender: 'F' },
    });
    await openForm(page, section);
  });

  test('renders the heading, the nine fields and Save/Cancel, with the "*" markers and the title span removed', async ({
    page,
  }) => {
    // when :3, :39, :53, :87, :151 (ENTER/EDIT)
    await expect(page.locator('h2')).toHaveCount(1);
    await expect(page.locator('input.address-hierarchy-shortcut')).toBeVisible();
    for (const id of ['contactName', 'contactRelationship', 'contactPhoneNumber']) {
      await expect(input(page, id)).toBeVisible();
    }
    for (const level of [...LEVELS, 'address1', 'address2']) {
      await expect(input(page, `contactAddress-${level}`)).toBeVisible();
    }
    await expect(page.locator('#buttons button.cancel')).toBeVisible();
    // script :21-26: first title span removed, `.required` stars hidden (the phone message reuses one, see below)
    await expect(page.locator('#contactPerson span.title')).toHaveCount(0);
    await expect(page.locator('#contactPerson span.required:visible')).toHaveCount(0);
  });

  test('Save with every field blank except a valid phone reports Required on the six required fields only', async ({
    page,
  }) => {
    await input(page, 'contactPhoneNumber').fill('12345678');
    await save(page);
    // server-side required check: name, relationship, country, department, commune, section communale
    for (const id of [
      'contactName',
      'contactRelationship',
      'contactAddress-country',
      'contactAddress-stateProvince',
      'contactAddress-cityVillage',
      'contactAddress-address3',
    ]) {
      await expect(page.locator(`#${id} span.field-error`)).toHaveText('Required');
    }
    await expect(page.locator('span.field-error:visible')).toHaveCount(6);
  });

  test.describe('phone number (script :28-32)', () => {
    const phoneMessage = (page: Page) => page.locator('#contactPhoneNumber span.required');

    for (const phone of ['12345678', '1234-5678', '1234 5678', '+509 12345678']) {
      test(`"${phone}" is accepted: no message`, async ({ page }) => {
        await input(page, 'contactPhoneNumber').fill(phone);
        await input(page, 'contactPhoneNumber').blur();
        await expect(phoneMessage(page)).toBeHidden();
      });
    }

    for (const phone of ['12ab', '1234']) {
      test(`"${phone}" shows the invalid-number message, and a valid value clears it`, async ({ page }) => {
        const phoneInput = input(page, 'contactPhoneNumber');
        await phoneInput.fill(phone);
        await phoneInput.blur();
        await expect(phoneMessage(page)).toBeVisible();
        await expect(phoneMessage(page)).toContainText(/\S/);
        await phoneInput.fill('12345678');
        await phoneInput.blur();
        await expect(phoneMessage(page)).toBeHidden();
      });
    }

    test('an invalid phone blocks Save client-side (no request); fixing it and saving again works', async ({
      page,
      api,
    }) => {
      const submits = countSubmits(page);
      await fillContact(page, { name: 'AutoBlocked Person', relationship: 'Sister', address2: 'Near', phone: '12ab' });
      await save(page);
      await page.waitForTimeout(1000); // nothing to wait for: the block sends no request
      expect(submits.n).toBe(0);
      await expect(page).toHaveURL(/editHtmlFormWithStandardUi/);
      await expect(phoneMessage(page)).toBeVisible();

      // blur first: the message disappearing moves the Save button, which swallows a click made straight after fill()
      await input(page, 'contactPhoneNumber').fill('1234-5678');
      await input(page, 'contactPhoneNumber').blur();
      await expect(phoneMessage(page)).toBeHidden();
      await save(page);
      await expectSaved(page);
      const { groups } = await contactGroups(api, section.encounter.uuid);
      expect(groups).toHaveLength(1);
    });

    // when :30-32 (V1). Intended: a blank required phone is reported like the other required fields.
    // Remove test.fixme() when fixed.
    test.fixme('V1 blank phone: Save shows a visible error on the phone field', async ({ page }) => {
      await fillContact(page, { name: 'AutoBlank Person', relationship: 'Sister', address2: 'Near', phone: '' });
      await save(page);
      await expect(page.locator('#contactPhoneNumber span:visible').filter({ hasText: /\S/ })).toBeVisible({
        timeout: 3000,
      });
    });
  });

  test.describe('address hierarchy (script :8-18)', () => {
    test('each level lists hierarchy entries and keeps the chosen one; address2 is free text', async ({ page }) => {
      await fillHierarchy(page);
      for (const level of LEVELS) {
        await expect(input(page, `contactAddress-${level}`)).not.toHaveValue('');
      }
      const address2 = input(page, 'contactAddress-address2');
      await address2.fill('Behind the church');
      await address2.blur();
      await expect(address2).toHaveValue('Behind the church');
    });

    test('free text that is not a hierarchy entry is cleared on blur', async ({ page }) => {
      await pickFirstSuggestion(page, input(page, 'contactAddress-country'));
      const state = input(page, 'contactAddress-stateProvince');
      await state.fill('Zzzzqq');
      await state.blur();
      await expect(state).toHaveValue('');
    });

    test('the quick-search input picks a locality and fills the levels above it', async ({ page }) => {
      const shortcut = page.locator('input.address-hierarchy-shortcut');
      await pickFirstSuggestion(page, shortcut, 'Sav');
      for (const level of [...LEVELS, 'address1']) {
        await expect(input(page, `contactAddress-${level}`)).not.toHaveValue('');
      }
    });
  });

  test('saves one contact group with the eight text obs, and EDIT starts from the saved values', async ({
    page,
    api,
  }) => {
    await fillContact(page, { name: 'AutoContact Person', relationship: 'Sister', address2: 'Behind the church', phone: '1234-5678' });
    const chosen = await Promise.all(LEVELS.map((l) => input(page, `contactAddress-${l}`).inputValue()));
    await save(page);
    await expectSaved(page);

    const { groups, topLevelWithoutGroup } = await contactGroups(api, section.encounter.uuid);
    expect(topLevelWithoutGroup).toBe(0);
    expect(groups).toHaveLength(1);
    const values = Object.values(groups[0]);
    for (const expected of ['AutoContact Person', 'Sister', 'Behind the church', '1234-5678', ...chosen]) {
      expect(values, `saved values contain "${expected}"`).toContain(expected);
    }
    expect(values).toHaveLength(8); // address1 left blank

    // when :3 (EDIT): the widgets are filled from the saved group
    await openForm(page, section);
    await expect(input(page, 'contactName')).toHaveValue('AutoContact Person');
    await expect(input(page, 'contactRelationship')).toHaveValue('Sister');
    await expect(input(page, 'contactPhoneNumber')).toHaveValue('1234-5678');
    for (let i = 0; i < LEVELS.length; i++) {
      await expect(input(page, `contactAddress-${LEVELS[i]}`)).toHaveValue(chosen[i]);
    }
    await expect(input(page, 'contactAddress-address2')).toHaveValue('Behind the church');

    // Visit page: the encounter's default long template lists the contact group as one row with its values
    const visit = await VisitPage.open(page, section.encounter.visitUuid);
    const long = await visit.expand(visit.encounterOfType(PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID));
    await expect(long.locator('p.aligned')).toHaveCount(1);
    for (const text of ['AutoContact Person', 'Sister', 'Behind the church', '1234-5678', ...chosen]) {
      await expect(long.locator('p.aligned')).toContainText(text);
    }

    // Registration summary page: the widget shows each saved value under its own id; address1 (not filled) is not shown as a value;
    // ENTER/EDIT-only parts are absent; the pencil leads to this form's edit page
    const summary = await RegistrationSummaryPage.open(page, section.patient.uuid);
    const shown = (id: string) => summary.value('contact', id);
    await expect(shown('contactFirstName')).toHaveText('AutoContact Person');
    await expect(shown('contactRelationship')).toHaveText('Sister');
    await expect(shown('contactPhoneNumber')).toHaveText('1234-5678');
    await expect(shown('contactAddress-address2')).toHaveText('Behind the church');
    for (let i = 0; i < LEVELS.length; i++) {
      await expect(shown(`contactAddress-${LEVELS[i]}`)).toHaveText(chosen[i]);
    }
    await expect(shown('contactAddress-address1')).toHaveCount(0);
    expect((await summary.rows('contact'))['Contact Address']).toContain('Behind the church');
    for (const gone of ['h2', 'input.address-hierarchy-shortcut', '#buttons', 'button.submitButton']) {
      await expect(summary.widget('contact').locator(gone), `${gone} is ENTER/EDIT only`).toHaveCount(0);
    }
    await summary.expectEditLink('contact');
  });

  test('EDIT: changing the relationship and re-saving replaces the group', async ({ page, api }) => {
    await fillContact(page, { name: 'AutoContact Person', relationship: 'Sister', address2: 'Near', phone: '12345678' });
    await save(page);
    await expectSaved(page);

    await openForm(page, section);
    await input(page, 'contactRelationship').fill('Brother');
    await save(page);
    await expectSaved(page);

    const { groups } = await contactGroups(api, section.encounter.uuid);
    expect(groups).toHaveLength(1);
    expect(Object.values(groups[0])).toContain('Brother');
    expect(Object.values(groups[0])).not.toContain('Sister');

    // Registration summary page: the second save's relationship and nothing of the replaced one
    const summary = await RegistrationSummaryPage.open(page, section.patient.uuid);
    await expect(summary.value('contact', 'contactRelationship')).toHaveText('Brother');
    expect(Object.values(await summary.rows('contact'))).not.toContain('Sister');
  });
});
