import 'dotenv/config';
import { PrismaClient } from '@app/database';
import { AUTO_CANCEL_BATCH_SIZE } from '@app/domain';
import { LogEvents, createLogger } from '@app/runtime';
import { AutoCancelJob } from './auto-cancel/auto-cancel.job';
import { AutoCancelRepository } from './auto-cancel/auto-cancel.repository';
import { validateWorkerEnv } from './config/worker-env';
import { startInterval } from './scheduler';
import { SHUTDOWN_SIGNALS, WORKER_LOGGER_CONTEXT } from './worker.constants';

/**
 * The worker process (ADR 0001, amended): one job, on an interval, against
 * PostgreSQL only. Validates its environment before touching anything, so a bad
 * deploy fails at boot with a list of what is wrong.
 */
function main(): void {
  const env = validateWorkerEnv();
  const logger = createLogger(WORKER_LOGGER_CONTEXT);
  const prisma = new PrismaClient();
  const job = new AutoCancelJob(new AutoCancelRepository(prisma), logger, {
    windowMs: env.CHECKOUT_PAYMENT_WINDOW_MS,
    batchSize: AUTO_CANCEL_BATCH_SIZE,
  });

  const stop = startInterval(
    async () => {
      await job.run();
    },
    env.AUTO_CANCEL_INTERVAL_MS,
  );
  logger.log(LogEvents.WORKER_STARTED, {
    intervalMs: env.AUTO_CANCEL_INTERVAL_MS,
    windowMs: env.CHECKOUT_PAYMENT_WINDOW_MS,
    batchSize: AUTO_CANCEL_BATCH_SIZE,
  });

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

main();
