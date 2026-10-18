import { Injectable } from '@nestjs/common';
import {
  SimulatorVerdicts,
  simulatedProviderRef,
  simulatorVerdict,
} from '@app/domain';
import type { ProviderCapture, PaymentCaptureRequest, PaymentProvider } from './interfaces/payment-provider.interface';
import type { ProviderChargeStore } from './interfaces/provider-charge.interface';

/**
 * The provider behind the port until phase 7 (ADR 004).
 *
 * Two rules, and the order between them is the design:
 *
 * 1. **The store is consulted before the rule.** A charge already recorded under the
 *    operation key answers `CAPTURED` with the recorded reference, whatever the amount
 *    says. That is what a retry of a lost response must see; re-deriving the verdict
 *    would tell the caller to try again forever while the money had already moved.
 * 2. **The rule decides everything else**, and a `CAPTURED` or `TIMEOUT` verdict is
 *    recorded *before* it is answered. `TIMEOUT` therefore means "charged, answer lost",
 *    which is the only shape in which that failure can be tested rather than imagined.
 *
 * A decline records nothing: no money moved, so there is nothing for a retry to find.
 */
@Injectable()
export class SimulatorPaymentProvider implements PaymentProvider {
  constructor(private readonly store: ProviderChargeStore) {}

  async capture({ operationKey, amountMinor, currency }: PaymentCaptureRequest): Promise<ProviderCapture> {
    const recorded = await this.store.find(operationKey);
    if (recorded !== null) {
      return {
        kind: SimulatorVerdicts.CAPTURED,
        providerRef: recorded.providerRef,
        capturedAt: recorded.capturedAt,
      };
    }

    const verdict = simulatorVerdict(amountMinor);
    if (verdict === SimulatorVerdicts.DECLINED) return { kind: SimulatorVerdicts.DECLINED };

    const candidate = {
      operationKey,
      providerRef: simulatedProviderRef(operationKey),
      amountMinor,
      currency,
      capturedAt: new Date(),
    };
    // Before the answer, never after: a crash here leaves a charge the retry can find.
    // Insert-if-absent, because two captures for one operation can arrive together — and
    // the loser must read the winner's charge rather than fail on a unique index.
    const { charge, created } = await this.store.record(candidate);
    if (!created) {
      return { kind: SimulatorVerdicts.CAPTURED, providerRef: charge.providerRef, capturedAt: charge.capturedAt };
    }

    return verdict === SimulatorVerdicts.TIMEOUT
      ? { kind: SimulatorVerdicts.TIMEOUT }
      : { kind: SimulatorVerdicts.CAPTURED, providerRef: charge.providerRef, capturedAt: charge.capturedAt };
  }
}
