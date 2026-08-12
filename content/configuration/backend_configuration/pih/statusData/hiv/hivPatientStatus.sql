
SELECT pp.outcome_concept_id into @outcomeConceptId from  patient_program pp 
WHERE pp.patient_id =@patientId
order by pp.date_created  desc limit 1 ;

SELECT DISTINCT pp.date_completed into @patientProgramDate
FROM patient_program pp 
WHERE pp.patient_id=@patientId
order by pp.date_created desc limit 1
;

select value_datetime(latestObs(@patientId, concept_from_mapping('PIH','5096'),null))  into @nextDispensingDate;
select program_id into @hivProgramId from program where uuid='b1cb1fc1-5190-4f7a-af08-48870975dafc';
select  programStartDate( patientProgramId(@patientId, @hivProgramId,NOW())) into @enrollmentDate;
select program_workflow_id  into @hivTreatmentWorkflow  from program_workflow pw where concept_id = concept_from_mapping('PIH','11449') and retired = 0;

select currentProgramState(patientProgramId(@patientId, @hivProgramId,NOW()), @hivTreatmentWorkflow,@locale) into @currentStatus;

-- noinspection SqlDialectInspection
SELECT
    CASE 
        WHEN @patientProgramDate is not null or @outcomeConceptId is not null then concept_name(@outcomeConceptId,@locale)
        WHEN DATEDIFF(NOW(), COALESCE(@nextDispensingDate,@enrollmentDate)) <= 28 THEN 'active_on_arvs'
        WHEN DATEDIFF(NOW(), COALESCE(@nextDispensingDate,@enrollmentDate)) >= 28 AND @currentStatus IS NOT NULL THEN @currentStatus
        ELSE 'ltfu' 
    END into @status;

SELECT @status AS Status;