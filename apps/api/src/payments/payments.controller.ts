import { ConflictException, Controller, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { PaymentRefusals, type Checkout } from '@app/contracts';
import type { BuyerContext } from '@app/domain';
import { UNKNOWN_REQUEST_ID, getRequestId } from '@app/runtime';
import { CheckoutService } from '../orders/checkout.service';
import { CheckoutDto } from '../orders/dto/orders.dto';
import { Buyer } from '../security/decorators/buyer.decorator';
import { TenantFree } from '../security/decorators/tenant-free.decorator';
import { PaymentService } from './payment.service';
import { PayCheckoutOutcomes, PaymentMessages } from './payments.constants';

/**
 * Paying a checkout (SRS-FR-PAY-001…-004).
 *
 * A buyer route, so `@TenantFree()` and `@Buyer()`: the buyer comes from the token, never
 * from the path, and another buyer's checkout id answers `404` like an unknown one (INV-12).
 *
 * The success shape is **the checkout**, not a payment: a client that has just paid wants the
 * thing it paid for, and a repeat — which charges nothing — answers with the same body, so a
 * retry and a first attempt are indistinguishable to the caller. Every refusal is the usual
 * typed 409 with `details.reason`, which is how a declined charge, an unconfirmable one and a
 * cancelled checkout stay readable by one client branch.
 */
@Controller('checkouts')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentService,
    private readonly checkouts: CheckoutService,
  ) {}

  @Post(':id/pay')
  @TenantFree()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CheckoutDto })
  async pay(
    @Buyer() buyer: BuyerContext,
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<Checkout> {
    const outcome = await this.payments.pay(buyer, id, getRequestId(request) ?? UNKNOWN_REQUEST_ID);

    switch (outcome.kind) {
      case PayCheckoutOutcomes.PAID:
      case PayCheckoutOutcomes.ALREADY_PAID:
        // Read back rather than returned from memory: the checkout is the answer, and a
        // replay must show the checkout as it is now, not as it was when first charged.
        return this.checkouts.findOne(buyer, id);
      case PayCheckoutOutcomes.DECLINED:
        throw new ConflictException({
          message: PaymentMessages.DECLINED,
          details: { reason: PaymentRefusals.PAYMENT_DECLINED },
        });
      case PayCheckoutOutcomes.PENDING:
        throw new ConflictException({
          message: PaymentMessages.PENDING,
          details: { reason: PaymentRefusals.PAYMENT_PENDING },
        });
      case PayCheckoutOutcomes.CANCELLED:
        throw new ConflictException({
          message: PaymentMessages.CANCELLED,
          details: { reason: PaymentRefusals.CHECKOUT_CANCELLED },
        });
    }
  }
}
