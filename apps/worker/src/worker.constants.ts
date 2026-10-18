/** The logger context every worker line carries. */
export const WORKER_LOGGER_CONTEXT = 'worker';

export const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

/**
 * The scheduler's own event. The auto-cancel job logs its outcomes through
 * `LogEvents` (`checkout.autocancel.run` / `.failed`); this is only the net for a
 * run that threw before the job could log it. A log event name is a contract.
 */
export const WorkerLogEvents = {
  RUN_FAILED: 'worker.run.failed',
} as const;

/** Floors for the D87 overrides: below these a misconfiguration would spin the database. */
export const MIN_AUTO_CANCEL_INTERVAL_MS = 500;
export const MIN_PAYMENT_WINDOW_MS = 1_000;

/** One run's transaction: at most 100 checkouts (D79), so seconds, not minutes. */
export const AUTO_CANCEL_TRANSACTION_TIMEOUT_MS = 30_000;
