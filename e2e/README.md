# End-to-end tests

Playwright tests for the Haiti (ZL) HTML forms. The layout follows `pihmalawi-emr/e2e` (`core/`, `fixtures/`, `commands/`, `pages/`, `specs/`); some fixtures and commands are duplicated from `pihsl-emr/e2e` for now and can move to a shared package later.

## Running locally

Needs a running ZL OpenMRS server (the example uses `http://localhost:7071/openmrs`, config `haiti,haiti-central,haiti-local-idgen`) and Node.js 22+ (`nvm use`).

```bash
cd e2e
npm install
npx playwright install chromium
cp .env.example .env    # then edit: URL and admin credentials of your server; quote values containing spaces
npx playwright test
```

Use a server with **test data only**. The specs create their own synthetic patients (`Auto<Something> Tester`) and write to the server.

Every test also fails on an uncaught JavaScript error in its pages (the `failOnJsError` auto fixture in `core/test.ts`); `console.error` output is not counted. When a test fails, the `attachDiagnostics` auto fixture attaches the failed requests, the form submit and its response, the console errors and the API user's providers as `server-diagnostics` (visible in the HTML report and the trace, not with the `line` reporter).

The specs share one login session (created in `core/global-setup.ts`), so if the machine sleeps during a long run the session expires and every later test fails with `create patient: 401`. Keep the machine awake, e.g. `systemd-inhibit --what=sleep:idle npx playwright test`. Run a few specs at a time while iterating (`npx playwright test specs/<form>`).

### Cleanup and leftover patients

After each test the fixtures **void** everything the test created (`commands/cleanup.ts`): its encounters (with their obs and orders), visits and program enrollments, then the patient. Nothing is purged, so the login does not need the Purge privileges (Purge Obs, Encounters, Visits, Orders, Patients, Persons), and a saved order does not stop the cleanup. The registration specs create their patients through the UI and void them the same way (`cleanupPatient`).

The voided `Auto… Tester` patients stay in the database. They are test data and can be left, or removed with a name-filtered database cleanup.

## Forms tested

One spec per form, in `specs/<xml file name without .xml>/`. *Form name*, *Form version*, *Form uuid* and *Encounter uuid* are the `formName`, `formVersion`, `formUuid` and `formEncounterType` of the form's `<htmlform>` element; *Encounter* is the name of that encounter type. Keep a row here when you add, rename or remove a spec, and update it when the form's version or uuid changes. `specs/registration` tests the "Register a patient" wizard, not a form, so it has no row.

### Top-level (entry) forms

