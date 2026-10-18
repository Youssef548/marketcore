import { z } from 'zod';
import { PaymentRefusals } from './constants';

/**
 * `error.details` of a 409 refusing a declined charge (D106).
 *
 * A decline is a refusal, not a server fault: the checkout is still payable, the payment
 * row says `FAILED`, and the buyer may try again. It is a typed 409 rather than the
 * semantically tidier `402` so that this API keeps one way of saying "no" — a client
 * branches on `details.reason` here exactly as it does for `CART_CHANGED`.
 */
export const PaymentDeclinedDetailsSchema = z
  .object({ reason: z.literal(PaymentRefusals.PAYMENT_DECLINED) })
  .strict();

/**
 * `error.details` of a 409 answering a charge the provider could not confirm (D111).
 *
 * The provider timed out, so the charge may have happened and the buyer must be told
 * neither "declined" nor "paid". The payment row stays `PROCESSING` — the honest record of
 * not knowing — and the same request again resolves it: the operation key is derived from
 * the checkout, so a retry is the same provider operation, and the store answers with the
 * charge if there is one.
 */
export const PaymentPendingDetailsSchema = z
  .object({ reason: z.literal(PaymentRefusals.PAYMENT_PENDING) })
  .strict();

/**
 * `error.details` of a 409 refusing a charge on a checkout the worker has cancelled
 * (D107, SRS-FR-PAY-004).
 *
 * Two routes reach it and they mean different things to the books: a checkout cancelled
 * before any charge existed (nothing to refund) and one cancelled between the claim and
 * the settle (the charge is refunded, and this is still the answer). A client that cares
 * which reads the checkout; this shape is about the request, not the books.
 */
export const CheckoutCancelledDetailsSchema = z
  .object({ reason: z.literal(PaymentRefusals.CHECKOUT_CANCELLED) })
  .strict();
