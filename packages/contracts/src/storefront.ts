import { z } from 'zod';
import { CurrencyCodes, wireValues } from './constants';
import { pageOf } from './pagination';

/** A seller as a buyer sees it: the organization's public name and handle. */
export const SellerSchema = z.object({ name: z.string(), slug: z.string() }).strict();
export type Seller = z.infer<typeof SellerSchema>;

/**
 * The public product (SRS-FR-CAT-003). `.strict()` makes the schema the
 * allowlist (RULE-CAT-001, ADR 010 amendment): the API parses every public read
 * through it, so a private field fails the parse instead of leaving the server.
 * Slug and status are deliberately absent — D76 gives Product no slug, and a
 * public read only ever returns PUBLISHED, so status would carry no information.
 */
export const PublicProductSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    priceMinor: z.int(),
    currency: z.enum(wireValues(CurrencyCodes)),
    available: z.int().min(0),
    seller: SellerSchema,
  })
  .strict();
export type PublicProduct = z.infer<typeof PublicProductSchema>;

export const PublicProductPageSchema = pageOf(PublicProductSchema);
export type PublicProductPage = z.infer<typeof PublicProductPageSchema>;
