import { afterAll, describe, expect, it } from '@jest/globals';
import { byLockOrder } from '@app/domain';
import type { PrismaService } from '@app/runtime';
import { InventoryRepository } from '../../src/catalog/repositories/inventory.repository';
import { testPrisma } from '../support/db';
import { availableOf, createProduct, createSeller } from '../support/marketplace';

afterAll(async () => {
  await testPrisma.$disconnect();
});

const repository = new InventoryRepository(testPrisma as unknown as PrismaService);

describe('InventoryRepository, checkout-side methods', () => {
  it('returns every row in the bytewise lock order whatever order it is asked (RULE-CHK-002)', async () => {
    const seller = await createSeller('invorder');
    const products = await Promise.all(
      Array.from({ length: 4 }, () => createProduct(seller.organizationId, { available: 7 })),
    );
    const ids = products.map((product) => product.id);
    const asked = [...ids].reverse();

    const rows = await testPrisma.$transaction((tx) => repository.lockByProductIds(tx, asked));

    expect(rows.map((row) => row.productId)).toEqual([...ids].sort(byLockOrder));
    expect(rows.every((row) => row.available === 7)).toBe(true);
  });

  it('locks every row it was asked for until the transaction ends (RULE-CHK-002)', async () => {
    const seller = await createSeller('invlock');
    const product = await createProduct(seller.organizationId, { available: 5 });

    let release!: () => void;
    let locked!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const isLocked = new Promise<void>((resolve) => (locked = resolve));

    const holder = testPrisma.$transaction(async (tx) => {
      await repository.lockByProductIds(tx, [product.id]);
      locked();
      await held;
    });
    await isLocked;

    let secondDone = false;
    const second = testPrisma
      .$transaction(async (tx) => {
        await repository.lockByProductIds(tx, [product.id]);
        secondDone = true;
      });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(secondDone).toBe(false);

    release();
    await holder;
    await second;
    expect(secondDone).toBe(true);
  });

  it('decrements inside the transaction and rolls back with it', async () => {
    const seller = await createSeller('invdec');
    const product = await createProduct(seller.organizationId, { available: 5 });

    await expect(
      testPrisma.$transaction(async (tx) => {
        await repository.decrement(tx, product.id, 2);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await availableOf(product.id)).toBe(5);

    await testPrisma.$transaction((tx) => repository.decrement(tx, product.id, 2));
    expect(await availableOf(product.id)).toBe(3);
  });
});
