import { devices, type PlaywrightTestConfig } from '@playwright/test';
import type { PihemrWorkerOptions } from '@pih/pihemr-e2e/src/site';
import { getSite } from './core/site';
import { requireTargetEnv, STORAGE_STATE, TARGET, targetEnv } from './core/target';

// A slow server (the local hiv-ci one takes 5-10 s per visit-page fragment and form save) needs longer timeouts: E2E_<TARGET>_TIMEOUT_FACTOR
// multiplies the test, expect and action timeouts. 1 (the default) is the primary server's setting.
const factor = Number(targetEnv('TIMEOUT_FACTOR') ?? 1);

const config: PlaywrightTestConfig<{}, PihemrWorkerOptions> = {
  testDir: './specs',
  // Applies tsconfig.json's `paths` to every file, including the specs shared from pihemr (@pih/pihemr-e2e) outside this repo.
  tsconfig: './tsconfig.json',
  timeout: 30 * 1000 * factor,
  expect: {
    timeout: 15 * 1000 * factor,
  },
  // @hiv-ci specs run only against the HIV server (E2E_TARGET=hiv-ci, see core/target.ts); that run runs nothing else.
  ...(TARGET === 'hiv-ci' ? { grep: /@hiv-ci/ } : { grepInvert: /@hiv-ci/ }),
  fullyParallel: true,
  // One worker by default: the specs create and void their own patients on a shared server (`--workers=N` overrides it).
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['junit', { outputFile: 'results.xml' }], ['html']] : [['html', { open: 'never' }]],
  globalSetup: require.resolve('./core/global-setup'),
  use: {
    // The site of the shared fixtures from pihemr (@pih/pihemr-e2e); see core/site.ts.
    siteConfig: { getSite },
    // Trailing slash is required so that relative page.goto() paths keep the "/openmrs" prefix.
    baseURL: `${requireTargetEnv('BASE_URL')}/`,
    actionTimeout: 15 * 1000 * factor,
    storageState: STORAGE_STATE,
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
};

export default config;
