import { z } from 'zod';
import { AUTO_CANCEL_INTERVAL_MS, CHECKOUT_PAYMENT_WINDOW_MS } from '@app/domain';
import { DatabaseEnvSchema, parseEnv } from '@app/runtime';
import { MIN_AUTO_CANCEL_INTERVAL_MS, MIN_PAYMENT_WINDOW_MS } from '../worker.constants';

/**
 * D87: the cadence and the window default to D79 and D70 and may be shortened
 * only by the environment — the behavioural stack cannot wait thirty minutes.
 * Nothing in the code path changes with them; only the clock arithmetic does.
 */
export const WorkerEnvSchema = DatabaseEnvSchema.extend({
  AUTO_CANCEL_INTERVAL_MS: z.coerce.number().int().min(MIN_AUTO_CANCEL_INTERVAL_MS).default(AUTO_CANCEL_INTERVAL_MS),
  CHECKOUT_PAYMENT_WINDOW_MS: z.coerce.number().int().min(MIN_PAYMENT_WINDOW_MS).default(CHECKOUT_PAYMENT_WINDOW_MS),
});
export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export function validateWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  return parseEnv(WorkerEnvSchema, source);
}
