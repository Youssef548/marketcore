import { z } from 'zod';
import {
  CurrencyCodes,
  ProductStatuses,
  wireValues,
} from './constants';

export const CreateProductRequestSchema = z.object({
  name: z.string().min(1),
  // Integer minor units. A float here would be the money bug the domain model
  // forbids, so the contract refuses it at the boundary.
  priceMinor: z.int(),
  currency: z.enum(wireValues(CurrencyCodes)),
});
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;

export const UpdateProductRequestSchema = z
  .object({
    name: z.string().min(1),
    priceMinor: z.int(),
  })
  .partial();
export type UpdateProductRequest = z.infer<typeof UpdateProductRequestSchema>;

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  priceMinor: z.number().int(),
  currency: z.enum(wireValues(CurrencyCodes)),
  status: z.enum(wireValues(ProductStatuses)),
});
export type Product = z.infer<typeof ProductSchema>;

export const InventorySchema = z.object({
  productId: z.string(),
  available: z.number().int(),
  reserved: z.number().int(),
});
export type Inventory = z.infer<typeof InventorySchema>;
