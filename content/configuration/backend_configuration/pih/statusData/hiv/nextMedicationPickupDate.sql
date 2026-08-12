# This query retrieves the total number of HIV Dispensing Encounters and the Most Recent Scheduled Dispensing Date for a patient

set @hivDispensingEncounterType = encounter_type('cc1720c9-3e4c-4fa8-a7ec-40eeaad1958c');

# Get total number of dispensing encounters for the patient

select ifnull(count(e.encounter_id), 0) into @numPickups
from encounter e
where e.encounter_type = @hivDispensingEncounterType
  and e.voided = 0
  and e.patient_id = @patientId;

# Get the next scheduled appointment date from the last dispensing encounter

select o.value_datetime into @nextPickupDate
from obs o
inner join encounter e on o.encounter_id = e.encounter_id
where o.concept_id = concept_from_mapping('PIH', '5096')
  and e.encounter_type = @hivDispensingEncounterType
  and o.voided = 0
  and e.voided = 0
  and o.person_id = @patientId
order by e.encounter_datetime desc
limit 1;

select
       ifnull(@numPickups, 0) as numPickups,
       date(@nextPickupDate) as nextPickupDate
;