CALL initialize_global_metadata();
SET  @locale = GLOBAL_PROPERTY_VALUE('default_locale', 'en');
SET @endDate = ADDDATE(@endDate, INTERVAL 1 DAY);
SET @type_of_delivery_concept_id = concept_from_mapping('PIH','11663');
SET @diagnosis_concept_id = concept_from_mapping('PIH','3064');
SET @delivery_date_concept_id = concept_from_mapping('PIH','5599');

-- Acceptation methode moderne contraception
SELECT
    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25<25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","13249") 
   ,1,0)),
    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25<25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","13248") 
   ,1,0)),
   
    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25<25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","907") 
   ,1,0)),
   
    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25<25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","12106") 
   ,1,0)),
   
    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25<25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","5275") 
   ,1,0)),
   
    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25<25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","190") 
   ,1,0)),
   
    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25<25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","13158") 
   ,1,0)),
   
    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25<25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","5277") 
   ,1,0)),
   
    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25<25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","1719") 
   ,1,0)),


    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25>=25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","13249") 
   ,1,0)),
   
    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25>=25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","13248") 
   ,1,0)),
   
    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25>=25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","907") 
   ,1,0)),
   
    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25>=25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","12106") 
   ,1,0)),
   
    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25>=25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","5275") 
   ,1,0)),
   
    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25>=25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","190") 
   ,1,0)),
   
    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25>=25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","13158") 
   ,1,0)),
   
    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25>=25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","5277") 
   ,1,0)),
   
    SUM(IF(DATEDIFF(e.encounter_datetime, p.birthdate)/365.25>=25
   AND planing_service_status.value_coded=concept_from_mapping("PIH","13958")
    AND planing_method.value_coded=concept_from_mapping("PIH","1719") 
   ,1,0))
    INTO
          @MET_COC_LESS_THAN_25_ACCEPTED,@MET_COP_LESS_THAN_25_ACCEPTED,@MET_DEPO_PROVERA_LESS_THAN_25_ACCEPTED,@MET_IMPL_LESS_THAN_25_ACCEPTED,@MET_DIU_LESS_THAN_25_ACCEPTED,@MET_CONDOM_LESS_THAN_25_ACCEPTED,@MET_MAMA_LESS_THAN_25_ACCEPTED,@MET_COLLIER_LESS_THAN_25_ACCEPTED,@MET_CCV_LESS_THAN_25_ACCEPTED,
          @MET_COC_MORE_25_ACCEPTED,@MET_COP_MORE_25_ACCEPTED,@MET_DEPO_PROVERA_MORE_25_ACCEPTED,@MET_IMPL_MORE_25_ACCEPTED,@MET_DIU_USED_MORE_25_ACCEPTED,@MET_CONDOM_MORE_25_ACCEPTED,@MET_MAMA_MORE_25_ACCEPTED,@MET_COLLIER_MORE_25_ACCEPTED,@MET_CCV_MORE_25_ACCEPTED
    FROM
    obs o
   INNER JOIN encounter e ON o.encounter_id = e.encounter_id
   INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
   INNER JOIN person p ON p.person_id = o.person_id
   LEFT JOIN (
	    SELECT encounter_id, value_coded
	    FROM obs
	    WHERE concept_id = concept_from_mapping("PIH", "374")  AND voided = 0)
	    AS planing_method ON o.encounter_id = planing_method.encounter_id
    LEFT JOIN (
	    SELECT encounter_id, value_coded
	    FROM obs
	    WHERE concept_id = concept_from_mapping("PIH", "14321") AND voided = 0 ) AS planing_service_status ON o.encounter_id = planing_service_status.encounter_id
    WHERE 
    o.value_coded in (concept_from_mapping("PIH", "13254"),concept_from_mapping("PIH", "6259"),concept_from_mapping("PIH", "6261"), concept_from_mapping("PIH", "5483"))
    AND e.voided = 0
    AND o.voided = 0
    AND DATE(e.encounter_datetime) >= @startDate
    AND DATE(e.encounter_datetime) < @endDate
    AND v.location_id = @location;

  SELECT 
  SUM(IF( planing_method.value_coded=concept_from_mapping("PIH","1719") 
   ,1,0)),
   SUM(IF( planing_method.value_coded=concept_from_mapping("PIH","12106") 
   ,1,0)),

     SUM(IF(planing_method.value_coded=concept_from_mapping("PIH","5275") 
   ,1,0))

    INTO
      @MET_CCV,@MET_IMPL,@MET_DIU

    FROM
    obs o
   INNER JOIN encounter e ON o.encounter_id = e.encounter_id
   INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
   INNER JOIN person p ON p.person_id = o.person_id
   LEFT JOIN (
	    SELECT encounter_id, value_coded
	    FROM obs
	    WHERE concept_id =  concept_from_mapping("PIH", "374")  AND voided = 0)
	    AS planing_method ON o.encounter_id = planing_method.encounter_id
    WHERE 
    o.value_coded in (concept_from_mapping("PIH", "13254"),concept_from_mapping("PIH", "6259"),concept_from_mapping("PIH", "6261"), concept_from_mapping("PIH", "5483"))
    AND e.voided = 0
    AND o.voided = 0
    AND DATE(e.encounter_datetime) >= @startDate
    AND DATE(e.encounter_datetime) < @endDate
    AND v.location_id = @location;


-- NUMBER 0F CONDOMS DONATED
  SELECT 
     SUM(nb_of_condoms.value_numeric)
    INTO
      @NB_OF_CONDOMS
    FROM
    obs o
   INNER JOIN encounter e ON o.encounter_id = e.encounter_id
   INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
   INNER JOIN person p ON p.person_id = o.person_id
   LEFT JOIN (
	    SELECT encounter_id, value_numeric  
	    FROM obs
	    WHERE concept_id =  concept_from_mapping("PIH", "20151")  AND voided = 0)
	    AS nb_of_condoms ON o.encounter_id = nb_of_condoms.encounter_id
    WHERE 
    o.value_coded in (concept_from_mapping("PIH", "13254"),concept_from_mapping("PIH", "6259"),concept_from_mapping("PIH", "6261"), concept_from_mapping("PIH", "5483"))
    AND e.voided = 0
    AND o.voided = 0
    AND DATE(e.encounter_datetime) >= @startDate
    AND DATE(e.encounter_datetime) < @endDate
    AND v.location_id = @location;

-- B1 Prenatal consultation
SELECT
       SUM(CASE
            WHEN  o.value_coded = concept_from_mapping("PIH","10900")
            THEN 1 ELSE 0 END),
    SUM(CASE
            WHEN o.value_coded = concept_from_mapping("PIH","10901")
            THEN 1 ELSE 0 END),
    SUM(CASE
            WHEN o.value_coded = concept_from_mapping("PIH","10902")
            THEN 1 ELSE 0 END),
    SUM(CASE
            WHEN  o.concept_id = concept_from_mapping("PIH","14390")
            AND o.value_numeric IS NULL
            THEN 1 ELSE 0 END),
    SUM(CASE
            WHEN o.concept_id =  concept_from_mapping("PIH","11672")
            AND o.value_coded = concept_from_mapping("PIH","1065")
            THEN 1 ELSE 0 END),
    SUM(CASE
            WHEN o.concept_id = concept_from_mapping("PIH","2169") 
            and o.value_coded = concept_from_mapping("PIH","703")
            THEN 1 ELSE 0 END),
    SUM(CASE
            WHEN o.concept_id = concept_from_mapping("PIH","3267")
            AND  o.value_datetime IS NOT NULL
            THEN 1 ELSE 0 END)
