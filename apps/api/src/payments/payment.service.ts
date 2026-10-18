import { Inject, Injectable, NotFoundException, type LoggerService } from '@nestjs/common';
import { SimulatorVerdicts, providerOperationKey, type BuyerContext } from '@app/domain';
import { LogEvents } from '@app/runtime';
import type { PayCheckoutOutcome } from './interfaces/payment.interface';
import type { PaymentProvider } from './interfaces/payment-provider.interface';
import {
  PAYMENT_PROVIDER,
  PAYMENTS_LOGGER,
  PaymentMessages,
  PaymentRefundReasons,
  PayCheckoutOutcomes,
} from './payments.constants';
import { PaymentRepository } from './repositories/payment.repository';

/**
 * One capture (SRS-FR-PAY-001, -003, -004).
 *
 * The order of these steps is the design, and each is one sentence of ADR 004: claim under
 * the checkout's lock, charge outside any transaction, then settle what the charge means now
 * that the checkout has been re-read. A decline is recorded and the checkout stays payable; a
 * timeout is not an answer at all, so the row stays `PROCESSING` and the buyer is told to try
 * again (D111); a charge that lands on a cancelled checkout is refunded rather than marking
 * anything paid.
 */
@Injectable()
export class PaymentService {
  constructor(
    private readonly payments: PaymentRepository,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(PAYMENTS_LOGGER) private readonly logger: LoggerService,
  ) {}

  async pay(buyer: BuyerContext, checkoutId: string, requestId: string): Promise<PayCheckoutOutcome> {
    const checkout = await this.payments.findForBuyer(buyer, checkoutId);
    if (checkout === null) throw new NotFoundException(PaymentMessages.NOT_FOUND);

    const claim = await this.payments.claim(checkout.id);
    if (claim.kind === 'ALREADY_PAID') {
      this.logged(LogEvents.PAYMENT_CAPTURED, requestId, buyer, checkout.id, { replayed: true });
      return { kind: PayCheckoutOutcomes.ALREADY_PAID };
    }
    if (claim.kind === 'CANCELLED') {
      // The provider is never called for a checkout that is already cancelled — but the key
      // is asked what it already did, because an earlier attempt may have charged and timed
      // out, and money that moved has to be refunded rather than forgotten (D107).
      const recorded = await this.provider.lookup(providerOperationKey(checkout.id));
      if (recorded !== null && recorded.kind === SimulatorVerdicts.CAPTURED) {
        await this.payments.refundCancelled(checkout.id, recorded);
        this.logged(LogEvents.PAYMENT_REFUNDED, requestId, buyer, checkout.id, {
          reason: PaymentRefundReasons.CHECKOUT_CANCELLED,
        });
      }
      return { kind: PayCheckoutOutcomes.CANCELLED };
    }

    const capture = await this.provider.capture({
      operationKey: providerOperationKey(checkout.id),
      // The locked row's total, not the pre-lock read: what is charged is what the claim saw.
      amountMinor: claim.payment.amountMinor,
      currency: claim.payment.currency,
    });

    switch (capture.kind) {
      case SimulatorVerdicts.CAPTURED: {
        const settlement = await this.payments.settle(checkout.id, capture);
        if (settlement.kind === 'REFUNDED') {
          this.logged(LogEvents.PAYMENT_REFUNDED, requestId, buyer, checkout.id, {
            reason: PaymentRefundReasons.CHECKOUT_CANCELLED,
          });
          return { kind: PayCheckoutOutcomes.CANCELLED };
        }
        // A concurrent capture of the same checkout reached tx B first. The charge is
        // already one charge — the derived key saw to that — and this request did not
        // settle anything, so it must not report itself as the one that did.
        if (settlement.kind === 'ALREADY_PAID') {
          this.logged(LogEvents.PAYMENT_CAPTURED, requestId, buyer, checkout.id, { replayed: true });
          return { kind: PayCheckoutOutcomes.ALREADY_PAID };
        }
        this.logged(LogEvents.PAYMENT_CAPTURED, requestId, buyer, checkout.id, {
          providerRef: capture.providerRef,
        });
        return { kind: PayCheckoutOutcomes.PAID };
      }
      case SimulatorVerdicts.DECLINED:
        await this.payments.markFailed(checkout.id);
        this.logged(LogEvents.PAYMENT_DECLINED, requestId, buyer, checkout.id, {});
        return { kind: PayCheckoutOutcomes.DECLINED };
      case SimulatorVerdicts.TIMEOUT:
        // Nothing is written: the row stays PROCESSING, which is the honest record of a
        // charge whose answer never arrived, and the next attempt resolves it.
        this.logged(LogEvents.PAYMENT_PENDING, requestId, buyer, checkout.id, {});
        return { kind: PayCheckoutOutcomes.PENDING };
    }
  }

  private logged(
    event: string,
    requestId: string,
    buyer: BuyerContext,
    checkoutId: string,
    fields: Record<string, unknown>,
  ): void {
    this.logger.log(event, { requestId, buyerId: buyer.buyerId, checkoutId, ...fields });
  }
}
