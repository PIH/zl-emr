-- set  @startDate = '2024-02-01';
-- set  @endDate = '2024-02-29';

SET  @locale = GLOBAL_PROPERTY_VALUE('default_locale', 'en');

set  @diagnosis = concept_from_mapping('PIH','3064');


set @cholera = concept_from_mapping('PIH','CHOLERA');
set @diphtheria_probable = concept_from_mapping('PIH','Diphtheria');
set @viral_meningitis = concept_from_mapping('PIH','VIRAL MENINGITIS');
set @bacterial_meningitis = concept_from_mapping('PIH','Bacterial meningitis');
set @paralysie_flasque_aigue = concept_from_mapping('PIH','Acute flassic paralysis');
set @measles = concept_from_mapping('PIH','MEASLES');
set @rubella = concept_from_mapping('PIH','Rubella');
set @hemorrhagic_fever = concept_from_mapping('PIH','Acute hemorrhagic fever');
set @rubeole_congenital = concept_from_mapping('CIEL','139479');
set @hemorrhagic_fever = concept_from_mapping('PIH','Acute hemorrhagic fever');
set @rubeole_congenital = concept_from_mapping('CIEL','139479');
set @animal_suspecte_de_rage = concept_from_mapping('PIH','Bitten by suspected rabid animal');
set @chikungunya_suspect = concept_from_mapping('CIEL','120742');
set @anthrax = concept_from_mapping('PIH','Anthrax');
set @pertussis = concept_from_mapping('PIH','PERTUSSIS');
set @diabetic_arthropathy = concept_from_mapping('CIEL','162491');
set @diabetes_ketoacidosis = concept_from_mapping('CIEL','119441');
set @type_1_diabetes = concept_from_mapping('PIH','Type 1 diabetes');
set @type_2_diabetes = concept_from_mapping('PIH','Type 2 diabetes');
set @gestational_diabetes = concept_from_mapping('PIH','Gestational diabetes');
set @diabetes_insipidus = concept_from_mapping('PIH','DIABETES INSIPIDUS');
set @pre_gestational_diabetes = concept_from_mapping('PIH','Pre-gestational diabetes');
set @diabetes = concept_from_mapping('PIH','DIABETES');
set @iddm = concept_from_mapping('CIEL','137941');
set @dm_type2 = concept_from_mapping('CIEL','119457');
set @diabete = concept_from_mapping('PIH','DIABETES MELLITUS');
set @diarrhee_aigue_aqueuse = concept_from_mapping('CIEL','161887');
set @diarrhee_aigue_sanglante = concept_from_mapping('PIH','Bloody diarrhea');
set @fievre_typhoide_suspecte = concept_from_mapping('PIH','TYPHOID FEVER');
set @hypertension = concept_from_mapping('PIH','HYPERTENSION');
set @hypertensive_crisis = concept_from_mapping('CIEL','161644');
set @hypertensive_heart_disease = concept_from_mapping('PIH','HYPERTENSIVE HEART DISEASE');
set @hypertension_complicating_pregnancy = concept_from_mapping('PIH','Pre-Existing Hypertension Complicating Pregnancy');
set @hypertensive_encephalopathy = concept_from_mapping('CIEL','138197');
set @unspecified_maternal_hypertension = concept_from_mapping('PIH','Unspecified maternal hypertension');
set @gestational_hypertension = concept_from_mapping('CIEL','113859');
set @hypertension_arterielle = concept_from_mapping('CIEL','129484');
set @upper_respiratory_tract_infection = concept_from_mapping('PIH','Upper respiratory tract infection');
set @infection_respiratoire_aigue = concept_from_mapping('PIH','Acute respiratory infections NOS');
set @tetanos = concept_from_mapping('PIH','Tetanus');
set @tetanos_neonatal = concept_from_mapping('PIH','Tetanus Neonatorum');
set @fever_unknown = concept_from_mapping('PIH','Fever of unknown origin');
set @dengue_suspecte = concept_from_mapping('PIH','Dengue');
set @filariose_probable = concept_from_mapping('PIH','Filariasis');
set @ist = concept_from_mapping('PIH','SEXUALLY TRANSMITTED INFECTION');
set @lepre_suspecte = concept_from_mapping('PIH','LEPROSY');
set @malnutrition = concept_from_mapping('PIH','MALNUTRITION');
set @plaudisme = concept_from_mapping('PIH','MALARIA');
set @rage_humaine = concept_from_mapping('PIH','Rabies');
set @syndrome_icterique_febrile = concept_from_mapping('PIH','Icteric febrile syndrome');
set @tuberculose_confirme = concept_from_mapping('PIH','TUBERCULOSIS');
set @vih_confirme = concept_from_mapping('PIH','HUMAN IMMUNODEFICIENCY VIRUS');
set @microcephaly_due_to_zika_virus = concept_from_mapping('PIH','Microcephaly due to Zika virus');
set @microcephalie = concept_from_mapping('PIH','Microcephalus');
set @syndrome_de_guillain_barre = concept_from_mapping('CIEL','139233');
set @zika_suspect = concept_from_mapping('CIEL','122746');



