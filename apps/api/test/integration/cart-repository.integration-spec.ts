import { afterAll, describe, expect, it } from '@jest/globals';
import { buildBuyerContext } from '@app/domain';
import type { PrismaService } from '@app/runtime';
import { CartRepository } from '../../src/cart/repositories/cart.repository';
import { testPrisma } from '../support/db';
import { cartWith, createBuyer, createProduct, createSeller } from '../support/marketplace';

afterAll(async () => {
  await testPrisma.$disconnect();
});

const repository = new CartRepository(testPrisma as unknown as PrismaService);

/** A hold held open on purpose, to prove a row lock is taken and released. */
function heldLock() {
  let release!: () => void;
  let locked!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const isLocked = new Promise<void>((resolve) => (locked = resolve));
  return { held, isLocked, release, locked };
}

describe('CartRepository, checkout-side methods', () => {
  it('locks the buyer cart row FOR UPDATE until the transaction ends (D83)', async () => {
    const buyer = await createBuyer();
    await testPrisma.cart.create({ data: { buyerId: buyer.id } });
    const context = buildBuyerContext(buyer.id);
    const { held, isLocked, release, locked } = heldLock();

    const holder = testPrisma.$transaction(async (tx) => {
      const cart = await repository.lockForCheckout(tx, context);
      expect(cart).not.toBeNull();
      locked();
      await held;
    });
    await isLocked;

    let secondDone = false;
    const second = testPrisma
      .$transaction((tx) => repository.lockForCheckout(tx, context))
      .then((cart) => {
        secondDone = true;
        return cart;
      });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(secondDone).toBe(false);

    release();
    await holder;
    expect(await second).not.toBeNull();
    expect(secondDone).toBe(true);
  });

  it('answers null when the buyer has no cart row yet', async () => {
    const buyer = await createBuyer();
    const cart = await testPrisma.$transaction((tx) =>
      repository.lockForCheckout(tx, buildBuyerContext(buyer.id)),
    );
    expect(cart).toBeNull();
  });

  it('reads the confirmed lines and clears them through the transaction client (SRS-FR-CHK-006/007)', async () => {
    const seller = await createSeller('cartstore');
    const product = await createProduct(seller.organizationId);
    const buyer = await createBuyer();
    await cartWith(buyer.id, [{ productId: product.id, quantity: 2, addedUnitPriceMinor: product.priceMinor }]);
    const context = buildBuyerContext(buyer.id);

    await testPrisma.$transaction(async (tx) => {
      const cart = await repository.lockForCheckout(tx, context);
      if (cart === null) throw new Error('expected a cart');
      expect(await repository.readCheckoutLines(tx, cart.id)).toEqual([{ productId: product.id, quantity: 2 }]);
      await repository.clearCheckoutLines(tx, cart.id);
    });

    expect(await testPrisma.cartItem.count({ where: { cart: { buyerId: buyer.id } } })).toBe(0);
  });

  it('leaves the lines in place when the transaction is rolled back', async () => {
    const seller = await createSeller('cartroll');
    const product = await createProduct(seller.organizationId);
    const buyer = await createBuyer();
    await cartWith(buyer.id, [{ productId: product.id, quantity: 1, addedUnitPriceMinor: product.priceMinor }]);
    const context = buildBuyerContext(buyer.id);

    await expect(
      testPrisma.$transaction(async (tx) => {
        const cart = await repository.lockForCheckout(tx, context);
        if (cart === null) throw new Error('expected a cart');
        await repository.clearCheckoutLines(tx, cart.id);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(await testPrisma.cartItem.count({ where: { cart: { buyerId: buyer.id } } })).toBe(1);
  });
});
