import { z } from 'zod';
import {
  CART_LINE_MAX_QUANTITY,
  CART_LINE_MIN_QUANTITY,
  CartLineAvailabilities,
  CurrencyCodes,
  wireValues,
} from './constants';
import { SellerSchema } from './storefront';

const quantity = z.int().min(CART_LINE_MIN_QUANTITY).max(CART_LINE_MAX_QUANTITY);

/** PUT /cart/items/:productId. The quantity is absolute, so a repeat changes nothing. */
export const SetCartLineRequestSchema = z.object({ quantity }).strict();
export type SetCartLineRequest = z.infer<typeof SetCartLineRequestSchema>;

export const CartLineSchema = z
  .object({
    productId: z.string(),
    name: z.string(),
    quantity,
    currency: z.enum(wireValues(CurrencyCodes)),
    /** The price when the line was first added (D82) — what the review step compares against. */
    addedUnitPriceMinor: z.int().min(1),
    /** null when the product is no longer public (D86). */
    currentUnitPriceMinor: z.int().min(1).nullable(),
    available: z.int().min(0),
    availability: z.enum(wireValues(CartLineAvailabilities)),
  })
  .strict();
export type CartLine = z.infer<typeof CartLineSchema>;

export const CartSellerGroupSchema = z
  .object({ seller: SellerSchema, lines: z.array(CartLineSchema).min(1) })
  .strict();
export type CartSellerGroup = z.infer<typeof CartSellerGroupSchema>;

/** The buyer's cart, grouped by seller (SRS-FR-CART-006). It has no id on the wire. */
export const CartSchema = z.object({ sellers: z.array(CartSellerGroupSchema) }).strict();
export type Cart = z.infer<typeof CartSchema>;
