select concept_from_mapping('PIH', '9070'),
concept_from_mapping('PIH', '1535'),
concept_from_mapping('PIH', '3013'),
concept_from_mapping('PIH', '2848'),
concept_from_mapping('PIH', '13960'),
concept_from_mapping('PIH', '1282'),
concept_from_mapping('PIH', '9071'),
concept_from_mapping('PIH','13276')
into @dispensingConstruct, @medicationCategory, @arv1, @arv2, @arv3, @medicationName, @medicationQuantity, @chwConceptId;

select et.encounter_type_id into @hivDrugDispensing
from encounter_type et
where et.uuid = 'cc1720c9-3e4c-4fa8-a7ec-40eeaad1958c';

# Get the latest encounter with ARV1 or ARV2 or ARV3
SELECT o.encounter_id  into @encounterId
FROM obs o
join obs o2 on o.obs_group_id = o2.obs_id
join encounter e on e.encounter_id = o.encounter_id
where o.person_id = @patientId
and e.encounter_type = @hivDrugDispensing
and o2.concept_id = @dispensingConstruct
and o.concept_id = @medicationCategory
and o.voided = 0
and o2.voided = 0
and (o.value_coded = @arv1 or o.value_coded = @arv2 or o.value_coded = @arv3)
group by o.encounter_id
order by e.encounter_datetime desc
limit 1;

select o.value_text into @chw
from obs o
where o.concept_id = @chwConceptId
and o.voided = 0
and o.encounter_id= @encounterId;

select
    @chw as chwName;