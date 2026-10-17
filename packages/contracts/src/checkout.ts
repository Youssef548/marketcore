import { z } from 'zod';
import {
  CART_LINE_MAX_QUANTITY,
  CART_LINE_MIN_QUANTITY,
  CHECKOUT_MAX_LINES,
  CheckoutConflictReasons,
  CheckoutRefusals,
  CheckoutStatuses,
  CurrencyCodes,
  OrderStatuses,
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
      }),
  })
  .strict();
export type CreateCheckoutRequest = z.infer<typeof CreateCheckoutRequestSchema>;

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

export const CheckoutConflictDetailsSchema = z.union([
  CheckoutLineConflictDetailsSchema,
  CheckoutCartChangedDetailsSchema,
]);
export type CheckoutConflictDetails = z.infer<typeof CheckoutConflictDetailsSchema>;
