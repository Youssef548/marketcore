import { Injectable } from '@nestjs/common';
import type { Prisma } from '@app/database';
import { buyerScope, type BuyerContext } from '@app/domain';
import { PrismaService } from '@app/runtime';
import { PUBLIC_PRODUCT_WHERE } from '../../storefront/storefront.constants';
import { CART_LINE_ORDER, CART_LINE_SELECT } from '../cart.constants';
import type { CartLineRow } from '../interfaces/cart.interface';

/**
 * Every write here locks the buyer's cart row before touching a line (D83). The
 * checkout transaction takes the same row lock first, so a line cannot be added,
 * changed or removed between checkout reading the cart and emptying it. One order
 * everywhere — cart row, then lines — so the two can never deadlock.
 */
@Injectable()
export class CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the cart on first use (SRS-FR-CART-001). A native upsert: INSERT … ON CONFLICT. */
  async ensureCart(buyer: BuyerContext): Promise<void> {
    await this.prisma.cart.upsert({ where: buyerScope(buyer), update: {}, create: buyerScope(buyer) });
  }

  readLines(buyer: BuyerContext): Promise<CartLineRow[]> {
    return this.prisma.cartItem.findMany({
      where: { cart: buyerScope(buyer) },
      select: CART_LINE_SELECT,
      orderBy: [...CART_LINE_ORDER],
    });
  }

  /** A plain read: the cart never locks or writes Inventory (SRS-FR-CART-004). */
  findPublicPrice(productId: string): Promise<{ priceMinor: number } | null> {
    return this.prisma.product.findFirst({
      where: { id: productId, ...PUBLIC_PRODUCT_WHERE },
      select: { priceMinor: true },
    });
  }

  async setLine(buyer: BuyerContext, productId: string, quantity: number, priceMinor: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const cart = await this.touchCart(tx, buyer);
      await tx.cartItem.upsert({
        where: { cartId_productId: { cartId: cart.id, productId } },
        // Written once (D82): a quantity change is not a price confirmation.
        update: { quantity },
        create: { cartId: cart.id, productId, quantity, addedUnitPriceMinor: priceMinor },
      });
    });
  }

  async removeLine(buyer: BuyerContext, productId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const cart = await this.touchCart(tx, buyer);
      await tx.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
    });
  }

  /**
   * An upsert with an explicit `updatedAt`, so the row is written — and therefore
   * locked until commit — even when it already exists. `update: {}` lets Prisma
   * skip the UPDATE and take no lock.
   */
  private touchCart(tx: Prisma.TransactionClient, buyer: BuyerContext): Promise<{ id: string }> {
    return tx.cart.upsert({
      where: buyerScope(buyer),
      update: { updatedAt: new Date() },
      create: buyerScope(buyer),
      select: { id: true },
    });
  }
}
