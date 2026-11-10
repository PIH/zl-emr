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

### Target servers (zl-ci and hiv-ci)

The suite runs against **one server at a time**, and ZL has two that together offer the most forms (see `documentation/_availability.e2e.md`, "Which instance offers what"):

| Target | Server and config stack | Run | What runs |
|---|---|---|---|
| primary (default) | zl-ci, `haiti,haiti-central,haiti-local-idgen`; settings `E2E_BASE_URL`, `E2E_USER_ADMIN_USERNAME`, ... | `npx playwright test` | every spec **not** tagged `@hiv-ci` |
| `hiv-ci` | HIV profile, `haiti,haiti-hiv,haiti-hiv-ci`; settings `E2E_HIV_CI_BASE_URL`, `E2E_HIV_CI_USER_ADMIN_USERNAME`, `E2E_HIV_CI_USER_ADMIN_PASSWORD`, `E2E_HIV_CI_DEFAULT_PROVIDER_NAME`, `E2E_HIV_CI_SESSION_LOCATION_UUID` | `E2E_TARGET=hiv-ci npx playwright test` | **only** the specs tagged `@hiv-ci` |

A setting a target leaves out falls back to the primary's (except the base URL, which must be set); see `.env.example` and `core/target.ts`. The hiv-ci run logs in once into `storageState.hiv-ci.json` (the primary one uses `storageState.json`). A spec is tagged by putting `@hiv-ci` in its top-level `test.describe` title (`test.describe('hiv-intake @hiv-ci', ...)`, `playwright.config.ts` selects by that tag): it is for forms only the HIV profile offers (HIV, PMTCT, EID and PrEP forms and their sections, `dispensing.xml`, `comment.xml`). Forms offered by both (vct, drugOrder, labResults, socio-econ, vitals, registration sections) are not tagged and run on the primary server; they are not re-run on hiv-ci (the tag selection in `playwright.config.ts` applies to the command line too: a run with `E2E_TARGET=hiv-ci` runs only `@hiv-ci` tests). Checked 2026-11-09: `npx playwright test --list` lists 526 tests in 54 files and none of them is `@hiv-ci`; `E2E_TARGET=hiv-ci npx playwright test --list` lists 229 tests in 19 files, all `@hiv-ci`.

**Session location.** The harness logs in with a session location (`SESSION_LOCATION_UUID`, `core/constants.ts`): Klinik Ekstèn on zl-ci. On the hiv-ci server Klinik Ekstèn carries no tags, so set `E2E_HIV_CI_SESSION_LOCATION_UUID` to a Login Location that has the HIV Consult, Dispensing and Consult Note tags (Mirebalais, `a084f714-a536-473b-94e6-ec317b152b43`, on the local server). Check with `GET /ws/rest/v1/location?tag=HIV%20Consult%20Location` (the uuid must be in the result). `E2E_HIV_CI_DEFAULT_PROVIDER_NAME` need not exist on the server: a form that does not list it gets its first provider.

### Cleanup and leftover patients

After each test the fixtures **void** everything the test created (`commands/cleanup.ts`): its encounters (with their obs and orders), visits and program enrollments, then the patient. Nothing is purged, so the login does not need the Purge privileges (Purge Obs, Encounters, Visits, Orders, Patients, Persons), and a saved order does not stop the cleanup. The registration specs create their patients through the UI and void them the same way (`cleanupPatient`).

The voided `Auto… Tester` patients stay in the database. They are test data and can be left, or removed with a name-filtered database cleanup.

## Forms tested

One spec per form, in `specs/<xml file name without .xml>/`. *Form name*, *Form version*, *Form uuid* and *Encounter uuid* are the `formName`, `formVersion`, `formUuid` and `formEncounterType` of the form's `<htmlform>` element; *Encounter* is the name of that encounter type. Keep a row here when you add, rename or remove a spec, and update it when the form's version or uuid changes. `specs/registration` tests the "Register a patient" wizard, not a form, so it has no row.

### Top-level (entry) forms