-- first set up a row per-diagnosis table and update all of the relevant properties of each
DROP TEMPORARY TABLE IF EXISTS temp_diagnoses;
CREATE TEMPORARY TABLE temp_diagnoses
(
 patient_id           int(11),      
 encounter_id         int(11),      
 obs_id               int(11),      
 obs_group_id         int(11),
 certainty_concept_id int(11), 
 diagnosis_concept_id int(11),
 age                  int,
 gender               varchar(1),
 hl5 int,
 fl5 int,
 hl14 int,
 fl14 int,
 hl50 int,
 fl50 int,
 hG50  int,
 fG50 int,
 htotal int,
 ftotal int
);

insert into temp_diagnoses (
patient_id,
encounter_id,
obs_id,
obs_group_id,
diagnosis_concept_id
)
select
o.person_id,
o.encounter_id,
o.obs_id,
o.obs_group_id ,
o.value_coded
from obs o
INNER JOIN encounter e ON o.encounter_id = e.encounter_id AND e.voided = 0
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
where concept_id = @diagnosis
AND o.voided = 0
AND ((date(o.obs_datetime) >=@startDate) or @startDate is null)
AND ((date(o.obs_datetime) <=@endDate)  or @endDate is null)
AND v.location_id = @location
and o.value_coded in (
@cholera,
@diphtheria_probable,
@viral_meningitis,
@bacterial_meningitis,
@paralysie_flasque_aigue,
@measles,
@rubella,
@hemorrhagic_fever,
@rubeole_congenital,
@hemorrhagic_fever,
@rubeole_congenital,
@animal_suspecte_de_rage,
@chikungunya_suspect,
@anthrax,
@pertussis,
@diabetic_arthropathy,
@diabetes_ketoacidosis,
@type_1_diabetes,
@type_2_diabetes,
@gestational_diabetes,
@diabetes_insipidus,
@pre_gestational_diabetes,
@diabetes,
@iddm,
@dm_type2,
@diabete,
@diarrhee_aigue_aqueuse,
@diarrhee_aigue_sanglante,
@fievre_typhoide_suspecte,
@hypertension,
@hypertensive_crisis,
@hypertensive_heart_disease,
@hypertension_complicating_pregnancy,
@hypertensive_encephalopathy,
@unspecified_maternal_hypertension,
@gestational_hypertension,
@hypertension_arterielle,
@upper_respiratory_tract_infection,
@infection_respiratoire_aigue,
@tetanos,
@tetanos_neonatal,
@fever_unknown,
@dengue_suspecte,
@filariose_probable,
@ist,
@lepre_suspecte,
@malnutrition,
@plaudisme,
@rage_humaine,
@syndrome_icterique_febrile,
@tuberculose_confirme,
@vih_confirme,
@microcephaly_due_to_zika_virus,
@microcephalie,
@syndrome_de_guillain_barre,
@zika_suspect);

create index temp_diagnoses_p on temp_diagnoses(patient_id);
create index temp_diagnoses_ogi on temp_diagnoses(obs_group_id);

-- patient level info
DROP TEMPORARY TABLE IF EXISTS temp_dx_patient;
CREATE TEMPORARY TABLE temp_dx_patient
(
patient_id               int(11),      
gender                   varchar(50),  
age                      int     
);
   
insert into temp_dx_patient(patient_id)
select distinct patient_id from temp_diagnoses;

create index temp_dx_patient_pi on temp_dx_patient(patient_id);

update temp_dx_patient set gender = gender(patient_id);

update temp_dx_patient t
set age = round(current_age_in_years(t.patient_id));

update temp_diagnoses t
inner join temp_dx_patient d on d.patient_id = t.patient_id
set t.age = d.age,
	t.gender = d.gender;

