import { PublicProductSchema, type PublicProduct } from '@app/contracts';
import type { PublicProductRow } from './interfaces/public-product.interface';

/**
 * Field by field, then through the strict schema (SRS-FR-CAT-003). `available`
 * comes from the same query as the product and is never cached (SRS-FR-CAT-004).
 */
export function toPublicProduct(row: PublicProductRow): PublicProduct {
  return PublicProductSchema.parse({
    id: row.id,
    name: row.name,
    priceMinor: row.priceMinor,
    currency: row.currency,
    available: row.inventory?.available ?? 0,
    seller: { name: row.organization.name, slug: row.organization.slug },
  });
}
