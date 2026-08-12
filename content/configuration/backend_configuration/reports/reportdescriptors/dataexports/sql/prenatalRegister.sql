SET sql_safe_updates = 0;
SET @locale = GLOBAL_PROPERTY_VALUE('default_locale', 'en');
-- set @startDate = '2024-05-01'; -- for testing
-- set @endDate = '2024-05-31';

SET @obgyn_encounter = (SELECT encounter_type_id FROM encounter_type WHERE uuid = 'd83e98fd-dc7b-420f-aa3f-36f648b4483d');

DROP TEMPORARY TABLE IF EXISTS temp_obgyn_visit;
CREATE TEMPORARY TABLE temp_obgyn_visit
(
encounter_id                                 int(11),       
encounter_datetime                           datetime,      
latest_new_prenatal_datetime                 datetime,     
latest_postpartum_datetime                   datetime,     
latest_delivery_datetime_from_prev_pregnancy datetime,     
visit_id                                     int(11),       
vitals_encounter_id                          int(11),       
patient_id                                   int(11),       
dossier_id                                   varchar(50),   
first_name                                   varchar(50),   
last_name                                    varchar(50),   
mothers_first_name                           varchar(50),   
date_of_birth                                datetime,      
age_at_encounter                             double,        
address                                      text,          
date_of_last_menstrual_period                datetime,      
gestational_age                              int,           
estimated_delivery_date                      datetime,      
gravida                                      int,           
parity                                       int,           
abortus                                      int,           
living_children                              int,           
referral_source                              varchar(255),  
visit_count                                  int,           
visit_date                                   datetime,      
anti_tetanus_dose                            int,           
anti_tetanus_vaccination_datetime            datetime,      
anti_tetanus_vaccination                     text,          
high_risks_for_the_pregnancy                 text,          
hiv_test_obs_id_labs                         int(11),      
hiv_test_encounter_id_labs                   int(11),       
hiv_test_date_labs                           datetime,      
hiv_test_result_date_labs                    datetime,      
result_labs                                  varchar(255),  
hiv_test_date_form                           datetime,      
result_form                                  varchar(255),  
pre_counseling_date                          datetime,      
hiv_test_date                                datetime,      
hiv_test_result_date                         datetime,      
result                                       varchar(255),  
not_tested_for_hiv                           varchar(1),    
syphillis_details_not_tracked_in_emr         varchar(50),   
syphiliss_treatment_start_date               datetime,      
syphillis_treatment_end_date                 datetime,      
on_art_for_hiv_prior_to_pregnancy            varchar(3),    
additional_hiv_details_not_in_the_emr        varchar(50),   
weight_in_kg                                 double,        
height_in_m                                  double,        
upper_arm_circumference                      double,        
malnutrition_malaria_details_not_in_emr      varchar(50),   
malnutrition                                 varchar(3),    
iron_deficiency_anemia                       varchar(3),    
malaria                                      varchar(3),    
birth_plan                                   varchar(3),    
accepts_accompanateur                        varchar(3),    
enrolled_in_mother_support_group             varchar(3)     
);

set @type_visit = concept_from_mapping('PIH','8879');
set @prenatal = concept_from_mapping('PIH','6259');
INSERT INTO temp_obgyn_visit(patient_id, encounter_id,encounter_datetime, visit_id)
SELECT DISTINCT e.patient_id, e.encounter_id, e.encounter_datetime, v.visit_id
FROM encounter e
INNER JOIN visit v ON v.visit_id = e.visit_id AND v.voided = 0
INNER JOIN obs o ON o.encounter_id = e.encounter_id AND o.voided = 0 and concept_id = @type_visit and value_coded = @prenatal
WHERE e.voided = 0 AND encounter_type = @obgyn_encounter
AND ((date(e.encounter_datetime) >=@startDate) or @startDate is null)
AND ((date(e.encounter_datetime) <=@endDate)  or @endDate is null)
AND v.location_id = @location
;


CREATE INDEX temp_obgyn_visit_patient_id ON temp_obgyn_visit (patient_id);
CREATE INDEX temp_obgyn_visit_encounter_id ON temp_obgyn_visit (encounter_id);

