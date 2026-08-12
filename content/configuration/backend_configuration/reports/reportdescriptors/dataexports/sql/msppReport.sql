
CALL initialize_global_metadata();

-- set  @startDate = '2025-04-03';
-- set  @endDate = '2025-04-24';
SET @firstDate = CONCAT(YEAR(CURDATE()), '-01-01');

SET  @locale = GLOBAL_PROPERTY_VALUE('default_locale', 'en');
SET @endDate = ADDDATE(@endDate, INTERVAL 1 DAY);

SET  @kid_age=14;
SET @death = concept_from_mapping('PIH','DEATH');
SET @discharged = concept_from_mapping('PIH','DISCHARGED');
SET @TransferOutOfHospital = concept_from_mapping('PIH','Transfer out of hospital');
SET @LeftWithoutSeeingClinician = concept_from_mapping('PIH','Left without seeing a clinician');


-- New visits (First visit of the year)
 SELECT 
    SUM(IF(age < 1, 1, 0)) AS less_than_1,
    SUM(IF(age >= 1 AND age < 5, 1, 0)) AS age_1_4,
    SUM(IF(age >= 5 AND age < 10, 1, 0)) AS age_5_9,
    SUM(IF(age >= 10 AND age < 15, 1, 0)) AS age_10_14,
    SUM(IF(age >= 15 AND age < 20, 1, 0)) AS age_15_19,
    SUM(IF(age >= 20 AND age < 25, 1, 0)) AS age_20_24,
    SUM(IF(age >= 25, 1, 0)) AS age_25_plus
	INTO
	@child_under_1_n,
	@child_between_1_4_n,
	@child_between_5_9_n,
	@child_between_10_14_n,
	@young_adult_between_15_19_n,
	@young_adult_between_20_24_n,
	@other_adult_n
FROM (
    SELECT 
       DISTINCT e.patient_id,
        TIMESTAMPDIFF(YEAR, pr.birthdate, e.encounter_datetime) AS age
    FROM encounter e
    INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
    INNER JOIN patient p ON e.patient_id = p.patient_id AND p.voided = 0
    INNER JOIN person pr ON pr.person_id = p.patient_id AND pr.voided = 0

    INNER JOIN (
        SELECT patient_id, MIN(encounter_datetime) AS first_visit_this_year
        FROM encounter
        WHERE encounter_type = encounter_type('55a0d3ea-a4d7-4e88-8f01-5aceb2d3c61b')
        AND voided = 0
        AND YEAR(encounter_datetime) = YEAR(CURDATE())
        GROUP BY patient_id
    ) first_visit 
        ON e.patient_id = first_visit.patient_id
        AND e.encounter_datetime = first_visit.first_visit_this_year

    WHERE e.voided = 0
    AND e.encounter_type = encounter_type('55a0d3ea-a4d7-4e88-8f01-5aceb2d3c61b')
    AND DATE(e.encounter_datetime) >= @firstDate
    AND DATE(e.encounter_datetime) < @endDate
    AND v.location_id = @location
) t;

-- Subsequent visits 
SELECT 
    SUM(IF(age < 1, 1, 0)) AS less_than_1,
    SUM(IF(age >= 1 AND age < 5, 1, 0)) AS age_1_4,
    SUM(IF(age >= 5 AND age < 10, 1, 0)) AS age_5_9,
    SUM(IF(age >= 10 AND age < 15, 1, 0)) AS age_10_14,
    SUM(IF(age >= 15 AND age < 20, 1, 0)) AS age_15_19,
    SUM(IF(age >= 20 AND age < 25, 1, 0)) AS age_20_24,
    SUM(IF(age >= 25, 1, 0)) AS age_25_plus
	INTO @child_under_1_s,
	@child_between_1_4_s,
	@child_between_5_9_s,
	@child_between_10_14_s,
	@young_adult_between_15_19_s,
	@young_adult_between_20_24_s,
	@other_adult_s
FROM (
    SELECT 
        e.patient_id,
        DATE(e.encounter_datetime) AS visit_date,
        TIMESTAMPDIFF(YEAR, pr.birthdate, MIN(e.encounter_datetime)) AS age
    FROM patient p
    INNER JOIN person pr 
        ON p.patient_id = pr.person_id AND pr.voided = 0

    INNER JOIN encounter e
        ON p.patient_id = e.patient_id
        AND e.voided = 0
        AND e.encounter_type = encounter_type('55a0d3ea-a4d7-4e88-8f01-5aceb2d3c61b')
    INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
    INNER JOIN (
        SELECT patient_id, MIN(encounter_datetime) AS first_visit_this_year
        FROM encounter
        WHERE encounter_type = encounter_type('55a0d3ea-a4d7-4e88-8f01-5aceb2d3c61b')
        AND voided = 0
        AND YEAR(encounter_datetime) = YEAR(CURDATE())
        GROUP BY patient_id
    ) first_visit
        ON e.patient_id = first_visit.patient_id

    WHERE p.voided = 0

    AND e.encounter_datetime > first_visit.first_visit_this_year

    AND DATE(e.encounter_datetime) >= @startDate
    AND DATE(e.encounter_datetime) < @endDate
    AND v.location_id = @location

    AND p.patient_id NOT IN (
        SELECT person_id 
        FROM person_attribute 
        WHERE value = 'true' 
        AND person_attribute_type_id = @testPt 
        AND voided = 0
    )
    GROUP BY e.patient_id, DATE(e.encounter_datetime)
) t;

-- New visits Of pregnancy women
SELECT
    COUNT(*)
   INTO @pregnant_visits_n
FROM encounter e
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN (
    SELECT
        e.encounter_id
    FROM encounter e
    INNER JOIN obs o_pn
        ON o_pn.encounter_id = e.encounter_id
        AND o_pn.value_coded =  concept_from_mapping('PIH','6259')
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
        AND e.encounter_datetime >= @startDate
	    AND e.encounter_datetime <  @endDate
       GROUP BY o_pn.person_id
) last_encounters
    ON last_encounters.encounter_id = e.encounter_id
    WHERE  e.encounter_datetime >= @startDate
	AND e.encounter_datetime <  @endDate
	AND v.location_id = @location;


-- Subsequent visits for pregnancy women
SELECT COUNT(*) 
INTO @pregnant_visits_s
FROM (

    SELECT
        fs.patient_id,
        DATE(fs.encounter_datetime) AS visit_date

    FROM encounter fs
    INNER JOIN visit v_fs ON fs.visit_id = v_fs.visit_id AND v_fs.voided = 0

    INNER JOIN obs o_suivi
        ON o_suivi.encounter_id = fs.encounter_id
        AND o_suivi.concept_id  = concept_from_mapping('PIH', '13236')
        AND o_suivi.value_coded = concept_from_mapping('PIH', '7383')
        AND o_suivi.voided = 0

    INNER JOIN obs o_pn
        ON o_pn.encounter_id = fs.encounter_id
        AND o_pn.concept_id  = concept_from_mapping('PIH', '8879')
        AND o_pn.value_coded = concept_from_mapping('PIH', '6259')
        AND o_pn.voided = 0

    WHERE fs.voided = 0
    AND NOT EXISTS (
        SELECT 1
        FROM encounter e_new
        INNER JOIN obs o_new_type
            ON o_new_type.encounter_id = e_new.encounter_id
            AND o_new_type.concept_id  = concept_from_mapping('PIH', '13236')
            AND o_new_type.value_coded = concept_from_mapping('PIH', '13235')
            AND o_new_type.voided = 0
        INNER JOIN obs o_new_pn
            ON o_new_pn.encounter_id = e_new.encounter_id
            AND o_new_pn.concept_id  = concept_from_mapping('PIH', '8879')
            AND o_new_pn.value_coded = concept_from_mapping('PIH', '6259')
            AND o_new_pn.voided = 0
        WHERE e_new.patient_id = fs.patient_id
          AND DATE(e_new.encounter_datetime) = DATE(fs.encounter_datetime)
          AND e_new.voided = 0
    )

    AND fs.encounter_datetime >= @startDate
    AND fs.encounter_datetime < @endDate
    AND v_fs.location_id = @location

    GROUP BY fs.patient_id, DATE(fs.encounter_datetime)

) x;

-- NEW CLIENT PF
SELECT
       COUNT(*)
   INTO @clientPfN
FROM encounter e
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN (
    SELECT
        e.encounter_id
    FROM encounter e
    INNER JOIN obs o_pf
        ON o_pf.encounter_id = e.encounter_id
        AND o_pf.value_coded =  concept_from_mapping('PIH','5483')
        AND o_pf.voided = 0
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
            o.value_coded = concept_from_mapping('PIH','5483')
            AND o2.value_coded = concept_from_mapping('PIH','13235')
            AND o.voided = 0
            AND o2.voided = 0
            AND e.voided = 0
            AND e.encounter_datetime IS NOT NULL
        GROUP BY o.person_id
    ) last_enc
        ON last_enc.person_id = o_pf.person_id
       AND last_enc.last_enc_datetime = e.encounter_datetime
        and e.voided = 0
        and o_pf.voided =0
        AND e.encounter_datetime >= @startDate
	    AND e.encounter_datetime <  @endDate
       GROUP BY o_pf.person_id
) last_encounters
    ON last_encounters.encounter_id = e.encounter_id
    WHERE  e.encounter_datetime >= @startDate
	AND e.encounter_datetime <  @endDate
	AND v.location_id = @location;


-- SUBSEQUENT CLIENT PF
SELECT COUNT(*) 
INTO @clientPfS
FROM (

    SELECT
        fs.patient_id,
        DATE(fs.encounter_datetime) AS visit_date

    FROM encounter fs
    INNER JOIN visit v_fs ON fs.visit_id = v_fs.visit_id AND v_fs.voided = 0

    INNER JOIN obs o_suivi
        ON o_suivi.encounter_id = fs.encounter_id
        AND o_suivi.concept_id  = concept_from_mapping('PIH', '13236')
        AND o_suivi.value_coded = concept_from_mapping('PIH', '7383')
        AND o_suivi.voided = 0

    INNER JOIN obs o_pf
        ON o_pf.encounter_id = fs.encounter_id
        AND o_pf.concept_id  = concept_from_mapping('PIH', '8879')
        AND o_pf.value_coded = concept_from_mapping('PIH', '5483')
        AND o_pf.voided = 0


    WHERE fs.voided = 0

    AND NOT EXISTS (
        SELECT 1
        FROM encounter e_new
        INNER JOIN obs o_new_type
            ON o_new_type.encounter_id = e_new.encounter_id
            AND o_new_type.concept_id  = concept_from_mapping('PIH', '13236')
            AND o_new_type.value_coded = concept_from_mapping('PIH', '13235')
            AND o_new_type.voided = 0
        INNER JOIN obs o_new_pf
            ON o_new_pf.encounter_id = e_new.encounter_id
            AND o_new_pf.concept_id  = concept_from_mapping('PIH', '8879')
            AND o_new_pf.value_coded = concept_from_mapping('PIH', '5483')
            AND o_new_pf.voided = 0
        WHERE e_new.patient_id = fs.patient_id
          AND DATE(e_new.encounter_datetime) = DATE(fs.encounter_datetime)
          AND e_new.voided = 0
    )
    AND fs.encounter_datetime >= @startDate
    AND fs.encounter_datetime < @endDate
    AND v_fs.location_id = @location

    GROUP BY fs.patient_id, DATE(fs.encounter_datetime)

) x;


-- PEOPLE MENTAL DISODER
SELECT COUNT(*) 
INTO @totalMentalDisorder
from
obs o 
INNER JOIN encounter e 
ON o.encounter_id =e.encounter_id  
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
WHERE o.value_coded =concept_from_mapping('PIH','7202')
AND o.voided =0
AND date(e.encounter_datetime) >= @startDate
AND date(e.encounter_datetime) < @endDate
AND v.location_id = @location
GROUP BY e.patient_id, DATE(e.encounter_datetime);

-- EXAMEN LABORATOIRE

 DROP TEMPORARY TABLE IF EXISTS  pregnancy_patient_temp;
CREATE TEMPORARY TABLE pregnancy_patient_temp(person_id int,pregnant int);
 INSERT INTO pregnancy_patient_temp(person_id,pregnant)
   SELECT
    o.person_id, IF(DATE(o.value_datetime) > CURDATE(), 1, 0)
    FROM obs o
    INNER JOIN encounter e ON o.encounter_id = e.encounter_id AND e.voided = 0
    INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
    WHERE o.concept_id = concept_from_mapping('PIH', '5596')
    AND o.voided = 0
    AND DATE(o.value_datetime) > CURDATE()
    AND v.location_id = @location
    GROUP BY o.person_id;


-- TOTAL TEST D'URINE
SELECT COUNT(*) INTO @total_urine_test_women
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
INNER JOIN pregnancy_patient_temp pr
    ON p.person_id = pr.person_id
WHERE o.concept_id = concept_from_mapping('PIH', '12375')
  AND pr.pregnant=1
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND date(e.encounter_datetime) < @endDate
  AND v.location_id = @location;


-- TOTAL TEST D'HEMOGRAME
SELECT COUNT(*) INTO @total_hemogram_test_women
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
INNER JOIN pregnancy_patient_temp pr
    ON p.person_id = pr.person_id
WHERE o.concept_id = concept_from_mapping('PIH', '11711')
  AND pr.pregnant=1
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND date(e.encounter_datetime) < @endDate
  AND v.location_id = @location;
 

 -- TOTAL TEST MALARIA TEST RAPID
SELECT COUNT(*) INTO @totat_malaria_rapd_test_women
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
INNER JOIN pregnancy_patient_temp pr
    ON p.person_id = pr.person_id
WHERE o.concept_id = concept_from_mapping('PIH', '11464')
  AND pr.pregnant=1
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND date(e.encounter_datetime) < @endDate
  AND v.location_id = @location;
 
  -- TOTAL TEST RPR
SELECT COUNT(*) INTO @total_rpr_test_women
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
INNER JOIN pregnancy_patient_temp pr
    ON p.person_id = pr.person_id
WHERE o.concept_id = concept_from_mapping('PIH', 'RPR')
  AND pr.pregnant=1
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND date(e.encounter_datetime) < @endDate
  AND v.location_id = @location;
 
 
  -- TOTAL TEST  HIV
SELECT COUNT(*) INTO @total_hiv_test_women
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
INNER JOIN pregnancy_patient_temp pr
    ON p.person_id = pr.person_id
WHERE o.concept_id = concept_from_mapping('PIH', '1040')
  AND pr.pregnant=1
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND date(e.encounter_datetime) < @endDate
  AND v.location_id = @location;
 
  -- TOTAL SICKLING TEST
SELECT COUNT(*) INTO @total_sickling_test_women
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
INNER JOIN pregnancy_patient_temp pr
    ON p.person_id = pr.person_id
WHERE o.concept_id = concept_from_mapping('PIH', '12716')
  AND pr.pregnant=1
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND date(e.encounter_datetime) < @endDate
  AND v.location_id = @location;
 
 
  -- TOTAL TEST GROUPE SANGUIN
SELECT COUNT(*) INTO @total_blood_type_test_women
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
INNER JOIN pregnancy_patient_temp pr
    ON p.person_id = pr.person_id
WHERE o.concept_id = concept_from_mapping('PIH', 'BLOOD TYPING')
  AND pr.pregnant=1
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND date(e.encounter_datetime) < @endDate
  AND v.location_id = @location;
   
 

-- Data for not Pregnant Women
 
  -- TOTAL TEST GROUPE SANGUIN FOR NOT PREGNANT
SELECT COUNT(*) INTO @total_blood_type_test
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
WHERE o.concept_id = concept_from_mapping('PIH', 'BLOOD TYPING')
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND date(e.encounter_datetime) < @endDate
  AND v.location_id = @location;
 
  -- TOTAL SICKLING TEST NOT PREGNANT
SELECT COUNT(*) 
INTO @total_sickling_test
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
WHERE o.concept_id = concept_from_mapping('PIH', '12716')
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND v.location_id = @location;

  
  
 -- TOTAL TEST MALARIA TEST RAPID NOT PREGNANT

 SELECT COUNT(*) 
INTO @total_malaria_rapd_test
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
WHERE o.concept_id = concept_from_mapping('PIH', '11464')
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND date(e.encounter_datetime) < @endDate
  AND v.location_id = @location;



  
 -- TOTAL TEST MALARIA TEST RAPID POSITIVE NOT PREGNANT
SELECT COUNT(*) INTO @totat_malaria_rapd_test_positif
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
WHERE o.concept_id = concept_from_mapping('PIH', '11464')
  AND concept_name(o.value_coded, 'fr') = 'Positif'
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND date(e.encounter_datetime) < @endDate
  AND v.location_id = @location;
 
 
 -- TOTAL TEST MALARIA TEST RAPID POSITIVE
SELECT COUNT(*) INTO @totat_malaria_rapd_test_positif_women
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
INNER JOIN pregnancy_patient_temp pr
    ON p.person_id = pr.person_id
WHERE o.concept_id = concept_from_mapping('PIH', '11464')
  AND pr.pregnant=1
  AND concept_name(o.value_coded, 'fr') = 'Positif'
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND date(e.encounter_datetime) < @endDate
  AND v.location_id = @location;
 
  -- TOTAL TEST RPR POSITIVE
 SELECT COUNT(*) INTO @total_rpr_test_positif_women
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
INNER JOIN pregnancy_patient_temp pr
    ON p.person_id = pr.person_id
WHERE o.concept_id = concept_from_mapping('PIH', 'RPR')
  AND pr.pregnant=1
  AND concept_name(o.value_coded, 'fr') = 'Positif'
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND date(e.encounter_datetime) < @endDate
  AND v.location_id = @location;
 
 
 
  -- TOTAL TEST  HIV POSITIVE
SELECT COUNT(*) INTO @total_hiv_test_positif_women
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
INNER JOIN pregnancy_patient_temp pr
    ON p.person_id = pr.person_id
WHERE o.concept_id = concept_from_mapping('PIH', '1040')
  AND pr.pregnant=1
  AND concept_name(o.value_coded, 'fr') = 'Positif'
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND date(e.encounter_datetime) < @endDate
  AND v.location_id = @location;

--  FOR Malaria Test microscopique
 
 SELECT COUNT(1) INTO @malaria_test_microscopique_vivax  
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
WHERE o.value_coded = concept_from_mapping("PIH","11463")
  AND o.concept_id = concept_from_mapping('PIH', '20079')
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND date(e.encounter_datetime) < @endDate
  AND v.location_id = @location;
 
 
 
SELECT COUNT(1) INTO @malaria_test_microscopique_oval  
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
WHERE o.value_coded = concept_from_mapping("PIH","20083")
  AND o.concept_id = concept_from_mapping('PIH', '20079')
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND date(e.encounter_datetime) < @endDate
  AND v.location_id = @location;
 

SELECT COUNT(1) INTO @malaria_test_microscopique_malariae 
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
WHERE o.value_coded = concept_from_mapping("PIH","20082")
 AND o.concept_id = concept_from_mapping('PIH', '20079')
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND date(e.encounter_datetime) < @endDate
  AND v.location_id = @location;
 
SELECT COUNT(1) INTO @malaria_test_microscopique_falciparum 
FROM obs o 
INNER JOIN encounter e 
    ON o.encounter_id = e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p
    ON p.person_id = o.person_id
 WHERE o.value_coded = concept_from_mapping("PIH","11461")
  AND o.concept_id = concept_from_mapping('PIH', '20079')
  AND o.voided = 0 
  AND e.voided = 0
  AND date(e.encounter_datetime) >= @startDate
  AND date(e.encounter_datetime) < @endDate
  AND v.location_id = @location;
 
SELECT  (@malaria_test_microscopique_vivax +
         @malaria_test_microscopique_oval +
         @malaria_test_microscopique_malariae +
         @malaria_test_microscopique_falciparum
         ) INTO @malaria_test_microscopique_total ;
         

-- PHYSICAL VIOLENCE
SELECT 
SUM(IF(disp.value_coded=@death AND p.gender ='F'  AND age_at_enc(p.person_id,e.encounter_id) > @kid_age,1,0)),
SUM(IF(disp.value_coded=@death AND p.gender ='M' AND age_at_enc(p.person_id,e.encounter_id) > @kid_age,1,0)),
SUM(IF(disp.value_coded=@death AND age_at_enc(p.person_id,e.encounter_id) <=@kid_age,1,0)),
SUM(IF(disp.value_coded=@discharged AND p.gender ='F' AND age_at_enc(p.person_id,e.encounter_id) > @kid_age,1,0)),
SUM(IF(disp.value_coded=@discharged AND p.gender ='M' AND age_at_enc(p.person_id,e.encounter_id) > @kid_age,1,0)),
SUM(IF(disp.value_coded=@discharged AND age_at_enc(p.person_id,e.encounter_id) <=@kid_age,1,0)),
SUM(IF(disp.value_coded=@TransferOutOfHospital AND p.gender ='F' AND age_at_enc(p.person_id,e.encounter_id) > @kid_age,1,0)),
SUM(IF(disp.value_coded=@TransferOutOfHospital AND p.gender ='M' AND age_at_enc(p.person_id,e.encounter_id) > @kid_age,1,0)),
SUM(IF(disp.value_coded=@TransferOutOfHospital AND age_at_enc(p.person_id,e.encounter_id) <=@kid_age,1,0)),
SUM(IF(disp.value_coded=@LeftWithoutSeeingClinician AND p.gender ='F' AND age_at_enc(p.person_id,e.encounter_id) > @kid_age,1,0)),
SUM(IF(disp.value_coded=@LeftWithoutSeeingClinician AND p.gender ='M' AND age_at_enc(p.person_id,e.encounter_id) > @kid_age,1,0)),
SUM(IF(disp.value_coded=@LeftWithoutSeeingClinician AND age_at_enc(p.person_id,e.encounter_id) <=@kid_age,1,0)) 
INTO 
@PHYSICAL_VIOL_WOMEN_DEAD,@PHYSICAL_VIOL_MEN_DEAD,@PHYSICAL_VIOL_KID_DEAD,
@PHYSICAL_VIOL_WOMEN_TREATED,@PHYSICAL_VIOL_MEN_TREATED,@PHYSICAL_VIOL_KID_TREATED,
@PHYSICAL_VIOL_WOMEN_TRANSFER,@PHYSICAL_VIOL_MEN_TRANSFER,@PHYSICAL_VIOL_KID_TRANSFER,
@PHYSICAL_VIOL_WOMEN_LEFT,@PHYSICAL_VIOL_MEN_LEFT,@PHYSICAL_VIOL_KID_LEFT
FROM obs o 
INNER JOIN encounter e on o.encounter_id =e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p ON p.person_id = o.person_id
LEFT JOIN (
SELECT encounter_id,value_coded  from obs where concept_id =concept_from_mapping("PIH","8620")
GROUP BY encounter_id 
) as disp on o.encounter_id=disp.encounter_id 
where o.concept_id =concept_from_mapping("PIH","3064")
and o.value_coded =concept_from_mapping("PIH","11533")
and e.voided =0
and o.voided =0
AND date(e.encounter_datetime) >= @startDate
 AND date(e.encounter_datetime) < @endDate
 AND v.location_id = @location;
 

-- SEXUAL VIOLENCE 
SELECT 
SUM(IF(disp.value_coded=@death AND p.gender ='F',1,0)),
SUM(IF(disp.value_coded=@death AND p.gender ='M',1,0)),
SUM(IF(disp.value_coded=@death AND p.gender ='F' AND age_at_enc(p.person_id,e.encounter_id) <=@kid_age,1,0)),
SUM(IF(disp.value_coded=@death AND p.gender ='M' AND age_at_enc(p.person_id,e.encounter_id) <=@kid_age,1,0)),
SUM(IF(disp.value_coded=@discharged AND p.gender ='F',1,0)),
SUM(IF(disp.value_coded=@discharged AND p.gender ='M',1,0)),
SUM(IF(disp.value_coded=@discharged AND p.gender ='F' AND age_at_enc(p.person_id,e.encounter_id) <=@kid_age,1,0)),
SUM(IF(disp.value_coded=@discharged AND p.gender ='M' AND age_at_enc(p.person_id,e.encounter_id) <=@kid_age,1,0)),
SUM(IF(disp.value_coded=@TransferOutOfHospital AND p.gender ='F',1,0)),
SUM(IF(disp.value_coded=@TransferOutOfHospital AND p.gender ='M',1,0)),
SUM(IF(disp.value_coded=@TransferOutOfHospital AND p.gender ='F' AND age_at_enc(p.person_id,e.encounter_id) <=@kid_age,1,0)),
SUM(IF(disp.value_coded=@TransferOutOfHospital AND p.gender ='M' AND age_at_enc(p.person_id,e.encounter_id) <=@kid_age,1,0)),
SUM(IF(disp.value_coded=@LeftWithoutSeeingClinician AND p.gender ='F',1,0)),
SUM(IF(disp.value_coded=@LeftWithoutSeeingClinician AND p.gender ='M',1,0)),
SUM(IF(disp.value_coded=@LeftWithoutSeeingClinician AND p.gender ='F' AND age_at_enc(p.person_id,e.encounter_id) <=@kid_age,1,0)),
SUM(IF(disp.value_coded=@LeftWithoutSeeingClinician AND p.gender ='M' AND age_at_enc(p.person_id,e.encounter_id) <=@kid_age,1,0))
INTO
@SEX_VIOL_WOMEN_DEAD,@SEX_VIOL_MEN_DEAD,@SEX_VIOL_KIDF_DEAD,@SEX_VIOL_KIDM_DEAD,
@SEX_VIOL_WOMEN_TREATED,@SEX_VIOL_MEN_TREATED,@SEX_VIOL_KIDF_TREATED,@SEX_VIOL_KIDM_TREATED,
@SEX_VIOL_WOMEN_TRANSFER,@SEX_VIOL_MEN_TRANSFER,@SEX_VIOL_KIDF_TRANSFER,@SEX_VIOL_KIDM_TRANSFER,
@SEX_VIOL_WOMEN_LEFT,@SEX_VIOL_MEN_LEFT,@SEX_VIOL_KIDF_LEFT,@SEX_VIOL_KIDM_LEFT
FROM obs o 
INNER JOIN encounter e on o.encounter_id =e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p ON p.person_id = o.person_id
LEFT JOIN (
SELECT encounter_id,value_coded  from obs where concept_id =concept_from_mapping("PIH","8620")
GROUP BY encounter_id 
) as disp on o.encounter_id=disp.encounter_id 
where o.concept_id = concept_from_mapping("PIH","3064")
and o.value_coded = concept_from_mapping("PIH","11049")
and e.voided =0
and o.voided =0
 AND date(e.encounter_datetime) >= @startDate
    AND date(e.encounter_datetime) < @endDate
    AND v.location_id = @location;

