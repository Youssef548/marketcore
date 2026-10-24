import type { FeeSplit } from './fee.interface';

export * from './fee.interface';

/** The platform fee in basis points (D78): 1000 bps = 10%. */
export const PLATFORM_FEE_BPS = 1000;

/** Basis points in a whole. */
export const BPS_DENOMINATOR = 10_000;

/**
 * Splits one seller order's total into the platform fee and the seller share
 * (D78). Applied per order, never per checkout, so a refund of one order can
 * reverse exactly what that order posted (ADR 014).
 *
 * Integer arithmetic only: total ≤ 2^31 and bps ≤ 10^4 keep the product far
 * below 2^53, so Math.floor of an exact integer quotient is exact.
 */
export function splitPlatformFee(totalMinor: number): FeeSplit {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) {
    throw new RangeError(`splitPlatformFee needs a non-negative integer, got ${totalMinor}`);
  }
  const feeMinor = Math.floor((totalMinor * PLATFORM_FEE_BPS) / BPS_DENOMINATOR);
  return { feeMinor, sellerShareMinor: totalMinor - feeMinor };
}