| XML file | Form name | Form version | Form uuid | Encounter | Encounter uuid |
|---|---|---|---|---|---|
| `checkin.xml` | Checkin | 4.0 | `660f4e34-b4c2-4666-bd9e-f7c07bac8190` | Inscription | `55a0d3ea-a4d7-4e88-8f01-5aceb2d3c61b` |
| `checkin_v3.5.xml` | Checkin | 3.5 | `2bbd0788-fc4f-4253-93fc-1f16033f8f78` | Inscription | `55a0d3ea-a4d7-4e88-8f01-5aceb2d3c61b` |
| `eid-followup.xml` | Exposed Infant Followup | 2.0 | `5a97a4d9-0a5f-46d4-86e2-756b1a4b32d8` | HIV-exposed Infant Followup | `0f070640-279e-4ec0-9e6c-6ef1f6567030` |
| `hiv-dispensing.xml` | HIV Dispensing | 2.0 | `259162b0-5dae-4bc8-9822-b40107a1d728` | HIV drug dispensing | `cc1720c9-3e4c-4fa8-a7ec-40eeaad1958c` |
| `hiv-drug-order-documentation.xml` | HIV Drug Order Documentation | 1.0 | `96482a6e-5b62-11eb-8f5a-0242ac110002` | Drug Order Documentation | `0b242b71-5b60-11eb-8f5a-0242ac110002` |
| `hiv-followup.xml` | HIV Followup | 5.0 | `c6227e74-06cd-4886-a2c7-2bebcb51b4eb` | HIV Followup | `c31d3312-40c4-11e7-a919-92ebcb67fe33` |
| `hiv-intake.xml` | HIV Intake | 5.0 | `37e3a6cb-23ae-4c52-95ca-926a1292a5b6` | HIV Intake | `c31d306a-40c4-11e7-a919-92ebcb67fe33` |
| `hiv-psychosocial.xml` | HIV Psychosocial Evaluation | 1.0 | `0fd6c419-379b-4927-ad31-b88a6590515e` | HIV Psychosocial evaluation | `83081f7d-ffd7-4d43-9571-a86e1bc19d7f` |
| `liveCheckin.xml` | LiveCheckin | 3.0 | `2b20903c-ceef-4b4c-9bfc-b1f9bea9d6b9` | Inscription | `55a0d3ea-a4d7-4e88-8f01-5aceb2d3c61b` |
| `outpatientConsult.xml` | Clinical Consult | 1.0 | `a3fc5c38-eb32-11e2-981f-96c0fcb18276` | Consultation | `92fd09b4-5335-4f7e-9f63-b2a663fd09a6` |
| `patientRegistration-contact.xml` | Patient Registration Contact Person | 1.0 | `9EE91561-42A0-4E1C-9469-ABA6726056BE` | Enregistrement de patient | `873f968a-73a8-4f9c-ac78-9f4778b751b6` |
| `patientRegistration-healthCenter.xml` | Patient Registration Health Center | 1.0 | `1E43C2A8-8634-4C16-B8D8-256B4782FB37` | Enregistrement de patient | `873f968a-73a8-4f9c-ac78-9f4778b751b6` |
| `patientRegistration-insurance.xml` | Patient Registration Insurance | 1.0 | `49FC8C8D-B06C-4E64-BC20-BBCF2A8F41A7` | Enregistrement de patient | `873f968a-73a8-4f9c-ac78-9f4778b751b6` |
| `patientRegistration-social.xml` | Patient Registration Social | 1.0 | `3C953068-B460-4B1A-8889-0AAD43447CD7` | Enregistrement de patient | `873f968a-73a8-4f9c-ac78-9f4778b751b6` |
| `pmtct-followup.xml` | PMTCT Followup | 2.0 | `6ffdfb9f-5040-415c-b716-1cea2f8507df` | PMTCT Followup | `95e03e7d-9aeb-4a99-bd7a-94e8591ec2c5` |
| `pmtct-intake.xml` | PMTCT Intake | 2.0 | `71ad3a72-fafc-4ecf-9613-d6522e5dc7aa` | PMTCT Intake | `584124b9-1f10-4757-ba09-91fc9075af92` |
| `prep-followup.xml` | Pre-Exposure Prophylaxis (PrEP) Followup | 1.0 | `cf636130-4d15-4ada-88aa-a2fa9d314d42` | PrEP Followup | `4fe5fc03-b42b-4bb2-8ed8-e3c7de8942fb` |
| `prep-intake.xml` | Pre-Exposure Prophylaxis (PrEP) Intake | 1.0 | `b4561256-ca1d-4377-89d4-f133341749bb` | PrEP Intake | `2fb72359-f6fe-4b37-bb11-9b4cb5fd6ca7` |
| `vct.xml` | HIV Counseling and Testing (CT) | 1.0 | `616b6b36-f189-11e7-8c3f-9a214cf093ae` | Voluntary counselling and testing | `616b66fe-f189-11e7-8c3f-9a214cf093ae` |
| `vitals.xml` | Vitals | 3.0 | `f4a9609a-43d5-44e2-aa0f-0016e3d39b65` | Signes vitaux | `4fb47712-34a6-40d2-8ed3-e153abbd25b7` |
| `vitalsInpatient.xml` | Vitals (inpatient) | 2.2 | `6c7ecb99-ff00-4cac-bebe-164a50fedfc0` | Signes vitaux | `4fb47712-34a6-40d2-8ed3-e153abbd25b7` |
| `vitalsPregnant.xml` | Vitals (pregnant) | 2.2 | `79c63955-56bc-4cb2-9853-3cbd42b4d7ee` | Signes vitaux | `4fb47712-34a6-40d2-8ed3-e153abbd25b7` |
| `vitals_v2.2.xml` | Vitals | 2.2 | `68728aa6-4985-11e2-8815-657001b58a90` | Signes vitaux | `4fb47712-34a6-40d2-8ed3-e153abbd25b7` |

### Section forms

A `section-*` form has no `formEncounterType`: its *Encounter* column lists the encounter types the spec creates for it (`<br>` separates several, in the same order in both columns).

