import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  CheckoutConflictReasons,
  CheckoutRefusals,
  CheckoutStatuses,
  CurrencyCodes,
  OrderStatuses,
  type CurrencyCode,
} from '@app/contracts';
import { Prisma } from '@app/database';
import { buildBuyerContext } from '@app/domain';
import { LogEvents } from '@app/runtime';
import { captureLogger } from '../../test/support/logger';
import { CheckoutService } from './checkout.service';
import { PlaceCheckoutOutcomes } from './orders.constants';

const buyer = buildBuyerContext('buyer_1');
const request = { lines: [{ productId: 'p1', quantity: 1, unitPriceMinor: 1000 }] };
const record = {
  id: 'k1',
  status: CheckoutStatuses.PENDING_PAYMENT,
  totalMinor: 1000,
  currency: CurrencyCodes.EGP,
  placedAt: new Date('2026-10-16T10:00:00.000Z'),
  orders: [
    {
      id: 'o1',
      status: OrderStatuses.PENDING_PAYMENT,
      totalMinor: 1000,
      currency: CurrencyCodes.EGP,
      organization: { name: 'Nile', slug: 'nile' },
      items: [{ productId: 'p1', productName: 'Shirt', quantity: 1, unitPriceMinor: 1000 }],
    },
  ],
};

function setup(place: jest.Mock, currencies: CurrencyCode[] = [CurrencyCodes.EGP]) {
  const repository = {
    currenciesOf: jest.fn().mockResolvedValue(currencies),
    place,
    findForBuyer: jest.fn().mockResolvedValue(record),
  };
  const logger = captureLogger();
  return { service: new CheckoutService(repository as never, logger), repository, logger };
}

describe('CheckoutService.place', () => {
  it('returns the placed checkout and logs one checkout.placed line with the request id (SRS-NFR-OBS-001)', async () => {
    const { service, logger } = setup(jest.fn().mockResolvedValue({ kind: PlaceCheckoutOutcomes.PLACED, checkoutId: 'k1' }));

    const checkout = await service.place(buyer, request, 'req_1');

    expect(checkout).toMatchObject({ id: 'k1', placedAt: '2026-10-16T10:00:00.000Z' });
    expect(checkout.orders[0].items[0].name).toBe('Shirt');
    expect(logger.lines).toEqual([
      { level: 'log', event: LogEvents.CHECKOUT_PLACED, fields: { requestId: 'req_1', buyerId: 'buyer_1', checkoutId: 'k1' } },
    ]);
  });

  it('refuses conflicting lines with 409 and details.lines, and logs the reasons', async () => {
    const conflicts = [{ productId: 'p1', reason: CheckoutConflictReasons.SOLD_OUT, available: 0, currentUnitPriceMinor: 1000 }];
    const { service, logger } = setup(jest.fn().mockResolvedValue({ kind: PlaceCheckoutOutcomes.REJECTED, conflicts }));

    const error = await service.place(buyer, request, 'req_2').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ details: { lines: conflicts } });
    expect(logger.lines[0]).toMatchObject({
      event: LogEvents.CHECKOUT_REJECTED,
      fields: { requestId: 'req_2', reasons: [CheckoutConflictReasons.SOLD_OUT] },
    });
  });

  it('refuses a changed cart with 409 and details.reason CART_CHANGED', async () => {
    const { service } = setup(jest.fn().mockResolvedValue({ kind: PlaceCheckoutOutcomes.CART_CHANGED }));

    const error = await service.place(buyer, request, 'req_3').catch((e: unknown) => e);
    expect((error as ConflictException).getResponse()).toMatchObject({ details: { reason: CheckoutRefusals.CART_CHANGED } });
  });

  it('refuses mixed currencies with 400 before the transaction runs (SRS-FR-CHK-005)', async () => {
    const place = jest.fn();
    const { service } = setup(place, [CurrencyCodes.EGP, CurrencyCodes.USD]);

    await expect(service.place(buyer, request, 'req_4')).rejects.toBeInstanceOf(BadRequestException);
    expect(place).not.toHaveBeenCalled();
  });

  it('answers 409 when retries are exhausted, never 500 (SRS §8)', async () => {
    const deadlock = new Prisma.PrismaClientKnownRequestError('deadlock', { code: 'P2034', clientVersion: 'test' });
    const { service } = setup(jest.fn().mockRejectedValue(deadlock));

    await expect(service.place(buyer, request, 'req_5')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rethrows anything that is not contention', async () => {
    const { service } = setup(jest.fn().mockRejectedValue(new Error('disk full')));
    await expect(service.place(buyer, request, 'req_6')).rejects.toThrow('disk full');
  });
});
