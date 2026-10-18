import { LogEvents, type Logger } from '@app/runtime';
import type { AutoCancelPolicy, AutoCancelResult, AutoCancelStore } from '../interfaces/auto-cancel.interface';

const NOTHING: AutoCancelResult = { cancelled: 0, restoredUnits: 0 };
const elapsedMs = (started: number) => Math.round((performance.now() - started) * 1000) / 1000;

/**
 * One run: work out the cutoff from the clock, cancel what is due, log one line
 * (SRS-FR-CXL-004). It never rejects — a failed run is logged and the scheduler
 * tries again an interval later, which is all a retry could do.
 */
export class AutoCancelJob {
  constructor(
    private readonly store: AutoCancelStore,
    private readonly logger: Logger,
    private readonly policy: AutoCancelPolicy,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async run(): Promise<AutoCancelResult> {
    const started = performance.now();
    const cutoff = new Date(this.clock().getTime() - this.policy.windowMs);

    try {
      const result = await this.store.cancelExpired(cutoff, this.policy.batchSize);
      this.logger.log(LogEvents.CHECKOUT_AUTOCANCEL_RUN, {
        cancelled: result.cancelled,
        restoredUnits: result.restoredUnits,
        durationMs: elapsedMs(started),
      });
      return result;
    } catch (error) {
      this.logger.error(LogEvents.CHECKOUT_AUTOCANCEL_FAILED, {
        message: error instanceof Error ? error.message : String(error),
        durationMs: elapsedMs(started),
      });
      return NOTHING;
    }
  }
}
