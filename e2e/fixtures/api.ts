import { type APIRequestContext, type PlaywrightWorkerArgs, type WorkerFixture } from '@playwright/test';
import { requireTargetEnv } from '../core/target';

export const api: WorkerFixture<APIRequestContext, PlaywrightWorkerArgs> = async ({ playwright }, use) => {
  const ctx = await playwright.request.newContext({
    baseURL: `${requireTargetEnv('BASE_URL')}/ws/rest/v1/`,
    httpCredentials: {
      username: requireTargetEnv('USER_ADMIN_USERNAME'),
      password: requireTargetEnv('USER_ADMIN_PASSWORD'),
    },
  });

  await use(ctx);
};
