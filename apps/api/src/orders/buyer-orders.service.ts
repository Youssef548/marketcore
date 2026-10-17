import { Injectable, NotFoundException } from '@nestjs/common';
import { BUYER_ORDERS_PAGE_SIZE, type BuyerOrder, type BuyerOrderPage } from '@app/contracts';
import type { BuyerContext } from '@app/domain';
import { toPage } from '../common/pagination/page';
import { toBuyerOrder, toBuyerOrderSummary } from './buyer-order.mapper';
import { BuyerOrderMessages } from './orders.constants';
import { BuyerOrdersRepository } from './repositories/buyer-orders.repository';

@Injectable()
export class BuyerOrdersService {
  constructor(private readonly buyerOrdersRepository: BuyerOrdersRepository) {}

  async list(buyer: BuyerContext, cursor: string | undefined): Promise<BuyerOrderPage> {
    const rows = await this.buyerOrdersRepository.list(buyer, cursor, BUYER_ORDERS_PAGE_SIZE);
    return toPage(rows, BUYER_ORDERS_PAGE_SIZE, toBuyerOrderSummary);
  }

  async findOne(buyer: BuyerContext, id: string): Promise<BuyerOrder> {
    const row = await this.buyerOrdersRepository.findById(buyer, id);
    if (row === null) {
      throw new NotFoundException(BuyerOrderMessages.NOT_FOUND);
    }
    return toBuyerOrder(row);
  }
}
