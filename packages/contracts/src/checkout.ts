import { z } from 'zod';
import {
  CheckoutCancelledDetailsSchema,
  PaymentDeclinedDetailsSchema,
  PaymentPendingDetailsSchema,
} from './payment';
import {
  CART_LINE_MAX_QUANTITY,
  CART_LINE_MIN_QUANTITY,
  CHECKOUT_MAX_LINES,
  CheckoutConflictReasons,
  CheckoutRefusals,
  CheckoutStatuses,
  CurrencyCodes,
  OrderStatuses,
  POSTGRES_INT_MAX,
  wireValues,
} from './constants';
import { SellerSchema } from './storefront';

const currency = z.enum(wireValues(CurrencyCodes));

/** One line the buyer confirmed on the review step (D77). */
export const CheckoutLineRequestSchema = z
  .object({
    productId: z.string().min(1),
    quantity: z.int().min(CART_LINE_MIN_QUANTITY).max(CART_LINE_MAX_QUANTITY),
    unitPriceMinor: z.int().min(1),
  })
  .strict();
export type CheckoutLineRequest = z.infer<typeof CheckoutLineRequestSchema>;

export const CreateCheckoutRequestSchema = z
  .object({
    lines: z
      .array(CheckoutLineRequestSchema)
      .min(1)
      .max(CHECKOUT_MAX_LINES)
      .refine((lines) => new Set(lines.map((line) => line.productId)).size === lines.length, {
        message: 'Each product may appear once',
      })
      .refine((lines) => checkoutTotalMinor(lines) <= POSTGRES_INT_MAX, {
        message: 'The checkout total is larger than this service can charge',
      }),
  })
  .strict();
export type CreateCheckoutRequest = z.infer<typeof CreateCheckoutRequestSchema>;

/**
 * The total the request will become, in minor units.
 *
 * The price is not trusted here — the service re-reads it under the transaction and
 * refuses a mismatch — but the two are equal for any request that can be placed, so
 * bounding this bounds the `INTEGER` the checkout and order rows store. `quantity` is
 * at most 10 and there are at most 50 lines, so the sum stays far inside a JS number;
 * only the database column is narrow.
 */
function checkoutTotalMinor(lines: readonly CheckoutLineRequest[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
}

/** An order line. `name` and `unitPriceMinor` are snapshots (PRD-FR-CHK-005, D90). */
export const OrderItemSchema = z
  .object({
    productId: z.string(),
    name: z.string(),
    quantity: z.int().min(1),
    unitPriceMinor: z.int().min(1),
  })
  .strict();
export type OrderItem = z.infer<typeof OrderItemSchema>;

export const CheckoutOrderSchema = z
  .object({
    id: z.string(),
    status: z.enum(wireValues(OrderStatuses)),
    totalMinor: z.int().min(1),
    currency,
    seller: SellerSchema,
    items: z.array(OrderItemSchema).min(1),
  })
  .strict();
export type CheckoutOrder = z.infer<typeof CheckoutOrderSchema>;

/** One "Place order": one buyer, one currency, one order per seller (D56). */
export const CheckoutSchema = z
  .object({
    id: z.string(),
    status: z.enum(wireValues(CheckoutStatuses)),
    totalMinor: z.int().min(1),
    currency,
    placedAt: z.iso.datetime(),
    orders: z.array(CheckoutOrderSchema).min(1),
  })
  .strict();
export type Checkout = z.infer<typeof CheckoutSchema>;

export const CheckoutLineConflictSchema = z
  .object({
    productId: z.string(),
    reason: z.enum(wireValues(CheckoutConflictReasons)),
    available: z.int().min(0),
    currentUnitPriceMinor: z.int().min(1).nullable(),
  })
  .strict();
export type CheckoutLineConflict = z.infer<typeof CheckoutLineConflictSchema>;

/** `error.details` of a 409 refusing lines. The web app branches on `lines[].reason`. */
export const CheckoutLineConflictDetailsSchema = z
  .object({ lines: z.array(CheckoutLineConflictSchema).min(1) })
  .strict();

/** `error.details` of a 409 refusing a request that no longer matches the cart. */
export const CheckoutCartChangedDetailsSchema = z
  .object({ reason: z.literal(CheckoutRefusals.CART_CHANGED) })
  .strict();

/**
 * `error.details` of a 409 refusing a key already used for a different body
 * (SRS-FR-CHK-008, ADR 003). A client that mints one key per attempt never sees it;
 * a client that reuses one key across two carts is being told which of the two it is.
 */
export const CheckoutKeyReusedDetailsSchema = z
  .object({ reason: z.literal(CheckoutRefusals.KEY_REUSED) })
  .strict();

export const CheckoutConflictDetailsSchema = z.union([
  CheckoutLineConflictDetailsSchema,
  CheckoutCartChangedDetailsSchema,
  CheckoutKeyReusedDetailsSchema,
  PaymentDeclinedDetailsSchema,
  CheckoutCancelledDetailsSchema,
  PaymentPendingDetailsSchema,
]);
export type CheckoutConflictDetails = z.infer<typeof CheckoutConflictDetailsSchema>;
