import { type APIRequestContext, expect } from '@playwright/test';
import { ZL_EMR_ID_IDENTIFIER_TYPE_UUID, MIREBALAIS_VISIT_LOCATION_UUID } from '../core/constants';

export interface TestPatient {
  uuid: string;
  person: { uuid: string; gender: string; birthdate: string };
}

export interface CreatePatientOptions {
  givenName?: string;
  familyName?: string;
  gender?: 'M' | 'F';
  birthdate?: string;
}

// ZL EMR ID: 5 random characters plus a Luhn mod 30 check character (idgen's LuhnMod30IdentifierValidator).
const LUHN_MOD_30_CHARS = '0123456789ACDEFGHJKLMNPRTUVWXY';

function randomIdentifier(): string {
  const base = Array.from({ length: 5 }, () => LUHN_MOD_30_CHARS[Math.floor(Math.random() * LUHN_MOD_30_CHARS.length)]);
  let factor = 2;
  let sum = 0;
  for (let i = base.length - 1; i >= 0; i--) {
    const addend = factor * LUHN_MOD_30_CHARS.indexOf(base[i]);
    factor = factor === 2 ? 1 : 2;
    sum += Math.floor(addend / 30) + (addend % 30);
  }
  const check = (30 - (sum % 30)) % 30;
  return base.join('') + LUHN_MOD_30_CHARS[check];
}

// Creates a synthetic patient. Names contain no digits.
export const createPatient = async (api: APIRequestContext, opts: CreatePatientOptions = {}): Promise<TestPatient> => {
  const res = await api.post('patient', {
    data: {
      identifiers: [
        {
          identifier: randomIdentifier(),
          identifierType: ZL_EMR_ID_IDENTIFIER_TYPE_UUID,
          location: MIREBALAIS_VISIT_LOCATION_UUID,
          preferred: true,
        },
      ],
      person: {
        gender: opts.gender ?? 'F',
        birthdate: opts.birthdate ?? '1990-01-01',
        birthdateEstimated: false,
        names: [{ givenName: opts.givenName ?? 'AutoE', familyName: opts.familyName ?? 'Tester', preferred: true }],
        addresses: [],
        attributes: [],
      },
    },
  });
  expect(res.ok(), `create patient: ${res.status()}`).toBeTruthy();
  return res.json();
};

export const deletePatient = async (api: APIRequestContext, uuid: string): Promise<void> => {
  const res = await api.delete(`patient/${uuid}`);
  expect(res.ok(), `void patient: ${res.status()}`).toBeTruthy();
};

// Birthdate for a patient who is `years` old today. The date is two days before the birthday: the browser
// machine, the test runner and the server may be in different timezones, and a patient born exactly
// `years` ago would read as `years - 1` on a server whose date is a day behind.
export const birthdateYearsAgo = (years: number): string => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 2);
  return d.toISOString().slice(0, 10);
};
