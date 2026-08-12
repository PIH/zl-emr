select encounterName('cc1720c9-3e4c-4fa8-a7ec-40eeaad1958c') into @encounterName;

select obs_value_coded_list (latestEnc(9, @encounterName , null), 'PIH','1282','en') into @regimen ;
select @regimen as regimen;