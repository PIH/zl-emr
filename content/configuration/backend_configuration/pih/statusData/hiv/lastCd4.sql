# This retrieves all of the data points needed to provide information as to the last CD4 count for the patient

select o.value_numeric, o.obs_datetime into @cd4, @cd4Date
from obs o
where o.person_id = @patientId
  and o.concept_id = concept_from_mapping('CIEL', '5497')
  and o.voided = 0
order by o.obs_datetime desc
limit 1
;

select
    @cd4 as cd4,
    date(@cd4Date) as cd4Date
;