-- OTHER VIOLENCE
SELECT 
SUM(IF(disp.value_coded=@death AND p.gender ='F',1,0)),
SUM(IF(disp.value_coded=@death AND p.gender ='M',1,0)),
SUM(IF(disp.value_coded=@death AND age_at_enc(p.person_id,e.encounter_id) <=@kid_age,1,0)),
SUM(IF(disp.value_coded=@discharged AND p.gender ='F',1,0)),
SUM(IF(disp.value_coded=@discharged AND p.gender ='M',1,0)),
SUM(IF(disp.value_coded=@discharged AND age_at_enc(p.person_id,e.encounter_id) <=@kid_age,1,0)),
SUM(IF(disp.value_coded=@TransferOutOfHospital AND p.gender ='F',1,0)),
SUM(IF(disp.value_coded=@TransferOutOfHospital AND p.gender ='M',1,0)),
SUM(IF(disp.value_coded=@TransferOutOfHospital AND age_at_enc(p.person_id,e.encounter_id) <=@kid_age,1,0)),
SUM(IF(disp.value_coded=@LeftWithoutSeeingClinician AND p.gender ='F',1,0)),
SUM(IF(disp.value_coded=@LeftWithoutSeeingClinician AND p.gender ='M',1,0)),
SUM(IF(disp.value_coded=@LeftWithoutSeeingClinician AND age_at_enc(p.person_id,e.encounter_id) <=@kid_age,1,0)) 
INTO @OTHER_SEX_VIOL_WOMEN_DEAD,@OTHER_SEX_VIOL_MEN_DEAD,@OTHER_SEX_VIOL_KID_DEAD,@OTHER_SEX_VIOL_WOMEN_TREATED,@OTHER_SEX_VIOL_MEN_TREATED,@OTHER_SEX_VIOL_KID_TREATED,
@OTHER_SEX_VIOL_WOMEN_TRANSFER,@OTHER_SEX_VIOL_MEN_TRANSFER,@OTHER_SEX_VIOL_KID_TRANSFER,@OTHER_SEX_VIOL_WOMEN_LEFT,@OTHER_SEX_VIOL_MEN_LEFT,@OTHER_SEX_VIOL_KID_LEFT
FROM obs o 
INNER JOIN encounter e on o.encounter_id =e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
INNER JOIN person p ON p.person_id = o.person_id
LEFT JOIN (
SELECT encounter_id,value_coded  from obs where concept_id =concept_from_mapping("PIH","8620")
GROUP BY encounter_id 
) as disp on o.encounter_id=disp.encounter_id 
where o.concept_id =concept_from_mapping("PIH","3064")
 AND 
      (
        o.value_coded = concept_from_mapping("PIH","8852")
        OR o.value_coded = concept_from_mapping("PIH","11550")
      )
and e.voided =0
and o.voided =0
AND date(e.encounter_datetime) >= @startDate
 AND date(e.encounter_datetime) < @endDate
 AND v.location_id = @location;
 
-- DOMESTIC ACCIDENT
SELECT 
SUM(IF(disp.value_coded=@LeftWithoutSeeingClinician,1,0)),
SUM(IF(disp.value_coded=@discharged,1,0)) ,
SUM(IF(disp.value_coded=@TransferOutOfHospital,1,0)),
SUM(IF(disp.value_coded=@death,1,0)) 
INTO @ACC_DOMES_LEFT,@ACC_DOMES_TREATED,@ACC_DOMES_TRANSFER,@ACC_DOMES_DEAD
FROM obs o 
INNER JOIN encounter e on o.encounter_id =e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
LEFT JOIN (
SELECT encounter_id,value_coded  FROM obs WHERE concept_id =concept_from_mapping("PIH","8620")
GROUP BY encounter_id 
) AS disp ON o.encounter_id=disp.encounter_id 
WHERE o.concept_id =concept_from_mapping("PIH","3064")
AND o.value_coded = concept_from_mapping('PIH','Home accident')
AND e.voided =0
AND o.voided =0
AND date(e.encounter_datetime) >= @startDate
AND date(e.encounter_datetime) < @endDate
AND v.location_id = @location;
      
-- WORK ACCIDENT
SELECT 
SUM(IF(disp.value_coded=@death,1,0)),
SUM(IF(disp.value_coded=@discharged,1,0)),
SUM(IF(disp.value_coded=@TransferOutOfHospital,1,0)),
SUM(IF(disp.value_coded=@LeftWithoutSeeingClinician,1,0))
INTO @ACC_TR_DEAD,@ACC_TR_TREATED,@ACC_TR_TRANSFER,@ACC_TR_LEFT
FROM obs o 
INNER JOIN encounter e on o.encounter_id =e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
LEFT JOIN (
SELECT encounter_id,value_coded  from obs where concept_id =concept_from_mapping("PIH","8620")
GROUP BY encounter_id 
) as disp on o.encounter_id=disp.encounter_id 
where o.concept_id = concept_from_mapping("PIH","8849")
and o.value_coded = concept_from_mapping("PIH","8851")
and e.voided =0
and o.voided =0
AND date(e.encounter_datetime) >= @startDate
AND date(e.encounter_datetime) < @endDate
AND v.location_id = @location;
   

 
-- TRANSPORT-MOTOR ACCIDENT
SELECT 
SUM(IF(disp.value_coded=@death,1,0)),
SUM(IF(disp.value_coded=@discharged,1,0)),
SUM(IF(disp.value_coded=@TransferOutOfHospital,1,0)),
SUM(IF(disp.value_coded=@LeftWithoutSeeingClinician,1,0)) 
INTO @ACC_TR_MOTOR_DEAD,@ACC_TR_MOTOR_TREATED,@ACC_TR_MOTOR_TRANSFER,@ACC_TR_MOTOR_LEFT
FROM obs o 
INNER JOIN encounter e on o.encounter_id =e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
LEFT JOIN (
SELECT encounter_id,value_coded  from obs where concept_id =concept_from_mapping("PIH","8620")
GROUP BY encounter_id 
) as disp on o.encounter_id=disp.encounter_id 
where o.concept_id =concept_from_mapping("PIH","3064")
and o.value_coded = concept_from_mapping("PIH","9579")
and e.voided =0
and o.voided =0
AND date(e.encounter_datetime) >= @startDate
AND date(e.encounter_datetime) < @endDate
AND v.location_id = @location;


-- TRANSPORT-VEHICLE ACCIDENT
SELECT 
SUM(IF(disp.value_coded=@death,1,0)),
SUM(IF(disp.value_coded=@discharged,1,0)),
SUM(IF(disp.value_coded=@TransferOutOfHospital,1,0)),
SUM(IF(disp.value_coded=@LeftWithoutSeeingClinician,1,0)) 
INTO @ACC_TR_VEHICLE_DEAD,@ACC_TR_VEHICLE_TREATED,@ACC_TR_VEHICLE_TRANSFER,@ACC_TR_VEHICLE_LEFT
FROM obs o 
INNER JOIN encounter e on o.encounter_id =e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
LEFT JOIN (
SELECT encounter_id,value_coded  from obs where concept_id =concept_from_mapping("PIH","8620")
GROUP BY encounter_id 
) as disp on o.encounter_id=disp.encounter_id 
where o.concept_id =concept_from_mapping("PIH","3064")
and o.value_coded= concept_from_mapping("PIH","9556")
and e.voided =0
and o.voided =0
AND date(e.encounter_datetime) >= @startDate
AND date(e.encounter_datetime) < @endDate
AND v.location_id = @location;

-- OTHER ACCIDENTS 
SELECT 
SUM(IF(disp.value_coded=@death,1,0)),
SUM(IF(disp.value_coded=@discharged,1,0)),
SUM(IF(disp.value_coded=@TransferOutOfHospital,1,0)),
SUM(IF(disp.value_coded=@LeftWithoutSeeingClinician,1,0)) 
INTO @OTHER_ACC_TR_DEAD,@OTHER_ACC_TR_TREATED,@OTHER_ACC_TR_TRANSFER,@OTHER_ACC_TR_LEFT
FROM obs o 
INNER JOIN encounter e on o.encounter_id =e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
LEFT JOIN (
SELECT encounter_id,value_coded  from obs where concept_id =concept_from_mapping("PIH","8620")
GROUP BY encounter_id 
) as disp on o.encounter_id=disp.encounter_id 
where o.concept_id =concept_from_mapping("PIH","3064")
and o.value_coded = concept_from_mapping("PIH","8437")
and e.voided =0
and o.voided =0
AND date(e.encounter_datetime) >= @startDate
AND date(e.encounter_datetime) < @endDate
AND v.location_id = @location;

-- Urgences Medico-Chirurgicales
SELECT 
SUM(IF(o.value_coded=concept_from_mapping('PIH','10710') OR o.value_coded=concept_from_mapping('PIH','10694')
OR o.value_coded=concept_from_mapping('PIH','10695') OR o.value_coded=concept_from_mapping('PIH','8567') 
OR o.value_coded=concept_from_mapping('PIH','10697') OR o.value_coded=concept_from_mapping('PIH','10696') 
OR o.value_coded=concept_from_mapping('PIH','10698'),1,0)),
SUM(IF(o.value_coded=concept_from_mapping('PIH','8419') OR o.value_coded=concept_from_mapping('PIH','10688'),1,0)),
SUM(IF(o.value_coded=concept_from_mapping('PIH','10704') OR o.value_coded=concept_from_mapping('PIH','10705'),1,0)),
SUM(IF(o.value_coded=concept_from_mapping('PIH','9321') OR o.value_coded=concept_from_mapping('PIH','7226'),1,0)),
SUM(IF(o.value_coded=concept_from_mapping('PIH','10706') OR o.value_coded=concept_from_mapping('PIH','136') 
OR o.value_coded=concept_from_mapping('PIH','10707') OR o.value_coded=concept_from_mapping('PIH','151'),1,0)),
SUM(IF(o.value_coded=concept_from_mapping('PIH','83'),1,0))
INTO @UMC_TRAUMA,@UMC_DIGESTIVE,@UMC_RESPIRATORY,@UMC_OBSTETRICS,@UMC_OSTEO_ARTICULAR,@UMC_OTHER
FROM obs o 
INNER JOIN encounter e on o.encounter_id =e.encounter_id
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
WHERE o.concept_id =concept_from_mapping("PIH","Triage diagnosis")
AND o.voided =0
AND e.voided =0
AND date(e.encounter_datetime) >= @startDate
AND date(e.encounter_datetime) < @endDate
AND v.location_id = @location;

-- ACCOUCHEMENT

 
SELECT
    SUM(IF(o.value_coded= concept_from_mapping("PIH",11785) AND age_at_enc(p.person_id, e.encounter_id) < 15, 1, 0)),
    SUM(IF(o.value_coded= concept_from_mapping("PIH",11785) AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19, 1, 0)),
    SUM(IF(o.value_coded= concept_from_mapping("PIH",11785) AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24, 1, 0)),
    SUM(IF(o.value_coded= concept_from_mapping("PIH",11785) AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 29, 1, 0)),
    SUM(IF(o.value_coded= concept_from_mapping("PIH",11785) AND age_at_enc(p.person_id, e.encounter_id) >= 30, 1, 0)),
    SUM(IF(o.value_coded= concept_from_mapping("PIH",11785) AND age_at_enc(p.person_id, e.encounter_id) IS NULL, 1, 0)),

    SUM(IF(o.value_coded= concept_from_mapping("PIH",9336) AND age_at_enc(p.person_id, e.encounter_id) < 15, 1, 0)),
    SUM(IF(o.value_coded= concept_from_mapping("PIH",9336) AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19, 1, 0)),
    SUM(IF(o.value_coded= concept_from_mapping("PIH",9336) AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24, 1, 0)),
    SUM(IF(o.value_coded= concept_from_mapping("PIH",9336) AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 29, 1, 0)),
    SUM(IF(o.value_coded= concept_from_mapping("PIH",9336) AND age_at_enc(p.person_id, e.encounter_id) >= 30, 1, 0)),
    SUM(IF(o.value_coded= concept_from_mapping("PIH",9336) AND age_at_enc(p.person_id, e.encounter_id) IS NULL, 1, 0)),
  
    SUM(IF((o.value_coded= concept_from_mapping("PIH",11785) AND instr_type.value_coded IS NOT NULL) AND age_at_enc(p.person_id, e.encounter_id) < 15, 1, 0)),
    SUM(IF((o.value_coded= concept_from_mapping("PIH",11785) AND instr_type.value_coded IS NOT NULL) AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19, 1, 0)),
    SUM(IF((o.value_coded= concept_from_mapping("PIH",11785) AND instr_type.value_coded IS NOT NULL) AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24, 1, 0)),
    SUM(IF((o.value_coded= concept_from_mapping("PIH",11785) AND instr_type.value_coded IS NOT NULL) AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 29, 1, 0)),
    SUM(IF((o.value_coded= concept_from_mapping("PIH",11785) AND instr_type.value_coded IS NOT NULL) AND age_at_enc(p.person_id, e.encounter_id) >= 30, 1, 0)),
    SUM(IF((o.value_coded= concept_from_mapping("PIH",11785) AND instr_type.value_coded IS NOT NULL) AND age_at_enc(p.person_id, e.encounter_id) IS NULL, 1, 0))
    INTO
    @LESS_THAN_15_NORMAL,
    @BETWEEN_15_19_NORMAL,
    @BETWEEN_20_24_NORMAL,
    @BETWEEN_25_29_NORMAL,
    @THIRTY_AND_ABOVE_NORMAL,
    @UNKNOWN_AGE_NORMAL,
    
    @LESS_THAN_15_CESA,
	@BETWEEN_15_19_CESA,
	@BETWEEN_20_24_CESA,
	@BETWEEN_25_29_CESA,
	@THIRTY_AND_ABOVE_CESA,
	@UNKNOWN_AGE_CESA,
	
	@LESS_THAN_15_INST,
    @BETWEEN_15_19_INST,
    @BETWEEN_20_24_INST,
    @BETWEEN_25_29_INST,
    @THIRTY_AND_ABOVE_INST,
    @UNKNOWN_AGE_INST
FROM obs o 
JOIN encounter e  ON o.encounter_id = e.encounter_id   
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
JOIN person p  ON p.person_id = o.person_id
  LEFT JOIN (
    SELECT encounter_id, value_coded
    FROM obs
    WHERE concept_id = concept_from_mapping("PIH", "20040")
    AND voided=0
    ) AS instr_type ON o.encounter_id = instr_type.encounter_id
   WHERE concept_id = concept_from_mapping("PIH", "11663")  
   AND o.voided = 0
   AND e.voided = 0
   AND DATE(e.encounter_datetime) >= @startDate
   AND DATE(e.encounter_datetime) < @endDate
   AND v.location_id = @location;
--    NAISSANCE
SELECT

    SUM(IF(o.value_coded= concept_from_mapping("PIH",11785) AND weight.value_numeric <1.5,1,0)),
    SUM(IF(o.value_coded= concept_from_mapping("PIH",11785) AND weight.value_numeric >= 1.5 AND weight.value_numeric < 2.5 , 1 , 0)),
    SUM(IF(o.value_coded= concept_from_mapping("PIH",11785) AND weight.value_numeric >=2.5,1,0)) ,
    SUM(IF(o.value_coded= concept_from_mapping("PIH",11785) AND instr_type.value_coded IS NULL  AND weight.value_numeric IS NULL,1,0)) ,
 

    SUM(IF(o.value_coded= concept_from_mapping("PIH",9336) AND weight.value_numeric <1.5,1,0)),
    SUM(IF(o.value_coded= concept_from_mapping("PIH",9336) AND weight.value_numeric >= 1.5 AND weight.value_numeric < 2.5 , 1 , 0)),
    SUM(IF(o.value_coded= concept_from_mapping("PIH",9336) AND weight.value_numeric >=2.5,1,0)) ,
    SUM(IF(o.value_coded= concept_from_mapping("PIH",9336) AND weight.value_numeric IS NULL,1,0)) ,
  
  
    SUM(IF((o.value_coded= concept_from_mapping("PIH",11785) AND instr_type.value_coded IS NOT NULL) AND weight.value_numeric <1.5,1,0)),
    SUM(IF((o.value_coded= concept_from_mapping("PIH",11785) AND instr_type.value_coded IS NOT NULL)  AND weight.value_numeric >= 1.5 AND weight.value_numeric < 2.5 , 1 , 0)),
    SUM(IF((o.value_coded= concept_from_mapping("PIH",11785) AND instr_type.value_coded IS NOT NULL) AND weight.value_numeric >=2.5,1,0)) ,
    SUM(IF((o.value_coded= concept_from_mapping("PIH",11785) AND instr_type.value_coded IS NOT NULL)  AND weight.value_numeric IS NULL,1,0)) 
 
    INTO
    @VAGINAL_MINUS_1_5 ,
	@VAGINAL_BETWEEN_2_5,
	@VAGINAL_EQUAL_OR_MORE_2_5,
	@VAGINAL_NO_WEIGHT, 
	
	@CESA_MINUS_1_5,
	@CESA_BETWEEN_2_5,
	@CESA_EQUAL_OR_MORE_2_5,
	@CESA_NO_WEIGHT,
	
	@INST_MINUS_1_5,
	@INST_BETWEEN_2_5,
	@INST_EQUAL_OR_MORE_2_5,
	@INST_NO_WEIGHT
FROM obs o 
JOIN encounter e  ON o.encounter_id = e.encounter_id   
INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
JOIN person p  ON p.person_id = o.person_id
  LEFT JOIN (
    SELECT encounter_id, value_coded
    FROM obs
    WHERE concept_id = concept_from_mapping("PIH", "20040")
    AND voided=0
    ) AS instr_type ON o.encounter_id = instr_type.encounter_id
    LEFT JOIN (
    SELECT encounter_id,  value_numeric
    FROM obs
    WHERE concept_id = concept_from_mapping("PIH", "11067")
    AND voided=0
) AS weight ON o.encounter_id = weight.encounter_id
   WHERE concept_id = concept_from_mapping("PIH", "11663")  
   AND o.voided = 0
   AND e.voided = 0
   AND DATE(e.encounter_datetime) >= @startDate
   AND DATE(e.encounter_datetime) < @endDate
   AND v.location_id = @location;
