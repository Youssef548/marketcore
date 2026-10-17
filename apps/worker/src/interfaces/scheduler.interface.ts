/** The two timer calls the scheduler makes, so a test can drive them. */
export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SchedulerOptions {
  timers?: Timers;
  onError?: (error: unknown) => void;
}

/** Stops scheduling and resolves once the run in flight, if any, has finished. */
export type StopScheduler = () => Promise<void>;
