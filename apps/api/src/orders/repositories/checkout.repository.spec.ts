import { buildBuyerContext } from '@app/domain';
import { PlaceCheckoutOutcomes } from '../orders.constants';
import { CheckoutRepository } from './checkout.repository';

/**
 * `place` is total: every input returns one of the five outcomes. An empty request
 * is refused by the wire contract before it reaches here, but the method is public
 * and callers construct the repository directly — so the refusal is asserted at the
 * boundary rather than left to Prisma's argument checking. Nothing downstream would
 * stop it: step 3's lock statement is `Prisma.join` over zero rows, which throws, and
 * `sameLines([], [])` is true, so an empty cart would not return first.
 */
describe('CheckoutRepository.place', () => {
  const openTransaction = jest.fn(() => {
    throw new Error('an empty request must not open a transaction');
  });
  const prisma = { $transaction: openTransaction } as never;
  const logger = { warn: jest.fn() } as never;

  beforeEach(() => jest.clearAllMocks());

  it('returns CART_CHANGED for an empty request, without opening a transaction', async () => {
    const repository = new CheckoutRepository(prisma, logger);

    await expect(repository.place(buildBuyerContext('buyer-1'), 'key-1', 'fingerprint', [])).resolves.toEqual({
      kind: PlaceCheckoutOutcomes.CART_CHANGED,
    });
    expect(openTransaction).not.toHaveBeenCalled();
  });
});
