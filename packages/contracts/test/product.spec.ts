import { describe, expect, it } from 'vitest';
import { CreateProductRequestSchema } from '../src/product';

describe('CreateProductRequestSchema', () => {
  it('accepts integer minor units and a known currency', () => {
    const parsed = CreateProductRequestSchema.safeParse({
      name: 'Dates',
      priceMinor: 1250,
      currency: 'EGP',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects a fractional price, because money is never a float', () => {
    const parsed = CreateProductRequestSchema.safeParse({
      name: 'Dates',
      priceMinor: 12.5,
      currency: 'EGP',
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown currency', () => {
    const parsed = CreateProductRequestSchema.safeParse({
      name: 'Dates',
      priceMinor: 1250,
      currency: 'XYZ',
    });

    expect(parsed.success).toBe(false);
  });
});
