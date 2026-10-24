import { CHECKOUT_PAYMENT_WINDOW_MINUTES } from '@app/contracts';

const MS_PER_MINUTE = 60_000;

/** The worker's cadence (D79). */
export const AUTO_CANCEL_INTERVAL_MS = 60_000;

/** The most checkouts one run cancels (D79), so one run's transaction stays short. */
export const AUTO_CANCEL_BATCH_SIZE = 100;

/** D70, in the unit the worker computes with. */
export const CHECKOUT_PAYMENT_WINDOW_MS = CHECKOUT_PAYMENT_WINDOW_MINUTES * MS_PER_MINUTE;

export function checkoutExpiresAt(placedAt: Date): Date {
  return new Date(placedAt.getTime() + CHECKOUT_PAYMENT_WINDOW_MS);
}
