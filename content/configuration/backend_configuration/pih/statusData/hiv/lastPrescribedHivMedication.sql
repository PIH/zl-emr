# This retrieves all the data about the ARV regimen on the latest order

# set pertinent concept_id
select concept_from_mapping('PIH', '11197'), 'NEW' into @hivDisease, @orderAction
;

select order_type_id into @drugOrder
from order_type ot
where uuid = '131168f4-15f5-102d-96e4-000c29c2a5d7'
;

# Get the encounter for the last order
select o.encounter_id into @encounterId
from orders o
where o.patient_id = @patientId
and o.order_type_id = @drugOrder
and o.order_reason = @hivDisease
and o.order_action = @orderAction
and o.voided = 0
order by o.date_activated desc
limit 1
;

# Get the orders
select group_concat(drugName(do.drug_inventory_id) separator '<br/>') as drugNames
from orders o
join drug_order do on do.order_id = o.order_id
where o.encounter_id = @encounterId
and o.patient_id = @patientId
and o.order_type_id = @drugOrder
and o.order_reason = @hivDisease
and o.order_action = @orderAction
and o.voided = 0
;