| XML file | Form name | Form version | Form uuid | Encounter | Encounter uuid |
|---|---|---|---|---|---|
| `admissionNote.xml` | Admission | 2.0 | `43acf930-eb1b-11e2-91e2-0800200c9a66` | Admission | `260566e1-c909-4d61-a96f-c1019291a09d` |
| `cancelAdmission.xml` | Cancel Admission | 1.0 | `912c7800-df82-11e3-8b68-0800200c9a66` | Cancel Admission | `edbb857b-e736-4296-9438-462b31f97ef9` |
| `checkin.xml` | Checkin | 4.0 | `660f4e34-b4c2-4666-bd9e-f7c07bac8190` | Inscription | `55a0d3ea-a4d7-4e88-8f01-5aceb2d3c61b` |
| `checkin_v3.5.xml` | Checkin | 3.5 | `2bbd0788-fc4f-4253-93fc-1f16033f8f78` | Inscription | `55a0d3ea-a4d7-4e88-8f01-5aceb2d3c61b` |
| `chemotherapyTreatment.xml` | Oncology Chemotherapy Treatment Session | 1.0 | `2fce4b79-a0c8-41ac-81d7-3bbfd85988fd` | Chemotheraphy treatment session | `828964fa-17eb-446e-aba4-e940b0f4be5b` |
| `comment.xml` | Comment | 1.0 | `9f1e1614-6b7f-423d-a28a-f174042524e2` | Comment | `c30d6e06-0f00-460a-8f81-3c39a1853b56` |
| `covid19Discharge.xml` | COVID19 Discharge | 1.0 | `9d05907a-2678-46c8-a447-1517b1cb6cac` | COVID-19 Discharge | `5e82bea0-fd7b-47f9-858a-91be87521073` |
| `covid19Followup.xml` | COVID19 Progress Note | 1.0 | `2bf00b0c-c411-4738-898d-9fac03a60099` | COVID-19 Progress | `ca65f5d3-6312-4143-ae4e-0237427f339e` |
| `covid19Intake.xml` | COVID19 Admission | 1.0 | `82be8c44-cc17-4704-ae10-1179ae9702db` | COVID-19 Admission | `8d50b938-dcf9-4b8e-9938-e625bd2f0a81` |
| `delivery.xml` | MCH Delivery | 3.0 | `c4fb83cf-e026-487b-8189-2120c988e625` | MCH Delivery | `00e5ebb2-90ec-11e8-9eb6-529269fb1459` |
| `dispensing.xml` | Dispensing | 1.0 | `ba22eda5-148d-456e-8adc-f36247d1f7c3` | Médicaments administrés (Medication Dispensed) | `8ff50dea-18a1-4609-b4c9-3f8f2d611b84` |
| `drugOrder.xml` | Order Medication | 1.0 | `d2adf684-34f7-42fc-a979-43178bca8e72` | Drug Order | `e0b41238-905a-497b-a2b6-885994701b99` |
| `echocardiogram.xml` | Echocardiogram | 1.0 | `fdee5220-78ba-11e9-8f9e-2a86e4085a59` | Echocardiogram | `fdee591e-78ba-11e9-8f9e-2a86e4085a59` |
| `edNote.xml` | ED Note | 1.0 | `793915d6-f8d9-11e2-8ff2-fd54ab5fdb2a` | Consultation | `92fd09b4-5335-4f7e-9f63-b2a663fd09a6` |
| `eid-followup.xml` | Exposed Infant Followup | 2.0 | `5a97a4d9-0a5f-46d4-86e2-756b1a4b32d8` | HIV-exposed Infant Followup | `0f070640-279e-4ec0-9e6c-6ef1f6567030` |
| `hiv-dispensing.xml` | HIV Dispensing | 2.0 | `259162b0-5dae-4bc8-9822-b40107a1d728` | HIV drug dispensing | `cc1720c9-3e4c-4fa8-a7ec-40eeaad1958c` |
| `hiv-drug-order-documentation.xml` | HIV Drug Order Documentation | 1.0 | `96482a6e-5b62-11eb-8f5a-0242ac110002` | Drug Order Documentation | `0b242b71-5b60-11eb-8f5a-0242ac110002` |
| `hiv-followup.xml` | HIV Followup | 5.0 | `c6227e74-06cd-4886-a2c7-2bebcb51b4eb` | HIV Followup | `c31d3312-40c4-11e7-a919-92ebcb67fe33` |
| `hiv-intake.xml` | HIV Intake | 5.0 | `37e3a6cb-23ae-4c52-95ca-926a1292a5b6` | HIV Intake | `c31d306a-40c4-11e7-a919-92ebcb67fe33` |
| `hiv-psychosocial.xml` | HIV Psychosocial Evaluation | 1.0 | `0fd6c419-379b-4927-ad31-b88a6590515e` | HIV Psychosocial evaluation | `83081f7d-ffd7-4d43-9571-a86e1bc19d7f` |
| `labResults.xml` | Lab results | 2.1 | `b437d585-132f-4e71-a812-70471b7474c7` | Laboratory Results | `4d77916a-0620-11e5-a6c0-1697f925ec7b` |
| `liveCheckin.xml` | LiveCheckin | 3.0 | `2b20903c-ceef-4b4c-9bfc-b1f9bea9d6b9` | Inscription | `55a0d3ea-a4d7-4e88-8f01-5aceb2d3c61b` |
| `mentalHealth.xml` | Mental Health Assessment V2 | 2.0 | `cb4fca1f-ae90-4e0a-a75d-13a8859feb66` | Mental Health Consult | `a8584ab8-cc2a-11e5-9956-625662870761` |
| `ncd-followup.xml` | NCD Followup | 2.0 | `1eb303ab-99ea-4022-bdda-1a89a339c737` | NCD Followup Consult | `5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c` |
| `ncd-initial.xml` | NCD Initial | 2.0 | `ed673783-ec75-49de-a19f-3976d031aec0` | NCD Initial Consult | `ae06d311-1866-455b-8a64-126a9bd74171` |
| `obGyn.xml` | ObGyn consult | 2.0 | `ef29d697-97d3-11f0-aa57-82198ff46031` | OB/GYN | `d83e98fd-dc7b-420f-aa3f-36f648b4483d` |
| `oncologyIntakeConsult.xml` | Oncology initial consult | 3.0 | `251a6a9f-f797-4573-b2da-04bbbe56a7b7` | Oncology Initial Consult | `a936ae01-6d10-455d-befc-b2d1828dad04` |
| `oncologyTreatment.xml` | Oncology Treatment Plan | 1.0 | `f55d57d3-aecb-4825-b45e-4220ceadf93f` | Oncology Treatment Plan | `f9cfdf8b-d086-4658-9b9d-45a62896da03` |
| `outpatientConsult.xml` | Clinical Consult | 1.0 | `a3fc5c38-eb32-11e2-981f-96c0fcb18276` | Consultation | `92fd09b4-5335-4f7e-9f63-b2a663fd09a6` |
| `patientRegistration-contact.xml` | Patient Registration Contact Person | 1.0 | `9EE91561-42A0-4E1C-9469-ABA6726056BE` | Enregistrement de patient | `873f968a-73a8-4f9c-ac78-9f4778b751b6` |
| `patientRegistration-healthCenter.xml` | Patient Registration Health Center | 1.0 | `1E43C2A8-8634-4C16-B8D8-256B4782FB37` | Enregistrement de patient | `873f968a-73a8-4f9c-ac78-9f4778b751b6` |
| `patientRegistration-insurance.xml` | Patient Registration Insurance | 1.0 | `49FC8C8D-B06C-4E64-BC20-BBCF2A8F41A7` | Enregistrement de patient | `873f968a-73a8-4f9c-ac78-9f4778b751b6` |
| `patientRegistration-rs.xml` | Patient Registration | 1.0 | `6F6E6FA0-1E99-41A3-9391-E5CB8A127C11` | Enregistrement de patient | `873f968a-73a8-4f9c-ac78-9f4778b751b6` |
| `patientRegistration-social.xml` | Patient Registration Social | 1.0 | `3C953068-B460-4B1A-8889-0AAD43447CD7` | Enregistrement de patient | `873f968a-73a8-4f9c-ac78-9f4778b751b6` |
| `pmtct-followup.xml` | PMTCT Followup | 2.0 | `6ffdfb9f-5040-415c-b716-1cea2f8507df` | PMTCT Followup | `95e03e7d-9aeb-4a99-bd7a-94e8591ec2c5` |
| `pmtct-intake.xml` | PMTCT Intake | 2.0 | `71ad3a72-fafc-4ecf-9613-d6522e5dc7aa` | PMTCT Intake | `584124b9-1f10-4757-ba09-91fc9075af92` |
| `prep-followup.xml` | Pre-Exposure Prophylaxis (PrEP) Followup | 1.0 | `cf636130-4d15-4ada-88aa-a2fa9d314d42` | PrEP Followup | `4fe5fc03-b42b-4bb2-8ed8-e3c7de8942fb` |
| `prep-intake.xml` | Pre-Exposure Prophylaxis (PrEP) Intake | 1.0 | `b4561256-ca1d-4377-89d4-f133341749bb` | PrEP Intake | `2fb72359-f6fe-4b37-bb11-9b4cb5fd6ca7` |
| `primary-care-adult-followup.xml` | Outpatient Followup (Adult) | 2.0 | `25cc7418-4dde-4b28-a3e9-fedb87243bcb` | Primary Care Adult Followup Consult | `27d3a181-031b-11e6-a837-0800200c9a66` |
| `primary-care-adult-initial.xml` | Outpatient Intake (Adult) | 2.0 | `d1ae1222-014e-496f-899a-d749e1adbe59` | Primary Care Adult Initial Consult | `27d3a180-031b-11e6-a837-0800200c9a66` |
| `primary-care-peds-followup.xml` | Outpatient Followup (Peds) | 2.0 | `dbc8b72d-89a0-4650-807a-e5170c995700` | Primary Care Pediatric Followup Consult | `229e5160-031b-11e6-a837-0800200c9a66` |
| `primary-care-peds-initial.xml` | Outpatient Intake (Peds) | 2.0 | `ec186d0f-0429-4ab3-9f52-547faa3a8eea` | Primary Care Pediatric Initial Consult | `5b812660-0262-11e6-a837-0800200c9a66` |
| `socio-econ.xml` | Socioeconomics Note | 1.0 | `de845312-11e1-11e8-b642-0ed5f89f718b` | Socio-economics | `de844e58-11e1-11e8-b642-0ed5f89f718b` |
| `surgicalPostOpNote.xml` | Brief post-operative note | 2.0 | `d29a49b1-957b-4bcb-b192-07484de4165b` | Surgery Note | `c4941dee-7a9b-4c1c-aa6f-8193e9e5e4e5` |
| `vaccination-only.xml` | Vaccination | 1.0 | `1e2a4e26-7c9f-11e9-8f9e-2a86e4085a59` | Vaccination | `1e2a509c-7c9f-11e9-8f9e-2a86e4085a59` |
| `vct.xml` | HIV Counseling and Testing (CT) | 1.0 | `616b6b36-f189-11e7-8c3f-9a214cf093ae` | Voluntary counselling and testing | `616b66fe-f189-11e7-8c3f-9a214cf093ae` |
| `vitals.xml` | Vitals | 3.0 | `f4a9609a-43d5-44e2-aa0f-0016e3d39b65` | Signes vitaux | `4fb47712-34a6-40d2-8ed3-e153abbd25b7` |
| `vitalsInpatient.xml` | Vitals (inpatient) | 2.2 | `6c7ecb99-ff00-4cac-bebe-164a50fedfc0` | Signes vitaux | `4fb47712-34a6-40d2-8ed3-e153abbd25b7` |
| `vitalsPregnant.xml` | Vitals (pregnant) | 2.2 | `79c63955-56bc-4cb2-9853-3cbd42b4d7ee` | Signes vitaux | `4fb47712-34a6-40d2-8ed3-e153abbd25b7` |
| `vitals_v2.2.xml` | Vitals | 2.2 | `68728aa6-4985-11e2-8815-657001b58a90` | Signes vitaux | `4fb47712-34a6-40d2-8ed3-e153abbd25b7` |