--    Client PF
    
  SELECT 
  
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","CONDOMS") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","CONDOMS") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","CONDOMS") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)),
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","CONDOMS") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","CONDOMS") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","CONDOMS") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF(p.gender = 'M' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","CONDOMS") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)) ,
    SUM(IF(p.gender = 'M' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","CONDOMS") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)) ,
    SUM(IF(p.gender = 'M' AND age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","CONDOMS") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)),
    SUM(IF(p.gender = 'M' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","CONDOMS") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF(p.gender = 'M' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","CONDOMS") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)),
    SUM(IF(p.gender = 'M' AND age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","CONDOMS") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","907") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)),
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","907") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)) ,
     SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","907") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","907") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","907") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","907") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","1719") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","1719") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","1719") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","1719") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","1719") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","1719") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)),
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","13158") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)),
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","13158") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)),
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","13158") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","13158") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","13158") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","13158") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)),
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","5277") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)),
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","5277") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)),
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","5277") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","5277") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)),
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","5277") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","5277") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)),
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","5275") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","5275") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","5275") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","5275") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)),
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","5275") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","5275") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","12106") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","12106") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","12106") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)),
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","12106") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","12106") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)),
    SUM(IF(p.gender = 'F' AND age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","12106") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF( age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","1719") AND depistage.value_coded=concept_from_mapping("PIH","13003") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)),
    SUM(IF( age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","1719") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)),
    SUM(IF( age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","1719") AND depistage.value_coded=concept_from_mapping("PIH","13003") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","13958"),1,0)),
    SUM(IF( age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 
    AND planing_method.value_coded=concept_from_mapping("PIH","1719") AND depistage.value_coded=concept_from_mapping("PIH","13003") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF( age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 
    AND planing_method.value_coded=concept_from_mapping("PIH","1719") AND depistage.value_coded=concept_from_mapping("PIH","13003") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) ,
    SUM(IF( age_at_enc(p.person_id, e.encounter_id) >=25
    AND planing_method.value_coded=concept_from_mapping("PIH","1719") AND depistage.value_coded=concept_from_mapping("PIH","13003") 
    AND planing_service_status.value_coded=concept_from_mapping("PIH","10867"),1,0)) 
    
    INTO
            @MET_CONDOM_BET15_19_ACCEPTED,@MET_CONDOM_BET20_24_ACCEPTED,@MET_CONDOM_MORE_25_ACCEPTED,@MET_CONDOM_BET15_19_USED,@MET_CONDOM_BET20_24_USED,@MET_CONDOM_MORE_25_USED, 
			@MET_CONDOM_BET15_19_ACCEPTED_M,@MET_CONDOM_BET20_24_ACCEPTED_M,@MET_CONDOM_MORE_25_ACCEPTED_M,@MET_CONDOM_BET15_19_USED_M,@MET_CONDOM_BET20_24_USED_M,@MET_CONDOM_MORE_25_USED_M,
			@MET_DEPO_PROVERA_BET15_19_ACCEPTED,@MET_DEPO_PROVERA_BET20_24_ACCEPTED,@MET_DEPO_PROVERA_MORE_25_ACCEPTED,@MET_DEPO_PROVERA_BET15_19_USED,@MET_DEPO_PROVERA_BET20_24_USED,@MET_DEPO_PROVERA_MORE_25_USED,
			@MET_LIGATURE_BET15_19_ACCEPTED,@MET_LIGATURE_BET20_24_ACCEPTED,@MET_LIGATURE_MORE_25_ACCEPTED,@MET_LIGATURE_BET15_19_USED,@MET_LIGATURE_BET20_24_USED,@MET_LIGATURE_MORE_25_USED,
			@MET_MAMA_BET15_19_ACCEPTED,@MET_MAMA_BET20_24_ACCEPTED,@MET_MAMA_MORE_25_ACCEPTED,@MET_MAMA_BET15_19_USED,@MET_MAMA_BET20_24_USED,@MET_MAMA_MORE_25_USED,
			@MET_COLIS_BET15_19_ACCEPTED,@MET_COLIS_BET20_24_ACCEPTED,@MET_COLIS_MORE_25_ACCEPTED,@MET_COLIS_BET15_19_USED,@MET_COLIS_BET20_24_USED,@MET_COLIS_MORE_25_USED,
			@MET_DIU_BET15_19_ACCEPTED,@MET_DIU_BET20_24_ACCEPTED,@MET_DIU_MORE_25_ACCEPTED,@MET_DIU_BET15_19_USED,@MET_DIU_BET20_24_USED,@MET_DIU_MORE_25_USED,
            @MET_IMPL_BET15_19_ACCEPTED,@MET_IMPL_BET20_24_ACCEPTED,@MET_IMPL_MORE_25_ACCEPTED,@MET_IMPL_BET15_19_USED,@MET_IMPL_BET20_24_USED,@MET_IMPL_MORE_25_USED,
			@MET_LIGATURE_CCV_BET15_19_ACCEPTED,@MET_LIGATURE_CCV_BET20_24_ACCEPTED,@MET_LIGATURE_CCV_MORE_25_ACCEPTED,@MET_LIGATURE_CCV_BET15_19_USED,
            @MET_LIGATURE_CCV_BET20_24_USED,@MET_LIGATURE_CCV_MORE_25_USED

 
   FROM 
   
    obs o 
   INNER JOIN encounter e ON o.encounter_id = e.encounter_id 
   INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
   INNER JOIN person p ON p.person_id = o.person_id
  LEFT JOIN (
    SELECT encounter_id, value_coded
    FROM obs
    WHERE concept_id = concept_from_mapping("PIH", "374") ) AS planing_method ON o.encounter_id = planing_method.encounter_id
 LEFT JOIN (
    SELECT encounter_id, value_coded
    FROM obs
    WHERE concept_id = concept_from_mapping("PIH", "14321") ) AS planing_service_status ON o.encounter_id = planing_service_status.encounter_id
 LEFT JOIN (
    SELECT encounter_id, value_coded
    FROM obs
    WHERE concept_id = concept_from_mapping("PIH", "13008") ) AS depistage ON o.encounter_id = depistage.encounter_id

WHERE 
    o.value_coded = concept_from_mapping("PIH", "5483")
   
   AND e.voided = 0
   AND o.voided = 0
   AND DATE(e.encounter_datetime) >= @startDate
   AND DATE(e.encounter_datetime) < @endDate
   AND v.location_id = @location;



-- 5) PRISE EN CHARGE DE LA FEMME ET DE LA MERE
DROP TEMPORARY TABLE IF EXISTS visits_prenatal_temp;
CREATE TEMPORARY TABLE visits_prenatal_temp (
     visit_number VARCHAR(50),
     person_id  VARCHAR(50),
     categorie_mois_1_visit  VARCHAR(50),
     categorie_mois_2_visit  VARCHAR(50),
     categorie_mois_3_visit  VARCHAR(50),
     categorie_mois_4_visit  VARCHAR(50),
     categorie_mois_5_visit  VARCHAR(50));

INSERT INTO visits_prenatal_temp (
    visit_number,
    person_id,
    categorie_mois_1_visit,
    categorie_mois_2_visit,
    categorie_mois_3_visit,
    categorie_mois_4_visit,
    categorie_mois_5_visit
)
SELECT 
    CONCAT('Visite ', v.visit_rank) AS numero_visite,
    v.person_id,

    CASE WHEN v.visit_rank = 1 THEN 
        CASE
            WHEN v.last_dlmp IS NULL OR v.edd IS NULL THEN 'Hors période'
            WHEN v.encounter_datetime < v.last_dlmp THEN 'Hors période'
            WHEN v.encounter_datetime BETWEEN v.last_dlmp AND DATE_ADD(v.last_dlmp, INTERVAL 12 WEEK) THEN '0-3'
            WHEN v.encounter_datetime BETWEEN DATE_ADD(v.last_dlmp, INTERVAL 13 WEEK) AND DATE_ADD(v.last_dlmp, INTERVAL 26 WEEK) THEN '4-6'
            WHEN v.encounter_datetime BETWEEN DATE_ADD(v.last_dlmp, INTERVAL 27 WEEK) AND v.edd THEN '7-9'
            ELSE 'Hors période'
        END
    ELSE NULL END AS categorie_mois_1_visit,
    
    CASE WHEN v.visit_rank = 2 THEN 
        CASE
            WHEN v.last_dlmp IS NULL OR v.edd IS NULL THEN 'Hors période'
            WHEN v.encounter_datetime < v.last_dlmp THEN 'Hors période'
            WHEN v.encounter_datetime BETWEEN v.last_dlmp AND DATE_ADD(v.last_dlmp, INTERVAL 12 WEEK) THEN '0-3'
            WHEN v.encounter_datetime BETWEEN DATE_ADD(v.last_dlmp, INTERVAL 13 WEEK) AND DATE_ADD(v.last_dlmp, INTERVAL 26 WEEK) THEN '4-6'
            WHEN v.encounter_datetime BETWEEN DATE_ADD(v.last_dlmp, INTERVAL 27 WEEK) AND v.edd THEN '7-9'
            ELSE 'Hors période'
        END
    ELSE NULL END AS categorie_mois_2_visit,
    
    CASE WHEN v.visit_rank = 3 THEN 
        CASE
            WHEN v.last_dlmp IS NULL OR v.edd IS NULL THEN 'Hors période'
            WHEN v.encounter_datetime < v.last_dlmp THEN 'Hors période'
            WHEN v.encounter_datetime BETWEEN v.last_dlmp AND DATE_ADD(v.last_dlmp, INTERVAL 12 WEEK) THEN '0-3'
            WHEN v.encounter_datetime BETWEEN DATE_ADD(v.last_dlmp, INTERVAL 13 WEEK) AND DATE_ADD(v.last_dlmp, INTERVAL 26 WEEK) THEN '4-6'
            WHEN v.encounter_datetime BETWEEN DATE_ADD(v.last_dlmp, INTERVAL 27 WEEK) AND v.edd THEN '7-9'
            ELSE 'Hors période'
        END
    ELSE NULL END AS categorie_mois_3_visit,
    
    CASE WHEN v.visit_rank = 4 THEN 
        CASE
            WHEN v.last_dlmp IS NULL OR v.edd IS NULL THEN 'Hors période'
            WHEN v.encounter_datetime < v.last_dlmp THEN 'Hors période'
            WHEN v.encounter_datetime BETWEEN v.last_dlmp AND DATE_ADD(v.last_dlmp, INTERVAL 12 WEEK) THEN '0-3'
            WHEN v.encounter_datetime BETWEEN DATE_ADD(v.last_dlmp, INTERVAL 13 WEEK) AND DATE_ADD(v.last_dlmp, INTERVAL 26 WEEK) THEN '4-6'
            WHEN v.encounter_datetime BETWEEN DATE_ADD(v.last_dlmp, INTERVAL 27 WEEK) AND v.edd THEN '7-9'
            ELSE 'Hors période'
        END
    ELSE NULL END AS categorie_mois_4_visit,
    
    CASE WHEN v.visit_rank >= 5 THEN 
        CASE
            WHEN v.last_dlmp IS NULL OR v.edd IS NULL THEN 'Hors période'
            WHEN v.encounter_datetime < v.last_dlmp THEN 'Hors période'
            WHEN v.encounter_datetime BETWEEN v.last_dlmp AND DATE_ADD(v.last_dlmp, INTERVAL 12 WEEK) THEN '0-3'
            WHEN v.encounter_datetime BETWEEN DATE_ADD(v.last_dlmp, INTERVAL 13 WEEK) AND DATE_ADD(v.last_dlmp, INTERVAL 26 WEEK) THEN '4-6'
            WHEN v.encounter_datetime BETWEEN DATE_ADD(v.last_dlmp, INTERVAL 27 WEEK) AND v.edd THEN '7-9'
            ELSE 'Hors période'
        END
    ELSE NULL END AS categorie_mois_5_visit
FROM (
    SELECT 
        o.person_id,
        e.encounter_datetime,
        e.encounter_id,
        last_edd.edd,
        last_date_of_last_menstrual_period.last_dlmp,
        (
            SELECT COUNT(*) 
            FROM obs o2
            JOIN encounter e2 ON e2.encounter_id = o2.encounter_id
            WHERE o2.person_id = o.person_id
            AND o2.concept_id = CONCEPT_FROM_MAPPING('PIH', '8879')
            AND o2.value_coded = CONCEPT_FROM_MAPPING('PIH', '6259')
            AND o2.voided = 0
            AND e2.voided = 0
            AND (
                DATE(e2.encounter_datetime) < DATE(e.encounter_datetime)
                OR DATE(e2.encounter_datetime) = DATE(e.encounter_datetime) 
                AND e2.encounter_id <= e.encounter_id
            )
            AND DATE(e2.encounter_datetime) >= @startDate
            AND DATE(e2.encounter_datetime) < @endDate
        ) AS visit_rank
    FROM obs o
    JOIN encounter e ON e.encounter_id = o.encounter_id
    JOIN visit v2 ON e.visit_id = v2.visit_id AND v2.voided = 0
    LEFT JOIN (
        SELECT
            MAX(o.value_datetime) AS edd,
            o.person_id  
        FROM obs o 
        JOIN encounter e ON e.encounter_id = o.encounter_id
        WHERE concept_id = CONCEPT_FROM_MAPPING('PIH', 'ESTIMATED DATE OF CONFINEMENT')
        AND o.voided = 0 
        AND e.voided = 0
        AND DATE(o.value_datetime) > @startDate
        GROUP BY o.person_id 
    ) AS last_edd ON o.person_id = last_edd.person_id
    LEFT JOIN (
        SELECT 
            MAX(o.value_datetime) AS last_dlmp,
            o.person_id  
        FROM obs o 
        JOIN encounter e ON e.encounter_id = o.encounter_id
        WHERE o.concept_id = CONCEPT_FROM_MAPPING('PIH', 'DATE OF LAST MENSTRUAL PERIOD')
        AND o.voided = 0 
        AND e.voided = 0
        GROUP BY o.person_id 
    ) AS last_date_of_last_menstrual_period ON o.person_id = last_date_of_last_menstrual_period.person_id  
    WHERE o.concept_id = CONCEPT_FROM_MAPPING('PIH', '8879')
    AND o.value_coded = CONCEPT_FROM_MAPPING('PIH', '6259')
    AND o.voided = 0
    AND e.voided = 0
    AND DATE(e.encounter_datetime) >= @startDate
    AND DATE(e.encounter_datetime) < @endDate
    AND v2.location_id = @location
) AS v
ORDER BY v.person_id, v.encounter_datetime, v.encounter_id;

   SELECT 
   SUM(IF(categorie_mois_1_visit='0-3',1,0)),
   SUM(IF(categorie_mois_1_visit='4-6',1,0)),
   SUM(IF(categorie_mois_1_visit='7-9',1,0)),

   
   SUM(IF(categorie_mois_2_visit='0-3',1,0)),
   SUM(IF(categorie_mois_2_visit='4-6',1,0)),
   SUM(IF(categorie_mois_2_visit='7-9',1,0)),
   
   SUM(IF(categorie_mois_3_visit='0-3',1,0)),
   SUM(IF(categorie_mois_3_visit='4-6',1,0)),
   SUM(IF(categorie_mois_3_visit='7-9',1,0)),
   
   SUM(IF(categorie_mois_4_visit='0-3',1,0)),
   SUM(IF(categorie_mois_4_visit='4-6',1,0)),
   SUM(IF(categorie_mois_4_visit='7-9',1,0)),
   
   SUM(IF(categorie_mois_5_visit='0-3',1,0)),
   SUM(IF(categorie_mois_5_visit='4-6',1,0)),
   SUM(IF(categorie_mois_5_visit='7-9',1,0))
   
   INTO 
   @PV1_BETWEEN_0_3,@PV1_BETWEEN_4_6, @PV1_BETWEEN_7_9,
   @PV2_BETWEEN_0_3,@PV2_BETWEEN_4_6, @PV2_BETWEEN_7_9,
   @PV3_BETWEEN_0_3,@PV3_BETWEEN_4_6, @PV3_BETWEEN_7_9,
   @PV4_BETWEEN_0_3,@PV4_BETWEEN_4_6, @PV4_BETWEEN_7_9,
   @PV5_BETWEEN_0_3,@PV5_BETWEEN_4_6, @PV5_BETWEEN_7_9
   FROM visits_prenatal_temp;
   
   -- Nouveau Episode Maladie
     
		  
		  
  SELECT 
   
          -- Cas Febrile
		   
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'F' AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'M' AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END),
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'F' AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'M' AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END),
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'F' AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'M' AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END),
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END),
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END),
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END),
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END),
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'F' AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'M' AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END),
		  
		  SUM(CASE WHEN  p.dead=1 AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN  disposition.value_coded = concept_from_mapping("PIH", "Transfer out of hospital") AND o.value_coded = concept_from_mapping("PIH", "FEVER") THEN 1 ELSE 0 END)
		  
		     INTO 
			  -- Cas Febrile
			 @FE_AGE_0_F, @FE_AGE_0_M, @FE_AGE_1_4_F, @FE_AGE_1_4_M, @FE_AGE_5_9_F, @FE_AGE_5_9_M, @FE_AGE_10_14_F, @FE_AGE_10_14_M,
             @FE_AGE_15_19_F, @FE_AGE_15_19_M, @FE_AGE_20_24_F, @FE_AGE_20_24_M, @FE_AGE_25_49_F, @FE_AGE_25_49_M, @FE_AGE_50_PLUS_F, @FE_AGE_50_PLUS_M,
             @FE_DEATH, @FE_TRANSFER
		 FROM  obs o 
		  INNER JOIN encounter e ON o.encounter_id = e.encounter_id 
		  INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
		  INNER JOIN person p ON p.person_id = o.person_id
		  LEFT JOIN (
		    SELECT encounter_id, value_coded
		    FROM obs
		    WHERE concept_id = concept_from_mapping("PIH", "8620") AND voided=0 ) AS disposition ON o.encounter_id = disposition.encounter_id
		
		  WHERE  e.voided = 0 AND o.voided = 0
		   AND o.value_coded = concept_from_mapping('PIH', 'FEVER')
		   AND DATE(e.encounter_datetime) >= @startDate
		   AND DATE(e.encounter_datetime) < @endDate
		   AND v.location_id = @location;
		   
		  
		  SELECT 
		  
		   -- Malaria + confirmée + traitée 
   
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "MALARIA") 
		  AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "DISCHARGED") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "MALARIA") 
		  AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "DISCHARGED") THEN 1 ELSE 0 END),
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'F'
		  AND o.value_coded = concept_from_mapping("PIH", "MALARIA") 
		  AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "DISCHARGED") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "MALARIA") 
		  AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "DISCHARGED") THEN 1 ELSE 0 END),
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "MALARIA")  
		  AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "DISCHARGED") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "MALARIA") 
		  AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "DISCHARGED") THEN 1 ELSE 0 END),
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "MALARIA") 
		  AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "DISCHARGED") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "MALARIA")
		  AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "DISCHARGED") THEN 1 ELSE 0 END),
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "MALARIA") 
		  AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "DISCHARGED") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "MALARIA") 
		  AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "DISCHARGED") THEN 1 ELSE 0 END),
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "MALARIA") 
		  AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		  AND o.value_coded = concept_from_mapping("PIH", "DISCHARGED") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "MALARIA") 
		  AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "DISCHARGED") THEN 1 ELSE 0 END),
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "MALARIA") 
		  AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "DISCHARGED") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "MALARIA") 
		  AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "DISCHARGED") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "MALARIA") 
		  AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "DISCHARGED") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "MALARIA")
		  AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "DISCHARGED") THEN 1 ELSE 0 END) ,
		  
		   SUM(CASE WHEN o.value_coded = concept_from_mapping("PIH", "MALARIA")
		   AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		   AND  p.dead=1
		   AND disposition.value_coded = concept_from_mapping("PIH", "DISCHARGED") THEN 1 ELSE 0 END) ,
		   
		   SUM(CASE WHEN o.value_coded = concept_from_mapping("PIH", "MALARIA")
		   AND diagnostic_cert.value_coded = concept_from_mapping("PIH", "CONFIRMED") 
		   AND  disposition.value_coded = concept_from_mapping("PIH", "Transfer out of hospital")  THEN 1 ELSE 0 END) 
		  
		  INTO
		  	 -- Malaria + confirmée + traitée 
			@MCT_AGE_0_F, @MCT_AGE_0_M, @MCT_AGE_1_4_F, @MCT_AGE_1_4_M, @MCT_AGE_5_9_F, @MCT_AGE_5_9_M, @MCT_AGE_10_14_F, @MCT_AGE_10_14_M,
            @MCT_AGE_15_19_F, @MCT_AGE_15_19_M, @MCT_AGE_20_24_F, @MCT_AGE_20_24_M, @MCT_AGE_25_49_F, @MCT_AGE_25_49_M, @MCT_AGE_50_PLUS_F, @MCT_AGE_50_PLUS_M,
            @MCT_DEATH, @MCT_TRANSFER
		  
		   FROM  obs o 
		  INNER JOIN encounter e ON o.encounter_id = e.encounter_id 
		  INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
		  INNER JOIN person p ON p.person_id = o.person_id
		 LEFT JOIN (
		    SELECT encounter_id, value_coded,obs_group_id
		    FROM obs
		    WHERE concept_id = concept_from_mapping("PIH", "1379") AND voided=0 ) AS diagnostic_cert ON o.obs_group_id = diagnostic_cert.obs_group_id
		  LEFT JOIN (
		    SELECT encounter_id, value_coded
		    FROM obs
		    WHERE concept_id = concept_from_mapping("PIH", "8620") AND voided=0 ) AS disposition ON o.encounter_id = disposition.encounter_id
		
		  WHERE  e.voided = 0 AND o.voided = 0
		   AND o.value_coded = concept_from_mapping('PIH', 'MALARIA')
		   AND DATE(e.encounter_datetime) >= @startDate
		   AND DATE(e.encounter_datetime) < @endDate
		   AND v.location_id = @location;
		  
		  
		  SELECT 
		  
		  
		     -- Malaria Severe  + Hospitalise 
		 
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END)  ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END)  ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'F'
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END)  ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END)  ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria")  
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria")
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria")  
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria")
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN  o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND p.dead=1 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN  o.value_coded = concept_from_mapping("PIH", "Severe malaria")
		  AND disposition.value_coded = concept_from_mapping("PIH", "Transfer out of hospital	") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") THEN 1 ELSE 0 END) 
		  
		  INTO 
		  
		  	 -- Malaria Severe  + Hospitalise 
			@MSH_AGE_0_F, @MSH_AGE_0_M, @MSH_AGE_1_4_F, @MSH_AGE_1_4_M, @MSH_AGE_5_9_F, @MSH_AGE_5_9_M, @MSH_AGE_10_14_F, @MSH_AGE_10_14_M,
            @MSH_AGE_15_19_F, @MSH_AGE_15_19_M, @MSH_AGE_20_24_F, @MSH_AGE_20_24_M, @MSH_AGE_25_49_F, @MSH_AGE_25_49_M, @MSH_AGE_50_PLUS_F, @MSH_AGE_50_PLUS_M,
            @MSH_DEATH, @MSH_TRANSFER

		     FROM  obs o 
		  INNER JOIN encounter e ON o.encounter_id = e.encounter_id 
		  INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
		  INNER JOIN person p ON p.person_id = o.person_id  
		  LEFT JOIN (
		    SELECT encounter_id, value_coded
		    FROM obs
		    WHERE concept_id = concept_from_mapping("PIH", "8620") AND voided=0 ) AS disposition ON o.encounter_id = disposition.encounter_id
		
		  WHERE  e.voided = 0 AND o.voided = 0
		   AND o.value_coded = concept_from_mapping('PIH', 'Severe malaria')
		   AND DATE(e.encounter_datetime) >= @startDate
		   AND DATE(e.encounter_datetime) < @endDate
		   AND v.location_id = @location;
		  
		  
	    
		      -- Malaria Severe  + Hospitalise + decedee
		  SELECT 
		  
		    
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL")
		  AND p.dead=1 THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL")
		  AND p.dead=1 THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'F'
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") 
		  AND p.dead=1 THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") 
		  AND p.dead=1 THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria")  
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") 
		  AND p.dead=1 THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL")
		  AND p.dead=1 THEN 1 ELSE 0 END),
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL")
		  AND p.dead=1 THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria")
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") 
		  AND p.dead=1 THEN 1 ELSE 0 END),
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria")  
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") 
		  AND p.dead=1 THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") 
		  AND p.dead=1 THEN 1 ELSE 0 END),
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") 
		  AND p.dead=1 THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") 
		  AND p.dead=1 THEN 1 ELSE 0 END),
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") 
		  AND p.dead=1 THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") 
		  AND p.dead=1 THEN 1 ELSE 0 END),
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") 
		  AND p.dead=1 THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "Severe malaria")
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL")
		  AND p.dead=1 THEN 1 ELSE 0 END),
		  
		  SUM(CASE WHEN o.value_coded = concept_from_mapping("PIH", "Severe malaria") 
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL") 
		  AND p.dead=1 THEN 1 ELSE 0 END),
		  
		  SUM(CASE WHEN  o.value_coded = concept_from_mapping("PIH", "Severe malaria")
		  AND disposition.value_coded = concept_from_mapping("PIH", "ADMIT TO HOSPITAL")
		  AND disposition.value_coded = concept_from_mapping("PIH", "Transfer out of hospital") THEN 1 ELSE 0 END)
		  
		  INTO
		  
		  	  -- Malaria Severe  + Hospitalise + decedee
			@MSHD_AGE_0_F, @MSHD_AGE_0_M, @MSHD_AGE_1_4_F, @MSHD_AGE_1_4_M, @MSHD_AGE_5_9_F, @MSHD_AGE_5_9_M, @MSHD_AGE_10_14_F, @MSHD_AGE_10_14_M,
            @MSHD_AGE_15_19_F, @MSHD_AGE_15_19_M, @MSHD_AGE_20_24_F, @MSHD_AGE_20_24_M, @MSHD_AGE_25_49_F, @MSHD_AGE_25_49_M, @MSHD_AGE_50_PLUS_F, @MSHD_AGE_50_PLUS_M,
            @MSHD_DEATH, @MSHD_TRANSFER
		  
		     FROM  obs o 
		  INNER JOIN encounter e ON o.encounter_id = e.encounter_id 
		  INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
		  INNER JOIN person p ON p.person_id = o.person_id
		  LEFT JOIN (
		    SELECT encounter_id, value_coded
		    FROM obs
		    WHERE concept_id = concept_from_mapping("PIH", "8620") AND voided=0 ) AS disposition ON o.encounter_id = disposition.encounter_id
		
		  WHERE  e.voided = 0 AND o.voided = 0
		   AND o.value_coded = concept_from_mapping('PIH', 'Severe malaria')
		   AND DATE(e.encounter_datetime) >= @startDate
		   AND DATE(e.encounter_datetime) < @endDate
		   AND v.location_id = @location;
		  
		  
		  
		  
		   SELECT 
		  
		   
		   -- Anxiete
		 
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER") THEN 1 ELSE 0 END)  ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'F'
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER")  THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER")  THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN  p.dead=1
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN disposition.value_coded = concept_from_mapping("PIH", "Transfer out of hospital")
		  AND o.value_coded = concept_from_mapping("PIH", "ANXIETY DISORDER") THEN 1 ELSE 0 END) 
		  
		  INTO
		  
		    @ANX_AGE_0_F, @ANX_AGE_0_M, @ANX_AGE_1_4_F, @ANX_AGE_1_4_M, @ANX_AGE_5_9_F, @ANX_AGE_5_9_M, @ANX_AGE_10_14_F, @ANX_AGE_10_14_M,
            @ANX_AGE_15_19_F, @ANX_AGE_15_19_M, @ANX_AGE_20_24_F, @ANX_AGE_20_24_M, @ANX_AGE_25_49_F, @ANX_AGE_25_49_M, @ANX_AGE_50_PLUS_F, @ANX_AGE_50_PLUS_M,
            @ANX_DEATH,@ANX_TRANSFER
		     FROM  obs o 
		  INNER JOIN encounter e ON o.encounter_id = e.encounter_id 
		  INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
		  INNER JOIN person p ON p.person_id = o.person_id
		  LEFT JOIN (
		    SELECT encounter_id, value_coded
		    FROM obs
		    WHERE concept_id = concept_from_mapping("PIH", "8620") AND voided=0 ) AS disposition ON o.encounter_id = disposition.encounter_id
		
		  WHERE  e.voided = 0 AND o.voided = 0
		   AND o.value_coded = concept_from_mapping('PIH', 'ANXIETY DISORDER')
		   AND DATE(e.encounter_datetime) >= @startDate
		   AND DATE(e.encounter_datetime) < @endDate
		   AND v.location_id = @location;
		  
		  
		
		   
		  SELECT
		   -- Démence
		    SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'F'
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA")  THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA")  THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN p.dead=1
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN disposition.value_coded = concept_from_mapping("PIH", "	Transfer out of hospital")
		  AND o.value_coded = concept_from_mapping("PIH", "DEMENTIA") THEN 1 ELSE 0 END) 
		  
		  INTO 
		  
		  
		  	@DEMENTIA_AGE_0_F, @DEMENTIA_AGE_0_M, @DEMENTIA_AGE_1_4_F, @DEMENTIA_AGE_1_4_M, @DEMENTIA_AGE_5_9_F, @DEMENTIA_AGE_5_9_M, @DEMENTIA_AGE_10_14_F, @DEMENTIA_AGE_10_14_M,
			@DEMENTIA_AGE_15_19_F, @DEMENTIA_AGE_15_19_M, @DEMENTIA_AGE_20_24_F, @DEMENTIA_AGE_20_24_M, @DEMENTIA_AGE_25_49_F, @DEMENTIA_AGE_25_49_M, @DEMENTIA_AGE_50_PLUS_F, @DEMENTIA_AGE_50_PLUS_M,
		    @DEMENTIA_DEATH,@DEMENTIA_TRANSFER
		    
		      FROM  obs o 
		  INNER JOIN encounter e ON o.encounter_id = e.encounter_id 
		  INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
		  INNER JOIN person p ON p.person_id = o.person_id
		   LEFT JOIN (
		    SELECT encounter_id, value_coded
		    FROM obs
		    WHERE concept_id = concept_from_mapping("PIH", "8620") AND voided=0 ) AS disposition ON o.encounter_id = disposition.encounter_id
		
		   WHERE  e.voided = 0 AND o.voided = 0
		   AND o.value_coded = concept_from_mapping('PIH', 'DEMENTIA')
		   AND DATE(e.encounter_datetime) >= @startDate
		   AND DATE(e.encounter_datetime) < @endDate
		   AND v.location_id = @location;
		  
		  

		  
		  
		
		  SELECT 
		  
		 
		  -- Dépression
		 
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'F'
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION")  THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION") THEN 1 ELSE 0 END),
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION")  THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN p.dead=1
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN disposition.value_coded = concept_from_mapping("PIH", "Transfer out of hospital")
		  AND o.value_coded = concept_from_mapping("PIH", "DEPRESSION") THEN 1 ELSE 0 END) 
		  
		  INTO
		  
		   @DEPRESSION_AGE_0_F, @DEPRESSION_AGE_0_M, @DEPRESSION_AGE_1_4_F, @DEPRESSION_AGE_1_4_M, @DEPRESSION_AGE_5_9_F, @DEPRESSION_AGE_5_9_M, @DEPRESSION_AGE_10_14_F, @DEPRESSION_AGE_10_14_M,
			@DEPRESSION_AGE_15_19_F, @DEPRESSION_AGE_15_19_M, @DEPRESSION_AGE_20_24_F, @DEPRESSION_AGE_20_24_M, @DEPRESSION_AGE_25_49_F, @DEPRESSION_AGE_25_49_M, @DEPRESSION_AGE_50_PLUS_F, @DEPRESSION_AGE_50_PLUS_M,
			@DEPRESSION_DEATH,@DEPRESSION_TRANSFER
		  
		        FROM  obs o 
		  INNER JOIN encounter e ON o.encounter_id = e.encounter_id 
		  INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
		  INNER JOIN person p ON p.person_id = o.person_id
		  LEFT JOIN (
		    SELECT encounter_id, value_coded
		    FROM obs
		    WHERE concept_id = concept_from_mapping("PIH", "8620") AND voided=0 ) AS disposition ON o.encounter_id = disposition.encounter_id
		
		  WHERE  e.voided = 0 AND o.voided = 0
		  AND o.value_coded = concept_from_mapping('PIH', 'DEPRESSION')
		   AND DATE(e.encounter_datetime) >= @startDate
		   AND DATE(e.encounter_datetime) < @endDate
		   AND v.location_id = @location;
		  
		  
		  
		 SELECT
		     -- Schizophrénie
		 
		   SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'F'
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA")  THEN 1 ELSE 0 END),
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA")  THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA") THEN 1 ELSE 0 END) ,
		  
		  
		  SUM(CASE WHEN p.dead=1
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN disposition.value_coded = concept_from_mapping("PIH", "Transfer out of hospital")
		  AND o.value_coded = concept_from_mapping("PIH", "SCHIZOPHRENIA") THEN 1 ELSE 0 END)
		  
		  INTO
		  
		     @SCHIZOPHRENIA_AGE_0_F, @SCHIZOPHRENIA_AGE_0_M, @SCHIZOPHRENIA_AGE_1_4_F, @SCHIZOPHRENIA_AGE_1_4_M, @SCHIZOPHRENIA_AGE_5_9_F, @SCHIZOPHRENIA_AGE_5_9_M, @SCHIZOPHRENIA_AGE_10_14_F, @SCHIZOPHRENIA_AGE_10_14_M,
			@SCHIZOPHRENIA_AGE_15_19_F, @SCHIZOPHRENIA_AGE_15_19_M, @SCHIZOPHRENIA_AGE_20_24_F, @SCHIZOPHRENIA_AGE_20_24_M, @SCHIZOPHRENIA_AGE_25_49_F, @SCHIZOPHRENIA_AGE_25_49_M, @SCHIZOPHRENIA_AGE_50_PLUS_F, @SCHIZOPHRENIA_AGE_50_PLUS_M,
		    @SCHIZOPHRENIA_DEATH, @SCHIZOPHRENIA_TRANSFER
		         FROM  obs o 
		  INNER JOIN encounter e ON o.encounter_id = e.encounter_id 
		  INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
		  INNER JOIN person p ON p.person_id = o.person_id
		  LEFT JOIN (
		    SELECT encounter_id, value_coded
		    FROM obs
		    WHERE concept_id = concept_from_mapping("PIH", "8620") AND voided=0 ) AS disposition ON o.encounter_id = disposition.encounter_id
		
		  WHERE  e.voided = 0 AND o.voided = 0
		  AND o.value_coded = concept_from_mapping('PIH', 'SCHIZOPHRENIA')
		  AND DATE(e.encounter_datetime) >= @startDate
		  AND DATE(e.encounter_datetime) < @endDate
		  AND v.location_id = @location;
		  
		  
		  
		 SELECT
		  
		    -- Stress aiguë
		 
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7950") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7950") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'F'
		  AND o.value_coded = concept_from_mapping("PIH", "7950") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7950")  THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7950") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "7950") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7950") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "7950") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7950") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7950") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7950") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7950") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7950")  THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7950") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7950") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "7950") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN p.dead=1
		  AND o.value_coded = concept_from_mapping("PIH", "7950") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN disposition.value_coded = concept_from_mapping("PIH", "Transfer out of hospital")
		  AND o.value_coded = concept_from_mapping("PIH", "7950") THEN 1 ELSE 0 END)
		  
		  INTO 
		   @STRESS_AIG_AGE_0_F, @STRESS_AIG_AGE_0_M, @STRESS_AIG_AGE_1_4_F, @STRESS_AIG_AGE_1_4_M, @STRESS_AIG_AGE_5_9_F, @STRESS_AIG_AGE_5_9_M, @STRESS_AIG_AGE_10_14_F, @STRESS_AIG_AGE_10_14_M,
			@STRESS_AIG_AGE_15_19_F, @STRESS_AIG_AGE_15_19_M, @STRESS_AIG_AGE_20_24_F, @STRESS_AIG_AGE_20_24_M, @STRESS_AIG_AGE_25_49_F, @STRESS_AIG_AGE_25_49_M, @STRESS_AIG_AGE_50_PLUS_F, @STRESS_AIG_AGE_50_PLUS_M,
			@STRESS_AIG_DEATH, @STRESS_AIG_TRANSFER
		  
		  FROM  obs o 
		  INNER JOIN encounter e ON o.encounter_id = e.encounter_id 
		  INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
		  INNER JOIN person p ON p.person_id = o.person_id
		  LEFT JOIN (
		    SELECT encounter_id, value_coded
		    FROM obs
		    WHERE concept_id = concept_from_mapping("PIH", "8620") AND voided=0 ) AS disposition ON o.encounter_id = disposition.encounter_id
		
		  WHERE  e.voided = 0 AND o.voided = 0
		   AND o.value_coded = concept_from_mapping('PIH', '7950')
		   AND DATE(e.encounter_datetime) >= @startDate
		   AND DATE(e.encounter_datetime) < @endDate
		   AND v.location_id = @location;
		  
		  
	 SELECT
