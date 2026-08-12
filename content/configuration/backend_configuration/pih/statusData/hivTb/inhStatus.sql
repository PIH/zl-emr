# This retrieves all of the data points needed to provide information as to the INH Prophylaxis for the patient

select concept_from_mapping('PIH', '2739') into @currentIsoniazidConstructConceptId;
select concept_from_mapping('PIH', '1501') into @isoniazidConstructConceptId;

select      o.encounter_id into @encounterId
from        obs o
join        encounter e on e.encounter_id=o.encounter_id
where       e.patient_id =@patientId
and         o.voided = 0
and         o.concept_id = @isoniazidConstructConceptId
order by    o.obs_datetime desc
limit 1;

select      o.encounter_id into @currentEncounterId
from        obs o
join        encounter e on e.encounter_id=o.encounter_id
where       e.patient_id =@patientId
and         o.voided = 0
and         o.concept_id = @currentIsoniazidConstructConceptId
order by    o.obs_datetime desc
limit 1;

select obs_from_group_id_value_datetime(obs_group_id_of_value_coded(ifnull(@currentEncounterId,@encounterId), 'PIH',if(@currentEncounterId > 0,'2289','1282'), 'PIH','656'), 'PIH',if(@currentEncounterId > 0,'11131','1190')) into @startDate; 

select obs_from_group_id_value_datetime(obs_group_id_of_value_coded(ifnull(@currentEncounterId,@encounterId), 'PIH',if(@currentEncounterId > 0,'2289','1282'), 'PIH','656'), 'PIH',if(@currentEncounterId > 0,'12748','1191')) into @endDate; 

select o.date_activated,o.auto_expire_date into @dateActivated,@autoExpireDate from orders o where o.order_reason = concept_from_mapping('PIH','14256')
and o.patient_id = @patientId 
and o.voided = 0
order by o.date_created desc
limit 1;


SELECT
    CASE 
        WHEN @dateActivated IS NOT NULL AND @startdate IS NOT NULL THEN
            CASE 
                WHEN @dateActivated > @startdate THEN @dateActivated
                ELSE @startdate
            END
        WHEN @dateActivated IS NOT NULL THEN @dateActivated
        WHEN @startdate IS NOT NULL THEN @startdate
        ELSE NULL 
    END INTO @start;


SELECT
    CASE 
        WHEN @dateActivated IS NOT NULL AND @startdate IS NOT NULL THEN
            CASE 
                WHEN @dateActivated > @startdate THEN @autoExpireDate
                ELSE @endDate
            END
        WHEN @dateActivated IS NOT NULL THEN @autoExpireDate
        WHEN @startdate IS NOT NULL THEN @endDate
        ELSE NULL 
    END INTO @end;

select
    date(@start) as startDate,
    date(@end) as endDate,
    if(@end > now(), 0, 1) as isCompleted,
    if(@start > now(), 'future', if(@end > now(), 'active', 'completed')) as status,
    datediff(ifnull(@end, now()),@start)+1 as duration;