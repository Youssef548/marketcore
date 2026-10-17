import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { BPS_DENOMINATOR, PLATFORM_FEE_BPS, splitPlatformFee } from '../src/fee';

// Int column ceiling: Order.totalMinor is a 32-bit Int (domain-model §3).
const total = fc.integer({ min: 0, max: 2_147_483_647 });

describe('splitPlatformFee (D78)', () => {
  it('is 10%', () => {
    expect(PLATFORM_FEE_BPS).toBe(1000);
    expect(BPS_DENOMINATOR).toBe(10_000);
  });

  it('matches the PRD example orders exactly', () => {
    // AC-US-PAY-001-1's two orders, E£249.00 and E£189.00.
    expect(splitPlatformFee(24_900)).toEqual({ feeMinor: 2_490, sellerShareMinor: 22_410 });
    expect(splitPlatformFee(18_900)).toEqual({ feeMinor: 1_890, sellerShareMinor: 17_010 });
  });

  it('rounds the fee down, so a fraction of a minor unit goes to the seller', () => {
    expect(splitPlatformFee(999)).toEqual({ feeMinor: 99, sellerShareMinor: 900 });
    expect(splitPlatformFee(9)).toEqual({ feeMinor: 0, sellerShareMinor: 9 });
  });

  it('never loses or invents a minor unit: fee + share = total (INV-13)', () => {
    fc.assert(
      fc.property(total, (totalMinor) => {
        const { feeMinor, sellerShareMinor } = splitPlatformFee(totalMinor);
        expect(feeMinor + sellerShareMinor).toBe(totalMinor);
        expect(Number.isInteger(feeMinor)).toBe(true);
        expect(feeMinor).toBeGreaterThanOrEqual(0);
        // floor(total × bps / 10 000), stated without floating point.
        expect(feeMinor * BPS_DENOMINATOR).toBeLessThanOrEqual(totalMinor * PLATFORM_FEE_BPS);
        expect((feeMinor + 1) * BPS_DENOMINATOR).toBeGreaterThan(totalMinor * PLATFORM_FEE_BPS);
      }),
    );
  });

  it('refuses a fractional or negative total rather than rounding it', () => {
    expect(() => splitPlatformFee(10.5)).toThrow(RangeError);
    expect(() => splitPlatformFee(-1)).toThrow(RangeError);
  });
});
