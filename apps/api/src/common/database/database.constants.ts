/** SRS §8: a deadlock or serialization failure is retried up to 3 times. */
export const TRANSACTION_RETRIES = 3;

/** The first retry's jitter ceiling; it doubles per attempt. */
export const TRANSACTION_RETRY_BASE_DELAY_MS = 15;

/**
 * How long an interactive transaction may wait for a pooled connection, and run.
 * Prisma's defaults (2 s / 5 s) are sized for one request; 100 checkouts queued
 * on a pool of ~2×CPU+1 connections can wait longer than 2 s for a connection
 * without anything being wrong, and would fail with P2028 instead of a 409.
 */
export const INTERACTIVE_TRANSACTION_MAX_WAIT_MS = 10_000;
export const INTERACTIVE_TRANSACTION_TIMEOUT_MS = 10_000;

/** deadlock_detected, serialization_failure. */
export const RETRYABLE_SQLSTATES = ['40P01', '40001'] as const;

export const PrismaErrorCodes = {
  /** "Transaction failed due to a write conflict or a deadlock." */
  TRANSACTION_CONFLICT: 'P2034',
  /** "Raw query failed" — the SQLSTATE is in `meta.code`. */
  RAW_QUERY_FAILED: 'P2010',
} as const;
