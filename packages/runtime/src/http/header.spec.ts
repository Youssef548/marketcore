import { describe, expect, it } from 'vitest';
import { firstHeaderValue } from './header';

describe('firstHeaderValue', () => {
  it('returns a single header value as it came', () => {
    expect(firstHeaderValue('203.0.113.5')).toBe('203.0.113.5');
  });

  it('takes the first value when the header was repeated', () => {
    // Node gives a repeated header as an array; the first value is the one that counts.
    expect(firstHeaderValue(['203.0.113.5', '10.0.0.1'])).toBe('203.0.113.5');
  });

  it('reports an absent header as undefined', () => {
    expect(firstHeaderValue(undefined)).toBeUndefined();
  });

  it('reports an empty repeat as undefined rather than throwing', () => {
    expect(firstHeaderValue([])).toBeUndefined();
  });
});
