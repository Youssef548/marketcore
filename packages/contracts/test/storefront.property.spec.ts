import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CurrencyCodes } from '../src/constants';
import { PublicProductSchema } from '../src/storefront';

const PUBLIC_KEYS = ['id', 'name', 'priceMinor', 'currency', 'available', 'seller'];

describe('PublicProductSchema is the allowlist (property)', () => {
  it('refuses any key outside the public set, whatever it is called', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((key) => !PUBLIC_KEYS.includes(key) && key !== '__proto__'),
        fc.jsonValue(),
        (key, value) => {
          const candidate = {
            id: 'p',
            name: 'n',
            priceMinor: 1,
            currency: CurrencyCodes.USD,
            available: 0,
            seller: { name: 's', slug: 's' },
            [key]: value,
          };
          expect(PublicProductSchema.safeParse(candidate).success).toBe(false);
        },
      ),
    );
  });
});
