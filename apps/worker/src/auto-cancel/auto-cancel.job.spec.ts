import { describe, expect, it, vi } from 'vitest';
import { LogEvents } from '@app/runtime';
import { captureLogger } from '../../test/support/logger';
import { AutoCancelJob } from './auto-cancel.job';

const policy = { windowMs: 30 * 60_000, batchSize: 100 };
const now = new Date('2026-10-16T12:00:00.000Z');

describe('AutoCancelJob', () => {
  it('asks for checkouts placed before now − window, at most a batch (SRS-FR-CXL-001)', async () => {
    const cancelExpired = vi.fn().mockResolvedValue({ cancelled: 0, restoredUnits: 0 });
    await new AutoCancelJob({ cancelExpired }, captureLogger(), policy, () => now).run();

    expect(cancelExpired).toHaveBeenCalledWith(new Date('2026-10-16T11:30:00.000Z'), 100);
  });

  it('logs exactly one JSON line per run with event, cancelled and durationMs (SRS-FR-CXL-004)', async () => {
    const logger = captureLogger();
    const cancelExpired = vi.fn().mockResolvedValue({ cancelled: 3, restoredUnits: 7 });

    await new AutoCancelJob({ cancelExpired }, logger, policy, () => now).run();

    expect(logger.lines).toHaveLength(1);
    expect(logger.lines[0]).toMatchObject({
      event: LogEvents.CHECKOUT_AUTOCANCEL_RUN,
      fields: { cancelled: 3, restoredUnits: 7, durationMs: expect.any(Number) },
    });
  });

  it('never rejects: a failed run is one error line, and the next run tries again', async () => {
    const logger = captureLogger();
    const cancelExpired = vi.fn().mockRejectedValue(new Error('connection refused'));

    await expect(new AutoCancelJob({ cancelExpired }, logger, policy, () => now).run()).resolves.toEqual({
      cancelled: 0,
      restoredUnits: 0,
    });
    expect(logger.lines).toEqual([
      expect.objectContaining({ level: 'error', event: LogEvents.CHECKOUT_AUTOCANCEL_FAILED }),
    ]);
  });
});