-- patient level columns
DROP TEMPORARY TABLE IF EXISTS temp_patient_level;
CREATE TEMPORARY TABLE temp_patient_level
(
patient_id         INT(11),
dossier_id         VARCHAR(50),
first_name         VARCHAR(50),
last_name          VARCHAR(50),
mothers_first_name VARCHAR(50),
date_of_birth      DATETIME,
address            TEXT
);

insert into temp_patient_level (patient_id)
select distinct patient_id from temp_obgyn_visit;

update temp_patient_level t 
set t.mothers_first_name = person_attribute_value(patient_id, 'First Name of Mother');

update temp_patient_level t 
set t.dossier_id = dosId(t.patient_id);

update temp_patient_level t 
set t.first_name = person_given_name(t.patient_id);

update temp_patient_level t 
set t.last_name = person_family_name(t.patient_id);

update temp_patient_level t 
set t.date_of_birth = birthdate(t.patient_id);

update temp_patient_level t 
set t.address = person_address(t.patient_id);

update temp_obgyn_visit v
inner join temp_patient_level t on t.patient_id = v.patient_id
set v.dossier_id = t.dossier_id,
v.first_name = t.first_name,
v.last_name = t.last_name,
v.mothers_first_name = t.mothers_first_name,
v.date_of_birth = t.date_of_birth,
v.address = t.address;

-- vaccinations
set @vacc_type = concept_from_mapping('PIH','10156');
set @dt = concept_from_mapping('PIH','17');
set @vacc_date = concept_from_mapping('PIH','10170');
set @vacc_seq = concept_from_mapping('PIH','10157');

drop temporary table if exists dt_vaccinations;
create temporary table dt_vaccinations
(vacc_index int PRIMARY KEY AUTO_INCREMENT,
patient_id int(11),
dt_obs_group_id int(11),
dt_seq_no int(11),
dt_datetime datetime
);

insert into dt_vaccinations(patient_id, dt_obs_group_id)
select o.person_id , o.obs_group_id  from obs o
inner join temp_patient_level t on t.patient_id = o.person_id 
where o.voided = 0
and o.concept_id = @vacc_type
and o.value_coded = @dt;

CREATE INDEX dt_vaccinations_og ON dt_vaccinations(dt_obs_group_id);

update dt_vaccinations t
set dt_seq_no = obs_from_group_id_value_numeric(t.dt_obs_group_id, 'PIH','10157');

CREATE INDEX dt_vaccinations_pat_seq ON dt_vaccinations(patient_id,dt_seq_no);

update dt_vaccinations t
set dt_datetime = obs_from_group_id_value_datetime(t.dt_obs_group_id, 'PIH','10170');

update temp_obgyn_visit t
set anti_tetanus_dose = (select max(dt_seq_no) from dt_vaccinations v where v.patient_id = t.patient_id); 

update temp_obgyn_visit t
inner join dt_vaccinations v on v.patient_id = t.patient_id and v.dt_seq_no = t.anti_tetanus_dose
set anti_tetanus_vaccination_datetime = v.dt_datetime;

-- transform seq no, which is saved as 0-3, 11, 12
update temp_obgyn_visit t
set anti_tetanus_dose =
	case anti_tetanus_dose
		when 11 then 5
		when 12 then 6
		else anti_tetanus_dose + 1
	end;

update temp_obgyn_visit t
set anti_tetanus_vaccination= CONCAT('Dose ',' ',t.anti_tetanus_dose, ' ',DATE_FORMAT(anti_tetanus_vaccination_datetime,'%d/%m/%Y')); 


-- obs-level columns
DROP TEMPORARY TABLE IF EXISTS temp_obs;
CREATE TEMPORARY TABLE temp_obs 
SELECT o.obs_id, o.voided ,o.obs_group_id , o.encounter_id, o.person_id, o.concept_id, o.value_coded, o.value_numeric, o.value_text,o.value_datetime, o.comments , o.date_created
FROM obs o
INNER JOIN temp_obgyn_visit t ON t.encounter_id = o.encounter_id
WHERE o.voided = 0;

CREATE INDEX temp_mch_obs_concept_id ON temp_obs(concept_id);
CREATE INDEX temp_mch_obs_ei ON temp_obs(encounter_id);

