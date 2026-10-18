import { describe, expect, it } from 'vitest';
import { formatMoney } from './money';

describe('formatMoney', () => {
  it('formats integer minor units in the currency', () => {
    expect(formatMoney(24_900, 'EGP')).toMatch(/249\.00/);
    expect(formatMoney(1, 'USD')).toBe('$0.01');
  });
});
