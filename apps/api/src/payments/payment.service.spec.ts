import { NotFoundException } from '@nestjs/common';
import { CurrencyCodes } from '@app/contracts';
import { SimulatorVerdicts, buildBuyerContext, providerOperationKey } from '@app/domain';
import { LogEvents } from '@app/runtime';
import { captureLogger } from '../../test/support/logger';
import { PaymentService } from './payment.service';
import { PayCheckoutOutcomes } from './payments.constants';

const buyer = buildBuyerContext('buyer_1');
const checkout = {
  id: 'c1',
  status: 'PENDING_PAYMENT' as const,
  totalMinor: 24_900,
  currency: CurrencyCodes.EGP,
};
const payment = {
  id: 'p1',
  status: 'PROCESSING' as const,
  amountMinor: 24_900,
  currency: CurrencyCodes.EGP,
  attempts: 1,
  providerRef: null,
  capturedAt: null,
  refundedReason: null,
};
const captured = { kind: SimulatorVerdicts.CAPTURED, providerRef: 'sim_pay_c1', capturedAt: new Date() };

function setup(repositoryOver: object = {}, providerOver: object = {}) {
  const repository = {
    findForBuyer: jest.fn().mockResolvedValue(checkout),
    claim: jest.fn().mockResolvedValue({ kind: 'CLAIMED', payment }),
    settle: jest.fn().mockResolvedValue({ kind: 'PAID' }),
    markFailed: jest.fn().mockResolvedValue(undefined),
    refundCancelled: jest.fn().mockResolvedValue(undefined),
    ...repositoryOver,
  };
  const provider = {
    capture: jest.fn().mockResolvedValue(captured),
    lookup: jest.fn().mockResolvedValue(null),
    ...providerOver,
  };
  const logger = captureLogger();
  return {
    service: new PaymentService(repository as never, provider as never, logger),
    repository,
    provider,
    logger,
  };
}

describe('PaymentService.pay (SRS-FR-PAY-001/003/004, D103–D111)', () => {
  it('settles a capture and logs it with the provider reference', async () => {
    const { service, repository, logger } = setup();

    expect(await service.pay(buyer, checkout.id, 'req_1')).toEqual({ kind: PayCheckoutOutcomes.PAID });
    expect(repository.settle).toHaveBeenCalledWith(checkout.id, captured);
    expect(logger.lines).toEqual([
      {
        level: 'log',
        event: LogEvents.PAYMENT_CAPTURED,
        fields: { requestId: 'req_1', buyerId: 'buyer_1', checkoutId: 'c1', providerRef: 'sim_pay_c1' },
      },
    ]);
  });

  it('charges the amount the claim read under the lock, with the derived operation key', async () => {
    const { service, provider } = setup();

    await service.pay(buyer, checkout.id, 'req_2');

    expect(provider.capture).toHaveBeenCalledWith({
      operationKey: providerOperationKey('c1'),
      amountMinor: payment.amountMinor,
      currency: payment.currency,
    });
  });

  it('records a decline, leaves the checkout payable, and says so', async () => {
    const { service, repository, logger } = setup(
      { settle: jest.fn() },
      { capture: jest.fn().mockResolvedValue({ kind: SimulatorVerdicts.DECLINED }) },
    );

    expect(await service.pay(buyer, checkout.id, 'req_3')).toEqual({ kind: PayCheckoutOutcomes.DECLINED });
    expect(repository.markFailed).toHaveBeenCalledWith(checkout.id);
    expect(repository.settle).not.toHaveBeenCalled();
    expect(logger.lines[0]).toMatchObject({
      event: LogEvents.PAYMENT_DECLINED,
      fields: { requestId: 'req_3', checkoutId: 'c1' },
    });
  });

  it('answers a timeout with PENDING and writes nothing — the row stays the record of not knowing', async () => {
    const { service, repository, logger } = setup({}, { capture: jest.fn().mockResolvedValue({ kind: SimulatorVerdicts.TIMEOUT }) });

    expect(await service.pay(buyer, checkout.id, 'req_4')).toEqual({ kind: PayCheckoutOutcomes.PENDING });
    expect(repository.settle).not.toHaveBeenCalled();
    expect(repository.markFailed).not.toHaveBeenCalled();
    expect(logger.lines[0]).toMatchObject({ event: LogEvents.PAYMENT_PENDING });
  });

  it('answers a charge that landed on a cancelled checkout with CANCELLED, and logs the refund', async () => {
    const { service, repository, logger } = setup({ settle: jest.fn().mockResolvedValue({ kind: 'REFUNDED' }) });

    expect(await service.pay(buyer, checkout.id, 'req_5')).toEqual({ kind: PayCheckoutOutcomes.CANCELLED });
    expect(repository.settle).toHaveBeenCalled();
    expect(logger.lines[0]).toMatchObject({ event: LogEvents.PAYMENT_REFUNDED });
  });

  it('answers an already-paid checkout without calling the provider at all', async () => {
    const { service, provider, logger } = setup({ claim: jest.fn().mockResolvedValue({ kind: 'ALREADY_PAID' }) });

    expect(await service.pay(buyer, checkout.id, 'req_6')).toEqual({ kind: PayCheckoutOutcomes.ALREADY_PAID });
    expect(provider.capture).not.toHaveBeenCalled();
    expect(logger.lines[0]).toMatchObject({
      event: LogEvents.PAYMENT_CAPTURED,
      fields: { replayed: true },
    });
  });

  it('refunds a charge an earlier attempt left behind when the checkout is already cancelled (D107)', async () => {
    const charge = { kind: SimulatorVerdicts.CAPTURED, providerRef: 'sim_pay_c1', capturedAt: new Date() };
    const { service, repository, provider } = setup(
      { claim: jest.fn().mockResolvedValue({ kind: 'CANCELLED', payment }) },
      { lookup: jest.fn().mockResolvedValue(charge) },
    );

    expect(await service.pay(buyer, checkout.id, 'req_7')).toEqual({ kind: PayCheckoutOutcomes.CANCELLED });
    expect(provider.lookup).toHaveBeenCalledWith(providerOperationKey('c1'));
    expect(repository.refundCancelled).toHaveBeenCalledWith(checkout.id, charge);
    // And it is a refund, not a charge: this path must never call the provider's capture.
    expect(provider.capture).not.toHaveBeenCalled();
  });

  it('refuses nothing to refund: a cancelled checkout with no charge is answered without a lookup write', async () => {
    const { service, repository } = setup({ claim: jest.fn().mockResolvedValue({ kind: 'CANCELLED', payment: null }) });

    expect(await service.pay(buyer, checkout.id, 'req_8')).toEqual({ kind: PayCheckoutOutcomes.CANCELLED });
    expect(repository.refundCancelled).not.toHaveBeenCalled();
  });

  it('answers 404 for another buyer\'s checkout, without charging anything (INV-12)', async () => {
    const { service, provider } = setup({ findForBuyer: jest.fn().mockResolvedValue(null) });

    await expect(service.pay(buyer, 'someone-elses', 'req_9')).rejects.toBeInstanceOf(NotFoundException);
    expect(provider.capture).not.toHaveBeenCalled();
  });
});
