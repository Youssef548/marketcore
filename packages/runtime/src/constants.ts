/**
 * Implementation-level literal values, defined once.
 *
 * Wire-level values live in `@app/contracts`, because both apps and any client
 * must agree on them. These are HTTP-plumbing and logging literals that only the
 * runtime owns.
 */

/** An inbound id longer than this is replaced rather than echoed or logged. */
export const REQUEST_ID_MAX_LENGTH = 64;

/** Characters an inbound id may contain. Anything else could forge a log record. */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

/** Fallback when the id middleware did not run, which is a misconfiguration rather than a normal case. */
export const UNKNOWN_REQUEST_ID = 'unknown';

export const LogLevels = {
  DEBUG: 'debug',
  ERROR: 'error',
  LOG: 'log',
  VERBOSE: 'verbose',
  WARN: 'warn',
} as const;
export type LogLevelName = (typeof LogLevels)[keyof typeof LogLevels];

/** Levels a sink should send to stderr, because they are what an operator greps for. */
export const STDERR_LOG_LEVELS = [LogLevels.ERROR, LogLevels.WARN] as const;

/** Field values shared by both processes. A log event name is a contract, not a literal. */
export const LogEvents = {
  HTTP_REQUEST_COMPLETED: 'http.request.completed',
} as const;
