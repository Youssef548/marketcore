import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import type { Cart } from '@app/contracts';
import type { BuyerContext } from '@app/domain';
import { Buyer } from '../security/decorators/buyer.decorator';
import { TenantFree } from '../security/decorators/tenant-free.decorator';
import { CartService } from './cart.service';
import { CartDto, SetCartLineRequestDto } from './dto/cart.dto';

/** The caller's own cart. The route names no cart: the buyer is the resource (finding 4). */
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @TenantFree()
  @ApiOkResponse({ type: CartDto })
  get(@Buyer() buyer: BuyerContext): Promise<Cart> {
    return this.cartService.get(buyer);
  }

  @Put('items/:productId')
  @TenantFree()
  @ApiOkResponse({ type: CartDto })
  setLine(
    @Buyer() buyer: BuyerContext,
    @Param('productId') productId: string,
    @Body() body: SetCartLineRequestDto,
  ): Promise<Cart> {
    return this.cartService.setLine(buyer, productId, body.quantity);
  }

  @Delete('items/:productId')
  @TenantFree()
  @ApiOkResponse({ type: CartDto })
  removeLine(@Buyer() buyer: BuyerContext, @Param('productId') productId: string): Promise<Cart> {
    return this.cartService.removeLine(buyer, productId);
  }
}
