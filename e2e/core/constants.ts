import { targetEnv } from './target';

// The encounter types of the forms that pihemr defines (VITALS, CONSULT, DELIVERY, PRIMARY_CARE_*, NCD_*, ...) are in @pih/pihemr-e2e, with its specs.
export * from '@pih/pihemr-e2e/src/encounter-types';

// Metadata uuids for the Haiti (ZL) configuration. Encounter types are the formEncounterType of the
// forms; locations, the identifier type and the visit type come from the ZL metadata packages. Verify
// against the target server's REST metadata endpoints if a spec cannot create its fixtures.

// "ZL EMR ID": 6 characters, Luhn mod 30 check digit.
export const ZL_EMR_ID_IDENTIFIER_TYPE_UUID = 'a541af1e-105c-40bf-b345-ba1fd6a59b85';
// "Local Pool of ZL Identifiers": the idgen source that registration draws a ZL EMR ID from. A test patient's identifier comes from it too.
export const ZL_EMR_ID_IDENTIFIER_SOURCE_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// "Mirebalais": has the Visit Location tag, so visits are created here.
export const MIREBALAIS_VISIT_LOCATION_UUID = 'a084f714-a536-473b-94e6-ec317b152b43';
// "Klinik Ekstèn" (Hôpital Universitaire de Mirebalais): a Login Location that carries the HIV Consult,
// Check-In, Vitals, Consult Note, Primary Care Consult and NCD Consult tags; used as session and encounter location.
export const KLINIK_EKSTEN_LOCATION_UUID = '199e7d87-92a0-4398-a0f8-11d012178164';
// The session location of the run (global-setup logs in with it; specs expect it as the encounter location of forms that preselect the
// session location). zl-ci: Klinik Ekstèn. hiv-ci (E2E_TARGET=hiv-ci): Klinik Ekstèn carries no tags on that server, so
// E2E_HIV_CI_SESSION_LOCATION_UUID must name a Login Location that carries the HIV Consult and Dispensing tags (Mirebalais does).
export const SESSION_LOCATION_UUID = targetEnv('SESSION_LOCATION_UUID') ?? KLINIK_EKSTEN_LOCATION_UUID;

export const CLINIC_OR_HOSPITAL_VISIT_TYPE_UUID = 'f01c54cb-2225-471a-9cd5-d348552c337c';

// formEncounterType of the forms in htmlforms/ and htmlforms/hiv/
export const CHECKIN_ENCOUNTER_TYPE_UUID = '55a0d3ea-a4d7-4e88-8f01-5aceb2d3c61b';
export const HIV_INTAKE_ENCOUNTER_TYPE_UUID = 'c31d306a-40c4-11e7-a919-92ebcb67fe33';
export const HIV_FOLLOWUP_ENCOUNTER_TYPE_UUID = 'c31d3312-40c4-11e7-a919-92ebcb67fe33';
export const EID_FOLLOWUP_ENCOUNTER_TYPE_UUID = '0f070640-279e-4ec0-9e6c-6ef1f6567030';
export const HIV_DISPENSING_ENCOUNTER_TYPE_UUID = 'cc1720c9-3e4c-4fa8-a7ec-40eeaad1958c';
export const HIV_DRUG_ORDER_DOCUMENTATION_ENCOUNTER_TYPE_UUID = '0b242b71-5b60-11eb-8f5a-0242ac110002';
export const HIV_PSYCHOSOCIAL_ENCOUNTER_TYPE_UUID = '83081f7d-ffd7-4d43-9571-a86e1bc19d7f';
export const PMTCT_INTAKE_ENCOUNTER_TYPE_UUID = '584124b9-1f10-4757-ba09-91fc9075af92';
export const PMTCT_FOLLOWUP_ENCOUNTER_TYPE_UUID = '95e03e7d-9aeb-4a99-bd7a-94e8591ec2c5';
export const PREP_INTAKE_ENCOUNTER_TYPE_UUID = '2fb72359-f6fe-4b37-bb11-9b4cb5fd6ca7';
export const PREP_FOLLOWUP_ENCOUNTER_TYPE_UUID = '4fe5fc03-b42b-4bb2-8ed8-e3c7de8942fb';
export const VCT_ENCOUNTER_TYPE_UUID = '616b66fe-f189-11e7-8c3f-9a214cf093ae';

// Primary care and NCD encounter types (formEncounterType of primary-care-*.xml and ncd-*.xml, pihemr; the parents of
// section-exam / -history / -chief-complaint / -plan / -peds). Names are in the e2e README "Forms tested" table.

// obGyn.xml (OB/GYN) and oncologyIntakeConsult.xml encounter types: parents of section-exam (and of the oncology / obgyn sections)

// echocardiogram.xml (Echocardiogram, pihemr) and oncologyTreatment.xml (Oncology Treatment Plan, pihemr): top-level forms with their own obs. The oncologyIntakeConsult.xml
// encounter type is ONCOLOGY_INTAKE_CONSULT_ENCOUNTER_TYPE_UUID above.

// MCH Delivery (delivery.xml): parent of section-delivery, section-c-section and (on the visit page) section-dx.

// The four community-health home-assessment encounter types (names resolved on zl-ci): no form of this repo creates them; they are
// the parents of section-comments, section-return-visit-date and the other home-assessment sections (see _availability.e2e.md).

// Encounter types of the ADT / surgery / ED forms of pihemr (formEncounterType): admissionNote.xml, cancelAdmission.xml, drugOrder.xml,
// surgicalPostOpNote.xml. edNote.xml shares CONSULT_ENCOUNTER_TYPE_UUID with outpatientConsult.xml.
export const SURGICAL_POST_OP_ENCOUNTER_TYPE_UUID = 'c4941dee-7a9b-4c1c-aa6f-8193e9e5e4e5'; // Surgery Note

// Socioeconomics Note (socio-econ.xml)

// Lab results (labResults.xml)
export const LAB_RESULTS_ENCOUNTER_TYPE_UUID = '4d77916a-0620-11e5-a6c0-1697f925ec7b';

// Mental Health Assessment (mentalHealth.xml)
export const MENTAL_HEALTH_ENCOUNTER_TYPE_UUID = 'a8584ab8-cc2a-11e5-9956-625662870761';

// dispensing.xml (pihemr, hiv-ci only): encounter type stored as "Médicaments administrés", English label "Medication Dispensed", not the HIV drug dispensing type above.
export const DISPENSING_ENCOUNTER_TYPE_UUID = '8ff50dea-18a1-4609-b4c9-3f8f2d611b84';
// comment.xml (pihemr, hiv-ci only)

// chemotherapyTreatment.xml (pihemr): "Chemotheraphy treatment session" (the spelling of the encounter type's own name); covid19Intake.xml / covid19Followup.xml / covid19Discharge.xml:
// "COVID-19 Admission", "COVID-19 Progress", "COVID-19 Discharge".
