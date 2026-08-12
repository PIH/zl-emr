# This retrieves the Appointment Date Obs from the most recent HIV encounter

set @hivIntake = encounter_type('c31d306a-40c4-11e7-a919-92ebcb67fe33');
set @hivFollowup = encounter_type('c31d3312-40c4-11e7-a919-92ebcb67fe33');
set @eidFollowup = encounter_type('0f070640-279e-4ec0-9e6c-6ef1f6567030');
set @pmtctIntake = encounter_type('584124b9-1f10-4757-ba09-91fc9075af92');
set @pmtctFollowup = encounter_type('95e03e7d-9aeb-4a99-bd7a-94e8591ec2c5');

select o.value_datetime into @nextVisitDate
from obs o
inner join encounter e on o.encounter_id = e.encounter_id
where o.concept_id = concept_from_mapping('PIH', '5096')
  and e.encounter_type in (@hivIntake, @hivFollowup, @eidFollowup, @pmtctIntake, @pmtctFollowup)
  and o.voided = 0
  and e.voided = 0
  and o.person_id = @patientId
order by e.encounter_datetime desc
limit 1;

select date(@nextVisitDate) as nextVisitDate;