import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import type { Checkout } from '@app/contracts';
import type { BuyerContext } from '@app/domain';
import { UNKNOWN_REQUEST_ID, getRequestId } from '@app/runtime';
import { Buyer } from '../security/decorators/buyer.decorator';
import { TenantFree } from '../security/decorators/tenant-free.decorator';
import { CheckoutService } from './checkout.service';
import { IdempotencyKey } from './decorators/idempotency-key.decorator';
import { CheckoutDto, CreateCheckoutRequestDto } from './dto/orders.dto';

@Controller('checkouts')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post()
  @TenantFree()
  @ApiCreatedResponse({ type: CheckoutDto })
  place(
    @Buyer() buyer: BuyerContext,
    @IdempotencyKey() key: string,
    @Body() body: CreateCheckoutRequestDto,
    @Req() request: Request,
  ): Promise<Checkout> {
    return this.checkoutService.place(buyer, key, body, getRequestId(request) ?? UNKNOWN_REQUEST_ID);
  }

  @Get(':id')
  @TenantFree()
  @ApiOkResponse({ type: CheckoutDto })
  findOne(@Buyer() buyer: BuyerContext, @Param('id') id: string): Promise<Checkout> {
    return this.checkoutService.findOne(buyer, id);
  }
}