set @certainty = concept_from_mapping('PIH','1379');
set @confirmed = concept_from_mapping('PIH','1345');
set @presumed = concept_from_mapping('PIH','1346');
 -- diagnosis info
DROP TEMPORARY TABLE IF EXISTS temp_obs;
create temporary table temp_obs 
select o.obs_id, o.voided ,o.obs_group_id , o.encounter_id, o.person_id, o.concept_id, o.value_coded, o.value_numeric, o.value_text,o.value_datetime, o.value_coded_name_id ,o.comments 
from obs o
inner join temp_diagnoses t on t.obs_group_id = o.obs_group_id 
where o.voided = 0
and o.concept_id = @certainty;
create index temp_obs_ogi on temp_obs(obs_group_id);

update temp_diagnoses t
inner join temp_obs o on o.obs_group_id = t.obs_group_id 
set t.certainty_concept_id = o.value_coded;

update temp_diagnoses t
set hl5 = if(gender = 'M',if(age < 5, 1,0),0),
	fl5 = if(gender = 'F',if(age < 5, 1,0),0),
	hl14 = if(gender = 'M',if(age < 14, if(age>= 5,1,0),0),0),
	fl14 = if(gender = 'F',if(age < 14, if(age>= 5,1,0),0),0),	
	hl50 = if(gender = 'M',if(age < 50, if(age>= 14,1,0),0),0),
	fl50 = if(gender = 'F',if(age < 50, if(age>= 14,1,0),0),0),	
	hg50 = if(gender = 'M',if(age >= 50, 1,0),0),
	fg50 = if(gender = 'F',if(age >= 50, 1,0),0),
	htotal = if(gender = 'M',1,0),
	ftotal = if(gender = 'F',1,0);

-- reformat to be a row-per diagnoses aggregated into the categories
drop temporary table if exists temp_output;
create temporary table temp_output
(dx text,
hl5 int,
fl5 int,
hl14 int,
fl14 int,
hl50 int,
fl50 int,
hG50  int,
fG50 int,
htotal int,
ftotal int);

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Cholera Suspecte',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id = @cholera
and certainty_concept_id = @confirmed
group by 1
;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Cholera Suspecte',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id = @cholera
and certainty_concept_id = @presumed
group by 1
;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Diphtheria Probable',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id = @diphtheria_probable
group by 1
;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Meningite Suspecte',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@viral_meningitis, @bacterial_meningitis)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Paralysie Flasque Aigue',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id = @paralysie_flasque_aigue
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Rougeole/Rubeole Suspecte',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@measles, @rubella)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Syndrome de Fievre Hemorragique Aigue',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@hemorrhagic_fever)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Syndrome Rubeole Congenital',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@rubeole_congenital)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Syndrome Rubeole Congenital',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@animal_suspecte_de_rage)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Chikungunya Suspect',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@chikungunya_suspect)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Charbon Cutane Suspect',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@anthrax)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Coqueluche Suspecte',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@pertussis)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Diabete',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@diabetic_arthropathy,
	@diabetes_ketoacidosis,
	@type_1_diabetes,
	@type_2_diabetes,
	@gestational_diabetes,
	@diabetes_insipidus,
	@pre_gestational_diabetes,
	@diabetes,
	@iddm,
	@dm_type2,
	@diabete)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Diarrhee Aigue Aqueuse',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@diarrhee_aigue_aqueuse)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Diarrhee Aigue Sanglante',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@diarrhee_aigue_sanglante)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Fievre Typhoide Suspecte',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@fievre_typhoide_suspecte)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Hypertension Arterielle (HTA)',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@hypertension,
	@hypertensive_crisis,
	@hypertensive_heart_disease,
	@hypertension_complicating_pregnancy,
	@hypertensive_encephalopathy,
	@unspecified_maternal_hypertension,
	@gestational_hypertension,
	@hypertension_arterielle)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Infection Respiratoire Aigue',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@upper_respiratory_tract_infection)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Tetanos',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@tetanos)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Tetanos Neonatal',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@tetanos_neonatal)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Autre Fievre a investiguer (D''Origine indeterminee)',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@fever_unknown)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Dengue Suspecte',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@dengue_suspecte)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Filariose Probable',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@filariose_probable)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Infection Sexuellement Transmissable (IST)',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@ist)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Lepre Suspecte',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@lepre_suspecte)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Malnutrition',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@malnutrition)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Microcéphalie',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id in (@microcephaly_due_to_zika_virus,@microcephalie)
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Paludisme Suspect',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id = @plaudisme
and certainty_concept_id = @presumed
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Paludisme Confirme',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id = @plaudisme
and certainty_concept_id = @confirmed
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Rage Humaine',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id = @rage_humaine
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Syndrome de Guillain Barré',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id = @syndrome_de_guillain_barre
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Tuberculose Confirme (TPM+)',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id = @tuberculose_confirme
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'VIH Confirme',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id = @vih_confirme
group by 1;