INTO  @ANC_1ST_VISIT_T1,@ANC_1ST_VISIT_T2,@ANC_1ST_VISIT_T3,@ANC_1ST_VISIT_GA_UNK,@ANC_1ST_VISIT_HIV_TESTED,@ANC_1ST_VISIT_HIV_POS,@ANC_1ST_VISIT_SYPH_TESTED
FROM encounter e
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN (
    SELECT
        e.encounter_id
    FROM encounter e
    INNER JOIN obs o_pn
        ON o_pn.encounter_id = e.encounter_id
        AND o_pn.value_coded = concept_from_mapping('PIH','6259')
        AND o_pn.voided = 0
    INNER JOIN obs o_nv
        ON o_nv.encounter_id = e.encounter_id
        AND o_nv.value_coded = concept_from_mapping('PIH','13235')
        AND o_nv.voided = 0
    INNER JOIN (
        SELECT
            o.person_id,
            MAX(e.encounter_datetime) AS last_enc_datetime
        FROM encounter e
        INNER JOIN obs o
            ON o.encounter_id = e.encounter_id
        INNER JOIN obs o2
            ON o2.encounter_id = e.encounter_id
        WHERE
            o.value_coded = concept_from_mapping('PIH','6259')
            AND o2.value_coded = concept_from_mapping('PIH','13235')
            AND o.voided = 0
            AND o2.voided = 0
            AND e.voided = 0
            AND e.encounter_datetime IS NOT NULL
        GROUP BY o.person_id
    ) last_enc
        ON last_enc.person_id = o_pn.person_id
       AND last_enc.last_enc_datetime = e.encounter_datetime
        and e.voided = 0
        and o_pn.voided =0
        AND e.encounter_datetime >=  @startDate
	    AND e.encounter_datetime <   @endDate
       GROUP BY o_pn.person_id
) last_encounters
    ON last_encounters.encounter_id = e.encounter_id
INNER JOIN obs o 
    ON o.encounter_id = e.encounter_id
INNER JOIN person p 
    ON p.person_id = e.patient_id
    AND o.voided = 0
    AND e.voided = 0
    WHERE  e.encounter_datetime >=  @startDate
	AND e.encounter_datetime <   @endDate
	AND v.location_id = @location;


SELECT
    SUM(CASE WHEN followup_number = 1 AND trimestre='Trim1' THEN 1 ELSE 0 END),
    SUM(CASE WHEN followup_number = 2 AND trimestre='Trim1' THEN 1 ELSE 0 END),
    SUM(CASE WHEN followup_number = 3 AND trimestre='Trim1' THEN 1 ELSE 0 END) ,
    SUM(CASE WHEN followup_number >= 4 AND trimestre='Trim1' THEN 1 ELSE 0 END),
    
    SUM(CASE WHEN followup_number = 1 AND trimestre='Trim2' THEN 1 ELSE 0 END),
    SUM(CASE WHEN followup_number = 2 AND trimestre='Trim2' THEN 1 ELSE 0 END),
    SUM(CASE WHEN followup_number = 3 AND trimestre='Trim2' THEN 1 ELSE 0 END),
    SUM(CASE WHEN followup_number >= 4 AND trimestre='Trim2' THEN 1 ELSE 0 END),

    SUM(CASE WHEN followup_number = 1 AND trimestre='Trim3' THEN 1 ELSE 0 END),
    SUM(CASE WHEN followup_number = 2 AND trimestre='Trim3' THEN 1 ELSE 0 END),
    SUM(CASE WHEN followup_number = 3 AND trimestre='Trim3' THEN 1 ELSE 0 END),
    SUM(CASE WHEN followup_number >= 4 AND trimestre='Trim3' THEN 1 ELSE 0 END)
    
    INTO  @ANC_SV_0_3M,@ANC_TV_0_3M,@ANC_FV_0_3M,@ANC_5PLUS_0_3M,
    	  @ANC_SV_4_6M,@ANC_TV_4_6M,@ANC_FV_4_6M,@ANC_5PLUS_4_6M,
    	  @ANC_SV_7_9M,@ANC_TV_7_9M,@ANC_FV_7_9M,@ANC_5PLUS_7_9M
FROM (
    SELECT
        fs.patient_id,
        fs.encounter_id,
         COUNT(
			  CASE 
			    WHEN o_suivi_prev.encounter_id IS NOT NULL 
			     AND o_pn_prev.encounter_id IS NOT NULL 
			    THEN 1 
			  END
			) + 1 AS followup_number,
        CASE
            WHEN o_trimester.value_coded = concept_from_mapping('PIH','10900') THEN 'Trim1'
            WHEN o_trimester.value_coded = concept_from_mapping('PIH','10901') THEN 'Trim2'
            WHEN o_trimester.value_coded = concept_from_mapping('PIH','10902') THEN 'Trim3'
        END AS trimestre
    FROM encounter fs
    INNER JOIN visit v_fs ON fs.visit_id = v_fs.visit_id AND v_fs.voided = 0
    INNER JOIN obs o_suivi
        ON o_suivi.encounter_id = fs.encounter_id
        AND o_suivi.value_coded = concept_from_mapping('PIH','7383')
        AND o_suivi.voided = 0
    INNER JOIN obs o_pn
        ON o_pn.encounter_id = fs.encounter_id
        AND o_pn.value_coded = concept_from_mapping('PIH','6259')
        AND o_pn.voided = 0
    INNER JOIN obs o_trimester
        ON o_trimester.encounter_id = fs.encounter_id
        AND o_trimester.value_coded IN (
            concept_from_mapping('PIH','10900'),
            concept_from_mapping('PIH','10901'),
            concept_from_mapping('PIH','10902')
        )
        AND o_trimester.voided = 0
    INNER JOIN (
        SELECT
            e.patient_id,
            MAX(e.encounter_datetime) AS last_new_visit_date
        FROM encounter e
        INNER JOIN obs o_pn2
            ON o_pn2.encounter_id = e.encounter_id
            AND o_pn2.value_coded = concept_from_mapping('PIH','6259')
            AND o_pn2.voided = 0
        INNER JOIN obs o_nv
            ON o_nv.encounter_id = e.encounter_id
            AND o_nv.value_coded = concept_from_mapping('PIH','13235')
            AND o_nv.voided = 0
        WHERE e.voided = 0
        GROUP BY e.patient_id
    ) last_nv
        ON last_nv.patient_id = fs.patient_id
    LEFT JOIN encounter fs_prev
        ON fs_prev.patient_id = fs.patient_id
        AND fs_prev.encounter_datetime > last_nv.last_new_visit_date
        AND fs_prev.encounter_datetime < fs.encounter_datetime
        AND fs_prev.encounter_datetime >=   @startDate
        AND fs_prev.encounter_datetime <    @endDate
        AND fs_prev.voided = 0
    LEFT JOIN obs o_suivi_prev
        ON o_suivi_prev.encounter_id = fs_prev.encounter_id
        AND o_suivi_prev.value_coded = concept_from_mapping('PIH','7383')
        AND fs_prev.encounter_datetime >=   @startDate
        AND fs_prev.encounter_datetime <    @endDate
        AND o_suivi_prev.voided = 0
    LEFT JOIN obs o_pn_prev
        ON o_pn_prev.encounter_id = fs_prev.encounter_id
        AND o_pn_prev.value_coded = concept_from_mapping('PIH','6259')
        AND fs_prev.encounter_datetime >=   @startDate
        AND fs_prev.encounter_datetime <    @endDate
        AND o_pn_prev.voided = 0
    WHERE fs.encounter_datetime > last_nv.last_new_visit_date
      AND fs.encounter_datetime >=  @startDate
      AND fs.encounter_datetime <   @endDate
      AND fs.voided = 0
      AND v_fs.location_id = @location
    GROUP BY fs.patient_id, fs.encounter_id, o_trimester.value_coded
) x;

