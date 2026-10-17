import 'dotenv/config';
import { createLogger } from '@app/runtime';
import { validateWorkerEnv } from './config/worker-env';
import type { StopScheduler } from './interfaces/scheduler.interface';
import type { WorkerStartOptions } from './interfaces/worker.interface';
import { startInterval } from './scheduler';
import { SHUTDOWN_SIGNALS, WORKER_LOGGER_CONTEXT, WorkerLogEvents } from './worker.constants';

/** The logger `createLogger` returns, named so the worker never imports `@nestjs/common`. */
export type WorkerLogger = ReturnType<typeof createLogger>;

/**
 * The placeholder job. It proves the scheduler, the logger and the shutdown
 * path end to end without touching Prisma. The stacked Task 18 PR replaces it
 * with the auto-cancel job.
 */
export async function runTick(logger: WorkerLogger): Promise<void> {
  // `debug` is optional on Nest's LoggerService; every logger we build has it.
  logger.debug?.(WorkerLogEvents.TICK);
}

/**
 * Everything the process wires, as a factory so a spec can drive it: the
 * interval running, failures logged rather than thrown, shutdown registered.
 */
export function startWorker({ intervalMs }: WorkerStartOptions, logger: WorkerLogger): StopScheduler {
  const stop = startInterval(() => runTick(logger), intervalMs, {
    onError: (error) =>
      logger.error(WorkerLogEvents.TICK_FAILED, { error: error instanceof Error ? error.stack : String(error) }),
  });

  // A plain Node process (ADR 0001) owns its signals: stop the interval — which
  // waits for a run in flight — and only then leave.
  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => void stop().then(() => process.exit(0)));
  }

  return stop;
}

async function bootstrap(): Promise<void> {
  // Validate before anything else, so a bad deploy fails at boot with a list of
  // what is wrong rather than on the first tick.
  const env = validateWorkerEnv();
  const logger = createLogger(WORKER_LOGGER_CONTEXT);

  startWorker({ intervalMs: env.AUTO_CANCEL_INTERVAL_MS }, logger);
  logger.log(WorkerLogEvents.STARTED, { intervalMs: env.AUTO_CANCEL_INTERVAL_MS });
}

// Run only when this file is the process entry (`node dist/main.js`): a spec
// that imports the exports above must start no timers and register no handlers.
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  void bootstrap();
}