insert into temp_output(dx,hl5,fl5,hl14,fl14,hl50,fl50,hG50,fG50,htotal,ftotal)
Select
'Zika suspect',SUM(hl5), SUM(fl5), SUM(hl14),SUM(fl14), SUM(hl50), SUM(fl50), SUM(hG50),SUM(fG50), SUM(htotal), SUM(ftotal)
from temp_diagnoses t
where diagnosis_concept_id = @zika_suspect
group by 1;

-- set up a list (in order) of diagnoses to be listed in final output
-- *note this step is required to join with the previously-built table so rows are not skipped for diagnoses with no results
drop temporary table if exists temp_dx_list;
create temporary table temp_dx_list
(output_order int,
dx text);

insert into temp_dx_list(output_order,dx)
values
(1,'Cholera Suspecte'),
(2,'Cholera Probable'),
(3,'Diphtheria Probable'),
(4,'Meningite Suspecte'),
(5,'Paralysie Flasque Aigue'),
(6,'Rougeole/Rubeole Suspecte'),
(7,'Syndrome de Fievre Hemorragique Aigue'),
(8,'Syndrome Rubeole Congenital'),
(9,'Agression Par Animal Suspecte de Rage'),
(10,'Evenement Supposes Etre Attribuables a la vaccination et a l''immunisation (Esavi)'),
(11,'Mortalite Maternelle'),
(12,'Peste Suspecte'),
(13,'Toxi-Infection Alimentaire Collective (TIAC)'),
(14,'Tout Phenomene Inhabituel'),
(15,'Chikungunya Suspect'),
(16,'Charbon Cutane Suspect'),
(17,'Coqueluche Suspecte'),
(18,'Diabete'),
(19,'Diarrhee Aigue Aqueuse'),
(20,'Diarrhee Aigue Sanglante'),
(21,'Fievre Typhoide Suspecte'),
(22,'Hypertension Arterielle (HTA)'),
(23,'Infection Respiratoire Aigue'),
(24,'Tetanos'),
(25,'Tetanos Neonatal'),
(26,'Autre Fievre a investiguer (D''Origine indeterminee)'),
(27,'Dengue Suspecte'),
(28,'Filariose Probable'),
(29,'Infection Sexuellement Transmissable (IST)'),
(30,'Lepre Suspecte'),
(31,'Malnutrition'),
(32,'Microcéphalie'),
(33,'Paludisme Suspect'),
(34,'Paludisme Teste'),
(35,'Paludisme cas Teste'),
(36,'Paludisme Confirme'),
(37,'Paludisme Traite'),
(38,'Rage Humaine'),
(39,'Syndrome de Guillain Barré'),
(40,'Syndrome Icterique Febrile'),
(41,'Tuberculose Confirme (TPM+)'),
(42,'VIH Confirme'),
(43,'Zika femme enceintes'),
(44,'Zika suspect'),
(45,'Autres Cas VUS Avec D''Autres Conditions')
;

select  
l.dx "PHENOMENES MORBIDES OU NON MORBIDES",
IFNULL(hl5,0) "H<5",
IFNULL(fl5,0) "F<5",
IFNULL(hl14,0) "H 5-14",
IFNULL(fl14,0) "F 5-14",
IFNULL(hl50,0) "H 15-50",
IFNULL(fl50,0) "F 15-50",
IFNULL(hG50,0)  "H>50",
IFNULL(fG50,0) "F>50",
IFNULL(htotal,0) "H Total",
IFNULL(ftotal,0) "F Total"
from temp_dx_list l
left outer join temp_output o on o.dx = l.dx
order by l.output_order; 

/*
The following daignoses/rows do not seem to be captured in the EMR:

- Evenement Supposes Etre Attribuables a la vaccination et a l'immunisation (Esavi)
- Mortalite Maternelle
- Peste Suspecte
- Toxi-Infection Alimentaire Collective (TIAC)
- Tout Phenomene Inhabituel
- Paludisme Teste
- Paludisme cas Teste
- Zika femme enceintes
- Autres Cas VUS Avec D'Autres Conditions
 */