-- Number of pregnant women with an estimated due date (EDD) for the month of the report
SELECT 
COUNT(x.person_id ) INTO @ANC_DPA_MONTH
FROM (
SELECT o.person_id FROM encounter e
INNER JOIN obs o on o.encounter_id =e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN (
        SELECT
            e.patient_id,e.encounter_id ,
            MAX(e.encounter_datetime) AS last_new_visit_date
        FROM encounter e
        INNER JOIN obs o_pn2
            ON o_pn2.encounter_id = e.encounter_id
            AND o_pn2.value_coded = concept_from_mapping('PIH','6259')
            AND o_pn2.voided = 0
        INNER JOIN obs o_nv
            ON o_nv.encounter_id = e.encounter_id
            AND o_nv.value_coded = concept_from_mapping('PIH','13235')
            AND o_nv.voided = 0
        WHERE e.voided = 0
        GROUP BY e.patient_id
    ) last_nv
        ON last_nv.patient_id = e.patient_id
WHERE
 e.encounter_datetime = last_nv.last_new_visit_date
 AND e.encounter_datetime >= @startDate
 AND e.encounter_datetime <  @endDate
 AND o.voided =0
 AND e.voided =0
 AND o.concept_id =concept_from_mapping('PIH','5596')
 AND v.location_id = @location
 GROUP BY o.person_id
 )x;

-- # of high-risk pregnancies
SELECT COUNT(x.person_id ) INTO @ANC_PREG_HR_CONDITIONS
 FROM (
    SELECT o.person_id FROM encounter e 
    INNER JOIN obs o on o.encounter_id =e.encounter_id
    INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
    INNER JOIN (
            SELECT
                e.patient_id,e.encounter_id ,
                MAX(e.encounter_datetime) AS last_new_visit_date
            FROM encounter e
            INNER JOIN obs o_pn2
                ON o_pn2.encounter_id = e.encounter_id
                AND o_pn2.value_coded = concept_from_mapping('PIH','6259')
                AND o_pn2.voided = 0
            INNER JOIN obs o_nv
                ON o_nv.encounter_id = e.encounter_id
                AND o_nv.value_coded = concept_from_mapping('PIH','13235')
                AND o_nv.voided = 0
            WHERE e.voided = 0
            GROUP BY e.patient_id
        ) last_nv
            ON last_nv.patient_id = e.patient_id
    WHERE
    e.encounter_datetime   >= last_nv.last_new_visit_date
    AND e.encounter_datetime >=  @startDate
    AND e.encounter_datetime <  @endDate
    AND o.voided =0
    AND e.voided =0
    AND o.concept_id =concept_from_mapping('PIH','11673')
    AND v.location_id = @location
    GROUP BY o.person_id
 )x;

-- # of pregnant women who had their first visit since October during the month of the report.
 SELECT COUNT(x.person_id ) INTO  @ANC_1ST_VISIT_SINCE_OCT_MONTH
  FROM (
    SELECT o.person_id FROM encounter e 
    INNER JOIN obs o on o.encounter_id =e.encounter_id
    INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
    INNER JOIN (
            SELECT
                e.patient_id,e.encounter_id ,
                MAX(e.encounter_datetime) AS last_new_visit_date
            FROM encounter e
            INNER JOIN obs o_pn2
                ON o_pn2.encounter_id = e.encounter_id
                AND o_pn2.value_coded = concept_from_mapping('PIH','6259')
                AND o_pn2.voided = 0
            INNER JOIN obs o_nv
                ON o_nv.encounter_id = e.encounter_id
                AND o_nv.value_coded = concept_from_mapping('PIH','13235')
                AND o_nv.voided = 0
            WHERE e.voided = 0
            GROUP BY e.patient_id
        ) last_nv
            ON last_nv.patient_id = e.patient_id
    WHERE
    e.encounter_datetime = last_nv.last_new_visit_date
    AND e.encounter_datetime >=  @startDate
    AND e.encounter_datetime <  @endDate
    AND o.voided =0
    AND e.voided =0
    AND o.value_coded = concept_from_mapping('PIH','6259')
    AND v.location_id = @location
    GROUP BY o.person_id
 )x;

-- number of pregnant women who received iron during prenatal visits (ferrous sulfate, iron, iron dextran)
SELECT COUNT(x.person_id ) INTO  @ANC_PREG_IRON_SUPP_COUNT
    FROM (
    SELECT o.person_id FROM encounter e
    INNER JOIN obs o on o.encounter_id =e.encounter_id
    INNER JOIN orders o2 on o2.encounter_id = e.encounter_id
    INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
    INNER JOIN (
            SELECT
                e.patient_id,e.encounter_id ,
                MAX(e.encounter_datetime) AS last_new_visit_date
            FROM encounter e
            INNER JOIN obs o_pn2
                ON o_pn2.encounter_id = e.encounter_id
                AND o_pn2.value_coded = concept_from_mapping('PIH','6259')
                AND o_pn2.voided = 0
            INNER JOIN obs o_nv
                ON o_nv.encounter_id = e.encounter_id
                AND o_nv.value_coded = concept_from_mapping('PIH','13235')
                AND o_nv.voided = 0
            WHERE e.voided = 0
            GROUP BY e.patient_id
        ) last_nv
            ON last_nv.patient_id = e.patient_id
    WHERE
    e.encounter_datetime >= last_nv.last_new_visit_date
    AND e.encounter_datetime >=  @startDate
    AND e.encounter_datetime <  @endDate
    AND o.voided =0
    AND e.voided =0
    AND o.value_coded = concept_from_mapping('PIH','6259')
    and o2.concept_id in (concept_from_mapping('PIH','256'),concept_from_mapping('PIH','9267'))
    AND o2.voided =0
    AND v.location_id = @location
    GROUP BY o.person_id
  )x;




-- #Total number of women seen at their first postnatal visit during the reporting month
  SELECT
       COUNT(*)
   INTO @PNC_1ST_VISIT_TOTAL
FROM encounter e
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN (
    SELECT
        e.encounter_id
    FROM encounter e
    INNER JOIN obs o_pn
        ON o_pn.encounter_id = e.encounter_id
        AND o_pn.value_coded =  concept_from_mapping('PIH','6261')
        AND o_pn.voided = 0
    INNER JOIN obs o_nv
        ON o_nv.encounter_id = e.encounter_id
        AND o_nv.value_coded =  concept_from_mapping('PIH','13235')
        AND o_nv.voided = 0
    INNER JOIN (
        SELECT
            o.person_id,
            MAX(e.encounter_datetime) AS last_enc_datetime
        FROM encounter e
        INNER JOIN obs o
            ON o.encounter_id = e.encounter_id
        INNER JOIN obs o2
            ON o2.encounter_id = e.encounter_id
        WHERE
            o.value_coded = concept_from_mapping('PIH','6261')
            AND o2.value_coded = concept_from_mapping('PIH','13235')
            AND o.voided = 0
            AND o2.voided = 0
            AND e.voided = 0
            AND e.encounter_datetime IS NOT NULL
        GROUP BY o.person_id
    ) last_enc
        ON last_enc.person_id = o_pn.person_id
       AND last_enc.last_enc_datetime = e.encounter_datetime
        and e.voided = 0
        and o_pn.voided =0
        AND e.encounter_datetime >= @startDate
	    AND e.encounter_datetime <  @endDate
       GROUP BY o_pn.person_id
) last_encounters
    ON last_encounters.encounter_id = e.encounter_id
    WHERE  e.encounter_datetime >= @startDate
	AND e.encounter_datetime <  @endDate
	AND v.location_id = @location;

