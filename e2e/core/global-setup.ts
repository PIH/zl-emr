import { request } from '@playwright/test';
import { SESSION_LOCATION_UUID } from './constants';
import { requireTargetEnv, STORAGE_STATE } from './target';

async function globalSetup() {
  const requestContext = await request.newContext();
  const token = Buffer.from(
    `${requireTargetEnv('USER_ADMIN_USERNAME')}:${requireTargetEnv('USER_ADMIN_PASSWORD')}`,
  ).toString('base64');

  // The HTML Form Entry UI needs a session location, so set one when logging in.
  const res = await requestContext.post(`${requireTargetEnv('BASE_URL')}/ws/rest/v1/session`, {
    data: { locale: 'en', sessionLocation: SESSION_LOCATION_UUID },
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${token}`,
    },
  });

  if (!res.ok()) {
    throw new Error(`Global setup login failed: ${res.status()}`);
  }

  await requestContext.storageState({ path: STORAGE_STATE });
  await requestContext.dispose();
}

export default globalSetup;
