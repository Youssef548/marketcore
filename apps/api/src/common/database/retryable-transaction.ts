import { Prisma } from '@app/database';
import type { RetryOptions } from '../interfaces/retry.interface';
import { PrismaErrorCodes, RETRYABLE_SQLSTATES } from './database.constants';

export function isRetryableTransactionError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === PrismaErrorCodes.TRANSACTION_CONFLICT) return true;
  if (error.code !== PrismaErrorCodes.RAW_QUERY_FAILED) return false;

  const sqlState = (error.meta as { code?: unknown } | undefined)?.code;
  return typeof sqlState === 'string' && (RETRYABLE_SQLSTATES as readonly string[]).includes(sqlState);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs a whole transaction again when Postgres aborted it as a deadlock victim or
 * a serialization failure. The transaction is the unit retried — never a single
 * statement inside it, because the abort already rolled every statement back.
 */
export async function withTransactionRetry<T>(run: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= options.retries || !isRetryableTransactionError(error)) throw error;
      options.onRetry?.(attempt + 1, error);
      // Full jitter: two transactions that just deadlocked must not retry in lockstep.
      await sleep(Math.round(random() * options.baseDelayMs * 2 ** attempt));
    }
  }
}
