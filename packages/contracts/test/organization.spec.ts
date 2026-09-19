import { describe, expect, it } from 'vitest';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '../src/constants';
import { CreateOrganizationRequestSchema } from '../src/organization';

describe('CreateOrganizationRequestSchema', () => {
  it('accepts a name and a well-formed slug', () => {
    const parsed = CreateOrganizationRequestSchema.safeParse({ name: 'Nile Traders', slug: 'nile-traders' });

    expect(parsed.success).toBe(true);
  });

  it('rejects a slug the contract disagrees with', () => {
    // The pattern has one definition and this asserts the schema actually uses it,
    // rather than carrying a second copy that can drift from it.
    const parsed = CreateOrganizationRequestSchema.safeParse({ name: 'Nile Traders', slug: 'Nile_Traders' });

    expect(parsed.success).toBe(false);
    expect(SLUG_PATTERN.test('Nile_Traders')).toBe(false);
    expect(SLUG_MAX_LENGTH).toBe(50);
  });
});
