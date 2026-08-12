# Get the latest value_coded with dispositionCategory 

select o.value_coded as disposition 
from obs o
where o.obs_id = latest_obs(@patientId, 'PIH', '8620')
and o.voided = 0;