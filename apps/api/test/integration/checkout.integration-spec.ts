import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from '@jest/globals';
import {
  CheckoutConflictReasons,
  CheckoutStatuses,
  OrderStatuses,
  ProductStatuses,
} from '@app/contracts';
import { buildBuyerContext, checkoutRequestFingerprint, type BuyerContext, type ConfirmedLine } from '@app/domain';
import type { PrismaService } from '@app/runtime';
import { PlaceCheckoutOutcomes } from '../../src/orders/orders.constants';
import { CheckoutRepository } from '../../src/orders/repositories/checkout.repository';
import { testPrisma } from '../support/db';
import { captureLogger } from '../support/logger';
import {
  availableOf,
  cartWith,
  createBuyer,
  createProduct,
  createSeller,
} from '../support/marketplace';
import type { ProductFixture } from '../support/interfaces/marketplace.interface';

afterAll(async () => {
  await testPrisma.$disconnect();
});

const repository = new CheckoutRepository(testPrisma as unknown as PrismaService, captureLogger());

/**
 * One placement attempt, keyed. These tests are about what a checkout does to the cart,
 * the stock and the orders — not about keys — so each call mints its own key and the
 * fingerprint the API would compute for the lines it is sending. Every key is used exactly
 * once here, which is the ordinary request; the reuse paths have their own spec.
 */
const placeOnce = (context: BuyerContext, lines: readonly ConfirmedLine[]) =>
  repository.place(context, `key-${randomUUID()}`, checkoutRequestFingerprint(lines), lines);

const confirmed = (product: ProductFixture, quantity: number, unitPriceMinor = product.priceMinor) => ({
  productId: product.id,
  quantity,
  unitPriceMinor,
});

async function threeSellerCart(stock: [number, number, number], quantities: [number, number, number]) {
  const sellers = await Promise.all(['chka', 'chkb', 'chkc'].map(createSeller));
  const products = await Promise.all(
    sellers.map((seller, i) =>
      createProduct(seller.organizationId, { priceMinor: [24_900, 18_900, 5_000][i], available: stock[i] }),
    ),
  );
  const buyer = await createBuyer();
  await cartWith(
    buyer.id,
    products.map((product, i) => ({ productId: product.id, quantity: quantities[i], addedUnitPriceMinor: product.priceMinor })),
  );
  const lines = products.map((product, i) => confirmed(product, quantities[i]));
  return { sellers, products, buyer, lines, context: buildBuyerContext(buyer.id) };
}

const snapshot = async (buyerId: string, productIds: string[]) => ({
  checkouts: await testPrisma.checkout.count({ where: { buyerId } }),
  orders: await testPrisma.order.count({ where: { buyerId } }),
  stock: await Promise.all(productIds.map(availableOf)),
  cart: await testPrisma.cartItem.findMany({
    where: { cart: { buyerId } },
    select: { productId: true, quantity: true },
    orderBy: { productId: 'asc' },
  }),
});

