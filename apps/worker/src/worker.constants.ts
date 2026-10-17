/** The logger context every worker line carries. */
export const WORKER_LOGGER_CONTEXT = 'worker';

export const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

/** The log event names this process emits. A log event name is a contract, not a literal. */
export const WorkerLogEvents = {
  STARTED: 'worker.started',
  /** The placeholder tick; the stacked Task 18 PR replaces it with the auto-cancel job's events. */
  TICK: 'worker.tick',
  TICK_FAILED: 'worker.tick.failed',
} as const;

/** Floors for the D87 overrides: below these a misconfiguration would spin the database. */
export const MIN_AUTO_CANCEL_INTERVAL_MS = 500;
export const MIN_PAYMENT_WINDOW_MS = 1_000;

/** One run's transaction: at most 100 checkouts (D79), so seconds, not minutes. */
export const AUTO_CANCEL_TRANSACTION_TIMEOUT_MS = 30_000;
