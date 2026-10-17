import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startInterval } from './scheduler';

describe('startInterval', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs once immediately, so a restarted worker catches up at once (failure-scenarios: worker down)', async () => {
    const job = vi.fn(async () => undefined);
    const stop = startInterval(job, 60_000);

    expect(job).toHaveBeenCalledTimes(1);
    await stop();
  });

  it('never overlaps runs: the next starts an interval after the previous finished', async () => {
    let finish!: () => void;
    const job = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)))
      .mockResolvedValue(undefined);
    const stop = startInterval(job, 1_000);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(job).toHaveBeenCalledTimes(1); // the first run is still going

    finish();
    await vi.advanceTimersByTimeAsync(999);
    expect(job).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(job).toHaveBeenCalledTimes(2);
    await stop();
  });

  it('stop waits for the run in flight and schedules nothing after it', async () => {
    let finish!: () => void;
    const job = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const stop = startInterval(job, 1_000);

    const stopped = stop();
    finish();
    await stopped;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(job).toHaveBeenCalledTimes(1);
  });

  it('reports a failed run and keeps going', async () => {
    const onError = vi.fn();
    const job = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined);
    const stop = startInterval(job, 1_000, { onError });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'db down' }));
    expect(job).toHaveBeenCalledTimes(2);
    await stop();
  });
});