-- # of women who gave birth at another facility
SELECT COUNT(x.person_id ) INTO @DELIVERY_EXT_FACILITY_COUNT
 FROM (
    SELECT o.person_id FROM encounter e 
    INNER JOIN obs o on o.encounter_id =e.encounter_id
    INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
    INNER JOIN (
            SELECT
                e.patient_id,e.encounter_id ,
                MAX(e.encounter_datetime) AS last_new_visit_date
            FROM encounter e
            INNER JOIN obs o_pn2
                ON o_pn2.encounter_id = e.encounter_id
                AND o_pn2.value_coded = concept_from_mapping('PIH','6261')
                AND o_pn2.voided = 0
            INNER JOIN obs o_nv
                ON o_nv.encounter_id = e.encounter_id
                AND o_nv.value_coded = concept_from_mapping('PIH','13235')
                AND o_nv.voided = 0
            WHERE e.voided = 0
            GROUP BY e.patient_id
        ) last_nv
            ON last_nv.patient_id = e.patient_id
    WHERE
    e.encounter_datetime   >= last_nv.last_new_visit_date
    AND o.voided =0
    AND e.voided =0
    AND o.concept_id =concept_from_mapping('PIH','11348')
    AND o.value_coded  =concept_from_mapping('PIH','8856')
    AND e.encounter_datetime >= @startDate
    AND e.encounter_datetime <  @endDate
    AND v.location_id = @location
    GROUP BY o.person_id
 )x;


-- # of women who have adopted a family planning method
 SELECT COUNT(x.person_id ) INTO @FP_METHOD_ACCEPTED_SUBSET
 FROM (
    SELECT o.person_id FROM encounter e 
    INNER JOIN obs o on o.encounter_id =e.encounter_id
    INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
    INNER JOIN (
            SELECT
                e.patient_id,e.encounter_id ,
                MAX(e.encounter_datetime) AS last_new_visit_date
            FROM encounter e
            INNER JOIN obs o_pn2
                ON o_pn2.encounter_id = e.encounter_id
                AND o_pn2.value_coded = concept_from_mapping('PIH','6261')
                AND o_pn2.voided = 0
            INNER JOIN obs o_nv
                ON o_nv.encounter_id = e.encounter_id
                AND o_nv.value_coded = concept_from_mapping('PIH','13235')
                AND o_nv.voided = 0
            WHERE e.voided = 0
            GROUP BY e.patient_id
        ) last_nv
            ON last_nv.patient_id = e.patient_id
    WHERE
    e.encounter_datetime   >= last_nv.last_new_visit_date
    AND o.voided =0
    AND e.voided =0
    AND o.concept_id =concept_from_mapping('PIH','374')
    AND e.encounter_datetime >= @startDate
    AND e.encounter_datetime <  @endDate
    AND v.location_id = @location
    GROUP BY o.person_id
 )x;


-- # of women who received vitamin A postpartum
 SELECT COUNT(x.person_id ) INTO @PNC_VIT_A_GIVEN
 FROM (
    SELECT o.person_id FROM encounter e 
    INNER JOIN obs o on o.encounter_id =e.encounter_id
    INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
    INNER JOIN (
            SELECT
                e.patient_id,e.encounter_id ,
                MAX(e.encounter_datetime) AS last_new_visit_date
            FROM encounter e
            INNER JOIN obs o_pn2
                ON o_pn2.encounter_id = e.encounter_id
                AND o_pn2.value_coded = concept_from_mapping('PIH','6261')
                AND o_pn2.voided = 0
            INNER JOIN obs o_nv
                ON o_nv.encounter_id = e.encounter_id
                AND o_nv.value_coded = concept_from_mapping('PIH','13235')
                AND o_nv.voided = 0
            WHERE e.voided = 0
            GROUP BY e.patient_id
        ) last_nv
            ON last_nv.patient_id = e.patient_id
    WHERE
    e.encounter_datetime   >= last_nv.last_new_visit_date
    AND o.voided =0
    AND e.voided =0
    AND o.concept_id =concept_from_mapping('PIH','13255')
    AND o.value_coded  =concept_from_mapping('PIH','4063')
    AND e.encounter_datetime >= @startDate
    AND e.encounter_datetime <  @endDate
    AND v.location_id = @location
    GROUP BY o.person_id
 )x;


-- # of women who gave birth at home and received prenatal care at the facility in question
 SELECT COUNT(x.person_id ) INTO @PREG_HOME_DELIV_ANC_FACILITY
 FROM (
    SELECT o.person_id FROM encounter e 
    INNER JOIN obs o on o.encounter_id =e.encounter_id
    INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
    INNER JOIN (
            SELECT
                e.patient_id,e.encounter_id ,
                MAX(e.encounter_datetime) AS last_new_visit_date
            FROM encounter e
            INNER JOIN obs o_pn2
                ON o_pn2.encounter_id = e.encounter_id
                AND o_pn2.value_coded = concept_from_mapping('PIH','6261')
                AND o_pn2.voided = 0
            INNER JOIN obs o_nv
                ON o_nv.encounter_id = e.encounter_id
                AND o_nv.value_coded = concept_from_mapping('PIH','13235')
                AND o_nv.voided = 0
            WHERE e.voided = 0
            GROUP BY e.patient_id
        ) last_nv
            ON last_nv.patient_id = e.patient_id
    WHERE
    e.encounter_datetime   >= last_nv.last_new_visit_date
    AND o.voided =0
    AND e.voided =0
    AND o.concept_id =concept_from_mapping('PIH','11348')
    AND o.value_coded  =concept_from_mapping('PIH','7889')
    AND e.encounter_datetime >= @startDate
    AND e.encounter_datetime <  @endDate
    AND v.location_id = @location
    GROUP BY o.person_id
 )x;

-- # of women seen at their first postnatal visit during the reporting month within 72 hours of delivery
SELECT 
  SUM(CASE 
        WHEN x.last_new_visit_date >= x.value_datetime
         AND x.last_new_visit_date <= DATE_ADD(x.value_datetime, INTERVAL 72 HOUR)
        THEN 1 ELSE 0 
    END) INTO  @PNC_FIRST_VISIT_LT72H_MONTH
 FROM (
    SELECT o.person_id,o.value_datetime,last_nv.last_new_visit_date  FROM encounter e 
    INNER JOIN obs o on o.encounter_id =e.encounter_id
    INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
    INNER JOIN (
            SELECT
                e.patient_id,e.encounter_id ,
                MAX(e.encounter_datetime) AS last_new_visit_date
            FROM encounter e
            INNER JOIN obs o_pn2
                ON o_pn2.encounter_id = e.encounter_id
                AND o_pn2.value_coded = concept_from_mapping('PIH','6261')
                AND o_pn2.voided = 0
            INNER JOIN obs o_nv
                ON o_nv.encounter_id = e.encounter_id
                AND o_nv.value_coded = concept_from_mapping('PIH','13235')
                AND o_nv.voided = 0
            WHERE e.voided = 0
            GROUP BY e.patient_id
        ) last_nv
            ON last_nv.patient_id = e.patient_id
    WHERE
    e.encounter_datetime   >= last_nv.last_new_visit_date
    AND o.voided =0
    AND e.voided =0
    AND o.concept_id =@delivery_date_concept_id
    AND e.encounter_datetime >=  @startDate
    AND e.encounter_datetime <  @endDate
    AND v.location_id = @location
    GROUP BY o.person_id
 )x;