UPDATE temp_obgyn_visit te 
set age_at_encounter = age_at_enc(te.patient_id, te.encounter_id);	

UPDATE temp_obgyn_visit te 
set date_of_last_menstrual_period =value_datetime(latest_obs(patient_id,'PIH', 'DATE OF LAST MENSTRUAL PERIOD'));


UPDATE temp_obgyn_visit te 
set gestational_age =ROUND(DATEDIFF(te.encounter_datetime, te.date_of_last_menstrual_period)/7, 0);

UPDATE temp_obgyn_visit te 
set estimated_delivery_date = obs_value_datetime_from_temp(te.encounter_id,'PIH', 'ESTIMATED DATE OF CONFINEMENT');

UPDATE temp_obgyn_visit te 
set gravida = obs_value_numeric_from_temp(te.encounter_id,'PIH', 'GRAVIDITY');

UPDATE temp_obgyn_visit te 
set parity = obs_value_numeric_from_temp(te.encounter_id,'PIH', 'PARITY');

UPDATE temp_obgyn_visit te 
set abortus = obs_value_numeric_from_temp(te.encounter_id,'PIH', 'NUMBER OF ABORTIONS');

UPDATE temp_obgyn_visit te 
set living_children = obs_value_numeric_from_temp(te.encounter_id,'PIH', '11117');

UPDATE temp_obgyn_visit te 
set referral_source = obs_value_coded_list_from_temp(te.encounter_id,'PIH','7454',@locale);

UPDATE temp_obgyn_visit te 
set syphiliss_treatment_start_date = 
	 if(obs_single_value_coded_from_temp(encounter_id, 'PIH','13024','PIH','13274') is not null, encounter_datetime,null) ;

UPDATE temp_obgyn_visit te 
set syphillis_treatment_end_date = 
	 if(obs_single_value_coded_from_temp(encounter_id, 'PIH','13024','PIH','1267') is not null, encounter_datetime,null) ;


UPDATE temp_obgyn_visit t 
set visit_date = date(t.encounter_datetime); 

UPDATE temp_obgyn_visit te 
set referral_source = obs_value_coded_list_from_temp(te.encounter_id,'PIH','7454',@locale);

UPDATE temp_obgyn_visit te 
set high_risks_for_the_pregnancy = obs_value_coded_list_from_temp(te.encounter_id,'CIEL','160079',@locale);
	
-- HIV Tests
set @hivTestId = concept_from_mapping('PIH','1040');
UPDATE temp_obgyn_visit te 
set hiv_test_obs_id_labs = latestObs(te.patient_id, @hivTestId,null);

UPDATE temp_obgyn_visit te 
inner join obs o on o.obs_id = hiv_test_obs_id_labs
set hiv_test_encounter_id_labs = o.encounter_id ;

UPDATE temp_obgyn_visit te 
inner join encounter e on e.encounter_id = hiv_test_encounter_id_labs
set hiv_test_date_labs = e.encounter_datetime ;

UPDATE temp_obgyn_visit te 
set hiv_test_result_date_labs = obs_value_datetime(hiv_test_encounter_id_labs,'PIH','10783');

UPDATE temp_obgyn_visit te 
inner join obs o on o.obs_id = hiv_test_obs_id_labs
set result_labs = concept_name(o.value_coded,@locale);

UPDATE temp_obgyn_visit te 
set hiv_test_date_form = obs_value_datetime_from_temp(te.encounter_id,'PIH','1837');

UPDATE temp_obgyn_visit te 
set result_form = obs_value_coded_list_from_temp(te.encounter_id,'PIH','2169',@locale);

UPDATE temp_obgyn_visit te 
set hiv_test_date = if(hiv_test_date_form>=hiv_test_date_labs,hiv_test_date_form,hiv_test_date_labs);

UPDATE temp_obgyn_visit te 
set result = if(hiv_test_date_form>=hiv_test_date_labs,result_form,result_labs);

UPDATE temp_obgyn_visit te 
set hiv_test_result_date = if(hiv_test_date_form>=hiv_test_date_labs,null,hiv_test_result_date_labs);

