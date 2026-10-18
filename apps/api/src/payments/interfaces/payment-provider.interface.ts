import type { CurrencyCode } from '@app/contracts';
import type { SimulatorVerdict } from '@app/domain';

/**
 * What a provider says about one capture (ADR 004).
 *
 * Three **typed results**, never exceptions: every one of them is an outcome the caller
 * must record, and `TIMEOUT` is the one that says "we do not know yet". `providerRef`
 * travels in the result rather than beside it because phase 8 posts the ledger against it.
 */
export type ProviderCapture =
  | { kind: Extract<SimulatorVerdict, 'CAPTURED'>; providerRef: string; capturedAt: Date }
  | { kind: Extract<SimulatorVerdict, 'DECLINED'> }
  | { kind: Extract<SimulatorVerdict, 'TIMEOUT'> };

/** One capture: the operation it belongs to, and what it is for. */
export interface PaymentCaptureRequest {
  operationKey: string;
  amountMinor: number;
  currency: CurrencyCode;
}

/**
 * The port phase 7 reimplements against Stripe test mode (SRS §2's context diagram).
 *
 * Nothing above this interface knows which provider answers, which is the point: the
 * capture's transaction boundaries are the claim under test, not the provider's identity.
 */
export interface PaymentProvider {
  capture(request: PaymentCaptureRequest): Promise<ProviderCapture>;

  /**
   * What this operation has already done, if anything (D112) — `null` when nothing was ever
   * charged under the key.
   *
   * Two paths need it and neither can ask by capturing. A capture that meets a **cancelled**
   * checkout must not charge, but must know whether an earlier attempt's charge is sitting
   * there to refund (the hole the phase-6 review found in D107); and a retry after a crash
   * between the charge and the commit can settle on what the lookup finds instead of calling
   * the provider again. Real providers expose exactly this lookup; the simulator answers
   * from its store.
   */
  lookup(operationKey: string): Promise<ProviderCapture | null>;
}
