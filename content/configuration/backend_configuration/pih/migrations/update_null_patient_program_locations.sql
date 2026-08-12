-- this is a one-time script to update all patient_program rows migrated without a location

drop temporary table if exists temp_null_location_programs;
create temporary table temp_null_location_programs
(patient_program_id int(11),
patient_id			int(11),
location_id			int(11));

-- load temp table with all patient_program_ids with null location 
insert into temp_null_location_programs(patient_program_id, patient_id)
select patient_program_id, pp.patient_id from patient_program pp
where pp.location_id is null
and pp.voided = 0;

-- update location id on temp table with:
--  * location of earliest encounter for each patient (excluding encounters with null location) 
--  * if there are none, set to unknown location (1)
update temp_null_location_programs t
left outer join encounter e on e.encounter_id =
	(select e2.encounter_id from encounter e2
	where e2.voided = 0
	and e2.patient_id = t.patient_id 
	and e2.location_id is not null
	order by e2.encounter_datetime asc, e2.encounter_id asc limit 1)
set t.location_id = IFNULL(e.location_id,1) ;

-- update patient_program table from temp table
update patient_program pp 
inner join temp_null_location_programs t on pp.patient_program_id  = t.patient_program_id 
set pp.location_id = t.location_id;