UPDATE temp_obgyn_visit te 
set not_tested_for_hiv = if(hiv_test_date is null, 'X',null);

UPDATE temp_obgyn_visit te 
set on_art_for_hiv_prior_to_pregnancy = if(obs_value_datetime_from_temp(te.encounter_id, 'PIH','2516')<date_of_last_menstrual_period,'Oui',null);

SELECT name into @vitalsEncName from encounter_type where uuid = '4fb47712-34a6-40d2-8ed3-e153abbd25b7';
select form_id into @vitalsForm from form where uuid = '68728aa6-4985-11e2-8815-657001b58a90';
UPDATE temp_obgyn_visit te 
set vitals_encounter_id = latestEncForminVisit(te.patient_id,@vitalsEncName, te.visit_id, @vitalsForm, null );

UPDATE temp_obgyn_visit te 
set height_in_m = obs_value_numeric(te.vitals_encounter_id, 'PIH','5090')/100;

UPDATE temp_obgyn_visit te 
set weight_in_kg = obs_value_numeric(te.vitals_encounter_id, 'PIH','5089');

UPDATE temp_obgyn_visit te 
set upper_arm_circumference = obs_value_numeric(te.vitals_encounter_id, 'PIH','7956');

set @dx = concept_from_mapping('PIH','3064');
set @anemia_id = concept_from_mapping('PIH','1226');
set @malaria_id = concept_from_mapping('PIH','123');
set @severe_malaria_id = concept_from_mapping('PIH','7134');
set @cerebral_malaria_id = concept_from_mapping('PIH','11487');
set @confirmed_malaria_id = concept_from_mapping('PIH','7646');
set @malaria_pregnancy_id = concept_from_mapping('PIH','15091');
set @malaria_complicating_id = concept_from_mapping('PIH','7568');

set @malnutrition_id = concept_from_mapping('PIH','68');
set @moderate_malnutrition_id = concept_from_mapping('PIH','1312');
set @mild_malnutrition_id = concept_from_mapping('PIH','1226');
set @severe_uncomplicated_mal_id = concept_from_mapping('PIH','11340');
set @severe_malnutrition_id = concept_from_mapping('PIH','1313');

DROP TEMPORARY TABLE IF EXISTS temp_dxs;
CREATE TEMPORARY TABLE temp_dxs
(
encounter_id  int(11),
dx_concept_id int(11)
);

insert into temp_dxs(encounter_id, dx_concept_id)
select o.encounter_id, o.value_coded from
temp_obs o 
inner join temp_obgyn_visit t on t.encounter_id = o.encounter_id 
and o.voided = 0
and o.concept_id = @dx
and o.value_coded in 
	(@anemia_id,
	@malaria_id,
	@severe_malaria_id,
	@cerebral_malaria_id,
	@confirmed_malaria_id,	
	@malaria_pregnancy_id,
	@malaria_complicating_id,
	@malnutrition_id,
	@moderate_malnutrition_id,
	@mild_malnutrition_id,
	@severe_uncomplicated_mal_id,
	@severe_malnutrition_id);	

UPDATE temp_obgyn_visit te 
inner join temp_dxs d on te.encounter_id = d.encounter_id and d.dx_concept_id = @anemia_id
set iron_deficiency_anemia = 'Oui';

UPDATE temp_obgyn_visit te 
inner join temp_dxs d on te.encounter_id = d.encounter_id and d.dx_concept_id IN 
	(@malaria_id,
	@severe_malaria_id,
	@cerebral_malaria_id,
	@confirmed_malaria_id,	
	@malaria_pregnancy_id,
	@malaria_complicating_id	
	)
set malaria = 'Oui';

UPDATE temp_obgyn_visit te 
inner join temp_dxs d on te.encounter_id = d.encounter_id and d.dx_concept_id IN 
	(@malnutrition_id,
	@moderate_malnutrition_id,
	@mild_malnutrition_id,
	@severe_uncomplicated_mal_id,
	@severe_malnutrition_id)
set malnutrition = 'Oui';

