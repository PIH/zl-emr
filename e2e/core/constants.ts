import { targetEnv } from './target';

// Metadata uuids for the Haiti (ZL) configuration. Encounter types are the formEncounterType of the
// forms; locations, the identifier type and the visit type come from the ZL metadata packages. Verify
// against the target server's REST metadata endpoints if a spec cannot create its fixtures.

// "ZL EMR ID": 6 characters, Luhn mod 30 check digit (see commands/patient-operations.ts).
export const ZL_EMR_ID_IDENTIFIER_TYPE_UUID = 'a541af1e-105c-40bf-b345-ba1fd6a59b85';

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
export const VITALS_ENCOUNTER_TYPE_UUID = '4fb47712-34a6-40d2-8ed3-e153abbd25b7';
export const CONSULT_ENCOUNTER_TYPE_UUID = '92fd09b4-5335-4f7e-9f63-b2a663fd09a6'; // outpatientConsult.xml
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
export const PRIMARY_CARE_ADULT_INITIAL_ENCOUNTER_TYPE_UUID = '27d3a180-031b-11e6-a837-0800200c9a66';
export const PRIMARY_CARE_ADULT_FOLLOWUP_ENCOUNTER_TYPE_UUID = '27d3a181-031b-11e6-a837-0800200c9a66';
export const PRIMARY_CARE_PEDS_INITIAL_ENCOUNTER_TYPE_UUID = '5b812660-0262-11e6-a837-0800200c9a66';
export const PRIMARY_CARE_PEDS_FOLLOWUP_ENCOUNTER_TYPE_UUID = '229e5160-031b-11e6-a837-0800200c9a66';
export const NCD_INITIAL_ENCOUNTER_TYPE_UUID = 'ae06d311-1866-455b-8a64-126a9bd74171';
export const NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID = '5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c';

// obGyn.xml (OB/GYN) and oncologyIntakeConsult.xml encounter types: parents of section-exam (and of the oncology / obgyn sections)
export const OBGYN_ENCOUNTER_TYPE_UUID = 'd83e98fd-dc7b-420f-aa3f-36f648b4483d';
export const ONCOLOGY_INTAKE_CONSULT_ENCOUNTER_TYPE_UUID = 'a936ae01-6d10-455d-befc-b2d1828dad04';

// echocardiogram.xml (Echocardiogram, pihemr) and oncologyTreatment.xml (Oncology Treatment Plan, pihemr): top-level forms with their own obs. The oncologyIntakeConsult.xml
// encounter type is ONCOLOGY_INTAKE_CONSULT_ENCOUNTER_TYPE_UUID above.
export const ECHOCARDIOGRAM_ENCOUNTER_TYPE_UUID = 'fdee591e-78ba-11e9-8f9e-2a86e4085a59'; // Echocardiogram
export const ONCOLOGY_TREATMENT_PLAN_ENCOUNTER_TYPE_UUID = 'f9cfdf8b-d086-4658-9b9d-45a62896da03'; // Oncology Treatment Plan

// MCH Delivery (delivery.xml): parent of section-delivery, section-c-section and (on the visit page) section-dx.
export const DELIVERY_ENCOUNTER_TYPE_UUID = '00e5ebb2-90ec-11e8-9eb6-529269fb1459';

// The four community-health home-assessment encounter types (names resolved on zl-ci): no form of this repo creates them; they are
// the parents of section-comments, section-return-visit-date and the other home-assessment sections (see _availability.e2e.md).
export const PRENATAL_HOME_ASSESSMENT_ENCOUNTER_TYPE_UUID = '91DDF969-A2D4-4603-B979-F2D6F777F4AF'; // Prenatal Home Assessment
export const PEDIATRIC_HOME_ASSESSMENT_ENCOUNTER_TYPE_UUID = '0CF4717A-479F-4349-AE6F-8602E2AA41D3'; // Pediatric Home Assessment
export const MATERNAL_POSTPARTUM_HOME_ASSESSMENT_ENCOUNTER_TYPE_UUID = '0E7160DF-2DD1-4728-B951-641BBE4136B8'; // Maternal Post-partum Home Assessment
export const MATERNAL_FOLLOWUP_HOME_ASSESSMENT_ENCOUNTER_TYPE_UUID = '690670E2-A0CC-452B-854D-B95E2EAB75C9'; // Maternal Follow-up Home Assessment

// Encounter types of the ADT / surgery / ED forms of pihemr (formEncounterType): admissionNote.xml, cancelAdmission.xml, drugOrder.xml,
// surgicalPostOpNote.xml. edNote.xml shares CONSULT_ENCOUNTER_TYPE_UUID with outpatientConsult.xml.
export const ADMISSION_ENCOUNTER_TYPE_UUID = '260566e1-c909-4d61-a96f-c1019291a09d'; // Admission
export const CANCEL_ADMISSION_ENCOUNTER_TYPE_UUID = 'edbb857b-e736-4296-9438-462b31f97ef9'; // Cancel Admission
export const DRUG_ORDER_ENCOUNTER_TYPE_UUID = 'e0b41238-905a-497b-a2b6-885994701b99'; // Drug Order
export const SURGICAL_POST_OP_ENCOUNTER_TYPE_UUID = 'c4941dee-7a9b-4c1c-aa6f-8193e9e5e4e5'; // Surgery Note

// Socioeconomics Note (socio-econ.xml)
export const SOCIO_ECONOMICS_ENCOUNTER_TYPE_UUID = 'de844e58-11e1-11e8-b642-0ed5f89f718b';

// Lab results (labResults.xml)
export const LAB_RESULTS_ENCOUNTER_TYPE_UUID = '4d77916a-0620-11e5-a6c0-1697f925ec7b';

// Mental Health Assessment (mentalHealth.xml)
export const MENTAL_HEALTH_ENCOUNTER_TYPE_UUID = 'a8584ab8-cc2a-11e5-9956-625662870761';

// dispensing.xml (pihemr, hiv-ci only): encounter type stored as "Médicaments administrés", English label "Medication Dispensed", not the HIV drug dispensing type above.
export const DISPENSING_ENCOUNTER_TYPE_UUID = '8ff50dea-18a1-4609-b4c9-3f8f2d611b84';
// comment.xml (pihemr, hiv-ci only)
export const COMMENT_ENCOUNTER_TYPE_UUID = 'c30d6e06-0f00-460a-8f81-3c39a1853b56';

// chemotherapyTreatment.xml (pihemr): "Chemotheraphy treatment session" (the spelling of the encounter type's own name); covid19Intake.xml / covid19Followup.xml / covid19Discharge.xml:
// "COVID-19 Admission", "COVID-19 Progress", "COVID-19 Discharge".
export const CHEMOTHERAPY_TREATMENT_ENCOUNTER_TYPE_UUID = '828964fa-17eb-446e-aba4-e940b0f4be5b';
export const COVID19_INTAKE_ENCOUNTER_TYPE_UUID = '8d50b938-dcf9-4b8e-9938-e625bd2f0a81';
export const COVID19_FOLLOWUP_ENCOUNTER_TYPE_UUID = 'ca65f5d3-6312-4143-ae4e-0237427f339e';
export const COVID19_DISCHARGE_ENCOUNTER_TYPE_UUID = '5e82bea0-fd7b-47f9-858a-91be87521073';
