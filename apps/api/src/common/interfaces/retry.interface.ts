export interface RetryOptions {
  /** Retries after the first attempt; SRS §8 says 3. */
  retries: number;
  baseDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (attempt: number, error: unknown) => void;
}
