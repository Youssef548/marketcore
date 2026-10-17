import { z } from 'zod';
import { CurrencyCodes, OrderStatuses, wireValues } from './constants';
import { OrderItemSchema } from './checkout';
import { pageOf } from './pagination';
import { SellerSchema } from './storefront';

const orderFields = {
  id: z.string(),
  checkoutId: z.string(),
  status: z.enum(wireValues(OrderStatuses)),
  totalMinor: z.int().min(1),
  currency: z.enum(wireValues(CurrencyCodes)),
  createdAt: z.iso.datetime(),
  seller: SellerSchema,
};

export const BuyerOrderSummarySchema = z
  .object({ ...orderFields, itemCount: z.int().min(1) })
  .strict();
export type BuyerOrderSummary = z.infer<typeof BuyerOrderSummarySchema>;

export const BuyerOrderPageSchema = pageOf(BuyerOrderSummarySchema);
export type BuyerOrderPage = z.infer<typeof BuyerOrderPageSchema>;

export const BuyerOrderSchema = z
  .object({ ...orderFields, items: z.array(OrderItemSchema).min(1) })
  .strict();
export type BuyerOrder = z.infer<typeof BuyerOrderSchema>;