-- SECTION C

 SELECT

    SUM(CASE WHEN x.value_coded = concept_from_mapping('PIH','11785') AND x.age < 15 THEN 1 ELSE 0 END) AS vaginal_lt15,

    SUM(CASE WHEN x.value_coded = concept_from_mapping('PIH','11785') AND x.age BETWEEN 15 AND 19 THEN 1 ELSE 0 END) AS vaginal_15_19,

    SUM(CASE WHEN x.value_coded = concept_from_mapping('PIH','11785') AND x.age BETWEEN 20 AND 24 THEN 1 ELSE 0 END) AS vaginal_20_24,

    SUM(CASE WHEN x.value_coded = concept_from_mapping('PIH','11785') AND x.age BETWEEN 25 AND 29 THEN 1 ELSE 0 END) AS vaginal_25_29,

    SUM(CASE WHEN x.value_coded = concept_from_mapping('PIH','11785') AND x.age >= 30 THEN 1 ELSE 0 END) AS vaginal_30_plus,

    SUM(CASE WHEN x.value_coded = concept_from_mapping('PIH','11785') AND x.age IS NULL THEN 1 ELSE 0 END) AS vaginal_unknown,

    
    SUM(CASE WHEN x.value_coded = concept_from_mapping('PIH','9336') AND x.age < 15 THEN 1 ELSE 0 END) AS cesarienne_lt15,

    SUM(CASE WHEN x.value_coded = concept_from_mapping('PIH','9336') AND x.age BETWEEN 15 AND 19 THEN 1 ELSE 0 END) AS cesarienne_15_19,

    SUM(CASE WHEN x.value_coded = concept_from_mapping('PIH','9336') AND x.age BETWEEN 20 AND 24 THEN 1 ELSE 0 END) AS cesarienne_20_24,

    SUM(CASE WHEN x.value_coded = concept_from_mapping('PIH','9336') AND x.age BETWEEN 25 AND 29 THEN 1 ELSE 0 END) AS cesarienne_25_29,

    SUM(CASE WHEN x.value_coded = concept_from_mapping('PIH','9336') AND x.age >= 30 THEN 1 ELSE 0 END) AS cesarienne_30_plus,

    SUM(CASE WHEN x.value_coded = concept_from_mapping('PIH','9336') AND x.age IS NULL THEN 1 ELSE 0 END) AS cesarienne_unknown
    
    INTO 
    @VAGINAL_BIRTH_MOTHER_LT15,@VAGINAL_BIRTH_MOTHER_15_19,@DELIVERY_VAGINAL_MOTHER_AGE_20_24,@VAGINAL_BIRTH_MOTHER_25_29,@DELIVERY_VAGINAL_MOTHER_AGE_GT30,@DELIVERY_VAGINAL_MOTHER_AGE_UNKNOWN,
    @CESAREAN_BIRTH_MOTHER_LT15,@DELIVERY_CESAREAN_MOTHER_AGE_15_19,@DELIVERY_CESAREAN_MOTHER_AGE_20_24,@DELIVERY_CESAREAN_MOTHER_AGE_25_29,@DELIVERY_CESAREAN_MOTHER_AGE_GT30,@DELIVERY_CESAREAN_MOTHER_AGE_UNKNOWN

FROM
(
    SELECT
        d.person_id,
        d.encounter_id,
        d.value_datetime AS delivery_date,
        t.value_coded,

        CASE
            WHEN p.birthdate IS NULL THEN NULL
            ELSE TIMESTAMPDIFF(YEAR, p.birthdate, d.value_datetime)
        END AS age

    FROM obs d

    INNER JOIN encounter e
        ON e.encounter_id = d.encounter_id
       AND e.voided = 0

    INNER JOIN visit v
        ON v.visit_id = e.visit_id
       AND v.voided = 0

    INNER JOIN obs t
        ON t.encounter_id = d.encounter_id
       AND t.person_id = d.person_id
       AND t.concept_id = @type_of_delivery_concept_id
       AND t.voided = 0

    LEFT JOIN person p
        ON p.person_id = d.person_id
       AND p.voided = 0

    WHERE d.concept_id = @delivery_date_concept_id
      AND d.value_datetime IS NOT NULL
      AND d.voided = 0
      AND e.encounter_datetime >= @startDate
      AND e.encounter_datetime < @endDate
      AND v.location_id = @location

) x;

SELECT

    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','11785')
             AND x.prematurity = concept_from_mapping('PIH','11789')
            THEN 1 ELSE 0
        END),

    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','11785')
             AND x.prematurity = concept_from_mapping('PIH','11790')
            THEN 1 ELSE 0
        END),

    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','11785')
             AND x.prematurity = concept_from_mapping('PIH','9414')
            THEN 1 ELSE 0
        END),

    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','11785')
             AND (
                    x.prematurity IS NULL
                 OR x.prematurity NOT IN (
                        concept_from_mapping('PIH','11789'),
                        concept_from_mapping('PIH','11790'),
                        concept_from_mapping('PIH','9414')
                    )
                 )
            THEN 1 ELSE 0
        END),


    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','9336')
             AND x.prematurity = concept_from_mapping('PIH','11789')
            THEN 1 ELSE 0
        END),

    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','9336')
             AND x.prematurity = concept_from_mapping('PIH','11790')
            THEN 1 ELSE 0
        END),

    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','9336')
             AND x.prematurity = concept_from_mapping('PIH','9414')
            THEN 1 ELSE 0
        END),

    SUM(CASE
            WHEN x.delivery_type =  concept_from_mapping('PIH','9336')
             AND (
                    x.prematurity IS NULL
                 OR x.prematurity NOT IN (
                         concept_from_mapping('PIH','11789'),
                        concept_from_mapping('PIH','11790'),
                        concept_from_mapping('PIH','9414')
                    )
                 )
            THEN 1 ELSE 0
        END)
INTO @VAGINAL_BIRTH_SEVERE_PREMATURITY,@VAGINAL_BIRTH_MODERATE_PREMATURITY,@VAGINAL_BIRTH_EXTREME_PREMATURITY,@VAGINAL_BIRTH_PREMATURITY_UNKNOWN,
	@CESAREAN_BIRTH_SEVERE_PREMATURITY, @CESAREAN_BIRTH_MODERATE_PREMATURITY,@CESAREAN_BIRTH_EXTREME_PREMATURITY,@CESAREAN_BIRTH_PREMATURITY_UNKNOWN

	FROM
(
    SELECT
        d.person_id,
        d.encounter_id,
        t.value_coded AS delivery_type,
        p.prematurity

    FROM obs d

    INNER JOIN encounter e
        ON e.encounter_id = d.encounter_id
       AND e.voided = 0
    INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0

    INNER JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_coded) value_coded
        FROM obs
        WHERE concept_id = @type_of_delivery_concept_id
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) t
        ON t.encounter_id = d.encounter_id
       AND t.person_id = d.person_id
       
    LEFT JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_coded ) AS prematurity
        FROM obs
        WHERE concept_id = @diagnosis_concept_id
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) p
        ON p.encounter_id = d.encounter_id
       AND p.person_id = d.person_id


    WHERE d.concept_id =  @delivery_date_concept_id
      AND d.value_datetime IS NOT NULL
      AND d.voided = 0
      AND e.encounter_datetime >= @startDate
      AND e.encounter_datetime < @endDate
      AND v.location_id = @location
) x;


SELECT
    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','11785')
             AND x.birth_weight < 2.5
            THEN 1 ELSE 0
        END),

    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','11785')
             AND x.birth_weight >= 2.5
            THEN 1 ELSE 0
        END),

    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','11785')
             AND x.birth_weight IS NULL
            THEN 1 ELSE 0
        END),

    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','11785')
             AND x.apgar_score IS NOT NULL
            THEN 1 ELSE 0
        END),

    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','11785')
             AND x.neonatal_resuscitation = concept_from_mapping('PIH','1065')
            THEN 1 ELSE 0
        END),
        
    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','9336')
             AND x.birth_weight < 2.5
            THEN 1 ELSE 0
        END),

    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','9336')
             AND x.birth_weight >= 2.5
            THEN 1 ELSE 0
        END),

    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','9336')
             AND x.birth_weight IS NULL
            THEN 1 ELSE 0
        END),

    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','9336')
             AND x.apgar_score IS NOT NULL
            THEN 1 ELSE 0
        END),

    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','9336')
             AND x.neonatal_resuscitation = concept_from_mapping('PIH','1065')
            THEN 1 ELSE 0
        END)

INTO
    @VAGINAL_DELIVERY_BIRTH_WEIGHT_LT2500G,
    @VAGINAL_DELIVERY_BIRTH_WEIGHT_GTE2500G,
    @VAGINAL_DELIVERY_BIRTH_WEIGHT_UNKNOWN,
    @VAGINAL_DELIVERY_APGAR_RECORDED,
    @VAGINAL_DELIVERY_NEWBORN_RESUSCITATED,

    @CESAREAN_DELIVERY_BIRTH_WEIGHT_LT2500G,
    @CESAREAN_DELIVERY_BIRTH_WEIGHT_GTE2500G,
    @CESAREAN_DELIVERY_BIRTH_WEIGHT_UNKNOWN,
    @CESAREAN_DELIVERY_APGAR_RECORDED,
    @CESAREAN_DELIVERY_NEWBORN_RESUSCITATED

