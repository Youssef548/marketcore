import { describe, expect, it } from 'vitest';
import { lineAvailabilityLabel, stockLabel } from './availability';

describe('stockLabel (AC-US-CAT-002-1, D61)', () => {
  it('states the exact count', () => {
    expect(stockLabel(1)).toBe('1 left');
    expect(stockLabel(7)).toBe('7 in stock');
    expect(stockLabel(0)).toBe('Sold out');
  });
});

describe('lineAvailabilityLabel (PRD-FR-CART-003)', () => {
  const line = { availability: 'OK', available: 5 } as const;
  it('says nothing when the line is fine', () => {
    expect(lineAvailabilityLabel(line)).toBeNull();
  });
  it('says "Only N left" when short', () => {
    expect(lineAvailabilityLabel({ availability: 'SHORT', available: 1 })).toBe('Only 1 left');
  });
  it('says "Sold out" at zero or when no longer sold', () => {
    expect(lineAvailabilityLabel({ availability: 'SOLD_OUT', available: 0 })).toBe('Sold out');
  });
});
