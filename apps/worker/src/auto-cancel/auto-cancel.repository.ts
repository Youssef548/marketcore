import { CheckoutStatuses, OrderStatuses } from '@app/contracts';
import { Prisma, type PrismaClient } from '@app/database';
import { byLockOrder } from '@app/domain';
import type { AutoCancelResult, AutoCancelStore } from '../interfaces/auto-cancel.interface';
import { AUTO_CANCEL_TRANSACTION_TIMEOUT_MS } from '../worker.constants';

/**
 * Cancels unpaid checkouts and restores their stock exactly once (D70, INV-15).
 *
 * The UPDATE is conditional on PENDING_PAYMENT and its subquery takes row locks
 * with SKIP LOCKED, so two runs — in this process or another — divide the due
 * checkouts between them instead of both claiming one; only the ids an UPDATE
 * actually returned are restocked. Inventory is locked in the order checkout
 * locks it, so this transaction and a checkout can never deadlock.
 */
export class AutoCancelRepository implements AutoCancelStore {
  constructor(private readonly prisma: PrismaClient) {}

  cancelExpired(cutoff: Date, batchSize: number): Promise<AutoCancelResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const cancelled = await tx.$queryRaw<{ id: string }[]>`
          UPDATE checkouts SET status = ${CheckoutStatuses.CANCELLED}::"CheckoutStatus"
          WHERE id IN (
            SELECT id FROM checkouts
            WHERE status = ${CheckoutStatuses.PENDING_PAYMENT}::"CheckoutStatus"
              AND "placedAt" < ${cutoff}
            ORDER BY "placedAt"
            LIMIT ${batchSize}
            FOR UPDATE SKIP LOCKED)
          AND status = ${CheckoutStatuses.PENDING_PAYMENT}::"CheckoutStatus"
          RETURNING id`;
        if (cancelled.length === 0) return { cancelled: 0, restoredUnits: 0 };

        const checkoutIds = cancelled.map((row) => row.id);
        // Every order of a checkout moves with it (domain-model §5).
        await tx.order.updateMany({
          where: { checkoutId: { in: checkoutIds }, status: OrderStatuses.PENDING_PAYMENT },
          data: { status: OrderStatuses.CANCELLED },
        });

        const restock = await tx.orderItem.groupBy({
          by: ['productId'],
          where: { order: { checkoutId: { in: checkoutIds } } },
          _sum: { quantity: true },
        });
        const units = new Map(restock.map((row) => [row.productId, row._sum.quantity ?? 0]));
        const productIds = [...units.keys()].sort(byLockOrder);

        await tx.$queryRaw`
          SELECT 1 FROM inventory WHERE "productId" IN (${Prisma.join(productIds)})
          ORDER BY "productId" COLLATE "C" FOR UPDATE`;

        let restoredUnits = 0;
        for (const productId of productIds) {
          const quantity = units.get(productId) ?? 0;
          await tx.inventory.update({ where: { productId }, data: { available: { increment: quantity } } });
          restoredUnits += quantity;
        }
        return { cancelled: checkoutIds.length, restoredUnits };
      },
      { timeout: AUTO_CANCEL_TRANSACTION_TIMEOUT_MS },
    );
  }
}
