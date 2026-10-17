import { afterAll, describe, expect, it } from '@jest/globals';
import { CART_LINE_MAX_QUANTITY, CheckoutStatuses, CurrencyCodes } from '@app/contracts';
import { testPrisma } from '../support/db';
import { createBuyer, createProduct, createSeller } from '../support/marketplace';

/** Each rule is proven by writing around the application, the week-2 pattern. */
afterAll(async () => {
  await testPrisma.$disconnect();
});

const CHECKS = [
  'cart_items_quantity_range',
  'cart_items_added_price_positive',
  'checkouts_total_positive',
  'orders_total_positive',
  'order_items_quantity_positive',
  'order_items_unit_price_positive',
];

async function checkoutFixture() {
  const seller = await createSeller('constraint');
  const product = await createProduct(seller.organizationId);
  const buyer = await createBuyer();
  const checkout = await testPrisma.checkout.create({
    data: { buyerId: buyer.id, totalMinor: 1000, currency: CurrencyCodes.EGP },
  });
  const order = {
    checkoutId: checkout.id,
    organizationId: seller.organizationId,
    buyerId: buyer.id,
    totalMinor: 1000,
    currency: CurrencyCodes.EGP,
  };
  return { product, checkout, order };
}

describe('phase-4 database constraints', () => {
  it.each(CHECKS)('%s is installed, not merely intended', async (name) => {
    const rows = await testPrisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE conname = ${name}
    `;
    expect(rows).toHaveLength(1);
  });

  it('refuses a cart line above 10 and below 1 (D72)', async () => {
    const seller = await createSeller('qty');
    const product = await createProduct(seller.organizationId);
    const buyer = await createBuyer();
    const cart = await testPrisma.cart.create({ data: { buyerId: buyer.id } });

    for (const quantity of [CART_LINE_MAX_QUANTITY + 1, 0]) {
      await expect(
        testPrisma.cartItem.create({
          data: { cartId: cart.id, productId: product.id, quantity, addedUnitPriceMinor: 1000 },
        }),
      ).rejects.toThrow(/cart_items_quantity_range/);
    }
  });

  it('keeps one cart per buyer (SRS-FR-CART-001)', async () => {
    const buyer = await createBuyer();
    await testPrisma.cart.create({ data: { buyerId: buyer.id } });
    await expect(testPrisma.cart.create({ data: { buyerId: buyer.id } })).rejects.toThrow();
  });

  it('keeps one line per product in a cart', async () => {
    const seller = await createSeller('line');
    const product = await createProduct(seller.organizationId);
    const buyer = await createBuyer();
    const cart = await testPrisma.cart.create({ data: { buyerId: buyer.id } });
    const line = { cartId: cart.id, productId: product.id, quantity: 1, addedUnitPriceMinor: 1000 };

    await testPrisma.cartItem.create({ data: line });
    await expect(testPrisma.cartItem.create({ data: line })).rejects.toThrow();
  });

  it('creates checkouts PENDING_PAYMENT by default', async () => {
    const { checkout } = await checkoutFixture();
    expect(checkout.status).toBe(CheckoutStatuses.PENDING_PAYMENT);
  });

  it('allows one order per seller per checkout (D56)', async () => {
    const { order } = await checkoutFixture();
    await testPrisma.order.create({ data: order });
    await expect(testPrisma.order.create({ data: order })).rejects.toThrow();
  });

  it('refuses an order item of zero units', async () => {
    const { product, order } = await checkoutFixture();
    const created = await testPrisma.order.create({ data: order });

    await expect(
      testPrisma.orderItem.create({
        data: {
          orderId: created.id,
          productId: product.id,
          productName: product.name,
          quantity: 0,
          unitPriceMinor: 1000,
        },
      }),
    ).rejects.toThrow(/order_items_quantity_positive/);
  });
});
