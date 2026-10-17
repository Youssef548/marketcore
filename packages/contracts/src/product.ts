import { z } from 'zod';
import {
  CurrencyCodes,
  POSTGRES_INT_MAX,
  POSTGRES_INT_MIN,
  ProductStatuses,
  wireValues,
} from './constants';

export const CreateProductRequestSchema = z.object({
  name: z.string().min(1),
  // Integer minor units. A float here would be the money bug the domain model
  // forbids, so the contract refuses it at the boundary; the bounds are the
  // column's, so an out-of-range value is a 400 rather than a 500 from Prisma.
  priceMinor: z.int().min(POSTGRES_INT_MIN).max(POSTGRES_INT_MAX),
  currency: z.enum(wireValues(CurrencyCodes)),
});
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;

export const UpdateProductRequestSchema = z
  .object({
    name: z.string().min(1),
    priceMinor: z.int().min(POSTGRES_INT_MIN).max(POSTGRES_INT_MAX),
  })
  .partial();
export type UpdateProductRequest = z.infer<typeof UpdateProductRequestSchema>;

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  priceMinor: z.number().int().max(POSTGRES_INT_MAX),
  currency: z.enum(wireValues(CurrencyCodes)),
  status: z.enum(wireValues(ProductStatuses)),
});
export type Product = z.infer<typeof ProductSchema>;

export const InventorySchema = z.object({
  productId: z.string(),
  available: z.number().int().max(POSTGRES_INT_MAX),
  reserved: z.number().int().max(POSTGRES_INT_MAX),
});
export type Inventory = z.infer<typeof InventorySchema>;

/**
 * PUT /products/:id/inventory (D81). An absolute count rather than a delta, so a
 * repeated request is harmless and a seller states what is on the shelf.
 */
export const SetInventoryRequestSchema = z
  .object({ available: z.int().min(0).max(POSTGRES_INT_MAX) })
  .strict();
export type SetInventoryRequest = z.infer<typeof SetInventoryRequestSchema>;