set @acceptsCHW = concept_from_mapping('PIH','3293');
set @yes = concept_from_mapping('PIH','1065');
set @momClub = concept_from_mapping('PIH','13261');
set @pmtctClub = concept_from_mapping('PIH','13262');
set @deliveryLocation = concept_from_mapping('PIH','13260');
set @prophylaxisPlan = concept_from_mapping('PIH','13259');

UPDATE temp_obgyn_visit te
inner join temp_obs o on o.encounter_id = te.encounter_id
	and ((o.concept_id = @acceptsCHW and o.value_coded = @yes)
	  or (o.concept_id = @momClub and o.value_coded = @yes)
      or (o.concept_id = @pmtctClub and o.value_coded = @yes)
      or (o.concept_id = @prophylaxisPlan and o.value_coded = @yes)
      or (o.concept_id = @deliveryLocation))
set birth_plan = 'Oui';      

UPDATE temp_obgyn_visit te
set accepts_accompanateur = if(value_coded_as_boolean(obs_id_from_temp(te.encounter_id, 'PIH','3293',0)),'Oui',null);

UPDATE temp_obgyn_visit te
set enrolled_in_mother_support_group = if(value_coded_as_boolean(obs_id_from_temp(te.encounter_id, 'PIH','13261',0)),'Oui',null);

set @type_visit = concept_from_mapping('PIH','8879');
set @prenatal = concept_from_mapping('PIH','6259');
set @postnatal = concept_from_mapping('PIH','6261');
set @new_or_followup = concept_from_mapping('PIH','13236');
set @new = concept_from_mapping('PIH','13235');

-- latest_delivery_datetime_from_prev_pregnancy
select concept_id into @add from concept where uuid = '5599AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

set @firstDayCurrentMonth = date(date_add(ifnull(@endDate, NOW()),interval -DAY(ifnull(@endDate, NOW()))+1 DAY));
UPDATE temp_obgyn_visit t
set latest_delivery_datetime_from_prev_pregnancy = 
	(select max(value_datetime)
	from obs o 
	where o.person_id = t.patient_id
	and o.concept_id = @add
	and o.value_datetime < @firstDayCurrentMonth);

DROP TEMPORARY TABLE IF EXISTS temp_visit_counts;
CREATE TEMPORARY TABLE temp_visit_counts
(
patient_id int(11),
encounter_id  int(11),
visit_type int(11),
new_or_followup int(11),
encounter_datetime datetime
);

insert into temp_visit_counts (patient_id, encounter_id,encounter_datetime) 
select distinct t.patient_id, e.encounter_id , e.encounter_datetime
from temp_obgyn_visit t
inner join encounter e on e.patient_id  = t.patient_id and e.voided = 0 AND encounter_type = @obgyn_encounter and DATEDIFF(t.encounter_datetime, e.encounter_datetime) < 270 
	 and e.encounter_datetime <= t.encounter_datetime
inner join obs o on o.encounter_id = e.encounter_id and o.voided = 0
;

create index temp_visit_counts_p on temp_visit_counts(patient_id);
create index temp_visit_counts_e on temp_visit_counts(encounter_id);

update temp_visit_counts t  
inner join obs o on o.encounter_id = t.encounter_id 
and o.concept_id = @type_visit
and o.voided = 0
set visit_type = value_coded ;

update temp_visit_counts t  
inner join obs o on o.encounter_id = t.encounter_id 
and o.concept_id = @new_or_followup
and o.voided = 0
set new_or_followup = value_coded ;

DROP TEMPORARY TABLE IF EXISTS temp_visit_counts_dup;
create temporary table temp_visit_counts_dup
select * from temp_visit_counts;

create index temp_visit_counts_dup_c1 on temp_visit_counts_dup(patient_id, visit_type,  new_or_followup, encounter_datetime);

update temp_obgyn_visit t
inner join temp_visit_counts c on c.encounter_id = 
	(select c2.encounter_id from temp_visit_counts_dup c2
	where c2.patient_id = t.patient_id
	and c2.visit_type = @prenatal
	and c2.new_or_followup = @new
	and c2.encounter_datetime <= t.encounter_datetime
	order by c2.encounter_datetime desc limit 1)
set latest_new_prenatal_datetime = c.encounter_datetime;

