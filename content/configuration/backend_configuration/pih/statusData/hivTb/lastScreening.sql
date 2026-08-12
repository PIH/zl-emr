# This retrieves all of the data points needed to provide information as to the last TB Screening data for the patient
# This are modeled as TB Symptom present (PIH: 11563) or TB Symptom absent (PIH:11564)

select concept_from_mapping('PIH', '11563') into @symptomPresent;
select concept_from_mapping('PIH', '11564') into @symptomAbsent;
select concept_from_mapping('PIH', '11565') into @feverSweats;
select concept_from_mapping('PIH', '11566') into @wtLoss3kg;
select concept_from_mapping('PIH', '11567') into @cough;
select concept_from_mapping('PIH', '11568') into @tbContact;
select concept_from_mapping('PIH', '11569') into @painfulNodes;
select concept_from_mapping('PIH', '970') into @bloodyCough;
select concept_from_mapping('PIH', '5960') into @dyspnea;
select concept_from_mapping('PIH', '136') into @chestPain;

select      e.encounter_id, e.encounter_datetime, sum(if(o.concept_id = @symptomPresent, 1, 0)), sum(if(o.concept_id = @symptomAbsent, 1, 0))
            into @lastScreeningEncounter, @lastScreeningDate, @numPresent, @numAbsent
from        encounter e
inner join  obs o on e.encounter_id = o.encounter_id
where       e.patient_id = @patientId
and         o.voided = 0
and         e.voided = 0
and         o.concept_id in (@symptomPresent, @symptomAbsent)
and         o.value_coded in (@feverSweats, @wtLoss3kg, @cough, @tbContact, @painfulNodes, @bloodyCough, @dyspnea, @chestPain)
group by    e.encounter_id, e.encounter_datetime
order by    e.encounter_datetime desc
limit 1
;

select
    date(@lastScreeningDate) as lastScreeningDate,
    @numPresent as numPresent,
    @numAbsent as numAbsent,
    if(@numPresent > 0, 'zl.status.hivTb.symptomatic', 'zl.status.hivTb.not_symptomatic') as screeningResult
;
