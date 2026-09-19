import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from '@jest/globals';
import { testPrisma } from '../support/db';

const suffix = () => randomUUID().slice(0, 8);

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('database constraints', () => {
  it('the non-negative inventory check is actually installed, not merely intended', async () => {
    const rows = await testPrisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE conname = 'inventory_quantities_non_negative'
    `;

    expect(rows).toHaveLength(1);
  });

  it('refuses to make available quantity negative', async () => {
    const org = await testPrisma.organization.create({
      data: { name: 'C', slug: `c-${suffix()}` },
    });
    const product = await testPrisma.product.create({
      data: { organizationId: org.id, name: 'P', priceMinor: 100, currency: 'USD' },
    });
    await testPrisma.inventory.create({ data: { productId: product.id, available: 1 } });

    await expect(
      testPrisma.inventory.update({ where: { productId: product.id }, data: { available: -1 } }),
    ).rejects.toThrow(/inventory_quantities_non_negative/);
  });

  it('refuses to make reserved quantity negative', async () => {
    // The other half of the same CHECK. Testing only `available` would let a
    // constraint silently missing `reserved` pass every assertion above.
    const org = await testPrisma.organization.create({
      data: { name: 'R', slug: `r-${suffix()}` },
    });
    const product = await testPrisma.product.create({
      data: { organizationId: org.id, name: 'P', priceMinor: 100, currency: 'USD' },
    });
    await testPrisma.inventory.create({ data: { productId: product.id, reserved: 1 } });

    await expect(
      testPrisma.inventory.update({ where: { productId: product.id }, data: { reserved: -1 } }),
    ).rejects.toThrow(/inventory_quantities_non_negative/);
  });

  it('refuses a duplicate organization slug', async () => {
    const slug = `dup-${suffix()}`;
    await testPrisma.organization.create({ data: { name: 'One', slug } });

    await expect(
      testPrisma.organization.create({ data: { name: 'Two', slug } }),
    ).rejects.toThrow();
  });

  it('refuses the same user joining one organization twice', async () => {
    const org = await testPrisma.organization.create({
      data: { name: 'M', slug: `m-${suffix()}` },
    });
    const user = await testPrisma.user.create({
      data: { email: `m-${suffix()}@marketcore.test`, passwordHash: 'x' },
    });
    await testPrisma.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });

    await expect(
      testPrisma.organizationMember.create({
        data: { organizationId: org.id, userId: user.id, role: 'MEMBER' },
      }),
    ).rejects.toThrow();
  });

  it('refuses a duplicate refresh token hash', async () => {
    const user = await testPrisma.user.create({
      data: { email: `r-${suffix()}@marketcore.test`, passwordHash: 'x' },
    });
    const session = await testPrisma.session.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + 1000) },
    });
    const tokenHash = `hash-${suffix()}`;
    await testPrisma.refreshToken.create({
      data: { sessionId: session.id, tokenHash, expiresAt: new Date(Date.now() + 1000) },
    });

    await expect(
      testPrisma.refreshToken.create({
        data: { sessionId: session.id, tokenHash, expiresAt: new Date(Date.now() + 1000) },
      }),
    ).rejects.toThrow();
  });
});
