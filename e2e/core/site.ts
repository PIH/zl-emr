import type { SiteSettings } from '@pih/pihemr-e2e/src/site';
// (`@pih/pihemr-e2e/src/site`, not the package root: the config imports this file, and only that entry loads no Playwright code. See pihemr/e2e/README.md.)
import {
  MIREBALAIS_VISIT_LOCATION_UUID,
  PRIMARY_CARE_ADULT_FOLLOWUP_ENCOUNTER_TYPE_UUID,
  PRIMARY_CARE_ADULT_INITIAL_ENCOUNTER_TYPE_UUID,
  PRIMARY_CARE_PEDS_FOLLOWUP_ENCOUNTER_TYPE_UUID,
  SESSION_LOCATION_UUID,
  ZL_EMR_ID_IDENTIFIER_SOURCE_UUID,
  ZL_EMR_ID_IDENTIFIER_TYPE_UUID,
} from './constants';
import { requireTargetEnv, targetEnv } from './target';

// What makes the shared fixtures of pihemr (@pih/pihemr-e2e) ZL's. playwright.config.ts passes it as `use: { siteConfig: { getSite } }`; it is called when the first test
// of a worker needs it, so a missing setting fails that test and does not break `playwright test --list`.
export const getSite = (): SiteSettings => ({
  api: {
    baseUrl: requireTargetEnv('BASE_URL'),
    username: requireTargetEnv('USER_ADMIN_USERNAME'),
    password: requireTargetEnv('USER_ADMIN_PASSWORD'),
  },
  // "ZL EMR ID": issued by the server's local pool (6 characters, Luhn mod 30 check digit)
  patientIdentifier: { typeUuid: ZL_EMR_ID_IDENTIFIER_TYPE_UUID, sourceUuid: ZL_EMR_ID_IDENTIFIER_SOURCE_UUID },
  visitLocationUuid: MIREBALAIS_VISIT_LOCATION_UUID,
  sessionLocationUuid: SESSION_LOCATION_UUID,
  defaultProviderName: targetEnv('DEFAULT_PROVIDER_NAME'),
  minRegistrationLocations: 5,
  // What the shared specs that depend on the site's encounter types and formulary need (see SiteSpecFacts in @pih/pihemr-e2e)
  specs: {
    'section-chief-complaint': {
      parents: [
        { name: 'primary care adult followup', encounterTypeUuid: PRIMARY_CARE_ADULT_FOLLOWUP_ENCOUNTER_TYPE_UUID },
        { name: 'primary care peds followup', encounterTypeUuid: PRIMARY_CARE_PEDS_FOLLOWUP_ENCOUNTER_TYPE_UUID },
      ],
    },
    'section-prescriptions-print': {
      parent: { name: 'primary care adult initial', encounterTypeUuid: PRIMARY_CARE_ADULT_INITIAL_ENCOUNTER_TYPE_UUID },
      drugs: ['Acetazolamide', 'Amoxicillin'],
      planFormMedication: 'Acetazolamide, 250mg tablet',
    },
    admissionNote: { ward: 'Sal Gason', otherWard: 'Sal Fanm' },
    edNote: { location: 'Ijans' },
    drugOrder: { drug: 'Paracetamol, 500mg tablet' },
    'section-obgyn-plan': { drug: 'Paracetamol, 500mg tablet' },
    'section-oncology-plan': { drug: 'Paracetamol, 500mg tablet' },
  },
});
