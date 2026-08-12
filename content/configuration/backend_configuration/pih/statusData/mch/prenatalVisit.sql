SELECT
   DATE(MAX(vp.encounter_datetime)) as lastPrenatalVisit,
   COUNT(DISTINCT vp.encounter_id) as numberOfVisits
 
FROM obs o
INNER JOIN encounter e ON o.encounter_id = e.encounter_id
INNER JOIN person p ON p.person_id = o.person_id
LEFT JOIN (
   SELECT  value_coded,person_id,encounter_datetime,e2.encounter_id from obs as o2
   JOIN encounter e2 
   ON e2.encounter_id=o2.encounter_id
   WHERE value_coded =concept_from_mapping('PIH', '6259')
   AND e2.voided=0 
   AND o2.voided =0
 
  )AS vp on vp.person_id =o.person_id AND DATEDIFF(NOW(),vp.encounter_datetime ) <= 270
WHERE o.concept_id= concept_from_mapping('PIH','ESTIMATED DATE OF CONFINEMENT')
  AND DATEDIFF(NOW(),o.value_datetime) <= 270
  AND e.patient_id =   @patientId
  AND e.voided = 0
  AND o.voided = 0
 