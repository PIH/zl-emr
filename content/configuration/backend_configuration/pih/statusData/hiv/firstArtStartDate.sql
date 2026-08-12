# set concept_id
select concept_from_mapping('PIH', '9070'),
concept_from_mapping('PIH', '1535'),
concept_from_mapping('PIH', '3013'),
concept_from_mapping('PIH', '2848'),
concept_from_mapping('PIH', '13960')
into @dispensingConstruct, @medicationCategory, @arv1, @arv2, @arv3;

select encounter_type_id into @hivDrugDispensing
from encounter_type
where name like 'HIV drug dispensing';

# Encounter and Obs Group containing first art start dates
select distinct ob.obs_id, e.encounter_id, e.encounter_datetime into @artDispenseObsGroupId, @artDispenseEncounterId, @artDispenseEncounterDate
from obs o
inner join encounter e 
on o.encounter_id = e.encounter_id
inner join obs ob on o.obs_group_id = ob.obs_id
where e.patient_id = @patientId
and ob.concept_id = @dispensingConstruct
and o.concept_id = @medicationCategory
and ob.voided = 0
and o.voided = 0
and e.voided = 0
and e.encounter_type = @hivDrugDispensing
and (o.value_coded = @arv1 or o.value_coded = @arv2 or o.value_coded = @arv3)
order by e.encounter_datetime asc
limit 1;

select
    date(@artDispenseEncounterDate) as artDispenseEncounterDate;