describe('CheckoutRepository.place', () => {
  it('three sellers → one checkout, three orders, stock decremented, cart emptied (AC-US-CHK-002-1)', async () => {
    const { sellers, products, buyer, lines, context } = await threeSellerCart([5, 5, 5], [1, 2, 3]);

    const outcome = await placeOnce(context, lines);

    expect(outcome.kind).toBe(PlaceCheckoutOutcomes.PLACED);
    const checkouts = await testPrisma.checkout.findMany({
      where: { buyerId: buyer.id },
      include: { orders: { include: { items: true } } },
    });
    expect(checkouts).toHaveLength(1);
    const [checkout] = checkouts;
    expect(checkout.status).toBe(CheckoutStatuses.PENDING_PAYMENT);
    expect(checkout.orders).toHaveLength(3);
    expect(checkout.orders.map((order) => order.organizationId).sort()).toEqual(
      sellers.map((seller) => seller.organizationId).sort(),
    );
    expect(checkout.orders.every((order) => order.status === OrderStatuses.PENDING_PAYMENT)).toBe(true);
    // INV-13's precondition: the orders sum to the checkout.
    expect(checkout.orders.reduce((sum, order) => sum + order.totalMinor, 0)).toBe(checkout.totalMinor);
    expect(checkout.totalMinor).toBe(24_900 * 1 + 18_900 * 2 + 5_000 * 3);
    // Snapshots (PRD-FR-CHK-005, D90).
    const items = checkout.orders.flatMap((order) => order.items);
    for (const product of products) {
      expect(items.find((item) => item.productId === product.id)).toMatchObject({
        unitPriceMinor: product.priceMinor,
        productName: product.name,
      });
    }
    expect(await Promise.all(products.map((product) => availableOf(product.id)))).toEqual([4, 3, 2]);
    expect(await testPrisma.cartItem.count({ where: { cart: { buyerId: buyer.id } } })).toBe(0);
  });

  it("one seller's line short by one → nothing at all changes (AC-US-CHK-002-2, INV-11)", async () => {
    // Seller C has 2 and the buyer wants 3: short by exactly one unit.
    const { products, buyer, lines, context } = await threeSellerCart([5, 5, 2], [1, 1, 3]);
    const before = await snapshot(buyer.id, products.map((p) => p.id));

    const outcome = await placeOnce(context, lines);

    expect(outcome).toEqual({
      kind: PlaceCheckoutOutcomes.REJECTED,
      conflicts: [
        { productId: products[2].id, reason: CheckoutConflictReasons.SHORT, available: 2, currentUnitPriceMinor: 5_000 },
      ],
    });
    const after = await snapshot(buyer.id, products.map((p) => p.id));
    expect(after).toEqual(before);
    expect(after.checkouts).toBe(0);
    expect(after.orders).toBe(0);
    expect(after.stock).toEqual([5, 5, 2]);
    expect(after.cart).toHaveLength(3);
  });

  it('reports every failing line, not only the first (SRS-FR-CHK-003)', async () => {
    const { products, buyer, context } = await threeSellerCart([0, 5, 5], [1, 1, 1]);
    const lines = [confirmed(products[0], 1), confirmed(products[1], 1, 999), confirmed(products[2], 1)];

    const outcome = await placeOnce(context, lines);

    expect(outcome.kind).toBe(PlaceCheckoutOutcomes.REJECTED);
    if (outcome.kind !== PlaceCheckoutOutcomes.REJECTED) throw new Error('unreachable');
    expect(outcome.conflicts.map((c) => [c.productId, c.reason])).toEqual([
      [products[0].id, CheckoutConflictReasons.SOLD_OUT],
      [products[1].id, CheckoutConflictReasons.PRICE_CHANGED],
    ]);
    expect(await testPrisma.checkout.count({ where: { buyerId: buyer.id } })).toBe(0);
  });

  it('a line that stopped being public is SOLD_OUT and masked (D86)', async () => {
    const { products, lines, context } = await threeSellerCart([5, 5, 5], [1, 1, 1]);
    await testPrisma.product.update({ where: { id: products[1].id }, data: { status: ProductStatuses.DRAFT } });

    const outcome = await placeOnce(context, lines);

    expect(outcome).toEqual({
      kind: PlaceCheckoutOutcomes.REJECTED,
      conflicts: [{ productId: products[1].id, reason: CheckoutConflictReasons.SOLD_OUT, available: 0, currentUnitPriceMinor: null }],
    });
  });

  it('two products of one seller make one order with two items (D56)', async () => {
    const seller = await createSeller('oneseller');
    const first = await createProduct(seller.organizationId);
    const second = await createProduct(seller.organizationId);
    const buyer = await createBuyer();
    await cartWith(buyer.id, [
      { productId: first.id, quantity: 1, addedUnitPriceMinor: first.priceMinor },
      { productId: second.id, quantity: 1, addedUnitPriceMinor: second.priceMinor },
    ]);

    await placeOnce(buildBuyerContext(buyer.id), [confirmed(first, 1), confirmed(second, 1)]);

    const orders = await testPrisma.order.findMany({ where: { buyerId: buyer.id }, include: { items: true } });
    expect(orders).toHaveLength(1);
    expect(orders[0].items).toHaveLength(2);
  });

  it('refuses lines that are not the cart, and writes nothing (SRS-FR-CHK-006)', async () => {
    const { products, buyer, context } = await threeSellerCart([5, 5, 5], [1, 1, 1]);
    const before = await snapshot(buyer.id, products.map((p) => p.id));

    expect(await placeOnce(context, [confirmed(products[0], 2)])).toEqual({ kind: PlaceCheckoutOutcomes.CART_CHANGED });
    expect(await snapshot(buyer.id, products.map((p) => p.id))).toEqual(before);
  });

  it('refuses a buyer who has no cart at all', async () => {
    const seller = await createSeller('nocart');
    const product = await createProduct(seller.organizationId);
    const buyer = await createBuyer();

    expect(await placeOnce(buildBuyerContext(buyer.id), [confirmed(product, 1)])).toEqual({
      kind: PlaceCheckoutOutcomes.CART_CHANGED,
    });
  });
});
