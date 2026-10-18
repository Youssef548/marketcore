import type { CheckoutStatus, CurrencyCode, PaymentStatus } from '@app/contracts';
import type { PayCheckoutOutcomes } from '../payments.constants';

/** A payment as this module reads it. */
export interface PaymentState {
  id: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: CurrencyCode;
  attempts: number;
  providerRef: string | null;
  capturedAt: Date | null;
  refundedReason: string | null;
}

/** The checkout a capture is about, as its own buyer sees it. */
export interface CapturableCheckout {
  id: string;
  status: CheckoutStatus;
  totalMinor: number;
  currency: CurrencyCode;
}

/** What tx A decided, before any provider is called. */
export type PaymentClaim =
  | { kind: 'CLAIMED'; payment: PaymentState }
  | { kind: 'ALREADY_PAID' }
  | { kind: 'CANCELLED'; payment: PaymentState | null };

/** What tx B decided, once the provider has answered. */
export type PaymentSettlement = { kind: 'PAID' } | { kind: 'ALREADY_PAID' } | { kind: 'REFUNDED' };

/** One capture's answer (D111 adds PENDING to the plan's four). */
export type PayCheckoutOutcome = { kind: (typeof PayCheckoutOutcomes)[keyof typeof PayCheckoutOutcomes] };