### Section forms

A `section-*` form has no `formEncounterType`: its *Encounter* column lists the encounter types the spec creates for it (`<br>` separates several, in the same order in both columns).

| XML file | Form name | Form version | Form uuid | Encounter | Encounter uuid |
|---|---|---|---|---|---|
| `section-c-section.xml` | C-section | 1.0 | `7e7f7dfb-92b8-45a9-841e-304474e0fcfe` | MCH Delivery | `00e5ebb2-90ec-11e8-9eb6-529269fb1459` |
| `section-chief-complaint.xml` | Chief Complaint | 1.0 | `71ee5c0c-d8ae-4777-af9f-bb57f563503a` | Primary Care Adult Followup Consult<br>Primary Care Pediatric Followup Consult | `27d3a181-031b-11e6-a837-0800200c9a66`<br>`229e5160-031b-11e6-a837-0800200c9a66` |
| `section-comments.xml` | Comments | 1.0 | `12d6922a-1dea-452d-ae2c-bb09366de400` | Prenatal Home Assessment<br>Pediatric Home Assessment<br>Maternal Post-partum Home Assessment<br>Maternal Follow-up Home Assessment | `91DDF969-A2D4-4603-B979-F2D6F777F4AF`<br>`0CF4717A-479F-4349-AE6F-8602E2AA41D3`<br>`0E7160DF-2DD1-4728-B951-641BBE4136B8`<br>`690670E2-A0CC-452B-854D-B95E2EAB75C9` |
| `section-delivery.xml` | MCH Delivery section | 3.0 | `ba7d705c-f818-44ea-8488-237d43d23d4f` | MCH Delivery<br>OB/GYN | `00e5ebb2-90ec-11e8-9eb6-529269fb1459`<br>`d83e98fd-dc7b-420f-aa3f-36f648b4483d` |
| `section-dx-obgyn.xml` | Diagnostic with obgyn | 1.0 | `2065460f-adeb-4895-837c-1fa516b6c280` | OB/GYN | `d83e98fd-dc7b-420f-aa3f-36f648b4483d` |
| `section-dx.xml` | Diagnostic | 1.0 | `3498f204-a6fa-4df0-b7fd-a94eb03a43c9` | HIV Followup<br>MCH Delivery | `c31d3312-40c4-11e7-a919-92ebcb67fe33`<br>`00e5ebb2-90ec-11e8-9eb6-529269fb1459` |
| `section-education-subjects.xml` | Education Subjects | 1.0 | `fdf32eae-f020-4075-993d-971b5633aa6d` | Prenatal Home Assessment | `91DDF969-A2D4-4603-B979-F2D6F777F4AF` |
| `section-eid-plan.xml` | EID Plan | 2.0 | `d65c4322-1027-4be9-9951-cf20460723f1` | HIV-exposed Infant Followup | `0f070640-279e-4ec0-9e6c-6ef1f6567030` |
| `section-eid-protection.xml` | Exposed infant protection | 1.0 | `6c256298-6f27-4fb4-85d0-620be70e2f6d` | HIV-exposed Infant Followup | `0f070640-279e-4ec0-9e6c-6ef1f6567030` |
| `section-exam.xml` | Examen physique | 1.0 | `b34b71f4-03f1-11e5-8418-1697f925ec7b` | Primary Care Adult Initial Consult<br>Primary Care Adult Followup Consult<br>Primary Care Pediatric Initial Consult<br>Primary Care Pediatric Followup Consult<br>NCD Initial Consult<br>NCD Followup Consult<br>HIV Intake<br>HIV Followup<br>HIV-exposed Infant Followup<br>Oncology Initial Consult<br>OB/GYN<br>PMTCT Intake<br>PMTCT Followup | `27d3a180-031b-11e6-a837-0800200c9a66`<br>`27d3a181-031b-11e6-a837-0800200c9a66`<br>`5b812660-0262-11e6-a837-0800200c9a66`<br>`229e5160-031b-11e6-a837-0800200c9a66`<br>`ae06d311-1866-455b-8a64-126a9bd74171`<br>`5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c`<br>`c31d306a-40c4-11e7-a919-92ebcb67fe33`<br>`c31d3312-40c4-11e7-a919-92ebcb67fe33`<br>`0f070640-279e-4ec0-9e6c-6ef1f6567030`<br>`a936ae01-6d10-455d-befc-b2d1828dad04`<br>`d83e98fd-dc7b-420f-aa3f-36f648b4483d`<br>`584124b9-1f10-4757-ba09-91fc9075af92`<br>`95e03e7d-9aeb-4a99-bd7a-94e8591ec2c5` |
| `section-family-planning-simple.xml` | Maternal Family planning | 1.0 | `3e9c3181-884d-43a4-a5c7-920bc5dd5d59` | Maternal Post-partum Home Assessment<br>Maternal Follow-up Home Assessment | `0E7160DF-2DD1-4728-B951-641BBE4136B8`<br>`690670E2-A0CC-452B-854D-B95E2EAB75C9` |
| `section-history.xml` | History | 1.0 | `162091b1-0060-4e56-8c17-7015aeddf608` | Primary Care Adult Initial Consult<br>Primary Care Adult Followup Consult<br>Primary Care Pediatric Initial Consult<br>NCD Initial Consult | `27d3a180-031b-11e6-a837-0800200c9a66`<br>`27d3a181-031b-11e6-a837-0800200c9a66`<br>`5b812660-0262-11e6-a837-0800200c9a66`<br>`ae06d311-1866-455b-8a64-126a9bd74171` |
| `section-hiv-assessment.xml` | Assessment | 4.0 | `d6ab46c0-e61d-11e9-81b4-2a2ae2dbcce4` | HIV Followup<br>HIV Intake<br>PMTCT Intake | `c31d3312-40c4-11e7-a919-92ebcb67fe33`<br>`c31d306a-40c4-11e7-a919-92ebcb67fe33`<br>`584124b9-1f10-4757-ba09-91fc9075af92` |
| `section-hiv-history.xml` | HIV History | 4.0 | `e8806b32-e546-11e9-81b4-2a2ae2dbcce4` | HIV Intake | `c31d306a-40c4-11e7-a919-92ebcb67fe33` |
| `section-hiv-plan.xml` | HIV Plan | 5.0 | `8d777188-a347-4c53-b6df-6f1e9a34d3fc` | HIV Followup<br>HIV Intake<br>PMTCT Followup<br>PMTCT Intake | `c31d3312-40c4-11e7-a919-92ebcb67fe33`<br>`c31d306a-40c4-11e7-a919-92ebcb67fe33`<br>`95e03e7d-9aeb-4a99-bd7a-94e8591ec2c5`<br>`584124b9-1f10-4757-ba09-91fc9075af92` |
| `section-hiv-state.xml` | HIV Clinical State | 4.0 | `3959f956-b83a-11e7-abc4-cec278b6b50a` | HIV Followup<br>PMTCT Followup | `c31d3312-40c4-11e7-a919-92ebcb67fe33`<br>`95e03e7d-9aeb-4a99-bd7a-94e8591ec2c5` |
| `section-maternal-danger-signs.xml` | Maternal Danger Signs | 1.0 | `7a2002bf-eeb2-4d71-b951-7e0b5a80f931` | Prenatal Home Assessment<br>Maternal Post-partum Home Assessment<br>Pediatric Home Assessment | `91DDF969-A2D4-4603-B979-F2D6F777F4AF`<br>`0E7160DF-2DD1-4728-B951-641BBE4136B8`<br>`0CF4717A-479F-4349-AE6F-8602E2AA41D3` |
| `section-maternal-vital-signs.xml` | Maternal Vital Signs | 1.0 | `8dba188c-d170-4755-9895-4c8324f67e33` | Prenatal Home Assessment<br>Pediatric Home Assessment<br>Maternal Post-partum Home Assessment<br>Maternal Follow-up Home Assessment | `91DDF969-A2D4-4603-B979-F2D6F777F4AF`<br>`0CF4717A-479F-4349-AE6F-8602E2AA41D3`<br>`0E7160DF-2DD1-4728-B951-641BBE4136B8`<br>`690670E2-A0CC-452B-854D-B95E2EAB75C9` |
| `section-mch-referral.xml` | Referrals | 1.0 | `544d566e-a4c6-4f18-b5a7-5cea32d09301` | Prenatal Home Assessment<br>Pediatric Home Assessment<br>Maternal Post-partum Home Assessment<br>Maternal Follow-up Home Assessment | `91DDF969-A2D4-4603-B979-F2D6F777F4AF`<br>`0CF4717A-479F-4349-AE6F-8602E2AA41D3`<br>`0E7160DF-2DD1-4728-B951-641BBE4136B8`<br>`690670E2-A0CC-452B-854D-B95E2EAB75C9` |
| `section-ncd.xml` | NCD | 2.0 | `47de1db8-bebc-4861-82bc-e4f0ee8c04aa` | NCD Initial Consult<br>NCD Followup Consult | `ae06d311-1866-455b-8a64-126a9bd74171`<br>`5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c` |
| `section-obgyn-initial.xml` | OB/GYN Overview | 1.0 | `fd19a3d0-4aa4-415c-a25a-dc1159098796` | OB/GYN | `d83e98fd-dc7b-420f-aa3f-36f648b4483d` |
| `section-obgyn-plan.xml` | OB-GYN Plan V2 | 2.0 | `84bed1ec-97c4-11f0-aa57-82198ff46031` | OB/GYN | `d83e98fd-dc7b-420f-aa3f-36f648b4483d` |
| `section-oncology-history.xml` | Oncology History | 1.0 | `f76d683d-8b30-47fd-8c80-1730a2ab57cf` | Oncology Initial Consult | `a936ae01-6d10-455d-befc-b2d1828dad04` |
| `section-oncology-plan.xml` | Oncology Plan | 3.0 | `cd0fd93e-234a-4cb0-bcb3-a0fecd3af1bd` | Oncology Initial Consult | `a936ae01-6d10-455d-befc-b2d1828dad04` |
| `section-peds.xml` | Pediatrics feeding and supplements | 1.0 | `c278f802-57be-11e9-8647-d663bd873d93` | Primary Care Pediatric Initial Consult<br>Primary Care Pediatric Followup Consult<br>NCD Initial Consult | `5b812660-0262-11e6-a837-0800200c9a66`<br>`229e5160-031b-11e6-a837-0800200c9a66`<br>`ae06d311-1866-455b-8a64-126a9bd74171` |
| `section-plan.xml` | Plan | 2.0 | `ed673783-ec75-49de-a19f-3976d031aec0` | Primary Care Adult Initial Consult<br>Primary Care Adult Followup Consult<br>Primary Care Pediatric Initial Consult<br>Primary Care Pediatric Followup Consult<br>NCD Initial Consult<br>NCD Followup Consult | `27d3a180-031b-11e6-a837-0800200c9a66`<br>`27d3a181-031b-11e6-a837-0800200c9a66`<br>`5b812660-0262-11e6-a837-0800200c9a66`<br>`229e5160-031b-11e6-a837-0800200c9a66`<br>`ae06d311-1866-455b-8a64-126a9bd74171`<br>`5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c` |
| `section-pmtct-history.xml` | PMTCT History | 1.0 | `db041f90-938b-44b2-ae70-2ef0da6c693e` | PMTCT Intake | `584124b9-1f10-4757-ba09-91fc9075af92` |
| `section-postpartum-counsel.xml` | Postpartum training | 1.0 | `d2ac7d33-cb7b-440e-93b9-45a75859109f` | Pediatric Home Assessment<br>Maternal Post-partum Home Assessment<br>Maternal Follow-up Home Assessment | `0CF4717A-479F-4349-AE6F-8602E2AA41D3`<br>`0E7160DF-2DD1-4728-B951-641BBE4136B8`<br>`690670E2-A0CC-452B-854D-B95E2EAB75C9` |
| `section-prescriptions-print.xml` | Prescriptions | 1.0 | `CA8D072A-2681-4E06-B83C-AD3B0FC3D49D` | Primary Care Adult Initial Consult | `27d3a180-031b-11e6-a837-0800200c9a66` |
| `section-return-visit-date.xml` | Return Visit Date | 1.0 | `674b13aa-9dcd-4c3e-979b-121b6b681bf4` | Prenatal Home Assessment<br>Pediatric Home Assessment<br>Maternal Post-partum Home Assessment | `91DDF969-A2D4-4603-B979-F2D6F777F4AF`<br>`0CF4717A-479F-4349-AE6F-8602E2AA41D3`<br>`0E7160DF-2DD1-4728-B951-641BBE4136B8` |
| `section-risk-factors.xml` | HIVRiskFactors | 1.0 | `3a0a01b6-4184-11e7-a919-92ebcb67fe33` | HIV Intake | `c31d306a-40c4-11e7-a919-92ebcb67fe33` |
| `section-sickle-cell.xml` | Sickle Cell | 1.0 | `23afe1ed-76c4-4642-b37b-44944a9dbed9` | NCD Initial Consult<br>NCD Followup Consult | `ae06d311-1866-455b-8a64-126a9bd74171`<br>`5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c` |
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
