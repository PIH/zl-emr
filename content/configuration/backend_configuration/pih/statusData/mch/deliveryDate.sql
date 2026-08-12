
SELECT DATE(o.value_datetime) AS estimatedDateOfConfinement
FROM obs o
WHERE o.person_id = @patientId
  AND o.concept_id = concept_from_mapping('PIH', 'ESTIMATED DATE OF CONFINEMENT')
  AND o.voided = 0
  AND o.obs_datetime >= DATE_SUB(NOW(), INTERVAL 270 DAY)
ORDER BY o.obs_datetime DESC
LIMIT 1;