# TB treatment status
select o.value_coded into @tbTreatmentStatusCoded
from obs o
where o.obs_id = latest_obs(@patientId, 'PIH', '1559')
and o.voided = 0;


# TB treatment Regimen
select o.value_coded into @tbTreatmentRegimenCoded
from obs o
where o.obs_id = latest_obs(@patientId, 'CIEL', '159792')
and o.voided = 0;

# TB treatment Date
select o.value_datetime into @tbTreatmentDate
from obs o
where o.obs_id = latest_obs(@patientId, 'CIEL', '1113')
and o.voided = 0;

select @tbTreatmentStatusCoded as tbTreatmentStatus,
       date(@tbTreatmentDate) as tbTreatmentDate,
       if(@tbTreatmentRegimenCoded = concept_from_mapping('CIEL', '1267'), null, @tbTreatmentRegimenCoded) as tbTreatmentRegimen;
       