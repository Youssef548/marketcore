import 'dotenv/config';
import { PrismaClient } from '@app/database';
import { AUTO_CANCEL_BATCH_SIZE } from '@app/domain';
import { LogEvents, createLogger } from '@app/runtime';
import { AutoCancelJob } from './auto-cancel/auto-cancel.job';
import { AutoCancelRepository } from './auto-cancel/auto-cancel.repository';
import { validateWorkerEnv } from './config/worker-env';
import type { StopScheduler } from './interfaces/scheduler.interface';
import type { WorkerStartOptions } from './interfaces/worker.interface';
import { startInterval } from './scheduler';
import { SHUTDOWN_SIGNALS, WORKER_LOGGER_CONTEXT, WorkerLogEvents } from './worker.constants';

/** The logger `createLogger` returns, named so the worker never imports `@nestjs/common`. */
export type WorkerLogger = ReturnType<typeof createLogger>;

/**
 * Everything the process wires, as a factory so a spec can drive it: the interval
 * running the job, and a failure logged rather than thrown. `AutoCancelJob.run`
 * already logs its own failures, so the handler here is the net for a throw it
 * could not catch — the chain keeps its next tick either way.
 */
export function startWorker(
  { intervalMs }: WorkerStartOptions,
  runOnce: () => Promise<unknown>,
  logger: WorkerLogger,
): StopScheduler {
  return startInterval(
    async () => {
      await runOnce();
    },
    intervalMs,
    {
      onError: (error) =>
        logger.error(WorkerLogEvents.RUN_FAILED, {
          error: error instanceof Error ? error.stack : String(error),
        }),
    },
  );
}

/** The one job this process runs (ADR 0001): auto-cancel, against PostgreSQL only. */
function buildJob(
  prisma: PrismaClient,
  logger: WorkerLogger,
  env: ReturnType<typeof validateWorkerEnv>,
): AutoCancelJob {
  return new AutoCancelJob(new AutoCancelRepository(prisma), logger, {
    windowMs: env.CHECKOUT_PAYMENT_WINDOW_MS,
    batchSize: AUTO_CANCEL_BATCH_SIZE,
  });
}

async function bootstrap(): Promise<void> {
  // Validate before anything else, so a bad deploy fails at boot with a list of what
  // is wrong rather than on the first run.
  const env = validateWorkerEnv();
  const logger = createLogger(WORKER_LOGGER_CONTEXT);
  const prisma = new PrismaClient();
  const job = buildJob(prisma, logger, env);

  const stop = startWorker({ intervalMs: env.AUTO_CANCEL_INTERVAL_MS }, () => job.run(), logger);
  logger.log(LogEvents.WORKER_STARTED, {
    intervalMs: env.AUTO_CANCEL_INTERVAL_MS,
    windowMs: env.CHECKOUT_PAYMENT_WINDOW_MS,
    batchSize: AUTO_CANCEL_BATCH_SIZE,
  });

  // A plain Node process (ADR 0001) owns its signals: stop the interval — which waits
  // for a run in flight — disconnect, and only then leave.
  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      void stop()
        .then(() => prisma.$disconnect())
        .then(() => {
          logger.log(LogEvents.WORKER_STOPPED, { signal });
          process.exit(0);
        });
    });
  }
}

// Run only when this file is the process entry (`node dist/main.js`): a spec that
// imports the factory above must start no timers and register no handlers.
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  void bootstrap();
}
