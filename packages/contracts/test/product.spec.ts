import { describe, expect, it } from 'vitest';
import { POSTGRES_INT_MAX } from '../src/constants';
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

describe('the int4 ceiling (phase-4 review finding)', () => {
  it('accepts the column maximum and refuses one above it', () => {
    // `z.int()` alone accepts any safe integer, so an over-large value used to pass
    // the contract and the pipe and then fail inside Prisma — a 500 for a 400.
    expect(SetInventoryRequestSchema.safeParse({ available: POSTGRES_INT_MAX }).success).toBe(true);
    expect(SetInventoryRequestSchema.safeParse({ available: POSTGRES_INT_MAX + 1 }).success).toBe(
      false,
    );
  });

  it('bounds a product price the same way, so the two cannot drift', () => {
    const priced = (priceMinor: number) =>
      CreateProductRequestSchema.safeParse({ name: 'Dates', priceMinor, currency: 'EGP' }).success;

    expect(priced(POSTGRES_INT_MAX)).toBe(true);
    expect(priced(POSTGRES_INT_MAX + 1)).toBe(false);
  });
});
