import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import type { BuyerOrder, BuyerOrderPage } from '@app/contracts';
import type { BuyerContext } from '@app/domain';
import { Buyer } from '../security/decorators/buyer.decorator';
import { TenantFree } from '../security/decorators/tenant-free.decorator';
import { PageQueryDto } from '../storefront/dto/storefront.dto';
import { BuyerOrdersService } from './buyer-orders.service';
import { BuyerOrderDto, BuyerOrderPageDto } from './dto/orders.dto';

@Controller('buyer/orders')
export class BuyerOrdersController {
  constructor(private readonly buyerOrdersService: BuyerOrdersService) {}

  @Get()
  @TenantFree()
  @ApiOkResponse({ type: BuyerOrderPageDto })
  list(@Buyer() buyer: BuyerContext, @Query() query: PageQueryDto): Promise<BuyerOrderPage> {
    return this.buyerOrdersService.list(buyer, query.cursor);
  }

  @Get(':id')
  @TenantFree()
  @ApiOkResponse({ type: BuyerOrderDto })
  findOne(@Buyer() buyer: BuyerContext, @Param('id') id: string): Promise<BuyerOrder> {
    return this.buyerOrdersService.findOne(buyer, id);
  }
}