| XML file | Form name | Form version | Form uuid | Encounter | Encounter uuid |
|---|---|---|---|---|---|
| `section-dx.xml` | Diagnostic | 1.0 | `3498f204-a6fa-4df0-b7fd-a94eb03a43c9` | HIV Followup<br>MCH Delivery | `c31d3312-40c4-11e7-a919-92ebcb67fe33`<br>`00e5ebb2-90ec-11e8-9eb6-529269fb1459` |
| `section-eid-plan.xml` | EID Plan | 2.0 | `d65c4322-1027-4be9-9951-cf20460723f1` | HIV-exposed Infant Followup | `0f070640-279e-4ec0-9e6c-6ef1f6567030` |
| `section-eid-protection.xml` | Exposed infant protection | 1.0 | `6c256298-6f27-4fb4-85d0-620be70e2f6d` | HIV-exposed Infant Followup | `0f070640-279e-4ec0-9e6c-6ef1f6567030` |
| `section-hiv-assessment.xml` | Assessment | 4.0 | `d6ab46c0-e61d-11e9-81b4-2a2ae2dbcce4` | HIV Followup<br>HIV Intake<br>PMTCT Intake | `c31d3312-40c4-11e7-a919-92ebcb67fe33`<br>`c31d306a-40c4-11e7-a919-92ebcb67fe33`<br>`584124b9-1f10-4757-ba09-91fc9075af92` |
| `section-hiv-history.xml` | HIV History | 4.0 | `e8806b32-e546-11e9-81b4-2a2ae2dbcce4` | HIV Intake | `c31d306a-40c4-11e7-a919-92ebcb67fe33` |
| `section-hiv-plan.xml` | HIV Plan | 5.0 | `8d777188-a347-4c53-b6df-6f1e9a34d3fc` | HIV Followup<br>HIV Intake<br>PMTCT Followup<br>PMTCT Intake | `c31d3312-40c4-11e7-a919-92ebcb67fe33`<br>`c31d306a-40c4-11e7-a919-92ebcb67fe33`<br>`95e03e7d-9aeb-4a99-bd7a-94e8591ec2c5`<br>`584124b9-1f10-4757-ba09-91fc9075af92` |
| `section-hiv-state.xml` | HIV Clinical State | 4.0 | `3959f956-b83a-11e7-abc4-cec278b6b50a` | HIV Followup<br>PMTCT Followup | `c31d3312-40c4-11e7-a919-92ebcb67fe33`<br>`95e03e7d-9aeb-4a99-bd7a-94e8591ec2c5` |
| `section-pmtct-history.xml` | PMTCT History | 1.0 | `db041f90-938b-44b2-ae70-2ef0da6c693e` | PMTCT Intake | `584124b9-1f10-4757-ba09-91fc9075af92` |
| `section-risk-factors.xml` | HIVRiskFactors | 1.0 | `3a0a01b6-4184-11e7-a919-92ebcb67fe33` | HIV Intake | `c31d306a-40c4-11e7-a919-92ebcb67fe33` |
| `section-symptoms.xml` | HIV Symptoms | 1.0 | `889327c0-4ad7-11e7-a919-92ebcb67fe33` | HIV Intake | `c31d306a-40c4-11e7-a919-92ebcb67fe33` |

## Section specs

`specs/section-<x>/` tests `htmlforms/section-<x>.xml` and `htmlforms/hiv/section-<x>.xml`. A section is a standalone form that edits an existing encounter (on the visit page it opens from the section's edit pencil). Each spec:

1. creates a patient, a visit and an empty encounter of the section's parent encounter type over REST (`createSectionEncounter`),
2. opens `editHtmlFormWithStandardUi.page?...definitionUiResource=file:configuration/pih/htmlforms/<path>` directly (`SectionFormPage`), so the visit-page gating documented in `htmlforms/documentation/_availability.e2e.md` is not exercised,
3. asserts the form's conditions and scripts, and the obs saved on the encounter.

## Top-level (entry form) specs

`specs/<form>/` for a top-level form (`vitals`, `checkin`, `hiv-intake`, ...) tests a form that **creates** the encounter. The spec creates a patient with an active visit and no encounter (`createEntryContext`), opens `enterHtmlFormWithStandardUi.page?...definitionUiResource=file:configuration/pih/htmlforms/<path>` (`EntryFormPage`), and reads the new encounter back with `getPatientEncounters` / `getEncounterObs`. Notes:

- The five HIV wrappers (`hiv-intake`, `hiv-followup`, `eid-followup`, `pmtct-intake`, `pmtct-followup`) auto-submit in ENTER when the encounter location has a value, so their specs only check the saved encounter and EDIT.
- Many forms use the HFE `<submit>` tag, which renders `input.submitButton` inside `#buttons`, not `#submit`.
- `vitalsInpatient` and `vitalsPregnant` are not launched by anything; their unit converters only run in the Simple UI (`enterHtmlFormWithSimpleUi.page`), which the behaviour tests use.
- The HIV forms are not offered on the `haiti-central` config at all (only `haiti-hiv`); the specs open them by direct URL.

## Registration specs

- `specs/registration` drives the "Register a patient" wizard (`pages/registration-page.ts`) and has two register tests that create patients through the UI (`AutoReg<letters> Tester`). It needs `allowManualEntryOfPrimaryIdentifier` (true in `pih-config-haiti.json`) and stubs `printIdCard.page` (it prints on load and saves an obs).
- `specs/patientRegistration-{contact,healthCenter,insurance,social}` are the editable summary-page forms. They have their own Save button (`#buttons button.submitButton`, no `#submit`): use `openEditWithButtonsSubmit` / `buttonsSubmit` from `pages`.
- `specs/checkin_v3.5` and `specs/vitals_v2.2` cover the versioned copies: `checkin_v3.5` is what the check-in app opens at CEN; `vitals_v2.2` is legacy (reached only when editing encounters saved with it). Both are opened by direct URL in the Simple UI.

### Known form bugs

Tests for behaviour that is currently broken assert the **intended** behaviour and are marked `test.fixme()` with the finding id (e.g. `section-hiv-state` V1). They are skipped, so a run stays green and fast; remove the marker when the form is fixed and the test should pass. Temporarily change `test.fixme()` to `test.fail()` to check whether a bug is still there (it fails the run once the bug is fixed). The findings, scripts and side effects of each form are documented in the header comment of its spec; the skill for writing specs is `htmlforms/documentation/hfe-e2e-specs.skill.md`.