FROM
(
    SELECT
        d.person_id,
        d.encounter_id,
        t.value_coded AS delivery_type,
        bw.birth_weight,
        ap.apgar_score,
        nr.neonatal_resuscitation

    FROM obs d

    INNER JOIN encounter e
        ON e.encounter_id = d.encounter_id
       AND e.voided = 0
    INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0

    INNER JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_coded) value_coded
        FROM obs
        WHERE concept_id = @type_of_delivery_concept_id
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) t
        ON t.encounter_id = d.encounter_id
       AND t.person_id = d.person_id

    LEFT JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_numeric) AS birth_weight
        FROM obs
        WHERE concept_id = concept_from_mapping('PIH','11067')
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) bw
        ON bw.encounter_id = d.encounter_id
       AND bw.person_id = d.person_id

    LEFT JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_numeric) AS apgar_score
        FROM obs
        WHERE concept_id IN
        (
            concept_from_mapping('PIH','14785'),
            concept_from_mapping('PIH','13558'),
            concept_from_mapping('PIH','14419')
        )
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) ap
        ON ap.encounter_id = d.encounter_id
       AND ap.person_id = d.person_id

    LEFT JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_coded) AS neonatal_resuscitation
        FROM obs
        WHERE concept_id = concept_from_mapping('PIH','13096')
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) nr
        ON nr.encounter_id = d.encounter_id
       AND nr.person_id = d.person_id

    WHERE d.concept_id = @delivery_date_concept_id
      AND d.value_datetime IS NOT NULL
      AND d.voided = 0
      AND e.encounter_datetime >= @startDate
      AND e.encounter_datetime < @endDate
      AND v.location_id = @location
) x;


SELECT
    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','11785')
             AND x.disposition = concept_from_mapping('PIH','8619')
            THEN 1 ELSE 0
        END),

    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','11785')
             AND x.preg_outcome = concept_from_mapping('PIH','8391')
             AND x.mace_fetus = concept_from_mapping('PIH','1065')
            THEN 1 ELSE 0
        END),
        
    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','11785')
             AND x.preg_outcome = concept_from_mapping('PIH','8391')
             AND x.mace_fetus = concept_from_mapping('PIH','1066')
            THEN 1 ELSE 0
        END),

        
    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','9336')
             AND x.disposition = concept_from_mapping('PIH','8619')
            THEN 1 ELSE 0
        END),

    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','9336')
             AND x.preg_outcome = concept_from_mapping('PIH','8391')
             AND x.mace_fetus = concept_from_mapping('PIH','1065')
            THEN 1 ELSE 0
        END),
        
    SUM(CASE
            WHEN x.delivery_type = concept_from_mapping('PIH','9336')
             AND x.preg_outcome = concept_from_mapping('PIH','8391')
             AND x.mace_fetus = concept_from_mapping('PIH','1066')
            THEN 1 ELSE 0
        END)


INTO
    @VAGINAL_DELIVERY_NEWBORN_DEATHS,
    @VAGINAL_DELIVERY_MACERATED_STILLBIRTH,
    @VAGINAL_DELIVERY_NON_MACERATED_STILLBIRTH,
   

    @CESAREAN_DELIVERY_NEWBORN_DEATHS,
    @CESAREAN_DELIVERY_MACERATED_STILLBIRTH,
    @CESAREAN_DELIVERY_NON_MACERATED_STILLBIRTH

FROM
(
    SELECT
        d.person_id,
        d.encounter_id,
        t.value_coded AS delivery_type,
        disp.disposition,
        pregout.preg_outcome,
        mf.mace_fetus

    FROM obs d

    INNER JOIN encounter e
        ON e.encounter_id = d.encounter_id
       AND e.voided = 0
    INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0

    INNER JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_coded) value_coded
        FROM obs
        WHERE concept_id = @type_of_delivery_concept_id
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) t
        ON t.encounter_id = d.encounter_id
       AND t.person_id = d.person_id

    LEFT JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_coded ) AS disposition
        FROM obs
        WHERE concept_id = concept_from_mapping('PIH','8620')
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) disp
        ON disp.encounter_id = d.encounter_id
       AND disp.person_id = d.person_id
       
	LEFT JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_coded ) AS preg_outcome
        FROM obs
        WHERE concept_id = concept_from_mapping('PIH','12899')
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) pregout
        ON pregout.encounter_id = d.encounter_id
       AND pregout.person_id = d.person_id
       
     LEFT JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_coded ) AS mace_fetus
        FROM obs
        WHERE concept_id = concept_from_mapping('PIH','13544')
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) mf
        ON mf.encounter_id = d.encounter_id
       AND mf.person_id = d.person_id

    WHERE d.concept_id = @delivery_date_concept_id
      AND d.value_datetime IS NOT NULL
      AND d.voided = 0
      AND e.encounter_datetime >= @startDate
      AND e.encounter_datetime < @endDate
      AND v.location_id = @location
) x;


SELECT
    SUM(CASE
            WHEN  x.adopt_pf =  concept_from_mapping('PIH','1065')
            THEN 1 ELSE 0
        END),
        
        
        SUM(CASE
               WHEN  x.nb_pv > 0
               THEN 1 ELSE 0
         END),
        
         SUM(CASE
                WHEN  x.nb_pv = 0
                THEN 1 ELSE 0
         END),
         
         
         SUM(CASE
            	WHEN  x.diag_value_coded =   concept_from_mapping('PIH','9344')
           		THEN 1 ELSE 0
       	 END),
        
          SUM(CASE
           		 WHEN  x.dys_type IN (concept_from_mapping('PIH','13530'),
            					concept_from_mapping('PIH','13529'),
            					concept_from_mapping('PIH','5622')
            					)
            	THEN 1 ELSE 0
        	END),
        	
          SUM(CASE
            	WHEN  x.vag_bleed =   concept_from_mapping('PIH','1065')
           		THEN 1 ELSE 0
       	  END),
       	  
       	  
       	   SUM(CASE
            	WHEN  x.postp_hemo =  concept_from_mapping('PIH','1065')
           		THEN 1 ELSE 0
       	  END),
       	  
       	  
       	  SUM(CASE
            	WHEN  x.diag_value_coded =  concept_from_mapping('PIH','7252')
           		THEN 1 ELSE 0
       	  END),
       	  
       	   SUM(CASE
            	WHEN  x.perineal_lac =  concept_from_mapping('PIH','1065')
           		THEN 1 ELSE 0
       	   END),
       	  
       	  
       	  SUM(CASE
            	WHEN  x.partogram =  concept_from_mapping('PIH','1065')
           		THEN 1 ELSE 0
       	   END),
       	   
   	   	  SUM(CASE
	        	WHEN  x.manage_th_stage_labor =  concept_from_mapping('PIH','1065')
	       		THEN 1 ELSE 0
   	   	  END)

INTO
    @POSTPARTUM_FP_METHOD_ADOPTED,
    @WOMEN_WITH_PRENATAL_VISITS,
    @WOMEN_WITHOUT_PRENATAL_VISITS_COUNT,
    @WOMEN_WITH_PREECLAMPSIA_COUNT,
    @WOMEN_DYSTOCIA_MECHANICAL_DYNAMIC_OTHER_COUNT,
    @WOMEN_WITH_VAGINAL_HEMORRHAGE_COUNT,
    @WOMEN_WITH_POSTPARTUM_HEMORRHAGE_COUNT,
    @WOMEN_WITH_PUERPERAL_INFECTION_COUNT,
    @WOMEN_WITH_PERINEAL_LACERATION_COUNT,
    @WOMEN_WITH_PARTOGRAM_COUNT,
    @WOMEN_WITH_AMTSL_COUNT

