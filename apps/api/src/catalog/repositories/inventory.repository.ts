import { Injectable } from '@nestjs/common';
import { Prisma } from '@app/database';
import { PrismaService } from '@app/runtime';
import type { InventoryStockRow } from '../interfaces/inventory.interface';

/**
 * Inventory as the checkout transaction touches it (D93). These methods take a
 * `Prisma.TransactionClient` the caller opened, so the lock and the decrement are
 * the same transaction as the order they belong to — the catalog module owns the
 * table, the checkout transaction owns the moment.
 *
 * The lock order is global and fixed (RULE-CHK-002): every row in one statement,
 * ordered by product id under `COLLATE "C"`. The worker takes the same order, so no
 * two transactions can each hold a row the other is waiting for.
 */
@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Every requested row, one statement, in bytewise product-id order, all locked. */
  lockByProductIds(
    tx: Prisma.TransactionClient,
    productIds: readonly string[],
  ): Promise<InventoryStockRow[]> {
    return tx.$queryRaw<InventoryStockRow[]>`
      SELECT "productId", available FROM inventory
      WHERE "productId" IN (${Prisma.join([...productIds])})
      ORDER BY "productId" COLLATE "C"
      FOR UPDATE`;
  }

  async decrement(tx: Prisma.TransactionClient, productId: string, quantity: number): Promise<void> {
    await tx.inventory.update({
      where: { productId },
      data: { available: { decrement: quantity } },
    });
  }
}
