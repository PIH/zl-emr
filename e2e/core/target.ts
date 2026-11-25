import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Which server a run goes to. The suite runs against ONE server at a time (`workers: 1`, shared test data), and ZL has two
// that together offer the most forms: the primary one (zl-ci, Central profile) and the HIV one (hiv-ci, HIV profile, which
// offers the HIV, PMTCT, EID and PrEP forms).
//   npx playwright test                    the primary server: E2E_BASE_URL, E2E_USER_ADMIN_USERNAME, ...
//   E2E_TARGET=hiv-ci npx playwright test  the HIV server: E2E_HIV_CI_BASE_URL, E2E_HIV_CI_USER_ADMIN_USERNAME, ...
// A target's setting that is missing falls back to the primary's, except the base URL, which must be set. Specs that only
// make sense on the HIV server carry the tag @hiv-ci in their describe title: only an `E2E_TARGET=hiv-ci` run includes
// them, and a primary run skips them (see playwright.config.ts).
export const TARGET = process.env.E2E_TARGET ?? '';
const prefix = TARGET ? `E2E_${TARGET.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_` : 'E2E_';

// A setting of the chosen target, e.g. targetEnv('BASE_URL') is E2E_BASE_URL or E2E_HIV_CI_BASE_URL.
export const targetEnv = (name: string): string | undefined => process.env[`${prefix}${name}`] ?? (name === 'BASE_URL' ? undefined : process.env[`E2E_${name}`]);

export const requireTargetEnv = (name: string): string => {
  const value = targetEnv(name);
  if (!value) {
    throw new Error(`${prefix}${name} is not set (see .env.example)${TARGET ? ` for E2E_TARGET=${TARGET}` : ''}`);
  }
  return value;
};

export const STORAGE_STATE = TARGET ? `storageState.${TARGET}.json` : 'storageState.json';

// What the shared code of @pih/pihemr-e2e reads from the environment, set from the chosen target:
// - E2E_DEFAULT_PROVIDER_NAME: the provider its pages select (a target may name its own, E2E_HIV_CI_DEFAULT_PROVIDER_NAME).
// - E2E_PROFILE: which profile of _availability.e2e.json the run is. The HIV server is the `hiv` profile; without this its run would use the default profile (central),
//   which does not offer the Comment form, and includeSpecs() would skip that spec.
const provider = targetEnv('DEFAULT_PROVIDER_NAME');
if (provider) {
  process.env.E2E_DEFAULT_PROVIDER_NAME = provider;
}
if (TARGET === 'hiv-ci') {
  process.env.E2E_PROFILE ??= 'hiv';
}
