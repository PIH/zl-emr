# This retrieves all of the data points needed to provide information as to the last TB Test data for the patient
# A TB Test is any of the following tests:
# PPD, qualitative (PIH:)
# TB culture test (PIH:)
# Tuberculosis  result (PIH:)
# GeneXpert MTB/RIF (PIH: )

select concept_from_mapping('PIH', '1435') into @ppd;
select concept_from_mapping('PIH', '3046') into @culture;
select concept_from_mapping('PIH', '3052') into @smear;
select concept_from_mapping('PIH', '11446') into @xpert;

select      o.concept_id, o.obs_datetime, o.value_coded into @testType, @testDate, @testResult
from        obs o
where       o.person_id = @patientId
and         o.voided = 0
and         o.concept_id in (@ppd, @culture, @smear, @xpert)
order by    o.obs_datetime desc
limit 1
;

select
    @testType as testType,
    date(@testDate) as testDate,
    @testResult as testResult
;
