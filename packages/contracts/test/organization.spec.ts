import { describe, expect, it } from 'vitest';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '../src/constants';
import { CreateOrganizationRequestSchema } from '../src/organization';

describe('CreateOrganizationRequestSchema', () => {
  it('accepts a name and a well-formed slug', () => {
    const parsed = CreateOrganizationRequestSchema.safeParse({ name: 'Nile Traders', slug: 'nile-traders' });

    expect(parsed.success).toBe(true);
  });

  it('rejects a slug the contract disagrees with', () => {
    // The pattern and the length bounds have one definition each, and this asserts
    // the schema actually applies them — rather than asserting a constant against
    // its own literal, which would pass even if the schema ignored it.
    const uppercase = CreateOrganizationRequestSchema.safeParse({
      name: 'Nile Traders',
      slug: 'Nile_Traders',
    });
    const tooLong = CreateOrganizationRequestSchema.safeParse({
      name: 'Nile Traders',
      slug: 'a'.repeat(SLUG_MAX_LENGTH + 1),
    });

    expect(uppercase.success).toBe(false);
    expect(tooLong.success).toBe(false);
    expect(SLUG_PATTERN.test('nile-traders')).toBe(true);
  });
});
