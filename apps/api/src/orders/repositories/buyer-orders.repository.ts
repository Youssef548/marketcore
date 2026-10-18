import { Injectable } from '@nestjs/common';
import { buyerScope, type BuyerContext } from '@app/domain';
import { PrismaService } from '@app/runtime';
import { NEWEST_FIRST } from '../../common/pagination/pagination.constants';
import type { BuyerOrderRow, BuyerOrderSummaryRow } from '../interfaces/buyer-order.interface';
import { BUYER_ORDER_DETAIL_SELECT, BUYER_ORDER_SUMMARY_SELECT } from '../orders.constants';

/**
 * The buyer's path to an order (ADR 010 amendment): by buyer id only, composed
 * from buyerScope and never from the tenant filter (RULE-BORD-001). The seller's
 * path to the same rows arrives with the seller orders screen and uses that filter.
 */
@Injectable()
export class BuyerOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(buyer: BuyerContext, cursor: string | undefined, size: number): Promise<BuyerOrderSummaryRow[]> {
    return this.prisma.order.findMany({
      where: buyerScope(buyer),
      select: BUYER_ORDER_SUMMARY_SELECT,
      orderBy: [...NEWEST_FIRST],
      take: size + 1,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    });
  }

  findById(buyer: BuyerContext, id: string): Promise<BuyerOrderRow | null> {
    return this.prisma.order.findFirst({
      where: { id, ...buyerScope(buyer) },
      select: BUYER_ORDER_DETAIL_SELECT,
    });
  }
}
