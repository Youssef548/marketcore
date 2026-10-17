import { CurrencyCodes } from '@app/contracts';
import { toPublicProduct } from './public-product.mapper';

const row = {
  id: 'p1',
  name: 'Shirt',
  priceMinor: 24_900,
  currency: CurrencyCodes.EGP,
  inventory: { available: 1 },
  organization: { name: 'Nile Traders', slug: 'nile-traders' },
};

describe('toPublicProduct', () => {
  it('builds exactly the public shape', () => {
    expect(toPublicProduct(row)).toEqual({
      id: 'p1',
      name: 'Shirt',
      priceMinor: 24_900,
      currency: CurrencyCodes.EGP,
      available: 1,
      seller: { name: 'Nile Traders', slug: 'nile-traders' },
    });
  });

  it('reads a missing inventory row as zero, never as available', () => {
    expect(toPublicProduct({ ...row, inventory: null }).available).toBe(0);
  });

  it('drops a private field that reached the row, because it builds field by field', () => {
    const leaky = { ...row, organizationId: 'org_1', status: 'DRAFT' };
    expect(toPublicProduct(leaky)).not.toHaveProperty('organizationId');
  });
});
