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
