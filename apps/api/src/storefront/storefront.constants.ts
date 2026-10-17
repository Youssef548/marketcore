import { OrganizationStatuses, ProductStatuses } from '@app/contracts';

export const StorefrontMessages = { NOT_FOUND: 'Product not found' } as const;

/**
 * The only definition of "public" (RULE-CAT-001, ADR 010 amendment): a published
 * product of an active organization. Every buyer-side product read spreads this.
 */
export const PUBLIC_PRODUCT_WHERE = {
  status: ProductStatuses.PUBLISHED,
  organization: { status: OrganizationStatuses.ACTIVE },
} as const;

export const PUBLIC_PRODUCT_SELECT = {
  id: true,
  name: true,
  priceMinor: true,
  currency: true,
  inventory: { select: { available: true } },
  organization: { select: { name: true, slug: true } },
} as const;