FROM
(
    SELECT
        d.person_id,
        d.encounter_id,
        adtpf.adopt_pf,
        nbpv.nb_pv,
        diag.diag_value_coded,
        dys.dys_type,
        vb.vag_bleed,
        pph.postp_hemo,
        pl.perineal_lac,
        pcd.partogram,
        amtsl.manage_th_stage_labor

    FROM obs d

    INNER JOIN encounter e
        ON e.encounter_id = d.encounter_id
       AND e.voided = 0
    INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0

    LEFT JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_coded ) AS adopt_pf
        FROM obs
        WHERE concept_id = concept_from_mapping('PIH','13564')
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) adtpf
        ON adtpf.encounter_id = d.encounter_id
       AND adtpf.person_id = d.person_id
       
	LEFT JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_numeric  ) AS nb_pv
        FROM obs
        WHERE concept_id = concept_from_mapping('PIH','13321')
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) nbpv
        ON nbpv.encounter_id = d.encounter_id
       AND nbpv.person_id = d.person_id
       
     LEFT JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_coded ) AS diag_value_coded
        FROM obs
        WHERE concept_id = concept_from_mapping('PIH','3064')
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) diag
        ON diag.encounter_id = d.encounter_id
       AND diag.person_id = d.person_id
       
       
   LEFT JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_coded ) AS dys_type
        FROM obs
        WHERE concept_id = concept_from_mapping('PIH','13531')
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) dys
        ON dys.encounter_id = d.encounter_id
       AND dys.person_id = d.person_id
       
   LEFT JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_coded ) AS vag_bleed
        FROM obs
        WHERE concept_id = concept_from_mapping('PIH','13343')
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) vb
        ON vb.encounter_id = d.encounter_id
       AND vb.person_id = d.person_id
       
   LEFT JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_coded ) AS postp_hemo
        FROM obs
        WHERE concept_id = concept_from_mapping('PIH','POSTPARTUM HEMORRHAGE')
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) pph
       ON pph.encounter_id = d.encounter_id
       AND pph.person_id = d.person_id
       
   LEFT JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_coded ) AS perineal_lac
        FROM obs
        WHERE concept_id = concept_from_mapping('PIH','12372')
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) pl
       ON pl.encounter_id = d.encounter_id
       AND pl.person_id = d.person_id
       
   
   LEFT JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_coded ) AS partogram 
        FROM obs
        WHERE concept_id = concept_from_mapping('PIH','13964')
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) pcd
       ON pcd.encounter_id = d.encounter_id
       AND pcd.person_id = d.person_id     
  
   LEFT JOIN
    (
        SELECT
            encounter_id,
            person_id,
            MAX(value_coded ) AS manage_th_stage_labor 
        FROM obs
        WHERE concept_id = concept_from_mapping('PIH','13533')
          AND voided = 0
        GROUP BY encounter_id, person_id
    ) amtsl
       ON amtsl.encounter_id = d.encounter_id
       AND amtsl.person_id = d.person_id  
       
    WHERE d.concept_id = @delivery_date_concept_id
      AND d.value_datetime IS NOT NULL
      AND d.voided = 0
      AND e.encounter_datetime >= @startDate
      AND e.encounter_datetime < @endDate
      AND v.location_id = @location
) x;


