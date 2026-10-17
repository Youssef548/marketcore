import { describe, expect, it } from 'vitest';
import { CurrencyCodes } from '../src/constants';
import { PageQuerySchema } from '../src/pagination';
import { PublicProductPageSchema, PublicProductSchema } from '../src/storefront';

const product = {
  id: 'p1',
  name: 'Nile Cotton Shirt',
  priceMinor: 24_900,
  currency: CurrencyCodes.EGP,
  available: 1,
  seller: { name: 'Nile Traders', slug: 'nile-traders' },
};

describe('PublicProductSchema (SRS-FR-CAT-003, SRS-NFR-SEC-001)', () => {
  it('accepts exactly the public fields', () => {
    expect(PublicProductSchema.parse(product)).toEqual(product);
  });

  it.each(['status', 'organizationId', 'createdAt', 'reserved', 'version'])(
    'refuses a private field: %s',
    (key) => {
      expect(PublicProductSchema.safeParse({ ...product, [key]: 'x' }).success).toBe(false);
    },
  );

  it('refuses a private field nested in the seller', () => {
    const leaky = { ...product, seller: { ...product.seller, id: 'org_1' } };
    expect(PublicProductSchema.safeParse(leaky).success).toBe(false);
  });

  it('refuses a fractional price and negative stock', () => {
    expect(PublicProductSchema.safeParse({ ...product, priceMinor: 249.5 }).success).toBe(false);
    expect(PublicProductSchema.safeParse({ ...product, available: -1 }).success).toBe(false);
  });
});

describe('PublicProductPageSchema', () => {
  it('carries items and a nullable cursor, and nothing else', () => {
    expect(PublicProductPageSchema.parse({ items: [product], nextCursor: null })).toEqual({
      items: [product],
      nextCursor: null,
    });
    expect(PublicProductPageSchema.safeParse({ items: [], nextCursor: null, total: 9 }).success).toBe(false);
  });
});

describe('PageQuerySchema', () => {
  it('makes the cursor optional and refuses an empty one', () => {
    expect(PageQuerySchema.parse({})).toEqual({});
    expect(PageQuerySchema.safeParse({ cursor: '' }).success).toBe(false);
  });
});
