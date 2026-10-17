import { Inject, Injectable, type LoggerService } from '@nestjs/common';
import { Prisma } from '@app/database';
import {
  OrganizationStatuses,
  ProductStatuses,
  type CurrencyCode,
} from '@app/contracts';
import {
  buyerScope,
  byLockOrder,
  evaluateCheckoutLines,
  groupBySeller,
  sameLines,
  sumLineTotals,
  type BuyerContext,
  type ConfirmedLine,
  type LockedLineState,
} from '@app/domain';
import { LogEvents, PrismaService } from '@app/runtime';
import { CartRepository } from '../../cart/repositories/cart.repository';
import { InventoryRepository } from '../../catalog/repositories/inventory.repository';
import {
  INTERACTIVE_TRANSACTION_MAX_WAIT_MS,
  INTERACTIVE_TRANSACTION_TIMEOUT_MS,
  TRANSACTION_RETRIES,
  TRANSACTION_RETRY_BASE_DELAY_MS,
} from '../../common/database/database.constants';
import { withTransactionRetry } from '../../common/database/retryable-transaction';
import type {
  CheckoutRecord,
  LockedProductRow,
  PlaceCheckoutOutcome,
} from '../interfaces/checkout.interface';
import {
  CHECKOUT_SELECT,
  LOCKED_PRODUCT_SELECT,
  ORDERS_LOGGER,
  PlaceCheckoutOutcomes,
} from '../orders.constants';

const isPurchasable = (product: LockedProductRow): boolean =>
  product.status === ProductStatuses.PUBLISHED &&
  product.organization.status === OrganizationStatuses.ACTIVE;

/**
 * The checkout transaction (SRS-FR-CHK-002 … 007). It owns the one write that
 * spans modules — inventory, the cart and the new orders commit together or not
 * at all (INV-11; finding 16 records why the boundary is this repository).
 *
 * The writes into `carts`, `cart_items` and `inventory` are the owning modules'
 * to make, so they go through their repositories, sharing this transaction's
 * client (D93, CR-002). Architecture rule 4 keeps no exception.
 *
 * Lock order is global and fixed: the buyer's cart row, then inventory rows by
 * productId under COLLATE "C". The cart routes and the worker take the same order,
 * so no two transactions can each hold a row the other is waiting for.
 */
@Injectable()
export class CheckoutRepository {
  private readonly cartRepository: CartRepository;
  private readonly inventoryRepository: InventoryRepository;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ORDERS_LOGGER) private readonly logger: LoggerService,
  ) {
    this.cartRepository = new CartRepository(prisma);
    this.inventoryRepository = new InventoryRepository(prisma);
  }

  /** A plain read, taken before any lock (SRS-FR-CHK-005). */
  async currenciesOf(productIds: readonly string[]): Promise<CurrencyCode[]> {
    const rows = await this.prisma.product.findMany({
      where: { id: { in: [...productIds] } },
      select: { currency: true },
    });
    return rows.map((row) => row.currency);
  }

  place(buyer: BuyerContext, lines: readonly ConfirmedLine[]): Promise<PlaceCheckoutOutcome> {
    return withTransactionRetry(
      () =>
        this.prisma.$transaction((tx) => this.placeWithin(tx, buyer, lines), {
          maxWait: INTERACTIVE_TRANSACTION_MAX_WAIT_MS,
          timeout: INTERACTIVE_TRANSACTION_TIMEOUT_MS,
        }),
      {
        retries: TRANSACTION_RETRIES,
        baseDelayMs: TRANSACTION_RETRY_BASE_DELAY_MS,
        onRetry: (attempt) =>
          this.logger.warn(LogEvents.CHECKOUT_TRANSACTION_RETRIED, { attempt, buyerId: buyer.buyerId }),
      },
    );
  }

  findForBuyer(buyer: BuyerContext, id: string): Promise<CheckoutRecord | null> {
    return this.prisma.checkout.findFirst({
      where: { id, ...buyerScope(buyer) },
      select: CHECKOUT_SELECT,
    });
  }

  private async placeWithin(
    tx: Prisma.TransactionClient,
    buyer: BuyerContext,
    lines: readonly ConfirmedLine[],
  ): Promise<PlaceCheckoutOutcome> {
    // 1. The cart row first (D83): every cart write takes it too, so the lines read
    //    next cannot change before they are deleted in step 6.
    const cart = await this.cartRepository.lockForCheckout(tx, buyer);
    if (cart === null) return { kind: PlaceCheckoutOutcomes.CART_CHANGED };

    // 2. The request must be the cart (SRS-FR-CHK-006).
    const cartLines = await this.cartRepository.readCheckoutLines(tx, cart.id);
    if (!sameLines(cartLines, lines)) return { kind: PlaceCheckoutOutcomes.CART_CHANGED };

    // 3. Every inventory row, one statement, in lock order (RULE-CHK-002).
    const productIds = lines.map((line) => line.productId);
    const stock = await this.inventoryRepository.lockByProductIds(tx, productIds);

    // 4. Price, status and seller re-read after the locks: what is decided is what is true now.
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: LOCKED_PRODUCT_SELECT,
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    const availableById = new Map(stock.map((row) => [row.productId, row.available]));
    const state = new Map<string, LockedLineState>(
      products.map((product) => [
        product.id,
        {
          productId: product.id,
          purchasable: isPurchasable(product),
          available: availableById.get(product.id) ?? 0,
          currentUnitPriceMinor: product.priceMinor,
        },
      ]),
    );

    // 5. The decision is pure and lives in @app/domain. Nothing has been written yet,
    //    so a rejection commits a read-only transaction: no stock, order or cart change.
    const conflicts = evaluateCheckoutLines(lines, state);
    if (conflicts.length > 0) return { kind: PlaceCheckoutOutcomes.REJECTED, conflicts };

    // 6. Every write, in one commit.
    const productFor = (productId: string): LockedProductRow => {
      const product = productById.get(productId);
      if (product === undefined) throw new Error(`checkout passed a line with no product: ${productId}`);
      return product;
    };

    for (const line of [...lines].sort((a, b) => byLockOrder(a.productId, b.productId))) {
      await this.inventoryRepository.decrement(tx, line.productId, line.quantity);
    }

    // One currency is guaranteed: the service refused a mixed request before any
    // lock (SRS-FR-CHK-005), and a product's currency cannot be changed.
    const currency = productFor(lines[0].productId).currency;
    const checkout = await tx.checkout.create({
      data: { buyerId: buyer.buyerId, totalMinor: sumLineTotals(lines), currency },
      select: { id: true },
    });

    const sellerLines = lines.map((line) => {
      const product = productFor(line.productId);
      return { ...line, sellerId: product.organization.id, productName: product.name };
    });
    for (const group of groupBySeller(sellerLines)) {
      await tx.order.create({
        data: {
          checkoutId: checkout.id,
          organizationId: group.sellerId,
          buyerId: buyer.buyerId,
          totalMinor: sumLineTotals(group.lines),
          currency,
          items: {
            create: group.lines.map((line) => ({
              productId: line.productId,
              productName: line.productName,
              quantity: line.quantity,
              unitPriceMinor: line.unitPriceMinor,
            })),
          },
        },
      });
    }

    await this.cartRepository.clearCheckoutLines(tx, cart.id);
    return { kind: PlaceCheckoutOutcomes.PLACED, checkoutId: checkout.id };
  }
}