update temp_obgyn_visit t
inner join temp_visit_counts c on c.encounter_id = 
	(select c2.encounter_id from temp_visit_counts_dup c2
	where c2.patient_id = t.patient_id
	and c2.visit_type = @postnatal
	and c2.encounter_datetime < t.encounter_datetime
	order by c2.encounter_datetime desc limit 1)
set latest_postpartum_datetime = c.encounter_datetime;

update temp_obgyn_visit t
set visit_count = 
	(select count(*) from temp_visit_counts c
	where c.patient_id = t.patient_id
	and c.encounter_datetime <= t.encounter_datetime
	and c.visit_type = @prenatal
	and c.encounter_datetime >= DATE_ADD(ifnull(@endDate, NOW()),INTERVAL -9 MONTH)
  	and (c.encounter_datetime >= latest_delivery_datetime_from_prev_pregnancy or latest_delivery_datetime_from_prev_pregnancy is null)
  	and (c.encounter_datetime >= latest_new_prenatal_datetime or latest_new_prenatal_datetime is null)
 	and (c.encounter_datetime > t.latest_postpartum_datetime or t.latest_postpartum_datetime is null));

-- select final output.  
-- Note that much of this is formatted in a non-standard way for our exports.
-- This is because it is coded to match the physical prenatal register as much as possible
select 
dossier_id "1 - # Dossier",
first_name "3 - Prénom(s)",
last_name "3- Surnoms",
mothers_first_name "4 - Prénom de la mère",
DATE_FORMAT(date_of_birth,'%d/%m/%Y') "5- Date de Naissance",
age_at_encounter "6 - Âge",
address "7 - Lieu de résidence",
DATE_FORMAT(date_of_last_menstrual_period,'%d/%m/%Y') "8 - Date Prénatal Dernières (DDR)",
gestational_age "9 - Âge gestationnel (en semaine)",
DATE_FORMAT(estimated_delivery_date,'%d/%m/%Y') "10 - Date Probable d'Accouchement (DPA)",
gravida "11 - Gravida (G)",
parity "12 - Para ou Parité (P)",
abortus "13 - Aborta (A)",
living_children "14 - Enfant(s) vivant(s) (EV)",
referral_source "15 - Source de référence",
visit_count "16 - # de visites",
DATE_FORMAT(visit_date,'%d/%m/%Y') "17 - Date visite",
anti_tetanus_vaccination "18 - Vaccination Antitétanique",
high_risks_for_the_pregnancy "19 - Risques élevés les à grossesse",
DATE_FORMAT(pre_counseling_date,'%d/%m/%Y') "20 - Date counseling pré test",
DATE_FORMAT(hiv_test_date,'%d/%m/%Y') "21 - Date test (VIH)",
DATE_FORMAT(hiv_test_result_date,'%d/%m/%Y') "22 - Date résultat (VIH)",
result "23 - Résultat (VIH)",
not_tested_for_hiv "24 - Non testée pour (VIH)",
syphillis_details_not_tracked_in_emr "détails de la syphilis pas suivis dans l'EMR",
DATE_FORMAT(syphiliss_treatment_start_date,'%d/%m/%Y') "33 - Date de début du traitement syphilis",
DATE_FORMAT(syphillis_treatment_end_date,'%d/%m/%Y') "34 - Date de fin du traitement la syphilis",
on_art_for_hiv_prior_to_pregnancy "35 - En soins ARV avant grossesse",
additional_hiv_details_not_in_the_emr "détails supplémentaires  VIH pas suivis dans le EMR",
weight_in_kg "41 - Poids (en Kg)",
height_in_m "42 - Taille (en m)",
upper_arm_circumference "43 - Périmètre Brachial (PB)",
malnutrition_malaria_details_not_in_emr "détails malnutrition et paludisme pas suivis dans le EMR",
malnutrition "44 - malnutrition",
iron_deficiency_anemia "46 - Anémie ferriprive",
malaria "48 - Malaria",
birth_plan "51 - Plan d'accouchement élaboré",
accepts_accompanateur "52 - Acceptation accompagnateur",
enrolled_in_mother_support_group "53 - Inscription club de mères"
from temp_obgyn_visit
order by visit_date desc;
