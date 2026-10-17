import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogLevels, createLogger, type LogLevelName } from '@app/runtime';
import { runTick, startWorker, type WorkerLogger } from './main';
import { WORKER_LOGGER_CONTEXT, WorkerLogEvents } from './worker.constants';

/** A line this process would have printed, captured through the logger's injected sink. */
interface CapturedLine {
  line: string;
  level: LogLevelName;
}

function captureLogger(): { logger: WorkerLogger; lines: CapturedLine[] } {
  const lines: CapturedLine[] = [];
  const logger = createLogger(WORKER_LOGGER_CONTEXT, (line, level) => lines.push({ line, level }));
  return { logger, lines };
}

const tickLines = (lines: CapturedLine[]) => lines.filter(({ line }) => line.includes(WorkerLogEvents.TICK));

describe('worker main wiring', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('logs exactly one tick at debug level (the stacked Task 18 PR replaces this no-op job)', async () => {
    const { logger, lines } = captureLogger();

    await runTick(logger);

    expect(tickLines(lines)).toEqual([{ line: expect.stringContaining(WorkerLogEvents.TICK), level: LogLevels.DEBUG }]);
  });

  it('startWorker runs the tick on the env interval, and stop ends it', async () => {
    const { logger, lines } = captureLogger();
    const stop = startWorker({ intervalMs: 1_000 }, logger);

    expect(tickLines(lines)).toHaveLength(1); // the first run is immediate
    await vi.advanceTimersByTimeAsync(1_000);
    expect(tickLines(lines)).toHaveLength(2);

    await stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(tickLines(lines)).toHaveLength(2); // nothing runs after stop
  });
});
