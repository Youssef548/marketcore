import { describe, expect, it } from 'vitest';
import { CreateProductRequestSchema, SetInventoryRequestSchema } from '../src/product';

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

describe('SetInventoryRequestSchema (D81)', () => {
  it('accepts a whole, non-negative count', () => {
    expect(SetInventoryRequestSchema.parse({ available: 0 })).toEqual({ available: 0 });
    expect(SetInventoryRequestSchema.parse({ available: 7 })).toEqual({ available: 7 });
  });
  it.each([-1, 1.5])('refuses %s', (available) => {
    expect(SetInventoryRequestSchema.safeParse({ available }).success).toBe(false);
  });
});
