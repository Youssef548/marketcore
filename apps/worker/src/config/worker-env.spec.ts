import { describe, expect, it } from 'vitest';
import { AUTO_CANCEL_INTERVAL_MS, CHECKOUT_PAYMENT_WINDOW_MS } from '@app/domain';
import { validateWorkerEnv } from './worker-env';

const base = { DATABASE_URL: 'postgresql://app:app@localhost:5432/app' };

describe('validateWorkerEnv (D87)', () => {
  it('defaults to D79 and D70 and needs no JWT secret', () => {
    expect(validateWorkerEnv(base)).toMatchObject({
      AUTO_CANCEL_INTERVAL_MS,
      CHECKOUT_PAYMENT_WINDOW_MS,
    });
  });

  it('accepts a shorter window and interval, as the behavioural stack sets them', () => {
    expect(
      validateWorkerEnv({ ...base, AUTO_CANCEL_INTERVAL_MS: '1000', CHECKOUT_PAYMENT_WINDOW_MS: '20000' }),
    ).toMatchObject({ AUTO_CANCEL_INTERVAL_MS: 1000, CHECKOUT_PAYMENT_WINDOW_MS: 20000 });
  });

  it('refuses an interval so small it would spin, and a missing database', () => {
    expect(() => validateWorkerEnv({ ...base, AUTO_CANCEL_INTERVAL_MS: '10' })).toThrow(/AUTO_CANCEL_INTERVAL_MS/);
    expect(() => validateWorkerEnv({})).toThrow(/DATABASE_URL/);
  });
});
