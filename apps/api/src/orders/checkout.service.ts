import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  type LoggerService,
} from '@nestjs/common';
import { CheckoutRefusals, type Checkout, type CreateCheckoutRequest } from '@app/contracts';
import { singleCurrency, type BuyerContext } from '@app/domain';
import { LogEvents } from '@app/runtime';
import { isRetryableTransactionError } from '../common/database/retryable-transaction';
import { toCheckout } from './checkout.mapper';
import type { PlaceCheckoutOutcome } from './interfaces/checkout.interface';
import {
  CheckoutLogReasons,
  CheckoutMessages,
  ORDERS_LOGGER,
  PlaceCheckoutOutcomes,
} from './orders.constants';
import { CheckoutRepository } from './repositories/checkout.repository';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly checkoutRepository: CheckoutRepository,
    @Inject(ORDERS_LOGGER) private readonly logger: LoggerService,
  ) {}

  async place(buyer: BuyerContext, request: CreateCheckoutRequest, requestId: string): Promise<Checkout> {
    const productIds = request.lines.map((line) => line.productId);

    // SRS-FR-CHK-005: refused before any lock. An unknown id has no currency and is
    // left to the transaction, which reports it as CART_CHANGED or SOLD_OUT.
    const currencies = await this.checkoutRepository.currenciesOf(productIds);
    if (currencies.length > 0 && singleCurrency(currencies) === null) {
      this.rejected(requestId, buyer, [CheckoutLogReasons.MIXED_CURRENCY]);
      throw new BadRequestException(CheckoutMessages.MIXED_CURRENCY);
    }

    const outcome = await this.placeOrRefuse(buyer, request, requestId);
    switch (outcome.kind) {
      case PlaceCheckoutOutcomes.PLACED:
        this.logger.log(LogEvents.CHECKOUT_PLACED, { requestId, buyerId: buyer.buyerId, checkoutId: outcome.checkoutId });
        return this.findOne(buyer, outcome.checkoutId);
      case PlaceCheckoutOutcomes.REJECTED:
        this.rejected(requestId, buyer, outcome.conflicts.map((conflict) => conflict.reason));
        throw new ConflictException({ message: CheckoutMessages.LINES_CONFLICT, details: { lines: outcome.conflicts } });
      case PlaceCheckoutOutcomes.CART_CHANGED:
        this.rejected(requestId, buyer, [CheckoutRefusals.CART_CHANGED]);
        throw new ConflictException({
          message: CheckoutMessages.CART_CHANGED,
          details: { reason: CheckoutRefusals.CART_CHANGED },
        });
    }
  }

  /** Another buyer's checkout and an unknown id answer alike (INV-12, ADR 010). */
  async findOne(buyer: BuyerContext, id: string): Promise<Checkout> {
    const record = await this.checkoutRepository.findForBuyer(buyer, id);
    if (record === null) throw new NotFoundException(CheckoutMessages.NOT_FOUND);
    return toCheckout(record);
  }

  /** SRS §8: contention that survived three retries is a 409, never a 500. */
  private async placeOrRefuse(
    buyer: BuyerContext,
    request: CreateCheckoutRequest,
    requestId: string,
  ): Promise<PlaceCheckoutOutcome> {
    try {
      return await this.checkoutRepository.place(buyer, request.lines);
    } catch (error) {
      if (!isRetryableTransactionError(error)) throw error;
      this.rejected(requestId, buyer, [CheckoutLogReasons.CONTENDED]);
      throw new ConflictException(CheckoutMessages.CONTENDED);
    }
  }

  private rejected(requestId: string, buyer: BuyerContext, reasons: string[]): void {
    this.logger.log(LogEvents.CHECKOUT_REJECTED, { requestId, buyerId: buyer.buyerId, reasons });
  }
}
