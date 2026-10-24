import { describe, expect, it } from 'vitest';
import { CHECKOUT_PAYMENT_WINDOW_MINUTES } from '@app/contracts';
import {
  AUTO_CANCEL_BATCH_SIZE,
  AUTO_CANCEL_INTERVAL_MS,
  CHECKOUT_PAYMENT_WINDOW_MS,
  checkoutExpiresAt,
} from '../../src/checkout/checkout-policy';

describe('auto-cancel policy (D70, D79)', () => {
  it('runs every 60 seconds and cancels at most 100 per run', () => {
    expect(AUTO_CANCEL_INTERVAL_MS).toBe(60_000);
    expect(AUTO_CANCEL_BATCH_SIZE).toBe(100);
  });

  it('derives the window in milliseconds from the one wire value', () => {
    expect(CHECKOUT_PAYMENT_WINDOW_MS).toBe(CHECKOUT_PAYMENT_WINDOW_MINUTES * 60_000);
  });

  it('expires a checkout exactly 30 minutes after placement', () => {
    const placedAt = new Date('2026-10-16T10:00:00.000Z');
    expect(checkoutExpiresAt(placedAt).toISOString()).toBe('2026-10-16T10:30:00.000Z');
  });
});