-- 		    Trouble Bipolaire
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'F'
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder")  THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder")  THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN p.dead=1
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN disposition.value_coded = concept_from_mapping("PIH", "Transfer out of hospital")
		  AND o.value_coded = concept_from_mapping("PIH", "Bipolar disorder") THEN 1 ELSE 0 END) 
		  
		  INTO
		  
		  	@BIPOLAR_DISO_AGE_0_F, @BIPOLAR_DISO_AGE_0_M, @BIPOLAR_DISO_AGE_1_4_F, @BIPOLAR_DISO_AGE_1_4_M, @BIPOLAR_DISO_AGE_5_9_F, @BIPOLAR_DISO_AGE_5_9_M, @BIPOLAR_DISO_AGE_10_14_F, @BIPOLAR_DISO_AGE_10_14_M,
			@BIPOLAR_DISO_AGE_15_19_F, @BIPOLAR_DISO_AGE_15_19_M, @BIPOLAR_DISO_AGE_20_24_F, @BIPOLAR_DISO_AGE_20_24_M, @BIPOLAR_DISO_AGE_25_49_F, @BIPOLAR_DISO_AGE_25_49_M, @BIPOLAR_DISO_AGE_50_PLUS_F, @BIPOLAR_DISO_AGE_50_PLUS_M,
			@BIPOLAR_DISO_DEATH,@BIPOLAR_DISO_TRANSFER
		  FROM  obs o 
		  INNER JOIN encounter e ON o.encounter_id = e.encounter_id 
		  INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
		  INNER JOIN person p ON p.person_id = o.person_id
		  LEFT JOIN (
		    SELECT encounter_id, value_coded
		    FROM obs
		    WHERE concept_id = concept_from_mapping("PIH", "8620") AND voided=0 ) AS disposition ON o.encounter_id = disposition.encounter_id
	
		  WHERE  e.voided = 0 AND o.voided = 0
		  AND o.value_coded = concept_from_mapping('PIH', 'Bipolar disorder')
		  AND DATE(e.encounter_datetime) >= @startDate
		  AND DATE(e.encounter_datetime) < @endDate
		  AND v.location_id = @location;
		  
		  
		 SELECT
		  
		   -- Troubles lies a la consomation de drogues 
		 
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7201") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7201") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'F'
		  AND o.value_coded = concept_from_mapping("PIH", "7201") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7201")  THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7201") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "7201") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7201") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "7201") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7201") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7201") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7201") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7201") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7201")  THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7201") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7201") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "7201") THEN 1 ELSE 0 END) ,
		  
		    SUM(CASE WHEN p.dead=1
		  AND o.value_coded = concept_from_mapping("PIH", "7201") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN disposition.value_coded = concept_from_mapping("PIH", "Transfer out of hospital")
		  AND o.value_coded = concept_from_mapping("PIH", "7201") THEN 1 ELSE 0 END) 
		  
		  INTO
		  
		  @DROG_USED_DISO_AGE_0_F, @DROG_USED_DISO_AGE_0_M, @DROG_USED_DISO_AGE_1_4_F, @DROG_USED_DISO_AGE_1_4_M, @DROG_USED_DISO_AGE_5_9_F, @DROG_USED_DISO_AGE_5_9_M, @DROG_USED_DISO_AGE_10_14_F, @DROG_USED_DISO_AGE_10_14_M,
			@DROG_USED_DISO_AGE_15_19_F, @DROG_USED_DISO_AGE_15_19_M, @DROG_USED_DISO_AGE_20_24_F, @DROG_USED_DISO_AGE_20_24_M, @DROG_USED_DISO_AGE_25_49_F, @DROG_USED_DISO_AGE_25_49_M, @DROG_USED_DISO_AGE_50_PLUS_F, @DROG_USED_DISO_AGE_50_PLUS_M,
			@DROG_USED_DISO_DEATH, @DROG_USED_DISO_TRANSFER
		  
		  
		    FROM  obs o 
		  INNER JOIN encounter e ON o.encounter_id = e.encounter_id 
		  INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
		  INNER JOIN person p ON p.person_id = o.person_id
		  LEFT JOIN (
		    SELECT encounter_id, value_coded
		    FROM obs
		    WHERE concept_id = concept_from_mapping("PIH", "8620") AND voided=0 ) AS disposition ON o.encounter_id = disposition.encounter_id
	
		  WHERE  e.voided = 0 AND o.voided = 0
		  AND o.value_coded = concept_from_mapping('PIH', '7201')
		  AND DATE(e.encounter_datetime) >= @startDate
		  AND DATE(e.encounter_datetime) < @endDate
		  AND v.location_id = @location;
		  
		  
		  
		  
		  
		SELECT 
		  
		  
		   -- Troubles developmental
		 
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7951") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7951") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'F'
		  AND o.value_coded = concept_from_mapping("PIH", "7951") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7951")  THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7951") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "7951") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7951") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "7951") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7951") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7951") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7951") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7951") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7951")  THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7951") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7951") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "7951") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN p.dead=1
		  AND o.value_coded = concept_from_mapping("PIH", "7951") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN disposition.value_coded = concept_from_mapping("PIH", "Transfer out of hospital")
		  AND o.value_coded = concept_from_mapping("PIH", "7951") THEN 1 ELSE 0 END) 
		  
		   INTO
		   @DEVELOP_DISO_AGE_0_F, @DEVELOP_DISO_AGE_0_M, @DEVELOP_DISO_AGE_1_4_F, @DEVELOP_DISO_AGE_1_4_M, @DEVELOP_DISO_AGE_5_9_F, @DEVELOP_DISO_AGE_5_9_M, @DEVELOP_DISO_AGE_10_14_F, @DEVELOP_DISO_AGE_10_14_M,
			@DEVELOP_DISO_AGE_15_19_F, @DEVELOP_DISO_AGE_15_19_M, @DEVELOP_DISO_AGE_20_24_F, @DEVELOP_DISO_AGE_20_24_M, @DEVELOP_DISO_AGE_25_49_F, @DEVELOP_DISO_AGE_25_49_M, @DEVELOP_DISO_AGE_50_PLUS_F, @DEVELOP_DISO_AGE_50_PLUS_M,
			@DEVELOP_DISO_DEATH,  @DEVELOP_DISO_TRANSFER
		  
		     FROM  obs o 
		  INNER JOIN encounter e ON o.encounter_id = e.encounter_id 
		  INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
		  INNER JOIN person p ON p.person_id = o.person_id
		  LEFT JOIN (
		    SELECT encounter_id, value_coded
		    FROM obs
		    WHERE concept_id = concept_from_mapping("PIH", "8620") AND voided=0 ) AS disposition ON o.encounter_id = disposition.encounter_id
	
		  WHERE  e.voided = 0 AND o.voided = 0
		   AND o.value_coded = concept_from_mapping('PIH', '7951')
		   AND DATE(e.encounter_datetime) >= @startDate
		   AND DATE(e.encounter_datetime) < @endDate
		   AND v.location_id = @location;
		  
		  
		  
		  
		  
       SELECT 
		  