SELECT 
        @MET_COC_LESS_THAN_25_ACCEPTED 'MET_COC_LESS_THAN_25_ACCEPTED',
        @MET_COP_LESS_THAN_25_ACCEPTED 'MET_COP_LESS_THAN_25_ACCEPTED',
        @MET_DEPO_PROVERA_LESS_THAN_25_ACCEPTED 'MET_DEPO_PROVERA_LESS_THAN_25_ACCEPTED',
        @MET_IMPL_LESS_THAN_25_ACCEPTED 'MET_IMPL_LESS_THAN_25_ACCEPTED',
        @MET_DIU_LESS_THAN_25_ACCEPTED 'MET_DIU_LESS_THAN_25_ACCEPTED',
        @MET_CONDOM_LESS_THAN_25_ACCEPTED 'MET_CONDOM_LESS_THAN_25_ACCEPTED',
        @MET_MAMA_LESS_THAN_25_ACCEPTED 'MET_MAMA_LESS_THAN_25_ACCEPTED',
        @MET_COLLIER_LESS_THAN_25_ACCEPTED 'MET_COLLIER_LESS_THAN_25_ACCEPTED',
        @MET_CCV_LESS_THAN_25_ACCEPTED 'MET_CCV_LESS_THAN_25_ACCEPTED',
        @MET_COC_MORE_25_ACCEPTED 'MET_COC_MORE_25_ACCEPTED',
        @MET_COP_MORE_25_ACCEPTED 'MET_COP_MORE_25_ACCEPTED',
        @MET_DEPO_PROVERA_MORE_25_ACCEPTED 'MET_DEPO_PROVERA_MORE_25_ACCEPTED',
        @MET_IMPL_MORE_25_ACCEPTED 'MET_IMPL_MORE_25_ACCEPTED',
        @MET_DIU_USED_MORE_25_ACCEPTED 'MET_DIU_USED_MORE_25_ACCEPTED',
        @MET_CONDOM_MORE_25_ACCEPTED 'MET_CONDOM_MORE_25_ACCEPTED',
        @MET_MAMA_MORE_25_ACCEPTED 'MET_MAMA_MORE_25_ACCEPTED',
        @MET_COLLIER_MORE_25_ACCEPTED 'MET_COLLIER_MORE_25_ACCEPTED',
        @MET_CCV_MORE_25_ACCEPTED 'MET_CCV_MORE_25_ACCEPTED',
        @MET_CCV 'MET_CCV',@MET_IMPL 'MET_IMPL',@MET_DIU 'MET_DIU',
        @NB_OF_CONDOMS 'NB_OF_CONDOMS',
        @ANC_1ST_VISIT_T1 'ANC_1ST_VISIT_T1',@ANC_1ST_VISIT_T2 'ANC_1ST_VISIT_T2',
        @ANC_1ST_VISIT_T3 'ANC_1ST_VISIT_T3',@ANC_1ST_VISIT_GA_UNK 'ANC_1ST_VISIT_GA_UNK',
        @ANC_1ST_VISIT_HIV_TESTED 'ANC_1ST_VISIT_HIV_TESTED',@ANC_1ST_VISIT_HIV_POS 'ANC_1ST_VISIT_HIV_POS',
        @ANC_1ST_VISIT_SYPH_TESTED 'ANC_1ST_VISIT_SYPH_TESTED',
        @ANC_SV_0_3M 'ANC_SV_0_3M',@ANC_TV_0_3M 'ANC_TV_0_3M',@ANC_FV_0_3M 'ANC_FV_0_3M',@ANC_5PLUS_0_3M 'ANC_5PLUS_0_3M',
    	@ANC_SV_4_6M 'ANC_SV_4_6M',@ANC_TV_4_6M 'ANC_TV_4_6M',@ANC_FV_4_6M 'ANC_FV_4_6M',@ANC_5PLUS_4_6M 'ANC_5PLUS_4_6M',
    	@ANC_SV_7_9M 'ANC_SV_7_9M',@ANC_TV_7_9M 'ANC_TV_7_9M',@ANC_FV_7_9M 'ANC_FV_7_9M',@ANC_5PLUS_7_9M 'ANC_5PLUS_7_9M',
        @ANC_DPA_MONTH 'ANC_DPA_MONTH', @ANC_PREG_HR_CONDITIONS 'ANC_PREG_HR_CONDITIONS', @ANC_1ST_VISIT_SINCE_OCT_MONTH 'ANC_1ST_VISIT_SINCE_OCT_MONTH', 
        @ANC_PREG_IRON_SUPP_COUNT 'ANC_PREG_IRON_SUPP_COUNT', 0 'ANC_VACC_COMPLETED_MONTH',0 'ANC_PREG_ABORTED_MONTH', 0 'ANC_PAC_MANAGED_MONTH',
        @PNC_1ST_VISIT_TOTAL 'PNC_1ST_VISIT_TOTAL',@DELIVERY_EXT_FACILITY_COUNT 'DELIVERY_EXT_FACILITY_COUNT',
        @FP_METHOD_ACCEPTED_SUBSET 'FP_METHOD_ACCEPTED_SUBSET', @PREG_HOME_DELIV_ANC_FACILITY 'PREG_HOME_DELIV_ANC_FACILITY',
        @PNC_FIRST_VISIT_LT72H_MONTH 'PNC_FIRST_VISIT_LT72H_MONTH',@PNC_VIT_A_GIVEN 'PNC_VIT_A_GIVEN',
        @VAGINAL_BIRTH_MOTHER_LT15 'VAGINAL_BIRTH_MOTHER_LT15',@VAGINAL_BIRTH_MOTHER_15_19 'VAGINAL_BIRTH_MOTHER_15_19',@DELIVERY_VAGINAL_MOTHER_AGE_20_24 'DELIVERY_VAGINAL_MOTHER_AGE_20_24',@VAGINAL_BIRTH_MOTHER_25_29 'VAGINAL_BIRTH_MOTHER_25_29',@DELIVERY_VAGINAL_MOTHER_AGE_GT30 'DELIVERY_VAGINAL_MOTHER_AGE_GT30',@DELIVERY_VAGINAL_MOTHER_AGE_UNKNOWN 'DELIVERY_VAGINAL_MOTHER_AGE_UNKNOWN',
        @CESAREAN_BIRTH_MOTHER_LT15 'CESAREAN_BIRTH_MOTHER_LT15',@DELIVERY_CESAREAN_MOTHER_AGE_15_19 'DELIVERY_CESAREAN_MOTHER_AGE_15_19',@DELIVERY_CESAREAN_MOTHER_AGE_20_24 'DELIVERY_CESAREAN_MOTHER_AGE_20_24',@DELIVERY_CESAREAN_MOTHER_AGE_25_29 'DELIVERY_CESAREAN_MOTHER_AGE_25_29',@DELIVERY_CESAREAN_MOTHER_AGE_GT30 'DELIVERY_CESAREAN_MOTHER_AGE_GT30',@DELIVERY_CESAREAN_MOTHER_AGE_UNKNOWN 'DELIVERY_CESAREAN_MOTHER_AGE_UNKNOWN',
        @VAGINAL_BIRTH_SEVERE_PREMATURITY 'VAGINAL_BIRTH_SEVERE_PREMATURITY',@VAGINAL_BIRTH_MODERATE_PREMATURITY 'VAGINAL_BIRTH_MODERATE_PREMATURITY',@VAGINAL_BIRTH_EXTREME_PREMATURITY 'VAGINAL_BIRTH_EXTREME_PREMATURITY',@VAGINAL_BIRTH_PREMATURITY_UNKNOWN 'VAGINAL_BIRTH_PREMATURITY_UNKNOWN',
	    @CESAREAN_BIRTH_SEVERE_PREMATURITY 'CESAREAN_BIRTH_SEVERE_PREMATURITY', @CESAREAN_BIRTH_MODERATE_PREMATURITY 'CESAREAN_BIRTH_MODERATE_PREMATURITY',@CESAREAN_BIRTH_EXTREME_PREMATURITY 'CESAREAN_BIRTH_EXTREME_PREMATURITY',@CESAREAN_BIRTH_PREMATURITY_UNKNOWN 'CESAREAN_BIRTH_PREMATURITY_UNKNOWN',
        @VAGINAL_DELIVERY_BIRTH_WEIGHT_LT2500G 'VAGINAL_DELIVERY_BIRTH_WEIGHT_LT2500G',@VAGINAL_DELIVERY_BIRTH_WEIGHT_GTE2500G 'VAGINAL_DELIVERY_BIRTH_WEIGHT_GTE2500G',@VAGINAL_DELIVERY_BIRTH_WEIGHT_UNKNOWN 'VAGINAL_DELIVERY_BIRTH_WEIGHT_UNKNOWN',@VAGINAL_DELIVERY_APGAR_RECORDED 'VAGINAL_DELIVERY_APGAR_RECORDED',@VAGINAL_DELIVERY_NEWBORN_RESUSCITATED 'VAGINAL_DELIVERY_NEWBORN_RESUSCITATED',
	    @CESAREAN_DELIVERY_BIRTH_WEIGHT_LT2500G 'CESAREAN_DELIVERY_BIRTH_WEIGHT_LT2500G',@CESAREAN_DELIVERY_BIRTH_WEIGHT_GTE2500G 'CESAREAN_DELIVERY_BIRTH_WEIGHT_GTE2500G',@CESAREAN_DELIVERY_BIRTH_WEIGHT_UNKNOWN 'CESAREAN_DELIVERY_BIRTH_WEIGHT_UNKNOWN',@CESAREAN_DELIVERY_APGAR_RECORDED 'CESAREAN_DELIVERY_APGAR_RECORDED',@CESAREAN_DELIVERY_NEWBORN_RESUSCITATED 'CESAREAN_DELIVERY_NEWBORN_RESUSCITATED',
        @VAGINAL_DELIVERY_NEWBORN_DEATHS 'VAGINAL_DELIVERY_NEWBORN_DEATHS',@VAGINAL_DELIVERY_MACERATED_STILLBIRTH 'VAGINAL_DELIVERY_MACERATED_STILLBIRTH',@VAGINAL_DELIVERY_NON_MACERATED_STILLBIRTH 'VAGINAL_DELIVERY_NON_MACERATED_STILLBIRTH',
   		@CESAREAN_DELIVERY_NEWBORN_DEATHS 'CESAREAN_DELIVERY_NEWBORN_DEATHS',@CESAREAN_DELIVERY_MACERATED_STILLBIRTH 'CESAREAN_DELIVERY_MACERATED_STILLBIRTH',@CESAREAN_DELIVERY_NON_MACERATED_STILLBIRTH 'CESAREAN_DELIVERY_NON_MACERATED_STILLBIRTH',
        @POSTPARTUM_FP_METHOD_ADOPTED 'POSTPARTUM_FP_METHOD_ADOPTED',@WOMEN_WITH_PRENATAL_VISITS 'WOMEN_WITH_PRENATAL_VISITS',@WOMEN_WITHOUT_PRENATAL_VISITS_COUNT 'WOMEN_WITHOUT_PRENATAL_VISITS_COUNT',@WOMEN_WITH_PREECLAMPSIA_COUNT 'WOMEN_WITH_PREECLAMPSIA_COUNT',@WOMEN_DYSTOCIA_MECHANICAL_DYNAMIC_OTHER_COUNT 'WOMEN_DYSTOCIA_MECHANICAL_DYNAMIC_OTHER_COUNT',@WOMEN_WITH_VAGINAL_HEMORRHAGE_COUNT 'WOMEN_WITH_VAGINAL_HEMORRHAGE_COUNT',@WOMEN_WITH_POSTPARTUM_HEMORRHAGE_COUNT 'WOMEN_WITH_POSTPARTUM_HEMORRHAGE_COUNT',@WOMEN_WITH_PUERPERAL_INFECTION_COUNT 'WOMEN_WITH_PUERPERAL_INFECTION_COUNT',@WOMEN_WITH_PERINEAL_LACERATION_COUNT 'WOMEN_WITH_PERINEAL_LACERATION_COUNT',@WOMEN_WITH_PARTOGRAM_COUNT 'WOMEN_WITH_PARTOGRAM_COUNT',@WOMEN_WITH_AMTSL_COUNT 'WOMEN_WITH_AMTSL_COUNT';