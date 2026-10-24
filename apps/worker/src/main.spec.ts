import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogLevels, createLogger } from '@app/runtime';
import { startWorker } from './main';
import type { CapturedWorkerLog, PrintedLine } from './interfaces/main.interface';
import { WORKER_LOGGER_CONTEXT, WorkerLogEvents } from './worker.constants';

function captureLogger(): CapturedWorkerLog {
  const lines: PrintedLine[] = [];
  const logger = createLogger(WORKER_LOGGER_CONTEXT, (line, level) => lines.push({ line, level }));
  return { logger, lines };
}

const failLines = (lines: PrintedLine[]) =>
  lines.filter(({ line }) => line.includes(WorkerLogEvents.RUN_FAILED));

describe('worker main wiring', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs the job immediately, then an interval after each run finishes', async () => {
    const runOnce = vi.fn(async () => undefined);
    const { logger } = captureLogger();

    const stop = startWorker({ intervalMs: 1_000 }, runOnce, logger);

    expect(runOnce).toHaveBeenCalledTimes(1); // the first run is immediate
    await vi.advanceTimersByTimeAsync(1_000);
    expect(runOnce).toHaveBeenCalledTimes(2);

    await stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runOnce).toHaveBeenCalledTimes(2); // nothing runs after stop
  });

  it('logs a failed run at error level and keeps the next tick scheduled', async () => {
    const runOnce = vi.fn(async () => {
      throw new Error('database is down');
    });
    const { logger, lines } = captureLogger();

    const stop = startWorker({ intervalMs: 1_000 }, runOnce, logger);

    await vi.advanceTimersByTimeAsync(0); // let the rejection reach the error handler
    expect(failLines(lines)).toHaveLength(1);
    expect(failLines(lines)[0]?.level).toBe(LogLevels.ERROR);

    // The failure did not end the chain: a later interval still runs the job.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(runOnce).toHaveBeenCalledTimes(2);

    await stop();
  });

  it('stop() waits for the run in flight instead of interrupting it', async () => {
    let finishRun: () => void = () => undefined;
    const runOnce = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRun = resolve;
        }),
    );
    const { logger } = captureLogger();

    const stop = startWorker({ intervalMs: 1_000 }, runOnce, logger);
    expect(runOnce).toHaveBeenCalledTimes(1);

    let stopped = false;
    const stopping = stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false); // a run is still in flight

    finishRun();
    await stopping;
    expect(stopped).toBe(true);
  });
});
