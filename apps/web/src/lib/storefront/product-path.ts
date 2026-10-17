/** A product id is a v4 UUID, 36 characters (Prisma `@default(uuid())`). */
const PRODUCT_ID_LENGTH = 36;

/**
 * `/p/{name-slug}-{id}` (D76). The slug is cosmetic: only the trailing id is read,
 * so a renamed product's old links keep working and Product needs no slug column.
 */
export function productPath(product: { id: string; name: string }): string {
  const slug = product.name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `/p/${slug.length > 0 ? `${slug}-` : ''}${product.id}`;
}

export function productIdFromSlug(slug: string): string {
  return slug.slice(-PRODUCT_ID_LENGTH);
}