-- 		  Troubles Lies a la consommation de l'alcool
		 
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "9522") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "9522") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'F'
		  AND o.value_coded = concept_from_mapping("PIH", "9522") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "9522")  THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "9522") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "9522") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "9522") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "9522") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "9522") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "9522") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "9522") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "9522") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "9522")  THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "9522") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "9522") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "9522") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN p.dead=1
		  AND o.value_coded = concept_from_mapping("PIH", "9522") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN disposition.value_coded = concept_from_mapping("PIH", "Transfer out of hospital")
		  AND o.value_coded = concept_from_mapping("PIH", "9522") THEN 1 ELSE 0 END)
		  
		  INTO
		  
		    @ALCOHOL_USED_DISO_AGE_0_F, @ALCOHOL_USED_DISO_AGE_0_M, @ALCOHOL_USED_DISO_AGE_1_4_F, @ALCOHOL_USED_DISO_AGE_1_4_M, @ALCOHOL_USED_DISO_AGE_5_9_F, @ALCOHOL_USED_DISO_AGE_5_9_M, @ALCOHOL_USED_DISO_AGE_10_14_F, @ALCOHOL_USED_DISO_AGE_10_14_M,
			@ALCOHOL_USED_DISO_AGE_15_19_F, @ALCOHOL_USED_DISO_AGE_15_19_M, @ALCOHOL_USED_DISO_AGE_20_24_F, @ALCOHOL_USED_DISO_AGE_20_24_M, @ALCOHOL_USED_DISO_AGE_25_49_F, @ALCOHOL_USED_DISO_AGE_25_49_M, @ALCOHOL_USED_DISO_AGE_50_PLUS_F, @ALCOHOL_USED_DISO_AGE_50_PLUS_M,
			@ALCOHOL_USED_DISO_DEATH,   @ALCOHOL_USED_DISO_TRANSFER
		       FROM  obs o 
		  INNER JOIN encounter e ON o.encounter_id = e.encounter_id 
		  INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
		  INNER JOIN person p ON p.person_id = o.person_id
		  LEFT JOIN (
		    SELECT encounter_id, value_coded
		    FROM obs
		    WHERE concept_id = concept_from_mapping("PIH", "8620") AND voided=0 ) AS disposition ON o.encounter_id = disposition.encounter_id
	
		  WHERE  e.voided = 0 AND o.voided = 0
		   AND o.value_coded = concept_from_mapping('PIH', '9522')
		   AND DATE(e.encounter_datetime) >= @startDate
		   AND DATE(e.encounter_datetime) < @endDate
		   AND v.location_id = @location;
		  
		  
		  
		 SELECT 
		    --  		Trouble de stress post-traumatique
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7197") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7197") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'F'
		  AND o.value_coded = concept_from_mapping("PIH", "7197") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7197")  THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7197") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "7197") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7197") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "7197") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7197") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7197") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7197") THEN 1 ELSE 0 END),
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7197") THEN 1 ELSE 0 END),
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7197")  THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "7197") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "7197") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "7197") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN p.dead=1
		  AND o.value_coded = concept_from_mapping("PIH", "7197") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN disposition.value_coded = concept_from_mapping("PIH", "Transfer out of hospital")
		  AND o.value_coded = concept_from_mapping("PIH", "7197") THEN 1 ELSE 0 END) 
		  
		  
		  INTO
		  
		    @POST_TRAUMATIC_DISO_AGE_0_F, @POST_TRAUMATIC_DISO_AGE_0_M, @POST_TRAUMATIC_DISO_AGE_1_4_F, @POST_TRAUMATIC_DISO_AGE_1_4_M, @POST_TRAUMATIC_DISO_AGE_5_9_F, @POST_TRAUMATIC_DISO_AGE_5_9_M, @POST_TRAUMATIC_DISO_AGE_10_14_F, @POST_TRAUMATIC_DISO_AGE_10_14_M,
			@POST_TRAUMATIC_DISO_AGE_15_19_F, @POST_TRAUMATIC_DISO_AGE_15_19_M, @POST_TRAUMATIC_DISO_AGE_20_24_F, @POST_TRAUMATIC_DISO_AGE_20_24_M, @POST_TRAUMATIC_DISO_AGE_25_49_F, @POST_TRAUMATIC_DISO_AGE_25_49_M, @POST_TRAUMATIC_DISO_AGE_50_PLUS_F, @POST_TRAUMATIC_DISO_AGE_50_PLUS_M,
		    @POST_TRAUMATIC_DISO_DEATH,@POST_TRAUMATIC_DISO_TRANSFER
		    
		  FROM  obs o 
		  INNER JOIN encounter e ON o.encounter_id = e.encounter_id 
		  INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
		  INNER JOIN person p ON p.person_id = o.person_id
		  LEFT JOIN (
		    SELECT encounter_id, value_coded
		    FROM obs
		    WHERE concept_id = concept_from_mapping("PIH", "8620") AND voided=0 ) AS disposition ON o.encounter_id = disposition.encounter_id
	
		  WHERE  e.voided = 0 AND o.voided = 0
		   AND o.value_coded = concept_from_mapping('PIH', '7197')
		   AND DATE(e.encounter_datetime) >= @startDate
		   AND DATE(e.encounter_datetime) < @endDate
		   AND v.location_id = @location;
		  
		  
		 SELECT
		    --  		Idéation suicidaire
		  		 
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "10633") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) < 1 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "10633") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'F'
		  AND o.value_coded = concept_from_mapping("PIH", "10633") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 1 AND 4 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "10633")  THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "10633") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 5 AND 9 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "10633") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "10633") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "10633") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "10633") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "10633") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "10633") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "10633") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "10633")  THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' 
		  AND o.value_coded = concept_from_mapping("PIH", "10633") THEN 1 ELSE 0 END) ,
		
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'F' 
		  AND o.value_coded = concept_from_mapping("PIH", "10633") THEN 1 ELSE 0 END) ,
		  SUM(CASE WHEN age_at_enc(p.person_id, e.encounter_id) >= 50 AND p.gender = 'M'
		  AND o.value_coded = concept_from_mapping("PIH", "10633") THEN 1 ELSE 0 END),
		  
		  SUM(CASE WHEN p.dead=1
		  AND o.value_coded = concept_from_mapping("PIH", "10633") THEN 1 ELSE 0 END) ,
		  
		  SUM(CASE WHEN disposition.value_coded = concept_from_mapping("PIH", "Transfer out of hospital")
		  AND o.value_coded = concept_from_mapping("PIH", "10633") THEN 1 ELSE 0 END) 
		  
		  INTO
		  
		  	@SUICIDAL_IDEATION_AGE_0_F, @SUICIDAL_IDEATION_AGE_0_M, @SUICIDAL_IDEATION_AGE_1_4_F, @SUICIDAL_IDEATION_AGE_1_4_M, @SUICIDAL_IDEATION_AGE_5_9_F, @SUICIDAL_IDEATION_AGE_5_9_M, @SUICIDAL_IDEATION_AGE_10_14_F, @SUICIDAL_IDEATION_AGE_10_14_M,
			@SUICIDAL_IDEATION_AGE_15_19_F, @SUICIDAL_IDEATION_AGE_15_19_M, @SUICIDAL_IDEATION_AGE_20_24_F, @SUICIDAL_IDEATION_AGE_20_24_M, @SUICIDAL_IDEATION_AGE_25_49_F, @SUICIDAL_IDEATION_AGE_25_49_M, @SUICIDAL_IDEATION_AGE_50_PLUS_F, @SUICIDAL_IDEATION_AGE_50_PLUS_M,
            @SUICIDAL_IDEATION_DEATH,@SUICIDAL_IDEATION_TRANSFER
		  
		    FROM  obs o 
		  INNER JOIN encounter e ON o.encounter_id = e.encounter_id 
		  INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
		  INNER JOIN person p ON p.person_id = o.person_id 
		  LEFT JOIN (
		    SELECT encounter_id, value_coded
		    FROM obs
		    WHERE concept_id = concept_from_mapping("PIH", "8620") AND voided=0 ) AS disposition ON o.encounter_id = disposition.encounter_id
	
		  WHERE  e.voided = 0 AND o.voided = 0
		   AND o.value_coded = concept_from_mapping('PIH', '10633')
		   AND DATE(e.encounter_datetime) >= @startDate
		   AND DATE(e.encounter_datetime) < @endDate
		   AND v.location_id = @location;
		
		 
		  -- Maladie Chroniques

			SELECT 
			 -- Diabetes
 		     --  -10 ans
			
			    SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)),
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)),
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)),
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)),
				
				 -- 10-14 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 15-19 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)),
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)),
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)),
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)),
			
				 -- 20-24 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)),
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)),
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)),
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)),
				
					 -- 25-49 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)),
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)),
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)),
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)),
			    
					 -- 50 ans and more 
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)),
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)),
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)),
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)),
			    
				-- décès
			    SUM(IF(p.dead=1 , 1, 0)) ,
	
			   -- référés
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year = e.encounter_datetime , 1, 0)) ,
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year < e.encounter_datetime , 1, 0)) 
				
				INTO 
				@NEW_DIAB_MINUS_10_F,@OLD_DIAB_MINUS_10_F,@NEW_DIAB_MINUS_10_M,@OLD_DIAB_MINUS_10_M,
				@NEW_DIAB_BET_10_AND_14_F,@OLD_DIAB_BET_10_AND_14_F,@NEW_DIAB_BET_10_AND_14_M,@OLD_DIAB_BET_10_AND_14_M,
				@NEW_DIAB_BET_15_AND_19_F,@OLD_DIAB_BET_15_AND_19_F,@NEW_DIAB_BET_15_AND_19_M,@OLD_DIAB_BET_15_AND_19_M,
				@NEW_DIAB_BET_20_AND_24_F,@OLD_DIAB_BET_20_AND_24_F,@NEW_DIAB_BET_20_AND_24_M,@OLD_DIAB_BET_20_AND_24_M,
				@NEW_DIAB_BET_25_AND_49_F,@OLD_DIAB_BET_25_AND_49_F,@NEW_DIAB_BET_25_AND_49_M,@OLD_DIAB_BET_25_AND_49_M,
				@NEW_DIAB_BET_50_AND_MORE_F,@OLD_DIAB_BET_50_AND_MORE_F,@NEW_DIAB_BET_50_AND_MORE_M,@OLD_DIAB_BET_50_AND_MORE_M,
				@DIAB_DEAD,@NEW_DIAB_DISCHARGED,@OLD_DIAB_DISCHARGED

			FROM obs o 
			INNER JOIN encounter e ON o.encounter_id = e.encounter_id
			INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
			INNER JOIN person p ON p.person_id = o.person_id
			LEFT JOIN (
				SELECT encounter_id, value_coded  
				FROM obs 
				WHERE concept_id = concept_from_mapping("PIH", "8620")
				GROUP BY encounter_id 
			) AS disp ON o.encounter_id = disp.encounter_id 
			LEFT JOIN (
				SELECT e.patient_id, MIN(e.encounter_datetime) AS first_visit_this_year
				FROM obs o 
				JOIN encounter e ON o.encounter_id = e.encounter_id
				WHERE YEAR(e.encounter_datetime) = YEAR(CURDATE()) 
				AND o.value_coded = concept_from_mapping('PIH', 'DIABETES')
				GROUP BY patient_id
			) AS first_visit ON e.patient_id = first_visit.patient_id
			WHERE o.concept_id = concept_from_mapping("PIH", "3064")
			AND o.value_coded = concept_from_mapping('PIH', 'DIABETES')
			AND e.voided = 0
			AND o.voided = 0
			AND DATE(e.encounter_datetime) >= @startDate
            AND DATE(e.encounter_datetime) < @endDate
            AND v.location_id = @location;

 

			SELECT 
			 -- HYPERTENSION
 		     --  -10 ans
			
			    SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 10-14 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 15-19 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			
				 -- 20-24 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
					 -- 25-49 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			    
					 -- 50 ans and more 
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			    
				-- décès
			    SUM(IF(p.dead=1 , 1, 0)) ,
	
			   -- référés
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year = e.encounter_datetime , 1, 0)),
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year < e.encounter_datetime , 1, 0)) 
				
				INTO
				@NEW_HYPER_MINUS_10_F,@OLD_HYPER_MINUS_10_F,@NEW_HYPER_MINUS_10_M,@OLD_HYPER_MINUS_10_M,
				@NEW_HYPER_BET_10_AND_14_F,@OLD_HYPER_BET_10_AND_14_F,@NEW_HYPER_BET_10_AND_14_M,@OLD_HYPER_BET_10_AND_14_M,
				@NEW_HYPER_BET_15_AND_19_F,@OLD_HYPER_BET_15_AND_19_F,@NEW_HYPER_BET_15_AND_19_M,@OLD_HYPER_BET_15_AND_19_M,
				@NEW_HYPER_BET_20_AND_24_F,@OLD_HYPER_BET_20_AND_24_F,@NEW_HYPER_BET_20_AND_24_M,@OLD_HYPER_BET_20_AND_24_M,
				@NEW_HYPER_BET_25_AND_49_F,@OLD_HYPER_BET_25_AND_49_F,@NEW_HYPER_BET_25_AND_49_M,@OLD_HYPER_BET_25_AND_49_M,
				@NEW_HYPER_BET_50_AND_MORE_F,@OLD_HYPER_BET_50_AND_MORE_F,@NEW_HYPER_BET_50_AND_MORE_M,@OLD_HYPER_BET_50_AND_MORE_M,
				@HYPER_DEAD,@NEW_HYPER_DISCHARGED,@OLD_HYPER_DISCHARGED
							
			FROM obs o  
			INNER JOIN encounter e ON o.encounter_id = e.encounter_id
			INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
			INNER JOIN person p ON p.person_id = o.person_id
			LEFT JOIN (
				SELECT encounter_id, value_coded  
				FROM obs 
				WHERE concept_id = concept_from_mapping("PIH", "8620")
				GROUP BY encounter_id 
			) AS disp ON o.encounter_id = disp.encounter_id 
			LEFT JOIN (
				SELECT e.patient_id, MIN(e.encounter_datetime) AS first_visit_this_year
				FROM obs o 
				JOIN encounter e ON o.encounter_id = e.encounter_id
				WHERE YEAR(e.encounter_datetime) = YEAR(CURDATE()) 
				AND o.value_coded = concept_from_mapping('PIH', 'HYPERTENSION')
				GROUP BY patient_id
			) AS first_visit ON e.patient_id = first_visit.patient_id
			WHERE o.concept_id = concept_from_mapping("PIH", "3064")
			AND o.value_coded = concept_from_mapping('PIH', 'HYPERTENSION')
			AND e.voided = 0
			AND o.voided = 0
			AND DATE(e.encounter_datetime) >= @startDate
            AND DATE(e.encounter_datetime) < @endDate
            AND v.location_id = @location;
			

			
			SELECT 
			 -- Tumeur de Burkit
 		     --  -10 ans
			
			    SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 10-14 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 15-19 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			
				 -- 20-24 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
					 -- 25-49 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			    
					 -- 50 ans and more 
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			    
				-- décès
			    SUM(IF(p.dead=1 , 1, 0)) ,
	
			   -- référés
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year = e.encounter_datetime , 1, 0)) ,
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year < e.encounter_datetime , 1, 0)) 
				
				INTO
				@NEW_TUMEUR_MINUS_10_F,@OLD_TUMEUR_MINUS_10_F,@NEW_TUMEUR_MINUS_10_M,@OLD_TUMEUR_MINUS_10_M,
				@NEW_TUMEUR_BET_10_AND_14_F,@OLD_TUMEUR_BET_10_AND_14_F,@NEW_TUMEUR_BET_10_AND_14_M,@OLD_TUMEUR_BET_10_AND_14_M,
				@NEW_TUMEUR_BET_15_AND_19_F,@OLD_TUMEUR_BET_15_AND_19_F,@NEW_TUMEUR_BET_15_AND_19_M,@OLD_TUMEUR_BET_15_AND_19_M,
				@NEW_TUMEUR_BET_20_AND_24_F,@OLD_TUMEUR_BET_20_AND_24_F,@NEW_TUMEUR_BET_20_AND_24_M,@OLD_TUMEUR_BET_20_AND_24_M,
				@NEW_TUMEUR_BET_25_AND_49_F,@OLD_TUMEUR_BET_25_AND_49_F,@NEW_TUMEUR_BET_25_AND_49_M,@OLD_TUMEUR_BET_25_AND_49_M,
				@NEW_TUMEUR_BET_50_AND_MORE_F,@OLD_TUMEUR_BET_50_AND_MORE_F,@NEW_TUMEUR_BET_50_AND_MORE_M,@OLD_TUMEUR_BET_50_AND_MORE_M,
				@TUMEUR_DEAD,@NEW_TUMEUR_DISCHARGED,@OLD_TUMEUR_DISCHARGED
								
			FROM obs o  
			INNER JOIN encounter e ON o.encounter_id = e.encounter_id
			INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
			INNER JOIN person p ON p.person_id = o.person_id
			LEFT JOIN (
				SELECT encounter_id, value_coded  
				FROM obs 
				WHERE concept_id = concept_from_mapping("PIH", "8620")
				GROUP BY encounter_id 
			) AS disp ON o.encounter_id = disp.encounter_id 
			LEFT JOIN (
				SELECT e.patient_id, MIN(e.encounter_datetime) AS first_visit_this_year
				FROM obs o 
				JOIN encounter e ON o.encounter_id = e.encounter_id
				WHERE YEAR(e.encounter_datetime) = YEAR(CURDATE()) 
				AND o.value_coded = concept_from_mapping('PIH', '8414')
				GROUP BY patient_id
			) AS first_visit ON e.patient_id = first_visit.patient_id
			WHERE o.concept_id = concept_from_mapping("PIH", "3064")
			AND o.value_coded = concept_from_mapping('PIH', '8414')
			AND e.voided = 0
			AND o.voided = 0
			AND DATE(e.encounter_datetime) >= @startDate
            AND DATE(e.encounter_datetime) < @endDate
            AND v.location_id = @location;

			
			
			SELECT 
			 -- Cancer du col de l'uterus
 		     --  -10 ans
			
			    SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 10-14 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 15-19 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			
				 -- 20-24 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
					 -- 25-49 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			    
					 -- 50 ans and more 
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			    
				-- décès
			    SUM(IF(p.dead=1 , 1, 0)) ,
	
			   -- référés
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year = e.encounter_datetime , 1, 0)) ,
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year < e.encounter_datetime , 1, 0)) 
				
				INTO
				@NEW_CANCER_COL_MINUS_10_F,@OLD_CANCER_COL_MINUS_10_F,@NEW_CANCER_COL_MINUS_10_M,@OLD_CANCER_COL_MINUS_10_M,
				@NEW_CANCER_COL_BET_10_AND_14_F,@OLD_CANCER_COL_BET_10_AND_14_F,@NEW_CANCER_COL_BET_10_AND_14_M,@OLD_CANCER_COL_BET_10_AND_14_M,
				@NEW_CANCER_COL_BET_15_AND_19_F,@OLD_CANCER_COL_BET_15_AND_19_F,@NEW_CANCER_COL_BET_15_AND_19_M,@OLD_CANCER_COL_BET_15_AND_19_M,
				@NEW_CANCER_COL_BET_20_AND_24_F,@OLD_CANCER_COL_BET_20_AND_24_F,@NEW_CANCER_COL_BET_20_AND_24_M,@OLD_CANCER_COL_BET_20_AND_24_M,
				@NEW_CANCER_COL_BET_25_AND_49_F,@OLD_CANCER_COL_BET_25_AND_49_F,@NEW_CANCER_COL_BET_25_AND_49_M,@OLD_CANCER_COL_BET_25_AND_49_M,
				@NEW_CANCER_COL_BET_50_AND_MORE_F,@OLD_CANCER_COL_BET_50_AND_MORE_F,@NEW_CANCER_COL_BET_50_AND_MORE_M,@OLD_CANCER_COL_BET_50_AND_MORE_M,
				@CANCER_COL_DEAD,@NEW_CANCER_COL_DISCHARGED,@OLD_CANCER_COL_DISCHARGED
				
				
			FROM obs o  
			INNER JOIN encounter e ON o.encounter_id = e.encounter_id
			INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
			INNER JOIN person p ON p.person_id = o.person_id
			LEFT JOIN (
				SELECT encounter_id, value_coded  
				FROM obs 
				WHERE concept_id = concept_from_mapping("PIH", "8620")
				GROUP BY encounter_id 
			) AS disp ON o.encounter_id = disp.encounter_id 
			LEFT JOIN (
				SELECT e.patient_id, MIN(e.encounter_datetime) AS first_visit_this_year
				FROM obs o 
				JOIN encounter e ON o.encounter_id = e.encounter_id
				WHERE YEAR(e.encounter_datetime) = YEAR(CURDATE()) 
				AND o.value_coded = concept_from_mapping('PIH', '7914')
				GROUP BY patient_id
			) AS first_visit ON e.patient_id = first_visit.patient_id
			WHERE o.concept_id = concept_from_mapping("PIH", "3064")
			AND o.value_coded = concept_from_mapping('PIH', '7914')
			AND e.voided = 0
			AND o.voided = 0
			AND DATE(e.encounter_datetime) >= @startDate
            AND DATE(e.encounter_datetime) < @endDate
            AND v.location_id = @location;

		 
			SELECT 
			 -- Cancer du Sein
 		     --  -10 ans
			
			    SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 10-14 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 15-19 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			
				 -- 20-24 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
					 -- 25-49 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			    
					 -- 50 ans and more 
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			    
				-- décès
			    SUM(IF(p.dead=1 , 1, 0)) ,
	
			   -- référés
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year = e.encounter_datetime , 1, 0)) ,
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year < e.encounter_datetime , 1, 0)) 
				
				INTO
				@NEW_CANCER_SEIN_MINUS_10_F,@OLD_CANCER_SEIN_MINUS_10_F,@NEW_CANCER_SEIN_MINUS_10_M,@OLD_CANCER_SEIN_MINUS_10_M,
				@NEW_CANCER_SEIN_BET_10_AND_14_F,@OLD_CANCER_SEIN_BET_10_AND_14_F,@NEW_CANCER_SEIN_BET_10_AND_14_M,@OLD_CANCER_SEIN_BET_10_AND_14_M,
				@NEW_CANCER_SEIN_BET_15_AND_19_F,@OLD_CANCER_SEIN_BET_15_AND_19_F,@NEW_CANCER_SEIN_BET_15_AND_19_M,@OLD_CANCER_SEIN_BET_15_AND_19_M,
				@NEW_CANCER_SEIN_BET_20_AND_24_F,@OLD_CANCER_SEIN_BET_20_AND_24_F,@NEW_CANCER_SEIN_BET_20_AND_24_M,@OLD_CANCER_SEIN_BET_20_AND_24_M,
				@NEW_CANCER_SEIN_BET_25_AND_49_F,@OLD_CANCER_SEIN_BET_25_AND_49_F,@NEW_CANCER_SEIN_BET_25_AND_49_M,@OLD_CANCER_SEIN_BET_25_AND_49_M,
				@NEW_CANCER_SEIN_BET_50_AND_MORE_F,@OLD_CANCER_SEIN_BET_50_AND_MORE_F,@NEW_CANCER_SEIN_BET_50_AND_MORE_M,@OLD_CANCER_SEIN_BET_50_AND_MORE_M,
				@CANCER_SEIN_DEAD,@NEW_CANCER_SEIN_DISCHARGED,@OLD_CANCER_SEIN_DISCHARGED
								
			FROM obs o  
			INNER JOIN encounter e ON o.encounter_id = e.encounter_id
			INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
			INNER JOIN person p ON p.person_id = o.person_id
			LEFT JOIN (
				SELECT encounter_id, value_coded  
				FROM obs 
				WHERE concept_id = concept_from_mapping("PIH", "8620")
				GROUP BY encounter_id 
			) AS disp ON o.encounter_id = disp.encounter_id 
			LEFT JOIN (
				SELECT e.patient_id, MIN(e.encounter_datetime) AS first_visit_this_year
				FROM obs o 
				JOIN encounter e ON o.encounter_id = e.encounter_id
				WHERE YEAR(e.encounter_datetime) = YEAR(CURDATE()) 
				AND o.value_coded = concept_from_mapping('PIH', '7581')
				GROUP BY patient_id
			) AS first_visit ON e.patient_id = first_visit.patient_id
			WHERE o.concept_id = concept_from_mapping("PIH", "3064")
			AND o.value_coded = concept_from_mapping('PIH', '7581')
			AND e.voided = 0
			AND o.voided = 0
			AND DATE(e.encounter_datetime) >= @startDate
            AND DATE(e.encounter_datetime) < @endDate
            AND v.location_id = @location;

 
        SELECT 
			 -- Cancer de la prostate
 		     --  -10 ans
			
			    SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 10-14 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 15-19 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			
				 -- 20-24 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
					 -- 25-49 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			    
					 -- 50 ans and more 
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			    
				-- décès
			    SUM(IF(p.dead=1 , 1, 0)) ,
	
			   -- référés
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year = e.encounter_datetime , 1, 0)),
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year < e.encounter_datetime , 1, 0)) 
				
				INTO
				@NEW_CANCER_PROSTATE_MINUS_10_F,@OLD_CANCER_PROSTATE_MINUS_10_F,@NEW_CANCER_PROSTATE_MINUS_10_M,@OLD_CANCER_PROSTATE_MINUS_10_M,
				@NEW_CANCER_PROSTATE_BET_10_AND_14_F,@OLD_CANCER_PROSTATE_BET_10_AND_14_F,@NEW_CANCER_PROSTATE_BET_10_AND_14_M,@OLD_CANCER_PROSTATE_BET_10_AND_14_M,
				@NEW_CANCER_PROSTATE_BET_15_AND_19_F,@OLD_CANCER_PROSTATE_BET_15_AND_19_F,@NEW_CANCER_PROSTATE_BET_15_AND_19_M,@OLD_CANCER_PROSTATE_BET_15_AND_19_M,
				@NEW_CANCER_PROSTATE_BET_20_AND_24_F,@OLD_CANCER_PROSTATE_BET_20_AND_24_F,@NEW_CANCER_PROSTATE_BET_20_AND_24_M,@OLD_CANCER_PROSTATE_BET_20_AND_24_M,
				@NEW_CANCER_PROSTATE_BET_25_AND_49_F,@OLD_CANCER_PROSTATE_BET_25_AND_49_F,@NEW_CANCER_PROSTATE_BET_25_AND_49_M,@OLD_CANCER_PROSTATE_BET_25_AND_49_M,
				@NEW_CANCER_PROSTATE_BET_50_AND_MORE_F,@OLD_CANCER_PROSTATE_BET_50_AND_MORE_F,@NEW_CANCER_PROSTATE_BET_50_AND_MORE_M,@OLD_CANCER_PROSTATE_BET_50_AND_MORE_M,
				@CANCER_PROSTATE_DEAD,@NEW_CANCER_PROSTATE_DISCHARGED,@OLD_CANCER_PROSTATE_DISCHARGED
				
				
			FROM obs o  
			INNER JOIN encounter e ON o.encounter_id = e.encounter_id
			INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
			INNER JOIN person p ON p.person_id = o.person_id
			LEFT JOIN (
				SELECT encounter_id, value_coded  
				FROM obs 
				WHERE concept_id = concept_from_mapping("PIH", "8620")
				GROUP BY encounter_id 
			) AS disp ON o.encounter_id = disp.encounter_id 
			LEFT JOIN (
				SELECT e.patient_id, MIN(e.encounter_datetime) AS first_visit_this_year
				FROM obs o 
				JOIN encounter e ON o.encounter_id = e.encounter_id
				WHERE YEAR(e.encounter_datetime) = YEAR(CURDATE()) 
				AND o.value_coded = concept_from_mapping('PIH', '7916')
				GROUP BY patient_id
			) AS first_visit ON e.patient_id = first_visit.patient_id
			WHERE o.concept_id = concept_from_mapping("PIH", "3064")
			AND o.value_coded = concept_from_mapping('PIH', '7916')
			AND e.voided = 0
			AND o.voided = 0
			AND DATE(e.encounter_datetime) >= @startDate
            AND DATE(e.encounter_datetime) < @endDate
            AND v.location_id = @location;


			
			

			SELECT 
			 -- Obesite
 		     --  -10 ans
			
			    SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 10-14 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 15-19 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			
				 -- 20-24 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
					 -- 25-49 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			    
					 -- 50 ans and more 
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			  -- décès
			    SUM(IF(p.dead=1 , 1, 0)) ,
	
			   -- référés
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year = e.encounter_datetime , 1, 0)) ,
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year < e.encounter_datetime , 1, 0)) 
				
				INTO
				@NEW_OBESITY_MINUS_10_F,@OLD_OBESITY_MINUS_10_F,@NEW_OBESITY_MINUS_10_M,@OLD_OBESITY_MINUS_10_M,
				@NEW_OBESITY_BET_10_AND_14_F,@OLD_OBESITY_BET_10_AND_14_F,@NEW_OBESITY_BET_10_AND_14_M,@OLD_OBESITY_BET_10_AND_14_M,
				@NEW_OBESITY_BET_15_AND_19_F,@OLD_OBESITY_BET_15_AND_19_F,@NEW_OBESITY_BET_15_AND_19_M,@OLD_OBESITY_BET_15_AND_19_M,
				@NEW_OBESITY_BET_20_AND_24_F,@OLD_OBESITY_BET_20_AND_24_F,@NEW_OBESITY_BET_20_AND_24_M,@OLD_OBESITY_BET_20_AND_24_M,
				@NEW_OBESITY_BET_25_AND_49_F,@OLD_OBESITY_BET_25_AND_49_F,@NEW_OBESITY_BET_25_AND_49_M,@OLD_OBESITY_BET_25_AND_49_M,
				@NEW_OBESITY_BET_50_AND_MORE_F,@OLD_OBESITY_BET_50_AND_MORE_F,@NEW_OBESITY_BET_50_AND_MORE_M,@OLD_OBESITY_BET_50_AND_MORE_M,
				@OBESITY_DEAD,@NEW_OBESITY_DISCHARGED,@OLD_OBESITY_DISCHARGED
				
				 
				
			FROM obs o  
			INNER JOIN encounter e ON o.encounter_id = e.encounter_id
			INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
			INNER JOIN person p ON p.person_id = o.person_id
			LEFT JOIN (
				SELECT encounter_id, value_coded  
				FROM obs 
				WHERE concept_id = concept_from_mapping("PIH", "8620")
				GROUP BY encounter_id 
			) AS disp ON o.encounter_id = disp.encounter_id 
			LEFT JOIN (
				SELECT e.patient_id, MIN(e.encounter_datetime) AS first_visit_this_year
				FROM obs o 
				JOIN encounter e ON o.encounter_id = e.encounter_id
				WHERE YEAR(e.encounter_datetime) = YEAR(CURDATE()) 
				AND o.value_coded = concept_from_mapping('PIH', 'Obesity')
				GROUP BY patient_id
			) AS first_visit ON e.patient_id = first_visit.patient_id
			WHERE o.concept_id = concept_from_mapping("PIH", "3064")
			AND o.value_coded = concept_from_mapping('PIH', 'Obesity')
			AND e.voided = 0
			AND o.voided = 0
			AND DATE(e.encounter_datetime) >= @startDate
            AND DATE(e.encounter_datetime) < @endDate
            AND v.location_id = @location;
 

       	SELECT 
			 -- Glaucome
 		     --  -10 ans
			
			    SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 10-14 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 15-19 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			
				 -- 20-24 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
					 -- 25-49 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			    
					 -- 50 ans and more 
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			    
				-- décès
			    SUM(IF(p.dead=1 , 1, 0)) ,
	
			   -- référés
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year = e.encounter_datetime , 1, 0)),
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year < e.encounter_datetime , 1, 0)) 
				
				INTO
				@NEW_GLAUCOMA_MINUS_10_F,@OLD_GLAUCOMA_MINUS_10_F,@NEW_GLAUCOMA_MINUS_10_M,@OLD_GLAUCOMA_MINUS_10_M,
				@NEW_GLAUCOMA_BET_10_AND_14_F,@OLD_GLAUCOMA_BET_10_AND_14_F,@NEW_GLAUCOMA_BET_10_AND_14_M,@OLD_GLAUCOMA_BET_10_AND_14_M,
				@NEW_GLAUCOMA_BET_15_AND_19_F,@OLD_GLAUCOMA_BET_15_AND_19_F,@NEW_GLAUCOMA_BET_15_AND_19_M,@OLD_GLAUCOMA_BET_15_AND_19_M,
				@NEW_GLAUCOMA_BET_20_AND_24_F,@OLD_GLAUCOMA_BET_20_AND_24_F,@NEW_GLAUCOMA_BET_20_AND_24_M,@OLD_GLAUCOMA_BET_20_AND_24_M,
				@NEW_GLAUCOMA_BET_25_AND_49_F,@OLD_GLAUCOMA_BET_25_AND_49_F,@NEW_GLAUCOMA_BET_25_AND_49_M,@OLD_GLAUCOMA_BET_25_AND_49_M,
				@NEW_GLAUCOMA_BET_50_AND_MORE_F,@OLD_GLAUCOMA_BET_50_AND_MORE_F,@NEW_GLAUCOMA_BET_50_AND_MORE_M,@OLD_GLAUCOMA_BET_50_AND_MORE_M,
				@GLAUCOMA_DEAD,@NEW_GLAUCOMA_DISCHARGED,@OLD_GLAUCOMA_DISCHARGED
				
			FROM obs o  
			INNER JOIN encounter e ON o.encounter_id = e.encounter_id
			INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
			INNER JOIN person p ON p.person_id = o.person_id
			LEFT JOIN (
				SELECT encounter_id, value_coded  
				FROM obs 
				WHERE concept_id = concept_from_mapping("PIH", "8620")
				GROUP BY encounter_id 
			) AS disp ON o.encounter_id = disp.encounter_id 
			LEFT JOIN (
				SELECT e.patient_id, MIN(e.encounter_datetime) AS first_visit_this_year
				FROM obs o 
				JOIN encounter e ON o.encounter_id = e.encounter_id
				WHERE YEAR(e.encounter_datetime) = YEAR(CURDATE()) 
				AND o.value_coded = concept_from_mapping('PIH', 'Glaucoma')
				GROUP BY patient_id
			) AS first_visit ON e.patient_id = first_visit.patient_id
			WHERE o.concept_id = concept_from_mapping("PIH", "3064")
			AND o.value_coded = concept_from_mapping('PIH', 'Glaucoma')
			AND e.voided = 0
			AND o.voided = 0
			AND DATE(e.encounter_datetime) >= @startDate
            AND DATE(e.encounter_datetime) < @endDate
            AND v.location_id = @location;
 

			SELECT 
			 -- Cataracte
 		     --  -10 ans
			
			    SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 10-14 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 15-19 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			
				 -- 20-24 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
					 -- 25-49 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			    
					 -- 50 ans and more 
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			    
			  -- décès
			    SUM(IF(p.dead=1 , 1, 0)) ,
	
			   -- référés
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year = e.encounter_datetime , 1, 0)),
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year < e.encounter_datetime , 1, 0)) 
				INTO
				@NEW_CATARACT_MINUS_10_F,@OLD_CATARACT_MINUS_10_F,@NEW_CATARACT_MINUS_10_M,@OLD_CATARACT_MINUS_10_M,
				@NEW_CATARACT_BET_10_AND_14_F,@OLD_CATARACT_BET_10_AND_14_F,@NEW_CATARACT_BET_10_AND_14_M,@OLD_CATARACT_BET_10_AND_14_M,
				@NEW_CATARACT_BET_15_AND_19_F,@OLD_CATARACT_BET_15_AND_19_F,@NEW_CATARACT_BET_15_AND_19_M,@OLD_CATARACT_BET_15_AND_19_M,
				@NEW_CATARACT_BET_20_AND_24_F,@OLD_CATARACT_BET_20_AND_24_F,@NEW_CATARACT_BET_20_AND_24_M,@OLD_CATARACT_BET_20_AND_24_M,
				@NEW_CATARACT_BET_25_AND_49_F,@OLD_CATARACT_BET_25_AND_49_F,@NEW_CATARACT_BET_25_AND_49_M,@OLD_CATARACT_BET_25_AND_49_M,
				@NEW_CATARACT_BET_50_AND_MORE_F,@OLD_CATARACT_BET_50_AND_MORE_F,@NEW_CATARACT_BET_50_AND_MORE_M,@OLD_CATARACT_BET_50_AND_MORE_M,
				@CATARACT_DEAD,@NEW_CATARACT_DISCHARGED,@OLD_CATARACT_DISCHARGED
								
			FROM obs o  
			INNER JOIN encounter e ON o.encounter_id = e.encounter_id
			INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
			INNER JOIN person p ON p.person_id = o.person_id
			LEFT JOIN (
				SELECT encounter_id, value_coded  
				FROM obs 
				WHERE concept_id = concept_from_mapping("PIH", "8620")
				GROUP BY encounter_id 
			) AS disp ON o.encounter_id = disp.encounter_id 
			LEFT JOIN (
				SELECT e.patient_id, MIN(e.encounter_datetime) AS first_visit_this_year
				FROM obs o 
				JOIN encounter e ON o.encounter_id = e.encounter_id
				WHERE YEAR(e.encounter_datetime) = YEAR(CURDATE()) 
				AND o.value_coded = concept_from_mapping('PIH', 'CATARACT')
				GROUP BY patient_id
			) AS first_visit ON e.patient_id = first_visit.patient_id
			WHERE o.concept_id = concept_from_mapping("PIH", "3064")
			AND o.value_coded = concept_from_mapping('PIH', 'CATARACT')
			AND e.voided = 0
			AND o.voided = 0
			AND DATE(e.encounter_datetime) >= @startDate
            AND DATE(e.encounter_datetime) < @endDate
            AND v.location_id = @location;

			
			SELECT 
			 -- Insuffisance Renale
 		     --  -10 ans
			
			    SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) < 10 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 10-14 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 10 AND 14 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
				 -- 15-19 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 15 AND 19 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			
				 -- 20-24 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 20 AND 24 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				
					 -- 25-49 ans
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) BETWEEN 25 AND 49 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			    
					 -- 50 ans and more 
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'F' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year = e.encounter_datetime, 1, 0)) ,
				SUM(IF(age_at_enc(p.person_id, e.encounter_id) >=50 AND p.gender = 'M' AND first_visit.first_visit_this_year < e.encounter_datetime, 1, 0)) ,
			    
			  -- décès
			    SUM(IF(p.dead=1 , 1, 0)) ,
	
			   -- référés
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year = e.encounter_datetime , 1, 0)),
				SUM(IF(disp.value_coded = @discharged AND first_visit.first_visit_this_year < e.encounter_datetime , 1, 0)) 
				
				INTO
				@NEW_RENAL_FAILURE_MINUS_10_F,@OLD_RENAL_FAILURE_MINUS_10_F,@NEW_RENAL_FAILURE_MINUS_10_M,@OLD_RENAL_FAILURE_MINUS_10_M,
				@NEW_RENAL_FAILURE_BET_10_AND_14_F,@OLD_RENAL_FAILURE_BET_10_AND_14_F,@NEW_RENAL_FAILURE_BET_10_AND_14_M,@OLD_RENAL_FAILURE_BET_10_AND_14_M,
				@NEW_RENAL_FAILURE_BET_15_AND_19_F,@OLD_RENAL_FAILURE_BET_15_AND_19_F,@NEW_RENAL_FAILURE_BET_15_AND_19_M,@OLD_RENAL_FAILURE_BET_15_AND_19_M,
				@NEW_RENAL_FAILURE_BET_20_AND_24_F,@OLD_RENAL_FAILURE_BET_20_AND_24_F,@NEW_RENAL_FAILURE_BET_20_AND_24_M,@OLD_RENAL_FAILURE_BET_20_AND_24_M,
				@NEW_RENAL_FAILURE_BET_25_AND_49_F,@OLD_RENAL_FAILURE_BET_25_AND_49_F,@NEW_RENAL_FAILURE_BET_25_AND_49_M,@OLD_RENAL_FAILURE_BET_25_AND_49_M,
				@NEW_RENAL_FAILURE_BET_50_AND_MORE_F,@OLD_RENAL_FAILURE_BET_50_AND_MORE_F,@NEW_RENAL_FAILURE_BET_50_AND_MORE_M,@OLD_RENAL_FAILURE_BET_50_AND_MORE_M,
				@RENAL_FAILURE_DEAD,@NEW_RENAL_FAILURE_DISCHARGED,@OLD_RENAL_FAILURE_DISCHARGED
								
			FROM obs o  
			INNER JOIN encounter e ON o.encounter_id = e.encounter_id
			INNER JOIN visit v ON e.visit_id = v.visit_id AND v.voided = 0
			INNER JOIN person p ON p.person_id = o.person_id
			LEFT JOIN (
				SELECT encounter_id, value_coded  
				FROM obs 
				WHERE concept_id = concept_from_mapping("PIH", "8620")
				GROUP BY encounter_id 
			) AS disp ON o.encounter_id = disp.encounter_id 
			LEFT JOIN (
				SELECT e.patient_id, MIN(e.encounter_datetime) AS first_visit_this_year
				FROM obs o 
				JOIN encounter e ON o.encounter_id = e.encounter_id
				WHERE YEAR(e.encounter_datetime) = YEAR(CURDATE()) 
				AND o.value_coded = concept_from_mapping('PIH', 'RENAL FAILURE')
				GROUP BY patient_id
			) AS first_visit ON e.patient_id = first_visit.patient_id
			WHERE o.concept_id = concept_from_mapping("PIH", "3064")
			AND o.value_coded = concept_from_mapping('PIH', 'RENAL FAILURE')
			AND e.voided = 0
			AND o.voided = 0
			AND DATE(e.encounter_datetime) >= @startDate
            AND DATE(e.encounter_datetime) < @endDate
            AND v.location_id = @location;
		  	
	 
