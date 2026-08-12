# This retrieves all of the data points needed to provide information as to
# the last viral load of the patient

# ART Start Date
select min(ifnull(o.scheduled_date, o.date_activated)) into @artStartDate
from orders o
where o.patient_id = @patientId
and o.order_reason = concept_from_mapping('CIEL', '138405')
and o.voided = 0;

# Active DTG
select (count(o.order_id) > 0) into @activeDtg
from orders o
where o.patient_id = @patientId
and o.concept_id = concept_from_mapping('CIEL', '165085')
and ifnull(o.scheduled_date, o.date_activated) <= now()
and ifnull(o.date_stopped, o.auto_expire_date) > now()
and o.voided = 0
;

# Encounter and Obs Group containing most recent viral load observations
select distinct og.obs_id, e.encounter_id, e.encounter_datetime into @vlObsGroupId, @vlEncounterId, @vlEncounterDate
from obs o
inner join encounter e on o.encounter_id = e.encounter_id
inner join obs og on o.obs_group_id = og.obs_id
where e.patient_id = @patientId
  and og.concept_id in (concept_from_mapping('PIH', '11545'), concept_from_mapping('PIH', '15124')) -- vl construct (standalone results) or vl panel (lab module) 
  and og.voided = 0
  and o.voided = 0
  and e.voided = 0
order by e.encounter_datetime desc
limit 1
;

# VL Qualitative
select o.value_coded into @vlQualitativeResult
from obs o
where o.obs_group_id = @vlObsGroupId
  and o.concept_id = concept_from_mapping('CIEL', '1305')
  and o.voided = 0;

select (@vlQualitativeResult = concept_from_mapping('CIEL', '1301')) into @vlDetectable;
select (@vlQualitativeResult = concept_from_mapping('CIEL', '1302')) into @vlUndetectable;

# VL Quantitative
select o.value_numeric into @vlQuantitativeResult
from obs o
where o.obs_group_id = @vlObsGroupId
  and o.concept_id = concept_from_mapping('CIEL', '856')
  and o.voided = 0;

# Due for viral load
select timestampdiff(MONTH, @artStartDate, now()) into @monthsSinceArtStart;
select timestampdiff(MONTH, @vlEncounterDate, now()) into @monthsSinceLastVl;
select (@activeDtg and (@vlEncounterDate is null or @vlEncounterDate < @artStartDate) and @monthsSinceArtStart < 3) into @needs3mArtVl;
select ((@vlEncounterDate is null or @vlEncounterDate < @artStartDate) and @monthsSinceArtStart >= 3 and @monthsSinceArtStart < 6) into @needs6mArtVl;
select (@monthsSinceLastVl >=6 and @vlDetectable) into @needs6mNextVl;
select (@monthsSinceLastVl >=12) into @needs12mNextVl;
select (@needs3mArtVl or @needs6mArtVl or @needs6mNextVl or @needs12mNextVl) into @dueForVl;

select
    date(@artStartDate) as artStartDate,
    @activeDtg as activeDtg,
    @vlObsGroupId as vlObsGroupId,
    @vlEncounterId as vlEncounterId,
    date(@vlEncounterDate) as vlEncounterDate,
    @vlQualitativeResult as vlQualitativeResult,
    @vlDetectable as vlDetectable,
    @vlUndetectable as vlUndetectable,
    @vlQuantitativeResult as vlQuantitativeResult,
    @dueForVl as dueForVl
;
