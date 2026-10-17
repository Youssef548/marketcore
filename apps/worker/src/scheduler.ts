import type { SchedulerOptions, StopScheduler, Timers } from './interfaces/scheduler.interface';

const systemTimers: Timers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

/**
 * Invokes `job` on this turn, so a synchronous throw becomes a rejection routed
 * through `.catch(onError)` instead of escaping before the handler is attached —
 * which would kill the loop with no error reported and no next tick scheduled.
 * A rejected promise already had a handler; its path is unchanged.
 */
function runJob(job: () => Promise<void>): Promise<void> {
  try {
    return job();
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Runs `job` now, then `intervalMs` after each run *finishes* — a setTimeout
 * chain, not setInterval, so a slow run can never overlap the next one in this
 * process. Overlap across processes is the database's job (SKIP LOCKED).
 */
export function startInterval(
  job: () => Promise<void>,
  intervalMs: number,
  { timers = systemTimers, onError = () => undefined }: SchedulerOptions = {},
): StopScheduler {
  let stopped = false;
  let handle: unknown;
  let inFlight: Promise<void> = Promise.resolve();

  const tick = (): void => {
    inFlight = runJob(job)
      .catch(onError)
      .finally(() => {
        if (!stopped) handle = timers.setTimeout(tick, intervalMs);
      });
  };

  tick();

  return async () => {
    stopped = true;
    if (handle !== undefined) timers.clearTimeout(handle);
    await inFlight;
  };
}