SELECT  @child_under_1_n  "CHILD_UNDER_1_N",
		@child_between_1_4_n "CHILD_BETWEEN_1_4_N",
	    @child_between_5_9_n "CHILD_BETWEEN_5_9_N",
	    @child_between_10_14_n "CHILD_BETWEEN_10_14_N",
	    @young_adult_between_15_19_n "YOUNG_ADULT_BETWEEN_15_19_N",
		@young_adult_between_20_24_n "YOUNG_ADULT_BETWEEN_20_24_N",
	    @other_adult_n "OTHER_ADULT_N",
		@child_under_1_s "CHILD_UNDER_1_S",
       	@child_between_1_4_s "CHILD_BETWEEN_1_4_S",
        @child_between_5_9_s "CHILD_BETWEEN_5_9_S",
        @child_between_10_14_s "CHILD_BETWEEN_10_14_S",
        @young_adult_between_15_19_s "YOUNG_ADULT_BETWEEN_15_19_S",
        @young_adult_between_20_24_s "YOUNG_ADULT_BETWEEN_20_24_S", 
        @other_adult_s "OTHER_ADULT_S",
        @clientPfN "CLIENT_PF_N", @clientPfS "CLIENT_PF_S",
        @pregnant_visits_n 'PREGNANCY_WOMEN_N',
		@pregnant_visits_s 'PREGNANCY_WOMEN_S',
            @totalMentalDisorder 'PEOPLE_MENTAL_DISODER',
            0 'CLIENT_S_BU_DENTAIRE_N', 0 'CLIENT_S_BU_DENTAIRE_S',
            0 'PEOPLE_REDUCED_MOB_MOTOR_N',0 'PEOPLE_REDUCED_MOB_MOTOR_S',
            0 'PEOPLE_REDUCED_MOB_SENSORY_N',0 'PEOPLE_REDUCED_MOB_SENSORY_S',
            @total_urine_test_women 'TOTAL_URINE_TEST_WOMEN',
            @total_hemogram_test_women 'TOTAL_HEMOGRAM_TEST_WOMEN',
            @totat_malaria_rapd_test_women 'TOTAL_MALARIA_RAPD_TEST_WOMEN',
            @totat_malaria_rapd_test_positif_women 'TOTAL_MALARIA_RAPD_TEST_POSITIF_WOMEN',
            @total_rpr_test_women 'TOTAL_RPR_TEST_WOMEN',
            @total_rpr_test_positif_women 'TOTAL_RPR_TEST_POSITIF_WOMEN',
            @total_hiv_test_women 'TOTAL_HIV_TEST_WOMEN',
            @total_hiv_test_positif_women 'TOTAL_HIV_TEST_POSITIF_WOMEN',
            @total_sickling_test_women 'TOTAL_SICKLING_TEST_WOMEN',
            @total_sickling_test 'TOTAL_SICKLING_TEST',
            @total_blood_type_test_women 'TOTAL_BLOOD_TYPE_TEST_WOMEN',
            @total_blood_type_test 'TOTAL_BLOOD_TYPE_TEST',
            @total_blood_type_test 'TOTAL_BLOOD_TYPE_TEST',
            @total_sickling_test 'TOTAL_SICKLING_TEST',
            @total_malaria_rapd_test 'TOTAL_MALARIA_RAPD_TEST',
            @totat_malaria_rapd_test_positif 'TOTAL_MALARIA_RAPD_TEST_POSITIF',
            @total_malaria_rapd_test 'TOTAL_MALARIA',
            @totat_malaria_rapd_test_positif 'TOTAL_MALARIA_POSITIF',
            @malaria_test_microscopique_vivax 'VIVAX',
            @malaria_test_microscopique_oval'OVAL',
            @malaria_test_microscopique_malariae 'MALARIAE',
            @malaria_test_microscopique_falciparum 'FALCIPARUM',
            @malaria_test_microscopique_total 'MALARIAN_TEST_MICRO',
            @PHYSICAL_VIOL_WOMEN_DEAD AS 'PHYSICAL_VIOL_WOMEN_DEAD',
            @PHYSICAL_VIOL_WOMEN_TRANSFER AS 'PHYSICAL_VIOL_WOMEN_TRANSFER',
            @PHYSICAL_VIOL_WOMEN_LEFT AS 'PHYSICAL_VIOL_WOMEN_LEFT',
            @PHYSICAL_VIOL_WOMEN_TREATED AS 'PHYSICAL_VIOL_WOMEN_TREATED',
            IFNULL(@PHYSICAL_VIOL_WOMEN_DEAD, 0) + IFNULL(@PHYSICAL_VIOL_WOMEN_TRANSFER, 0) + IFNULL(@PHYSICAL_VIOL_WOMEN_LEFT, 0) + IFNULL(@PHYSICAL_VIOL_WOMEN_TREATED, 0) AS 'PHYSICAL_VIOL_WOMEN_TOTAL',
            @PHYSICAL_VIOL_MEN_DEAD AS 'PHYSICAL_VIOL_MEN_DEAD',
            @PHYSICAL_VIOL_MEN_TRANSFER AS 'PHYSICAL_VIOL_MEN_TRANSFER',
            @PHYSICAL_VIOL_MEN_LEFT AS 'PHYSICAL_VIOL_MEN_LEFT',
            @PHYSICAL_VIOL_MEN_TREATED AS 'PHYSICAL_VIOL_MEN_TREATED',
            IFNULL(@PHYSICAL_VIOL_MEN_DEAD, 0) + IFNULL(@PHYSICAL_VIOL_MEN_TRANSFER, 0) + IFNULL(@PHYSICAL_VIOL_MEN_LEFT, 0) + IFNULL(@PHYSICAL_VIOL_MEN_TREATED, 0) AS 'PHYSICAL_VIOL_MEN_TOTAL',
            @PHYSICAL_VIOL_KID_DEAD AS 'PHYSICAL_VIOL_KID_DEAD',
            @PHYSICAL_VIOL_KID_TRANSFER AS 'PHYSICAL_VIOL_KID_TRANSFER',
            @PHYSICAL_VIOL_KID_LEFT AS 'PHYSICAL_VIOL_KID_LEFT',
            @PHYSICAL_VIOL_KID_TREATED AS 'PHYSICAL_VIOL_KID_TREATED',
            IFNULL(@PHYSICAL_VIOL_KID_DEAD, 0) + IFNULL(@PHYSICAL_VIOL_KID_TRANSFER, 0) + IFNULL(@PHYSICAL_VIOL_KID_LEFT, 0) + IFNULL(@PHYSICAL_VIOL_KID_TREATED, 0) AS 'PHYSICAL_VIOL_KID_TOTAL',
            @SEX_VIOL_WOMEN_DEAD AS 'SEX_VIOL_WOMEN_DEAD',
            @SEX_VIOL_WOMEN_TRANSFER AS 'SEX_VIOL_WOMEN_TRANSFER',
            @SEX_VIOL_WOMEN_LEFT AS 'SEX_VIOL_WOMEN_LEFT',
            @SEX_VIOL_WOMEN_TREATED AS 'SEX_VIOL_WOMEN_TREATED',
            IFNULL(@SEX_VIOL_WOMEN_DEAD, 0) + IFNULL(@SEX_VIOL_WOMEN_TRANSFER, 0) + IFNULL(@SEX_VIOL_WOMEN_LEFT, 0) + IFNULL(@SEX_VIOL_WOMEN_TREATED, 0) AS 'SEX_VIOL_WOMEN_TOTAL', 
            @SEX_VIOL_KIDF_DEAD AS 'SEX_VIOL_KIDF_DEAD',
            @SEX_VIOL_KIDF_TRANSFER AS 'SEX_VIOL_KIDF_TRANSFER',
            @SEX_VIOL_KIDF_LEFT AS 'SEX_VIOL_KIDF_LEFT',
            @SEX_VIOL_KIDF_TREATED AS 'SEX_VIOL_KIDF_TREATED',
            IFNULL(@SEX_VIOL_KIDF_DEAD, 0) + IFNULL(@SEX_VIOL_KIDF_TRANSFER, 0) + IFNULL(@SEX_VIOL_KIDF_LEFT, 0) + IFNULL(@SEX_VIOL_KIDF_TREATED, 0) AS 'SEX_VIOL_KIDF_TOTAL', 
            @SEX_VIOL_MEN_DEAD AS 'SEX_VIOL_MEN_DEAD',
            @SEX_VIOL_MEN_TRANSFER AS 'SEX_VIOL_MEN_TRANSFER',
            @SEX_VIOL_MEN_LEFT AS 'SEX_VIOL_MEN_LEFT',
            @SEX_VIOL_MEN_TREATED AS 'SEX_VIOL_MEN_TREATED',
            IFNULL(@SEX_VIOL_MEN_DEAD, 0) + IFNULL(@SEX_VIOL_MEN_TRANSFER, 0) + IFNULL(@SEX_VIOL_MEN_LEFT, 0) + IFNULL(@SEX_VIOL_MEN_TREATED, 0) AS 'SEX_VIOL_MEN_TOTAL', 
            @SEX_VIOL_KIDM_DEAD AS 'SEX_VIOL_KIDM_DEAD',
            @SEX_VIOL_KIDM_TRANSFER AS 'SEX_VIOL_KIDM_TRANSFER',
            @SEX_VIOL_KIDM_LEFT AS 'SEX_VIOL_KIDM_LEFT',
            @SEX_VIOL_KIDM_TREATED AS 'SEX_VIOL_KIDM_TREATED',
            IFNULL(@SEX_VIOL_KIDM_DEAD, 0) + IFNULL(@SEX_VIOL_KIDM_TRANSFER, 0) + IFNULL(@SEX_VIOL_KIDM_LEFT, 0) + IFNULL(@SEX_VIOL_KIDM_TREATED, 0) AS 'SEX_VIOL_KIDM_TOTAL',
            @ACC_DOMES_DEAD AS 'ACC_DOMES_DEAD',
            @ACC_DOMES_TREATED AS 'ACC_DOMES_TREATED',
            @ACC_DOMES_TRANSFER AS 'ACC_DOMES_TRANSFER',
            @ACC_DOMES_LEFT AS 'ACC_DOMES_LEFT',
            IFNULL(@ACC_DOMES_DEAD, 0) + IFNULL(@ACC_DOMES_TREATED, 0) + IFNULL(@ACC_DOMES_TRANSFER, 0) + IFNULL(@ACC_DOMES_LEFT, 0) AS 'ACC_DOMES_TOTAL',
            @ACC_TR_DEAD AS 'ACC_TR_DEAD',
            @ACC_TR_TREATED AS 'ACC_TR_TREATED',
            @ACC_TR_TRANSFER AS 'ACC_TR_TRANSFER',
            @ACC_TR_LEFT AS 'ACC_TR_LEFT',
            IFNULL(@ACC_TR_DEAD, 0) + IFNULL(@ACC_TR_TREATED, 0) + IFNULL(@ACC_TR_TRANSFER, 0) + IFNULL(@ACC_TR_LEFT, 0) AS 'ACC_TR_TOTAL',
            @ACC_TR_MOTOR_DEAD AS 'ACC_TR_MOTOR_DEAD',
            @ACC_TR_MOTOR_TREATED AS 'ACC_TR_MOTOR_TREATED',
            @ACC_TR_MOTOR_TRANSFER AS 'ACC_TR_MOTOR_TRANSFER',
            @ACC_TR_MOTOR_LEFT AS 'ACC_TR_MOTOR_LEFT',
            IFNULL(@ACC_TR_MOTOR_DEAD, 0) + IFNULL(@ACC_TR_MOTOR_TREATED, 0) + IFNULL(@ACC_TR_MOTOR_TRANSFER, 0) + IFNULL(@ACC_TR_MOTOR_LEFT, 0) AS 'ACC_TR_MOTOR_TOTAL', 
            @ACC_TR_VEHICLE_DEAD AS 'ACC_TR_VEHICLE_DEAD',
            @ACC_TR_VEHICLE_TREATED AS 'ACC_TR_VEHICLE_TREATED',
            @ACC_TR_VEHICLE_TRANSFER AS 'ACC_TR_VEHICLE_TRANSFER',
            @ACC_TR_VEHICLE_LEFT AS 'ACC_TR_VEHICLE_LEFT',
            IFNULL(@ACC_TR_VEHICLE_DEAD, 0) + IFNULL(@ACC_TR_VEHICLE_TREATED, 0) + IFNULL(@ACC_TR_VEHICLE_TRANSFER, 0) + IFNULL(@ACC_TR_VEHICLE_LEFT, 0) AS 'ACC_TR_VEHICLE_TOTAL',
            @OTHER_ACC_TR_DEAD AS 'OTHER_ACC_TR_DEAD',
            @OTHER_ACC_TR_TREATED AS 'OTHER_ACC_TR_TREATED',
            @OTHER_ACC_TR_TRANSFER AS 'OTHER_ACC_TR_TRANSFER',
            @OTHER_ACC_TR_LEFT AS 'OTHER_ACC_TR_LEFT',
            IFNULL(@OTHER_ACC_TR_DEAD, 0) + IFNULL(@OTHER_ACC_TR_TREATED, 0) + IFNULL(@OTHER_ACC_TR_TRANSFER, 0) + IFNULL(@OTHER_ACC_TR_LEFT, 0) AS 'OTHER_ACC_TR_TOTAL',  
            @OTHER_SEX_VIOL_WOMEN_DEAD AS 'OTHER_SEX_VIOL_WOMEN_DEAD',
            @OTHER_SEX_VIOL_WOMEN_TREATED AS 'OTHER_SEX_VIOL_WOMEN_TREATED',
            @OTHER_SEX_VIOL_WOMEN_TRANSFER AS 'OTHER_SEX_VIOL_WOMEN_TRANSFER',
            @OTHER_SEX_VIOL_WOMEN_LEFT AS 'OTHER_SEX_VIOL_WOMEN_LEFT',
            IFNULL(@OTHER_SEX_VIOL_WOMEN_DEAD, 0) + IFNULL(@OTHER_SEX_VIOL_WOMEN_TREATED, 0) + IFNULL(@OTHER_SEX_VIOL_WOMEN_TRANSFER, 0) + IFNULL(@OTHER_SEX_VIOL_WOMEN_LEFT, 0) AS 'OTHER_SEX_VIOL_WOMEN_TOTAL',
            @OTHER_SEX_VIOL_MEN_DEAD AS 'OTHER_SEX_VIOL_MEN_DEAD',
            @OTHER_SEX_VIOL_MEN_TREATED AS 'OTHER_SEX_VIOL_MEN_TREATED',
            @OTHER_SEX_VIOL_MEN_TRANSFER AS 'OTHER_SEX_VIOL_MEN_TRANSFER',
            @OTHER_SEX_VIOL_MEN_LEFT AS 'OTHER_SEX_VIOL_MEN_LEFT',
            IFNULL(@OTHER_SEX_VIOL_MEN_DEAD, 0) + IFNULL(@OTHER_SEX_VIOL_MEN_TREATED, 0) + IFNULL(@OTHER_SEX_VIOL_MEN_TRANSFER, 0) + IFNULL(@OTHER_SEX_VIOL_MEN_LEFT, 0) AS 'OTHER_SEX_VIOL_MEN_TOTAL',  
            @OTHER_SEX_VIOL_KID_DEAD AS 'OTHER_SEX_VIOL_KID_DEAD',
            @OTHER_SEX_VIOL_KID_TREATED AS 'OTHER_SEX_VIOL_KID_TREATED',
            @OTHER_SEX_VIOL_KID_TRANSFER AS 'OTHER_SEX_VIOL_KID_TRANSFER',
            @OTHER_SEX_VIOL_KID_LEFT AS 'OTHER_SEX_VIOL_KID_LEFT',
            IFNULL(@OTHER_SEX_VIOL_KID_DEAD, 0) + IFNULL(@OTHER_SEX_VIOL_KID_TREATED, 0) + IFNULL(@OTHER_SEX_VIOL_KID_TRANSFER, 0) + IFNULL(@OTHER_SEX_VIOL_KID_LEFT, 0) AS 'OTHER_SEX_VIOL_KID_TOTAL',
            @UMC_TRAUMA AS 'UMC_TRAUMA',@UMC_DIGESTIVE AS 'UMC_DIGESTIVE',@UMC_RESPIRATORY AS 'UMC_RESPIRATORY',@UMC_OBSTETRICS AS 'UMC_OBSTETRICS',@UMC_OSTEO_ARTICULAR AS 'UMC_OSTEO_ARTICULAR',@UMC_OTHER AS 'UMC_OTHER',
            @LESS_THAN_15_NORMAL       'LESS_THAN_15_NORMAL',
            @BETWEEN_15_19_NORMAL      'BETWEEN_15_19_NORMAL',
            @BETWEEN_20_24_NORMAL      'BETWEEN_20_24_NORMAL',
            @BETWEEN_25_29_NORMAL      'BETWEEN_25_29_NORMAL',
            @THIRTY_AND_ABOVE_NORMAL   'THIRTY_AND_ABOVE_NORMAL',
            @UNKNOWN_AGE_NORMAL        'UNKNOWN_AGE_NORMAL',
            @LESS_THAN_15_CESA         'LESS_THAN_15_CESA',
            @BETWEEN_15_19_CESA        'BETWEEN_15_19_CESA',
            @BETWEEN_20_24_CESA        'BETWEEN_20_24_CESA',
            @BETWEEN_25_29_CESA        'BETWEEN_25_29_CESA',
            @THIRTY_AND_ABOVE_CESA     'THIRTY_AND_ABOVE_CESA',
            @UNKNOWN_AGE_CESA          'UNKNOWN_AGE_CESA',
            @LESS_THAN_15_INST         'LESS_THAN_15_INST',
            @BETWEEN_15_19_INST        'BETWEEN_15_19_INST',
            @BETWEEN_20_24_INST        'BETWEEN_20_24_INST',
            @BETWEEN_25_29_INST        'BETWEEN_25_29_INST',
            @THIRTY_AND_ABOVE_INST     'THIRTY_AND_ABOVE_INST',
            @UNKNOWN_AGE_INST          'UNKNOWN_AGE_INST',
            @VAGINAL_MINUS_1_5 'VAGINAL_MINUS_1_5',
            @VAGINAL_BETWEEN_2_5 'VAGINAL_BETWEEN_2_5',
            @VAGINAL_EQUAL_OR_MORE_2_5 'VAGINAL_EQUAL_OR_MORE_2_5',
            @VAGINAL_NO_WEIGHT 'VAGINAL_NO_WEIGHT',
            @CESA_MINUS_1_5 'CESA_MINUS_1_5',
            @CESA_BETWEEN_2_5 'CESA_BETWEEN_2_5',
            @CESA_EQUAL_OR_MORE_2_5 'CESA_EQUAL_OR_MORE_2_5',
            @CESA_NO_WEIGHT 'CESA_NO_WEIGHT',
            @INST_MINUS_1_5 'INST_MINUS_1_5',
            @INST_BETWEEN_2_5 'INST_BETWEEN_2_5',
            @INST_EQUAL_OR_MORE_2_5 'INST_EQUAL_OR_MORE_2_5',
            @INST_NO_WEIGHT 'INST_NO_WEIGHT',
             @MET_CONDOM_BET15_19_ACCEPTED 'MET_CONDOM_BET15_19_ACCEPTED',
			@MET_CONDOM_BET20_24_ACCEPTED 'MET_CONDOM_BET20_24_ACCEPTED',
			@MET_CONDOM_MORE_25_ACCEPTED 'MET_CONDOM_MORE_25_ACCEPTED',
			@MET_CONDOM_BET15_19_USED 'MET_CONDOM_BET15_19_USED',
			@MET_CONDOM_BET20_24_USED 'MET_CONDOM_BET20_24_USED',
			@MET_CONDOM_MORE_25_USED 'MET_CONDOM_MORE_25_USED',
			@MET_CONDOM_BET15_19_ACCEPTED_M 'MET_CONDOM_BET15_19_ACCEPTED_M',
			@MET_CONDOM_BET20_24_ACCEPTED_M 'MET_CONDOM_BET20_24_ACCEPTED_M',
			@MET_CONDOM_MORE_25_ACCEPTED_M 'MET_CONDOM_MORE_25_ACCEPTED_M',
			@MET_CONDOM_BET15_19_USED_M 'MET_CONDOM_BET15_19_USED_M' ,
			@MET_CONDOM_BET20_24_USED_M 'MET_CONDOM_BET20_24_USED_M',
			@MET_CONDOM_MORE_25_USED_M 'MET_CONDOM_MORE_25_USED_M',
			@MET_DEPO_PROVERA_BET15_19_ACCEPTED 'MET_DEPO_PROVERA_BET15_19_ACCEPTED',
			@MET_DEPO_PROVERA_BET20_24_ACCEPTED 'MET_DEPO_PROVERA_BET20_24_ACCEPTED',
			@MET_DEPO_PROVERA_MORE_25_ACCEPTED 'MET_DEPO_PROVERA_MORE_25_ACCEPTED',
			@MET_DEPO_PROVERA_BET15_19_USED 'MET_DEPO_PROVERA_BET15_19_USED',
			@MET_DEPO_PROVERA_BET20_24_USED 'MET_DEPO_PROVERA_BET20_24_USED',
			@MET_DEPO_PROVERA_MORE_25_USED 'MET_DEPO_PROVERA_MORE_25_USED',
			@MET_LIGATURE_BET15_19_ACCEPTED 'MET_LIGATURE_BET15_19_ACCEPTED',
			@MET_LIGATURE_BET20_24_ACCEPTED 'MET_LIGATURE_BET20_24_ACCEPTED',
			@MET_LIGATURE_MORE_25_ACCEPTED 'MET_LIGATURE_MORE_25_ACCEPTED',
			@MET_LIGATURE_BET15_19_USED 'MET_LIGATURE_BET15_19_USED',
			@MET_LIGATURE_BET20_24_USED 'MET_LIGATURE_BET20_24_USED',
			@MET_LIGATURE_MORE_25_USED 'MET_LIGATURE_MORE_25_USED',
			@MET_MAMA_BET15_19_ACCEPTED 'MET_MAMA_BET15_19_ACCEPTED',
			@MET_MAMA_BET20_24_ACCEPTED 'MET_MAMA_BET20_24_ACCEPTED',
			@MET_MAMA_MORE_25_ACCEPTED 'MET_MAMA_MORE_25_ACCEPTED',
			@MET_MAMA_BET15_19_USED 'MET_MAMA_BET15_19_USED',
			@MET_MAMA_BET20_24_USED 'MET_MAMA_BET20_24_USED',
			@MET_MAMA_MORE_25_USED 'MET_MAMA_MORE_25_USED',
			@MET_COLIS_BET15_19_ACCEPTED 'MET_COLIS_BET15_19_ACCEPTED',
			@MET_COLIS_BET20_24_ACCEPTED 'MET_COLIS_BET20_24_ACCEPTED',
			@MET_COLIS_MORE_25_ACCEPTED 'MET_COLIS_MORE_25_ACCEPTED',		
			@MET_COLIS_BET15_19_USED 'MET_COLIS_BET15_19_USED',
			@MET_COLIS_BET20_24_USED 'MET_COLIS_BET20_24_USED',
			@MET_COLIS_MORE_25_USED 'MET_COLIS_MORE_25_USED',
			@MET_DIU_BET15_19_ACCEPTED 'MET_DIU_BET15_19_ACCEPTED',
			@MET_DIU_BET20_24_ACCEPTED 'MET_DIU_BET20_24_ACCEPTED',
			@MET_DIU_MORE_25_ACCEPTED 'MET_DIU_MORE_25_ACCEPTED',
			@MET_DIU_BET15_19_USED 'MET_DIU_BET15_19_USED',
			@MET_DIU_BET20_24_USED 'MET_DIU_BET20_24_USED',
			@MET_DIU_MORE_25_USED 'MET_DIU_MORE_25_USED',
			@MET_IMPL_BET15_19_ACCEPTED 'MET_IMPL_BET15_19_ACCEPTED',
			@MET_IMPL_BET20_24_ACCEPTED 'MET_IMPL_BET20_24_ACCEPTED',
			@MET_IMPL_MORE_25_ACCEPTED 'MET_IMPL_MORE_25_ACCEPTED',
			@MET_IMPL_BET15_19_USED 'MET_IMPL_BET15_19_USED',
			@MET_IMPL_BET20_24_USED 'MET_IMPL_BET20_24_USED',
			@MET_IMPL_MORE_25_USED 'MET_IMPL_MORE_25_USED',
			@MET_LIGATURE_CCV_BET15_19_ACCEPTED 'MET_LIGATURE_CCV_BET15_19_ACCEPTED',
			@MET_LIGATURE_CCV_BET20_24_ACCEPTED 'MET_LIGATURE_CCV_BET20_24_ACCEPTED',
			@MET_LIGATURE_CCV_MORE_25_ACCEPTED 'MET_LIGATURE_CCV_MORE_25_ACCEPTED',
			@MET_LIGATURE_CCV_BET15_19_USED 'MET_LIGATURE_CCV_BET15_19_USED',
			@MET_LIGATURE_CCV_BET20_24_USED 'MET_LIGATURE_CCV_BET20_24_USED',
			@MET_LIGATURE_CCV_MORE_25_USED 'MET_LIGATURE_CCV_MORE_25_USED',
            
            @PV1_BETWEEN_0_3 'PV1_BETWEEN_0_3',@PV1_BETWEEN_4_6 'PV1_BETWEEN_4_6', @PV1_BETWEEN_7_9 'PV1_BETWEEN_7_9',
            @PV2_BETWEEN_0_3 'PV2_BETWEEN_0_3',@PV2_BETWEEN_4_6 'PV2_BETWEEN_4_6', @PV2_BETWEEN_7_9 'PV2_BETWEEN_7_9',
            @PV3_BETWEEN_0_3 'PV3_BETWEEN_0_3',@PV3_BETWEEN_4_6 'PV3_BETWEEN_4_6', @PV3_BETWEEN_7_9 'PV3_BETWEEN_7_9',
            @PV4_BETWEEN_0_3 'PV4_BETWEEN_0_3',@PV4_BETWEEN_4_6 'PV4_BETWEEN_4_6', @PV4_BETWEEN_7_9 'PV4_BETWEEN_7_9',
            @PV5_BETWEEN_0_3 'PV5_BETWEEN_0_3',@PV5_BETWEEN_4_6 'PV5_BETWEEN_4_6', @PV5_BETWEEN_7_9 'PV5_BETWEEN_7_9',

            @FE_AGE_0_F 'FE_AGE_0_F',  @FE_AGE_0_M 'FE_AGE_0_M', @FE_AGE_1_4_F 'FE_AGE_1_4_F', 
            @FE_AGE_1_4_M 'FE_AGE_1_4_M', @FE_AGE_5_9_F 'FE_AGE_5_9_F',  @FE_AGE_5_9_M 'FE_AGE_5_9_M',
            @FE_AGE_10_14_F 'FE_AGE_10_14_F',  @FE_AGE_10_14_M 'FE_AGE_10_14_M',@FE_AGE_15_19_F 'FE_AGE_15_19_F', 
            @FE_AGE_15_19_M 'FE_AGE_15_19_M',@FE_AGE_20_24_F 'FE_AGE_20_24_F', @FE_AGE_20_24_M 'FE_AGE_20_24_M', @FE_AGE_25_49_F 'FE_AGE_25_49_F', 
            @FE_AGE_25_49_M 'FE_AGE_25_49_M', @FE_AGE_50_PLUS_F 'FE_AGE_50_PLUS_F',  @FE_AGE_50_PLUS_M 'FE_AGE_50_PLUS_M',
            @FE_DEATH 'FE_DEATH',@FE_TRANSFER 'FE_TRANSFER',
            
            @MCT_AGE_0_F 'MCT_AGE_0_F', @MCT_AGE_0_M 'MCT_AGE_0_M', @MCT_AGE_1_4_F 'MCT_AGE_1_4_F', 
            @MCT_AGE_1_4_M 'MCT_AGE_1_4_M', @MCT_AGE_5_9_F 'MCT_AGE_5_9_F',@MCT_AGE_5_9_M 'MCT_AGE_5_9_M',
            @MCT_AGE_10_14_F 'MCT_AGE_10_14_F', @MCT_AGE_10_14_M 'MCT_AGE_10_14_M', @MCT_AGE_15_19_F 'MCT_AGE_15_19_F', 
            @MCT_AGE_15_19_M 'MCT_AGE_15_19_M', @MCT_AGE_20_24_F 'MCT_AGE_20_24_F', @MCT_AGE_20_24_M 'MCT_AGE_20_24_M',
            @MCT_AGE_25_49_F 'MCT_AGE_25_49_F', @MCT_AGE_25_49_M 'MCT_AGE_25_49_M', @MCT_AGE_50_PLUS_F 'MCT_AGE_50_PLUS_F',
            @MCT_AGE_50_PLUS_M 'MCT_AGE_50_PLUS_M',@MCT_DEATH 'MCT_DEATH',@MCT_TRANSFER 'MCT_TRANSFER',
            
            @MSH_AGE_0_F 'MSH_AGE_0_F', @MSH_AGE_0_M 'MSH_AGE_0_M', @MSH_AGE_1_4_F 'MSH_AGE_1_4_F',
            @MSH_AGE_1_4_M 'MSH_AGE_1_4_M', @MSH_AGE_5_9_F 'MSH_AGE_5_9_F', @MSH_AGE_5_9_M 'MSH_AGE_5_9_M',
            @MSH_AGE_10_14_F 'MSH_AGE_10_14_F', @MSH_AGE_10_14_M 'MSH_AGE_10_14_M', @MSH_AGE_15_19_F 'MSH_AGE_15_19_F',
            @MSH_AGE_15_19_M 'MSH_AGE_15_19_M', @MSH_AGE_20_24_F 'MSH_AGE_20_24_F', @MSH_AGE_20_24_M 'MSH_AGE_20_24_M',
            @MSH_AGE_25_49_F 'MSH_AGE_25_49_F', @MSH_AGE_25_49_M 'MSH_AGE_25_49_M', @MSH_AGE_50_PLUS_F 'MSH_AGE_50_PLUS_F',
            @MSH_AGE_50_PLUS_M 'MSH_AGE_50_PLUS_M',@MSH_DEATH 'MSH_DEATH',@MSH_TRANSFER 'MSH_TRANSFER',
            
            @MSHD_AGE_0_F 'MSHD_AGE_0_F', @MSHD_AGE_0_M 'MSHD_AGE_0_M', @MSHD_AGE_1_4_F 'MSHD_AGE_1_4_F',
            @MSHD_AGE_1_4_M 'MSHD_AGE_1_4_M', @MSHD_AGE_5_9_F 'MSHD_AGE_5_9_F', @MSHD_AGE_5_9_M 'MSHD_AGE_5_9_M',
            @MSHD_AGE_10_14_F 'MSHD_AGE_10_14_F', @MSHD_AGE_10_14_M 'MSHD_AGE_10_14_M', @MSHD_AGE_15_19_F 'MSHD_AGE_15_19_F',
            @MSHD_AGE_15_19_M 'MSHD_AGE_15_19_M', @MSHD_AGE_20_24_F 'MSHD_AGE_20_24_F', @MSHD_AGE_20_24_M 'MSHD_AGE_20_24_M',
            @MSHD_AGE_25_49_F 'MSHD_AGE_25_49_F', @MSHD_AGE_25_49_M 'MSHD_AGE_25_49_M', @MSHD_AGE_50_PLUS_F 'MSHD_AGE_50_PLUS_F',
            @MSHD_AGE_50_PLUS_M 'MSHD_AGE_50_PLUS_M', @MSHD_DEATH 'MSHD_DEATH', @MSHD_TRANSFER 'MSHD_TRANSFER',
            
            @ANX_AGE_0_F 'ANX_AGE_0_F', @ANX_AGE_0_M 'ANX_AGE_0_M', @ANX_AGE_1_4_F 'ANX_AGE_1_4_F',
            @ANX_AGE_1_4_M 'ANX_AGE_1_4_M', @ANX_AGE_5_9_F 'ANX_AGE_5_9_F', @ANX_AGE_5_9_M 'ANX_AGE_5_9_M',
            @ANX_AGE_10_14_F 'ANX_AGE_10_14_F', @ANX_AGE_10_14_M 'ANX_AGE_10_14_M', @ANX_AGE_15_19_F 'ANX_AGE_15_19_F',
            @ANX_AGE_15_19_M 'ANX_AGE_15_19_M', @ANX_AGE_20_24_F 'ANX_AGE_20_24_F', @ANX_AGE_20_24_M 'ANX_AGE_20_24_M',
            @ANX_AGE_25_49_F 'ANX_AGE_25_49_F', @ANX_AGE_25_49_M 'ANX_AGE_25_49_M', @ANX_AGE_50_PLUS_F 'ANX_AGE_50_PLUS_F',
            @ANX_AGE_50_PLUS_M 'ANX_AGE_50_PLUS_M',@ANX_DEATH 'ANX_DEATH', @ANX_TRANSFER 'ANX_TRANSFER',
            
            @DEMENTIA_AGE_0_F 'DEMENTIA_AGE_0_F', @DEMENTIA_AGE_0_M 'DEMENTIA_AGE_0_M', @DEMENTIA_AGE_1_4_F 'DEMENTIA_AGE_1_4_F',
            @DEMENTIA_AGE_1_4_M 'DEMENTIA_AGE_1_4_M', @DEMENTIA_AGE_5_9_F 'DEMENTIA_AGE_5_9_F', @DEMENTIA_AGE_5_9_M 'DEMENTIA_AGE_5_9_M',
            @DEMENTIA_AGE_10_14_F 'DEMENTIA_AGE_10_14_F', @DEMENTIA_AGE_10_14_M 'DEMENTIA_AGE_10_14_M', @DEMENTIA_AGE_15_19_F 'DEMENTIA_AGE_15_19_F',
            @DEMENTIA_AGE_15_19_M 'DEMENTIA_AGE_15_19_M', @DEMENTIA_AGE_20_24_F 'DEMENTIA_AGE_20_24_F', @DEMENTIA_AGE_20_24_M 'DEMENTIA_AGE_20_24_M',
            @DEMENTIA_AGE_25_49_F 'DEMENTIA_AGE_25_49_F', @DEMENTIA_AGE_25_49_M 'DEMENTIA_AGE_25_49_M', @DEMENTIA_AGE_50_PLUS_F 'DEMENTIA_AGE_50_PLUS_F',
            @DEMENTIA_AGE_50_PLUS_M 'DEMENTIA_AGE_50_PLUS_M', @DEMENTIA_DEATH 'DEMENTIA_DEATH', @DEMENTIA_TRANSFER 'DEMENTIA_TRANSFER',
            
            @DEPRESSION_AGE_0_F 'DEPRESSION_AGE_0_F', @DEPRESSION_AGE_0_M 'DEPRESSION_AGE_0_M', @DEPRESSION_AGE_1_4_F 'DEPRESSION_AGE_1_4_F',
            @DEPRESSION_AGE_1_4_M 'DEPRESSION_AGE_1_4_M', @DEPRESSION_AGE_5_9_F 'DEPRESSION_AGE_5_9_F', @DEPRESSION_AGE_5_9_M 'DEPRESSION_AGE_5_9_M',
            @DEPRESSION_AGE_10_14_F 'DEPRESSION_AGE_10_14_F', @DEPRESSION_AGE_10_14_M 'DEPRESSION_AGE_10_14_M', @DEPRESSION_AGE_15_19_F 'DEPRESSION_AGE_15_19_F',
            @DEPRESSION_AGE_15_19_M 'DEPRESSION_AGE_15_19_M', @DEPRESSION_AGE_20_24_F 'DEPRESSION_AGE_20_24_F', @DEPRESSION_AGE_20_24_M 'DEPRESSION_AGE_20_24_M',
            @DEPRESSION_AGE_25_49_F 'DEPRESSION_AGE_25_49_F', @DEPRESSION_AGE_25_49_M 'DEPRESSION_AGE_25_49_M', @DEPRESSION_AGE_50_PLUS_F 'DEPRESSION_AGE_50_PLUS_F',
            @DEPRESSION_AGE_50_PLUS_M 'DEPRESSION_AGE_50_PLUS_M', @DEPRESSION_DEATH 'DEPRESSION_DEATH', @DEPRESSION_TRANSFER 'DEPRESSION_TRANSFER',

            
            @SCHIZOPHRENIA_AGE_0_F 'SCHIZOPHRENIA_AGE_0_F', @SCHIZOPHRENIA_AGE_0_M 'SCHIZOPHRENIA_AGE_0_M', @SCHIZOPHRENIA_AGE_1_4_F 'SCHIZOPHRENIA_AGE_1_4_F',
            @SCHIZOPHRENIA_AGE_1_4_M 'SCHIZOPHRENIA_AGE_1_4_M', @SCHIZOPHRENIA_AGE_5_9_F 'SCHIZOPHRENIA_AGE_5_9_F', @SCHIZOPHRENIA_AGE_5_9_M 'SCHIZOPHRENIA_AGE_5_9_M',
            @SCHIZOPHRENIA_AGE_10_14_F 'SCHIZOPHRENIA_AGE_10_14_F', @SCHIZOPHRENIA_AGE_10_14_M 'SCHIZOPHRENIA_AGE_10_14_M', @SCHIZOPHRENIA_AGE_15_19_F 'SCHIZOPHRENIA_AGE_15_19_F',
            @SCHIZOPHRENIA_AGE_15_19_M 'SCHIZOPHRENIA_AGE_15_19_M', @SCHIZOPHRENIA_AGE_20_24_F 'SCHIZOPHRENIA_AGE_20_24_F', @SCHIZOPHRENIA_AGE_20_24_M 'SCHIZOPHRENIA_AGE_20_24_M',
            @SCHIZOPHRENIA_AGE_25_49_F 'SCHIZOPHRENIA_AGE_25_49_F', @SCHIZOPHRENIA_AGE_25_49_M 'SCHIZOPHRENIA_AGE_25_49_M', @SCHIZOPHRENIA_AGE_50_PLUS_F 'SCHIZOPHRENIA_AGE_50_PLUS_F',
            @SCHIZOPHRENIA_AGE_50_PLUS_M 'SCHIZOPHRENIA_AGE_50_PLUS_M', @SCHIZOPHRENIA_DEATH 'SCHIZOPHRENIA_DEATH', @SCHIZOPHRENIA_TRANSFER 'SCHIZOPHRENIA_TRANSFER',
            
            @STRESS_AIG_AGE_0_F 'STRESS_AIG_AGE_0_F', @STRESS_AIG_AGE_0_M 'STRESS_AIG_AGE_0_M', @STRESS_AIG_AGE_1_4_F 'STRESS_AIG_AGE_1_4_F',
            @STRESS_AIG_AGE_1_4_M 'STRESS_AIG_AGE_1_4_M', @STRESS_AIG_AGE_5_9_F 'STRESS_AIG_AGE_5_9_F', @STRESS_AIG_AGE_5_9_M 'STRESS_AIG_AGE_5_9_M',
            @STRESS_AIG_AGE_10_14_F 'STRESS_AIG_AGE_10_14_F', @STRESS_AIG_AGE_10_14_M 'STRESS_AIG_AGE_10_14_M', @STRESS_AIG_AGE_15_19_F 'STRESS_AIG_AGE_15_19_F',
            @STRESS_AIG_AGE_15_19_M 'STRESS_AIG_AGE_15_19_M', @STRESS_AIG_AGE_20_24_F 'STRESS_AIG_AGE_20_24_F', @STRESS_AIG_AGE_20_24_M 'STRESS_AIG_AGE_20_24_M',
            @STRESS_AIG_AGE_25_49_F 'STRESS_AIG_AGE_25_49_F', @STRESS_AIG_AGE_25_49_M 'STRESS_AIG_AGE_25_49_M', @STRESS_AIG_AGE_50_PLUS_F 'STRESS_AIG_AGE_50_PLUS_F',
            @STRESS_AIG_AGE_50_PLUS_M 'STRESS_AIG_AGE_50_PLUS_M',  @STRESS_AIG_DEATH 'STRESS_AIG_DEATH', @STRESS_AIG_TRANSFER 'STRESS_AIG_TRANSFER',
            
            @BIPOLAR_DISO_AGE_0_F 'BIPOLAR_DISO_AGE_0_F', @BIPOLAR_DISO_AGE_0_M 'BIPOLAR_DISO_AGE_0_M', @BIPOLAR_DISO_AGE_1_4_F 'BIPOLAR_DISO_AGE_1_4_F',
            @BIPOLAR_DISO_AGE_1_4_M 'BIPOLAR_DISO_AGE_1_4_M', @BIPOLAR_DISO_AGE_5_9_F 'BIPOLAR_DISO_AGE_5_9_F', @BIPOLAR_DISO_AGE_5_9_M 'BIPOLAR_DISO_AGE_5_9_M',
            @BIPOLAR_DISO_AGE_10_14_F 'BIPOLAR_DISO_AGE_10_14_F', @BIPOLAR_DISO_AGE_10_14_M 'BIPOLAR_DISO_AGE_10_14_M', @BIPOLAR_DISO_AGE_15_19_F 'BIPOLAR_DISO_AGE_15_19_F',
            @BIPOLAR_DISO_AGE_15_19_M 'BIPOLAR_DISO_AGE_15_19_M', @BIPOLAR_DISO_AGE_20_24_F 'BIPOLAR_DISO_AGE_20_24_F', @BIPOLAR_DISO_AGE_20_24_M 'BIPOLAR_DISO_AGE_20_24_M',
            @BIPOLAR_DISO_AGE_25_49_F 'BIPOLAR_DISO_AGE_25_49_F', @BIPOLAR_DISO_AGE_25_49_M 'BIPOLAR_DISO_AGE_25_49_M', @BIPOLAR_DISO_AGE_50_PLUS_F 'BIPOLAR_DISO_AGE_50_PLUS_F',
            @BIPOLAR_DISO_AGE_50_PLUS_M 'BIPOLAR_DISO_AGE_50_PLUS_M', @BIPOLAR_DISO_DEATH 'BIPOLAR_DISO_DEATH',@BIPOLAR_DISO_TRANSFER 'BIPOLAR_DISO_TRANSFER',

            
            @DROG_USED_DISO_AGE_0_F 'DROG_USED_DISO_AGE_0_F', @DROG_USED_DISO_AGE_0_M 'DROG_USED_DISO_AGE_0_M', @DROG_USED_DISO_AGE_1_4_F 'DROG_USED_DISO_AGE_1_4_F',
            @DROG_USED_DISO_AGE_1_4_M 'DROG_USED_DISO_AGE_1_4_M', @DROG_USED_DISO_AGE_5_9_F 'DROG_USED_DISO_AGE_5_9_F', @DROG_USED_DISO_AGE_5_9_M 'DROG_USED_DISO_AGE_5_9_M',
            @DROG_USED_DISO_AGE_10_14_F 'DROG_USED_DISO_AGE_10_14_F', @DROG_USED_DISO_AGE_10_14_M 'DROG_USED_DISO_AGE_10_14_M', @DROG_USED_DISO_AGE_15_19_F 'DROG_USED_DISO_AGE_15_19_F',
            @DROG_USED_DISO_AGE_15_19_M 'DROG_USED_DISO_AGE_15_19_M', @DROG_USED_DISO_AGE_20_24_F 'DROG_USED_DISO_AGE_20_24_F', @DROG_USED_DISO_AGE_20_24_M 'DROG_USED_DISO_AGE_20_24_M',
            @DROG_USED_DISO_AGE_25_49_F 'DROG_USED_DISO_AGE_25_49_F', @DROG_USED_DISO_AGE_25_49_M 'DROG_USED_DISO_AGE_25_49_M', @DROG_USED_DISO_AGE_50_PLUS_F 'DROG_USED_DISO_AGE_50_PLUS_F',
            @DROG_USED_DISO_AGE_50_PLUS_M 'DROG_USED_DISO_AGE_50_PLUS_M', @DROG_USED_DISO_DEATH 'DROG_USED_DISO_DEATH', @DROG_USED_DISO_TRANSFER 'DROG_USED_DISO_TRANSFER',


            @DEVELOP_DISO_AGE_0_F 'DEVELOP_DISO_AGE_0_F', @DEVELOP_DISO_AGE_0_M 'DEVELOP_DISO_AGE_0_M', @DEVELOP_DISO_AGE_1_4_F 'DEVELOP_DISO_AGE_1_4_F',
            @DEVELOP_DISO_AGE_1_4_M 'DEVELOP_DISO_AGE_1_4_M', @DEVELOP_DISO_AGE_5_9_F 'DEVELOP_DISO_AGE_5_9_F', @DEVELOP_DISO_AGE_5_9_M 'DEVELOP_DISO_AGE_5_9_M',
            @DEVELOP_DISO_AGE_10_14_F 'DEVELOP_DISO_AGE_10_14_F', @DEVELOP_DISO_AGE_10_14_M 'DEVELOP_DISO_AGE_10_14_M', @DEVELOP_DISO_AGE_15_19_F 'DEVELOP_DISO_AGE_15_19_F',
            @DEVELOP_DISO_AGE_15_19_M 'DEVELOP_DISO_AGE_15_19_M', @DEVELOP_DISO_AGE_20_24_F 'DEVELOP_DISO_AGE_20_24_F', @DEVELOP_DISO_AGE_20_24_M 'DEVELOP_DISO_AGE_20_24_M',
            @DEVELOP_DISO_AGE_25_49_F 'DEVELOP_DISO_AGE_25_49_F', @DEVELOP_DISO_AGE_25_49_M 'DEVELOP_DISO_AGE_25_49_M', @DEVELOP_DISO_AGE_50_PLUS_F 'DEVELOP_DISO_AGE_50_PLUS_F',
            @DEVELOP_DISO_AGE_50_PLUS_M 'DEVELOP_DISO_AGE_50_PLUS_M',  @DEVELOP_DISO_DEATH 'DEVELOP_DISO_DEATH',  @DEVELOP_DISO_TRANSFER 'DEVELOP_DISO_TRANSFER',
            
            @ALCOHOL_USED_DISO_AGE_0_F 'ALCOHOL_USED_DISO_AGE_0_F', @ALCOHOL_USED_DISO_AGE_0_M 'ALCOHOL_USED_DISO_AGE_0_M', @ALCOHOL_USED_DISO_AGE_1_4_F 'ALCOHOL_USED_DISO_AGE_1_4_F',
            @ALCOHOL_USED_DISO_AGE_1_4_M 'ALCOHOL_USED_DISO_AGE_1_4_M', @ALCOHOL_USED_DISO_AGE_5_9_F 'ALCOHOL_USED_DISO_AGE_5_9_F', @ALCOHOL_USED_DISO_AGE_5_9_M 'ALCOHOL_USED_DISO_AGE_5_9_M',
            @ALCOHOL_USED_DISO_AGE_10_14_F 'ALCOHOL_USED_DISO_AGE_10_14_F', @ALCOHOL_USED_DISO_AGE_10_14_M 'ALCOHOL_USED_DISO_AGE_10_14_M', @ALCOHOL_USED_DISO_AGE_15_19_F 'ALCOHOL_USED_DISO_AGE_15_19_F',
            @ALCOHOL_USED_DISO_AGE_15_19_M 'ALCOHOL_USED_DISO_AGE_15_19_M', @ALCOHOL_USED_DISO_AGE_20_24_F 'ALCOHOL_USED_DISO_AGE_20_24_F', @ALCOHOL_USED_DISO_AGE_20_24_M 'ALCOHOL_USED_DISO_AGE_20_24_M',
            @ALCOHOL_USED_DISO_AGE_25_49_F 'ALCOHOL_USED_DISO_AGE_25_49_F', @ALCOHOL_USED_DISO_AGE_25_49_M 'ALCOHOL_USED_DISO_AGE_25_49_M', @ALCOHOL_USED_DISO_AGE_50_PLUS_F 'ALCOHOL_USED_DISO_AGE_50_PLUS_F',
            @ALCOHOL_USED_DISO_AGE_50_PLUS_M 'ALCOHOL_USED_DISO_AGE_50_PLUS_M', @ALCOHOL_USED_DISO_DEATH 'ALCOHOL_USED_DISO_DEATH',   @ALCOHOL_USED_DISO_TRANSFER 'ALCOHOL_USED_DISO_TRANSFER',

            @POST_TRAUMATIC_DISO_AGE_0_F 'POST_TRAUMATIC_DISO_AGE_0_F', @POST_TRAUMATIC_DISO_AGE_0_M 'POST_TRAUMATIC_DISO_AGE_0_M', @POST_TRAUMATIC_DISO_AGE_1_4_F 'POST_TRAUMATIC_DISO_AGE_1_4_F',
            @POST_TRAUMATIC_DISO_AGE_1_4_M 'POST_TRAUMATIC_DISO_AGE_1_4_M', @POST_TRAUMATIC_DISO_AGE_5_9_F 'POST_TRAUMATIC_DISO_AGE_5_9_F', @POST_TRAUMATIC_DISO_AGE_5_9_M 'POST_TRAUMATIC_DISO_AGE_5_9_M',
            @POST_TRAUMATIC_DISO_AGE_10_14_F 'POST_TRAUMATIC_DISO_AGE_10_14_F', @POST_TRAUMATIC_DISO_AGE_10_14_M 'POST_TRAUMATIC_DISO_AGE_10_14_M', @POST_TRAUMATIC_DISO_AGE_15_19_F 'POST_TRAUMATIC_DISO_AGE_15_19_F',
            @POST_TRAUMATIC_DISO_AGE_15_19_M 'POST_TRAUMATIC_DISO_AGE_15_19_M', @POST_TRAUMATIC_DISO_AGE_20_24_F 'POST_TRAUMATIC_DISO_AGE_20_24_F', @POST_TRAUMATIC_DISO_AGE_20_24_M 'POST_TRAUMATIC_DISO_AGE_20_24_M',
            @POST_TRAUMATIC_DISO_AGE_25_49_F 'POST_TRAUMATIC_DISO_AGE_25_49_F', @POST_TRAUMATIC_DISO_AGE_25_49_M 'POST_TRAUMATIC_DISO_AGE_25_49_M', @POST_TRAUMATIC_DISO_AGE_50_PLUS_F 'POST_TRAUMATIC_DISO_AGE_50_PLUS_F',
            @POST_TRAUMATIC_DISO_AGE_50_PLUS_M 'POST_TRAUMATIC_DISO_AGE_50_PLUS_M', @POST_TRAUMATIC_DISO_DEATH 'POST_TRAUMATIC_DISO_DEATH',@POST_TRAUMATIC_DISO_TRANSFER 'POST_TRAUMATIC_DISO_TRANSFER',

            @SUICIDAL_IDEATION_AGE_0_F 'SUICIDAL_IDEATION_AGE_0_F', @SUICIDAL_IDEATION_AGE_0_M 'SUICIDAL_IDEATION_AGE_0_M', @SUICIDAL_IDEATION_AGE_1_4_F 'SUICIDAL_IDEATION_AGE_1_4_F',
            @SUICIDAL_IDEATION_AGE_1_4_M 'SUICIDAL_IDEATION_AGE_1_4_M', @SUICIDAL_IDEATION_AGE_5_9_F 'SUICIDAL_IDEATION_AGE_5_9_F', @SUICIDAL_IDEATION_AGE_5_9_M 'SUICIDAL_IDEATION_AGE_5_9_M',
            @SUICIDAL_IDEATION_AGE_10_14_F 'SUICIDAL_IDEATION_AGE_10_14_F', @SUICIDAL_IDEATION_AGE_10_14_M 'SUICIDAL_IDEATION_AGE_10_14_M', @SUICIDAL_IDEATION_AGE_15_19_F 'SUICIDAL_IDEATION_AGE_15_19_F',
            @SUICIDAL_IDEATION_AGE_15_19_M 'SUICIDAL_IDEATION_AGE_15_19_M', @SUICIDAL_IDEATION_AGE_20_24_F 'SUICIDAL_IDEATION_AGE_20_24_F', @SUICIDAL_IDEATION_AGE_20_24_M 'SUICIDAL_IDEATION_AGE_20_24_M',
            @SUICIDAL_IDEATION_AGE_25_49_F 'SUICIDAL_IDEATION_AGE_25_49_F', @SUICIDAL_IDEATION_AGE_25_49_M 'SUICIDAL_IDEATION_AGE_25_49_M', @SUICIDAL_IDEATION_AGE_50_PLUS_F 'SUICIDAL_IDEATION_AGE_50_PLUS_F',
            @SUICIDAL_IDEATION_AGE_50_PLUS_M 'SUICIDAL_IDEATION_AGE_50_PLUS_M',  @SUICIDAL_IDEATION_DEATH 'SUICIDAL_IDEATION_DEATH', @SUICIDAL_IDEATION_TRANSFER 'SUICIDAL_IDEATION_TRANSFER',
			 @NEW_DIAB_MINUS_10_F 'NEW_DIAB_MINUS_10_F', @OLD_DIAB_MINUS_10_F 'OLD_DIAB_MINUS_10_F', @NEW_DIAB_MINUS_10_M 'NEW_DIAB_MINUS_10_M', @OLD_DIAB_MINUS_10_M 'OLD_DIAB_MINUS_10_M',
			@NEW_DIAB_BET_10_AND_14_F 'NEW_DIAB_BET_10_AND_14_F', @OLD_DIAB_BET_10_AND_14_F 'OLD_DIAB_BET_10_AND_14_F', @NEW_DIAB_BET_10_AND_14_M 'NEW_DIAB_BET_10_AND_14_M', @OLD_DIAB_BET_10_AND_14_M 'OLD_DIAB_BET_10_AND_14_M',
			@NEW_DIAB_BET_15_AND_19_F 'NEW_DIAB_BET_15_AND_19_F', @OLD_DIAB_BET_15_AND_19_F 'OLD_DIAB_BET_15_AND_19_F', @NEW_DIAB_BET_15_AND_19_M 'NEW_DIAB_BET_15_AND_19_M', @OLD_DIAB_BET_15_AND_19_M 'OLD_DIAB_BET_15_AND_19_M',
			@NEW_DIAB_BET_20_AND_24_F 'NEW_DIAB_BET_20_AND_24_F', @OLD_DIAB_BET_20_AND_24_F 'OLD_DIAB_BET_20_AND_24_F', @NEW_DIAB_BET_20_AND_24_M 'NEW_DIAB_BET_20_AND_24_M', @OLD_DIAB_BET_20_AND_24_M 'OLD_DIAB_BET_20_AND_24_M',
			@NEW_DIAB_BET_25_AND_49_F 'NEW_DIAB_BET_25_AND_49_F', @OLD_DIAB_BET_25_AND_49_F 'OLD_DIAB_BET_25_AND_49_F', @NEW_DIAB_BET_25_AND_49_M 'NEW_DIAB_BET_25_AND_49_M', @OLD_DIAB_BET_25_AND_49_M 'OLD_DIAB_BET_25_AND_49_M',
			@NEW_DIAB_BET_50_AND_MORE_F 'NEW_DIAB_BET_50_AND_MORE_F', @OLD_DIAB_BET_50_AND_MORE_F 'OLD_DIAB_BET_50_AND_MORE_F', @NEW_DIAB_BET_50_AND_MORE_M 'NEW_DIAB_BET_50_AND_MORE_M', @OLD_DIAB_BET_50_AND_MORE_M 'OLD_DIAB_BET_50_AND_MORE_M',
			@DIAB_DEAD 'DIAB_DEAD', @NEW_DIAB_DISCHARGED 'NEW_DIAB_DISCHARGED', @OLD_DIAB_DISCHARGED 'OLD_DIAB_DISCHARGED',

			@NEW_HYPER_MINUS_10_F 'NEW_HYPER_MINUS_10_F', @OLD_HYPER_MINUS_10_F 'OLD_HYPER_MINUS_10_F', @NEW_HYPER_MINUS_10_M 'NEW_HYPER_MINUS_10_M', @OLD_HYPER_MINUS_10_M 'OLD_HYPER_MINUS_10_M',
			@NEW_HYPER_BET_10_AND_14_F 'NEW_HYPER_BET_10_AND_14_F', @OLD_HYPER_BET_10_AND_14_F 'OLD_HYPER_BET_10_AND_14_F', @NEW_HYPER_BET_10_AND_14_M 'NEW_HYPER_BET_10_AND_14_M', @OLD_HYPER_BET_10_AND_14_M 'OLD_HYPER_BET_10_AND_14_M',
			@NEW_HYPER_BET_15_AND_19_F 'NEW_HYPER_BET_15_AND_19_F', @OLD_HYPER_BET_15_AND_19_F 'OLD_HYPER_BET_15_AND_19_F', @NEW_HYPER_BET_15_AND_19_M 'NEW_HYPER_BET_15_AND_19_M', @OLD_HYPER_BET_15_AND_19_M 'OLD_HYPER_BET_15_AND_19_M',
			@NEW_HYPER_BET_20_AND_24_F 'NEW_HYPER_BET_20_AND_24_F', @OLD_HYPER_BET_20_AND_24_F 'OLD_HYPER_BET_20_AND_24_F', @NEW_HYPER_BET_20_AND_24_M 'NEW_HYPER_BET_20_AND_24_M', @OLD_HYPER_BET_20_AND_24_M 'OLD_HYPER_BET_20_AND_24_M',
			@NEW_HYPER_BET_25_AND_49_F 'NEW_HYPER_BET_25_AND_49_F', @OLD_HYPER_BET_25_AND_49_F 'OLD_HYPER_BET_25_AND_49_F', @NEW_HYPER_BET_25_AND_49_M 'NEW_HYPER_BET_25_AND_49_M', @OLD_HYPER_BET_25_AND_49_M 'OLD_HYPER_BET_25_AND_49_M',
			@NEW_HYPER_BET_50_AND_MORE_F 'NEW_HYPER_BET_50_AND_MORE_F', @OLD_HYPER_BET_50_AND_MORE_F 'OLD_HYPER_BET_50_AND_MORE_F', @NEW_HYPER_BET_50_AND_MORE_M 'NEW_HYPER_BET_50_AND_MORE_M', @OLD_HYPER_BET_50_AND_MORE_M 'OLD_HYPER_BET_50_AND_MORE_M',
			@HYPER_DEAD 'HYPER_DEAD', @NEW_HYPER_DISCHARGED 'NEW_HYPER_DISCHARGED', @OLD_HYPER_DISCHARGED 'OLD_HYPER_DISCHARGED',
			
			 @NEW_TUMEUR_MINUS_10_F 'NEW_TUMEUR_MINUS_10_F', @OLD_TUMEUR_MINUS_10_F 'OLD_TUMEUR_MINUS_10_F', @NEW_TUMEUR_MINUS_10_M 'NEW_TUMEUR_MINUS_10_M', @OLD_TUMEUR_MINUS_10_M 'OLD_TUMEUR_MINUS_10_M',
			@NEW_TUMEUR_BET_10_AND_14_F 'NEW_TUMEUR_BET_10_AND_14_F', @OLD_TUMEUR_BET_10_AND_14_F 'OLD_TUMEUR_BET_10_AND_14_F', @NEW_TUMEUR_BET_10_AND_14_M 'NEW_TUMEUR_BET_10_AND_14_M', @OLD_TUMEUR_BET_10_AND_14_M 'OLD_TUMEUR_BET_10_AND_14_M',
			@NEW_TUMEUR_BET_15_AND_19_F 'NEW_TUMEUR_BET_15_AND_19_F', @OLD_TUMEUR_BET_15_AND_19_F 'OLD_TUMEUR_BET_15_AND_19_F', @NEW_TUMEUR_BET_15_AND_19_M 'NEW_TUMEUR_BET_15_AND_19_M', @OLD_TUMEUR_BET_15_AND_19_M 'OLD_TUMEUR_BET_15_AND_19_M',
			@NEW_TUMEUR_BET_20_AND_24_F 'NEW_TUMEUR_BET_20_AND_24_F', @OLD_TUMEUR_BET_20_AND_24_F 'OLD_TUMEUR_BET_20_AND_24_F', @NEW_TUMEUR_BET_20_AND_24_M 'NEW_TUMEUR_BET_20_AND_24_M', @OLD_TUMEUR_BET_20_AND_24_M 'OLD_TUMEUR_BET_20_AND_24_M',
			@NEW_TUMEUR_BET_25_AND_49_F 'NEW_TUMEUR_BET_25_AND_49_F', @OLD_TUMEUR_BET_25_AND_49_F 'OLD_TUMEUR_BET_25_AND_49_F', @NEW_TUMEUR_BET_25_AND_49_M 'NEW_TUMEUR_BET_25_AND_49_M', @OLD_TUMEUR_BET_25_AND_49_M 'OLD_TUMEUR_BET_25_AND_49_M',
			@NEW_TUMEUR_BET_50_AND_MORE_F 'NEW_TUMEUR_BET_50_AND_MORE_F', @OLD_TUMEUR_BET_50_AND_MORE_F 'OLD_TUMEUR_BET_50_AND_MORE_F', @NEW_TUMEUR_BET_50_AND_MORE_M 'NEW_TUMEUR_BET_50_AND_MORE_M', @OLD_TUMEUR_BET_50_AND_MORE_M 'OLD_TUMEUR_BET_50_AND_MORE_M',
			@TUMEUR_DEAD 'TUMEUR_DEAD', @NEW_TUMEUR_DISCHARGED 'NEW_TUMEUR_DISCHARGED', @OLD_TUMEUR_DISCHARGED 'OLD_TUMEUR_DISCHARGED',
			
			@NEW_CANCER_COL_MINUS_10_F 'NEW_CANCER_COL_MINUS_10_F', @OLD_CANCER_COL_MINUS_10_F 'OLD_CANCER_COL_MINUS_10_F', @NEW_CANCER_COL_MINUS_10_M 'NEW_CANCER_COL_MINUS_10_M', @OLD_CANCER_COL_MINUS_10_M 'OLD_CANCER_COL_MINUS_10_M',
			@NEW_CANCER_COL_BET_10_AND_14_F 'NEW_CANCER_COL_BET_10_AND_14_F', @OLD_CANCER_COL_BET_10_AND_14_F 'OLD_CANCER_COL_BET_10_AND_14_F', @NEW_CANCER_COL_BET_10_AND_14_M 'NEW_CANCER_COL_BET_10_AND_14_M', @OLD_CANCER_COL_BET_10_AND_14_M 'OLD_CANCER_COL_BET_10_AND_14_M',
			@NEW_CANCER_COL_BET_15_AND_19_F 'NEW_CANCER_COL_BET_15_AND_19_F', @OLD_CANCER_COL_BET_15_AND_19_F 'OLD_CANCER_COL_BET_15_AND_19_F', @NEW_CANCER_COL_BET_15_AND_19_M 'NEW_CANCER_COL_BET_15_AND_19_M', @OLD_CANCER_COL_BET_15_AND_19_M 'OLD_CANCER_COL_BET_15_AND_19_M',
			@NEW_CANCER_COL_BET_20_AND_24_F 'NEW_CANCER_COL_BET_20_AND_24_F', @OLD_CANCER_COL_BET_20_AND_24_F 'OLD_CANCER_COL_BET_20_AND_24_F', @NEW_CANCER_COL_BET_20_AND_24_M 'NEW_CANCER_COL_BET_20_AND_24_M', @OLD_CANCER_COL_BET_20_AND_24_M 'OLD_CANCER_COL_BET_20_AND_24_M',
			@NEW_CANCER_COL_BET_25_AND_49_F 'NEW_CANCER_COL_BET_25_AND_49_F', @OLD_CANCER_COL_BET_25_AND_49_F 'OLD_CANCER_COL_BET_25_AND_49_F', @NEW_CANCER_COL_BET_25_AND_49_M 'NEW_CANCER_COL_BET_25_AND_49_M', @OLD_CANCER_COL_BET_25_AND_49_M 'OLD_CANCER_COL_BET_25_AND_49_M',
			@NEW_CANCER_COL_BET_50_AND_MORE_F 'NEW_CANCER_COL_BET_50_AND_MORE_F', @OLD_CANCER_COL_BET_50_AND_MORE_F 'OLD_CANCER_COL_BET_50_AND_MORE_F', @NEW_CANCER_COL_BET_50_AND_MORE_M 'NEW_CANCER_COL_BET_50_AND_MORE_M', @OLD_CANCER_COL_BET_50_AND_MORE_M 'OLD_CANCER_COL_BET_50_AND_MORE_M',
			@CANCER_COL_DEAD 'CANCER_COL_DEAD', @NEW_CANCER_COL_DISCHARGED 'NEW_CANCER_COL_DISCHARGED', @OLD_CANCER_COL_DISCHARGED 'OLD_CANCER_COL_DISCHARGED',

			@NEW_CANCER_SEIN_MINUS_10_F 'NEW_CANCER_SEIN_MINUS_10_F', @OLD_CANCER_SEIN_MINUS_10_F 'OLD_CANCER_SEIN_MINUS_10_F', @NEW_CANCER_SEIN_MINUS_10_M 'NEW_CANCER_SEIN_MINUS_10_M', @OLD_CANCER_SEIN_MINUS_10_M 'OLD_CANCER_SEIN_MINUS_10_M',
			@NEW_CANCER_SEIN_BET_10_AND_14_F 'NEW_CANCER_SEIN_BET_10_AND_14_F', @OLD_CANCER_SEIN_BET_10_AND_14_F 'OLD_CANCER_SEIN_BET_10_AND_14_F', @NEW_CANCER_SEIN_BET_10_AND_14_M 'NEW_CANCER_SEIN_BET_10_AND_14_M', @OLD_CANCER_SEIN_BET_10_AND_14_M 'OLD_CANCER_SEIN_BET_10_AND_14_M',
			@NEW_CANCER_SEIN_BET_15_AND_19_F 'NEW_CANCER_SEIN_BET_15_AND_19_F', @OLD_CANCER_SEIN_BET_15_AND_19_F 'OLD_CANCER_SEIN_BET_15_AND_19_F', @NEW_CANCER_SEIN_BET_15_AND_19_M 'NEW_CANCER_SEIN_BET_15_AND_19_M', @OLD_CANCER_SEIN_BET_15_AND_19_M 'OLD_CANCER_SEIN_BET_15_AND_19_M',
			@NEW_CANCER_SEIN_BET_20_AND_24_F 'NEW_CANCER_SEIN_BET_20_AND_24_F', @OLD_CANCER_SEIN_BET_20_AND_24_F 'OLD_CANCER_SEIN_BET_20_AND_24_F', @NEW_CANCER_SEIN_BET_20_AND_24_M 'NEW_CANCER_SEIN_BET_20_AND_24_M', @OLD_CANCER_SEIN_BET_20_AND_24_M 'OLD_CANCER_SEIN_BET_20_AND_24_M',
			@NEW_CANCER_SEIN_BET_25_AND_49_F 'NEW_CANCER_SEIN_BET_25_AND_49_F', @OLD_CANCER_SEIN_BET_25_AND_49_F 'OLD_CANCER_SEIN_BET_25_AND_49_F', @NEW_CANCER_SEIN_BET_25_AND_49_M 'NEW_CANCER_SEIN_BET_25_AND_49_M', @OLD_CANCER_SEIN_BET_25_AND_49_M 'OLD_CANCER_SEIN_BET_25_AND_49_M',
			@NEW_CANCER_SEIN_BET_50_AND_MORE_F 'NEW_CANCER_SEIN_BET_50_AND_MORE_F', @OLD_CANCER_SEIN_BET_50_AND_MORE_F 'OLD_CANCER_SEIN_BET_50_AND_MORE_F', @NEW_CANCER_SEIN_BET_50_AND_MORE_M 'NEW_CANCER_SEIN_BET_50_AND_MORE_M', @OLD_CANCER_SEIN_BET_50_AND_MORE_M 'OLD_CANCER_SEIN_BET_50_AND_MORE_M',
			@CANCER_SEIN_DEAD 'CANCER_SEIN_DEAD', @NEW_CANCER_SEIN_DISCHARGED 'NEW_CANCER_SEIN_DISCHARGED', @OLD_CANCER_SEIN_DISCHARGED 'OLD_CANCER_SEIN_DISCHARGED',
			
			@NEW_CANCER_PROSTATE_MINUS_10_F 'NEW_CANCER_PROSTATE_MINUS_10_F', @OLD_CANCER_PROSTATE_MINUS_10_F 'OLD_CANCER_PROSTATE_MINUS_10_F', @NEW_CANCER_PROSTATE_MINUS_10_M 'NEW_CANCER_PROSTATE_MINUS_10_M', @OLD_CANCER_PROSTATE_MINUS_10_M 'OLD_CANCER_PROSTATE_MINUS_10_M',
			@NEW_CANCER_PROSTATE_BET_10_AND_14_F 'NEW_CANCER_PROSTATE_BET_10_AND_14_F', @OLD_CANCER_PROSTATE_BET_10_AND_14_F 'OLD_CANCER_PROSTATE_BET_10_AND_14_F', @NEW_CANCER_PROSTATE_BET_10_AND_14_M 'NEW_CANCER_PROSTATE_BET_10_AND_14_M', @OLD_CANCER_PROSTATE_BET_10_AND_14_M 'OLD_CANCER_PROSTATE_BET_10_AND_14_M',
			@NEW_CANCER_PROSTATE_BET_15_AND_19_F 'NEW_CANCER_PROSTATE_BET_15_AND_19_F', @OLD_CANCER_PROSTATE_BET_15_AND_19_F 'OLD_CANCER_PROSTATE_BET_15_AND_19_F', @NEW_CANCER_PROSTATE_BET_15_AND_19_M 'NEW_CANCER_PROSTATE_BET_15_AND_19_M', @OLD_CANCER_PROSTATE_BET_15_AND_19_M 'OLD_CANCER_PROSTATE_BET_15_AND_19_M',
			@NEW_CANCER_PROSTATE_BET_20_AND_24_F 'NEW_CANCER_PROSTATE_BET_20_AND_24_F', @OLD_CANCER_PROSTATE_BET_20_AND_24_F 'OLD_CANCER_PROSTATE_BET_20_AND_24_F', @NEW_CANCER_PROSTATE_BET_20_AND_24_M 'NEW_CANCER_PROSTATE_BET_20_AND_24_M', @OLD_CANCER_PROSTATE_BET_20_AND_24_M 'OLD_CANCER_PROSTATE_BET_20_AND_24_M',
			@NEW_CANCER_PROSTATE_BET_25_AND_49_F 'NEW_CANCER_PROSTATE_BET_25_AND_49_F', @OLD_CANCER_PROSTATE_BET_25_AND_49_F 'OLD_CANCER_PROSTATE_BET_25_AND_49_F', @NEW_CANCER_PROSTATE_BET_25_AND_49_M 'NEW_CANCER_PROSTATE_BET_25_AND_49_M', @OLD_CANCER_PROSTATE_BET_25_AND_49_M 'OLD_CANCER_PROSTATE_BET_25_AND_49_M',
			@NEW_CANCER_PROSTATE_BET_50_AND_MORE_F 'NEW_CANCER_PROSTATE_BET_50_AND_MORE_F', @OLD_CANCER_PROSTATE_BET_50_AND_MORE_F 'OLD_CANCER_PROSTATE_BET_50_AND_MORE_F', @NEW_CANCER_PROSTATE_BET_50_AND_MORE_M 'NEW_CANCER_PROSTATE_BET_50_AND_MORE_M', @OLD_CANCER_PROSTATE_BET_50_AND_MORE_M 'OLD_CANCER_PROSTATE_BET_50_AND_MORE_M',
			@CANCER_PROSTATE_DEAD 'CANCER_PROSTATE_DEAD', @NEW_CANCER_PROSTATE_DISCHARGED 'NEW_CANCER_PROSTATE_DISCHARGED', @OLD_CANCER_PROSTATE_DISCHARGED 'OLD_CANCER_PROSTATE_DISCHARGED',
			
			@NEW_OBESITY_MINUS_10_F 'NEW_OBESITY_MINUS_10_F', @OLD_OBESITY_MINUS_10_F 'OLD_OBESITY_MINUS_10_F', @NEW_OBESITY_MINUS_10_M 'NEW_OBESITY_MINUS_10_M', @OLD_OBESITY_MINUS_10_M 'OLD_OBESITY_MINUS_10_M',
			@NEW_OBESITY_BET_10_AND_14_F 'NEW_OBESITY_BET_10_AND_14_F', @OLD_OBESITY_BET_10_AND_14_F 'OLD_OBESITY_BET_10_AND_14_F', @NEW_OBESITY_BET_10_AND_14_M 'NEW_OBESITY_BET_10_AND_14_M', @OLD_OBESITY_BET_10_AND_14_M 'OLD_OBESITY_BET_10_AND_14_M',
			@NEW_OBESITY_BET_15_AND_19_F 'NEW_OBESITY_BET_15_AND_19_F', @OLD_OBESITY_BET_15_AND_19_F 'OLD_OBESITY_BET_15_AND_19_F', @NEW_OBESITY_BET_15_AND_19_M 'NEW_OBESITY_BET_15_AND_19_M', @OLD_OBESITY_BET_15_AND_19_M 'OLD_OBESITY_BET_15_AND_19_M',
			@NEW_OBESITY_BET_20_AND_24_F 'NEW_OBESITY_BET_20_AND_24_F', @OLD_OBESITY_BET_20_AND_24_F 'OLD_OBESITY_BET_20_AND_24_F', @NEW_OBESITY_BET_20_AND_24_M 'NEW_OBESITY_BET_20_AND_24_M', @OLD_OBESITY_BET_20_AND_24_M 'OLD_OBESITY_BET_20_AND_24_M',
			@NEW_OBESITY_BET_25_AND_49_F 'NEW_OBESITY_BET_25_AND_49_F', @OLD_OBESITY_BET_25_AND_49_F 'OLD_OBESITY_BET_25_AND_49_F', @NEW_OBESITY_BET_25_AND_49_M 'NEW_OBESITY_BET_25_AND_49_M', @OLD_OBESITY_BET_25_AND_49_M 'OLD_OBESITY_BET_25_AND_49_M',
			@NEW_OBESITY_BET_50_AND_MORE_F 'NEW_OBESITY_BET_50_AND_MORE_F', @OLD_OBESITY_BET_50_AND_MORE_F 'OLD_OBESITY_BET_50_AND_MORE_F', @NEW_OBESITY_BET_50_AND_MORE_M 'NEW_OBESITY_BET_50_AND_MORE_M', @OLD_OBESITY_BET_50_AND_MORE_M 'OLD_OBESITY_BET_50_AND_MORE_M',
			@OBESITY_DEAD 'OBESITY_DEAD', @NEW_OBESITY_DISCHARGED 'NEW_OBESITY_DISCHARGED', @OLD_OBESITY_DISCHARGED 'OLD_OBESITY_DISCHARGED',

			@NEW_GLAUCOMA_MINUS_10_F 'NEW_GLAUCOMA_MINUS_10_F', @OLD_GLAUCOMA_MINUS_10_F 'OLD_GLAUCOMA_MINUS_10_F', @NEW_GLAUCOMA_MINUS_10_M 'NEW_GLAUCOMA_MINUS_10_M', @OLD_GLAUCOMA_MINUS_10_M 'OLD_GLAUCOMA_MINUS_10_M',
			@NEW_GLAUCOMA_BET_10_AND_14_F 'NEW_GLAUCOMA_BET_10_AND_14_F', @OLD_GLAUCOMA_BET_10_AND_14_F 'OLD_GLAUCOMA_BET_10_AND_14_F', @NEW_GLAUCOMA_BET_10_AND_14_M 'NEW_GLAUCOMA_BET_10_AND_14_M', @OLD_GLAUCOMA_BET_10_AND_14_M 'OLD_GLAUCOMA_BET_10_AND_14_M',
			@NEW_GLAUCOMA_BET_15_AND_19_F 'NEW_GLAUCOMA_BET_15_AND_19_F', @OLD_GLAUCOMA_BET_15_AND_19_F 'OLD_GLAUCOMA_BET_15_AND_19_F', @NEW_GLAUCOMA_BET_15_AND_19_M 'NEW_GLAUCOMA_BET_15_AND_19_M', @OLD_GLAUCOMA_BET_15_AND_19_M 'OLD_GLAUCOMA_BET_15_AND_19_M',
			@NEW_GLAUCOMA_BET_20_AND_24_F 'NEW_GLAUCOMA_BET_20_AND_24_F', @OLD_GLAUCOMA_BET_20_AND_24_F 'OLD_GLAUCOMA_BET_20_AND_24_F', @NEW_GLAUCOMA_BET_20_AND_24_M 'NEW_GLAUCOMA_BET_20_AND_24_M', @OLD_GLAUCOMA_BET_20_AND_24_M 'OLD_GLAUCOMA_BET_20_AND_24_M',
			@NEW_GLAUCOMA_BET_25_AND_49_F 'NEW_GLAUCOMA_BET_25_AND_49_F', @OLD_GLAUCOMA_BET_25_AND_49_F 'OLD_GLAUCOMA_BET_25_AND_49_F', @NEW_GLAUCOMA_BET_25_AND_49_M 'NEW_GLAUCOMA_BET_25_AND_49_M', @OLD_GLAUCOMA_BET_25_AND_49_M 'OLD_GLAUCOMA_BET_25_AND_49_M',
			@NEW_GLAUCOMA_BET_50_AND_MORE_F 'NEW_GLAUCOMA_BET_50_AND_MORE_F', @OLD_GLAUCOMA_BET_50_AND_MORE_F 'OLD_GLAUCOMA_BET_50_AND_MORE_F', @NEW_GLAUCOMA_BET_50_AND_MORE_M 'NEW_GLAUCOMA_BET_50_AND_MORE_M', @OLD_GLAUCOMA_BET_50_AND_MORE_M 'OLD_GLAUCOMA_BET_50_AND_MORE_M',
			@GLAUCOMA_DEAD 'GLAUCOMA_DEAD', @NEW_GLAUCOMA_DISCHARGED 'NEW_GLAUCOMA_DISCHARGED', @OLD_GLAUCOMA_DISCHARGED 'OLD_GLAUCOMA_DISCHARGED',
			
			@NEW_CATARACT_MINUS_10_F 'NEW_CATARACT_MINUS_10_F', @OLD_CATARACT_MINUS_10_F 'OLD_CATARACT_MINUS_10_F', @NEW_CATARACT_MINUS_10_M 'NEW_CATARACT_MINUS_10_M', @OLD_CATARACT_MINUS_10_M 'OLD_CATARACT_MINUS_10_M',
			@NEW_CATARACT_BET_10_AND_14_F 'NEW_CATARACT_BET_10_AND_14_F', @OLD_CATARACT_BET_10_AND_14_F 'OLD_CATARACT_BET_10_AND_14_F', @NEW_CATARACT_BET_10_AND_14_M 'NEW_CATARACT_BET_10_AND_14_M', @OLD_CATARACT_BET_10_AND_14_M 'OLD_CATARACT_BET_10_AND_14_M',
			@NEW_CATARACT_BET_15_AND_19_F 'NEW_CATARACT_BET_15_AND_19_F', @OLD_CATARACT_BET_15_AND_19_F 'OLD_CATARACT_BET_15_AND_19_F', @NEW_CATARACT_BET_15_AND_19_M 'NEW_CATARACT_BET_15_AND_19_M', @OLD_CATARACT_BET_15_AND_19_M 'OLD_CATARACT_BET_15_AND_19_M',
			@NEW_CATARACT_BET_20_AND_24_F 'NEW_CATARACT_BET_20_AND_24_F', @OLD_CATARACT_BET_20_AND_24_F 'OLD_CATARACT_BET_20_AND_24_F', @NEW_CATARACT_BET_20_AND_24_M 'NEW_CATARACT_BET_20_AND_24_M', @OLD_CATARACT_BET_20_AND_24_M 'OLD_CATARACT_BET_20_AND_24_M',
			@NEW_CATARACT_BET_25_AND_49_F 'NEW_CATARACT_BET_25_AND_49_F', @OLD_CATARACT_BET_25_AND_49_F 'OLD_CATARACT_BET_25_AND_49_F', @NEW_CATARACT_BET_25_AND_49_M 'NEW_CATARACT_BET_25_AND_49_M', @OLD_CATARACT_BET_25_AND_49_M 'OLD_CATARACT_BET_25_AND_49_M',
			@NEW_CATARACT_BET_50_AND_MORE_F 'NEW_CATARACT_BET_50_AND_MORE_F', @OLD_CATARACT_BET_50_AND_MORE_F 'OLD_CATARACT_BET_50_AND_MORE_F', @NEW_CATARACT_BET_50_AND_MORE_M 'NEW_CATARACT_BET_50_AND_MORE_M', @OLD_CATARACT_BET_50_AND_MORE_M 'OLD_CATARACT_BET_50_AND_MORE_M',
			@CATARACT_DEAD 'CATARACT_DEAD', @NEW_CATARACT_DISCHARGED 'NEW_CATARACT_DISCHARGED', @OLD_CATARACT_DISCHARGED 'OLD_CATARACT_DISCHARGED',
			
			@NEW_RENAL_FAILURE_MINUS_10_F 'NEW_RENAL_FAILURE_MINUS_10_F', @OLD_RENAL_FAILURE_MINUS_10_F 'OLD_RENAL_FAILURE_MINUS_10_F', @NEW_RENAL_FAILURE_MINUS_10_M 'NEW_RENAL_FAILURE_MINUS_10_M', @OLD_RENAL_FAILURE_MINUS_10_M 'OLD_RENAL_FAILURE_MINUS_10_M',
			@NEW_RENAL_FAILURE_BET_10_AND_14_F 'NEW_RENAL_FAILURE_BET_10_AND_14_F', @OLD_RENAL_FAILURE_BET_10_AND_14_F 'OLD_RENAL_FAILURE_BET_10_AND_14_F', @NEW_RENAL_FAILURE_BET_10_AND_14_M 'NEW_RENAL_FAILURE_BET_10_AND_14_M', @OLD_RENAL_FAILURE_BET_10_AND_14_M 'OLD_RENAL_FAILURE_BET_10_AND_14_M',
			@NEW_RENAL_FAILURE_BET_15_AND_19_F 'NEW_RENAL_FAILURE_BET_15_AND_19_F', @OLD_RENAL_FAILURE_BET_15_AND_19_F 'OLD_RENAL_FAILURE_BET_15_AND_19_F', @NEW_RENAL_FAILURE_BET_15_AND_19_M 'NEW_RENAL_FAILURE_BET_15_AND_19_M', @OLD_RENAL_FAILURE_BET_15_AND_19_M 'OLD_RENAL_FAILURE_BET_15_AND_19_M',
			@NEW_RENAL_FAILURE_BET_20_AND_24_F 'NEW_RENAL_FAILURE_BET_20_AND_24_F', @OLD_RENAL_FAILURE_BET_20_AND_24_F 'OLD_RENAL_FAILURE_BET_20_AND_24_F', @NEW_RENAL_FAILURE_BET_20_AND_24_M 'NEW_RENAL_FAILURE_BET_20_AND_24_M', @OLD_RENAL_FAILURE_BET_20_AND_24_M 'OLD_RENAL_FAILURE_BET_20_AND_24_M',
			@NEW_RENAL_FAILURE_BET_25_AND_49_F 'NEW_RENAL_FAILURE_BET_25_AND_49_F', @OLD_RENAL_FAILURE_BET_25_AND_49_F 'OLD_RENAL_FAILURE_BET_25_AND_49_F', @NEW_RENAL_FAILURE_BET_25_AND_49_M 'NEW_RENAL_FAILURE_BET_25_AND_49_M', @OLD_RENAL_FAILURE_BET_25_AND_49_M 'OLD_RENAL_FAILURE_BET_25_AND_49_M',
			@NEW_RENAL_FAILURE_BET_50_AND_MORE_F 'NEW_RENAL_FAILURE_BET_50_AND_MORE_F', @OLD_RENAL_FAILURE_BET_50_AND_MORE_F 'OLD_RENAL_FAILURE_BET_50_AND_MORE_F', @NEW_RENAL_FAILURE_BET_50_AND_MORE_M 'NEW_RENAL_FAILURE_BET_50_AND_MORE_M', @OLD_RENAL_FAILURE_BET_50_AND_MORE_M 'OLD_RENAL_FAILURE_BET_50_AND_MORE_M',
			@RENAL_FAILURE_DEAD 'RENAL_FAILURE_DEAD', @NEW_RENAL_FAILURE_DISCHARGED 'NEW_RENAL_FAILURE_DISCHARGED', 
			@OLD_RENAL_FAILURE_DISCHARGED 'OLD_RENAL_FAILURE_DISCHARGED';