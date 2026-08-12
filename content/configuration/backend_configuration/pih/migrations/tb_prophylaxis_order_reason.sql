-- the following selects all Isoniazide orders 
-- except where the order coincides (using end date as the identifying period) 
-- with at least one of the 3 drugs used in cocktails with it
-- these are updated with an order reason = "TB Prophylaxis"

drop temporary table if exists temp_tb_prophylaxis_orders; -- 26814 vs
create temporary table temp_tb_prophylaxis_orders
select o.order_id 
from orders o
where o.concept_id = concept_from_mapping('PIH','ISONIAZID')
and o.order_action = 'NEW' 
and o.voided = 0
and not EXISTS 
	(select 1 from orders o2
	where o2.patient_id = o.patient_id
	and o2.voided = 0
	and o2.date_activated <= COALESCE(o.date_stopped,auto_expire_date)
	and o2.date_stopped >= COALESCE(o.date_stopped,auto_expire_date)
	and o2.order_action = 'NEW' 
		and o2.concept_id IN 
			(concept_from_mapping('PIH','RIFAMPICIN'),
			concept_from_mapping('PIH','ETHAMBUTOL'),
			concept_from_mapping('PIH','PYRAZINAMIDE'),
			concept_from_mapping('PIH','RIFAMPICIN AND ISONIAZID'),
			concept_from_mapping('PIH','RIFAMPICIN ISONIAZID AND ETHAMBUTOL'),
			concept_from_mapping('PIH','RIFAMPICIN ISONIAZID AND PYRAZINAMIDE'),
	 	    concept_from_mapping('PIH','ETHAMBUTOL AND ISONIZAID')
		)
	); 

update orders o
inner join temp_tb_prophylaxis_orders t on t.order_id = o.order_id
set o.order_reason = concept_from_mapping('PIH',14256);
