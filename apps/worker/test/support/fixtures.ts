import { randomUUID } from 'node:crypto';
import { CurrencyCodes, ProductStatuses } from '@app/contracts';
import { PrismaClient } from '@app/database';
import type { FixtureLine, ProductFixture } from './interfaces/fixtures.interface';

export const prisma: PrismaClient = new PrismaClient();

const suffix = () => randomUUID().slice(0, 8);

export async function stockedProduct(available: number, organizationId?: string): Promise<ProductFixture> {
  const orgId =
    organizationId ??
    (await prisma.organization.create({ data: { name: 'Worker seller', slug: `wk-${suffix()}` } })).id;
  return prisma.product.create({
    data: {
      organizationId: orgId,
      name: `Worker item ${suffix()}`,
      priceMinor: 1000,
      currency: CurrencyCodes.EGP,
      status: ProductStatuses.PUBLISHED,
      inventory: { create: { available } },
    },
    select: { id: true, organizationId: true, name: true, priceMinor: true, currency: true },
  });
}

/**
 * What a successful POST /checkouts commits, written directly: stock already
 * taken, one checkout, one order per seller. The worker suite cannot call the
 * API (apps never import apps), so it reproduces the committed state.
 */
export async function placedCheckout(
  placedAt: Date,
  lines: FixtureLine[],
): Promise<{ checkoutId: string }> {
  const buyer = await prisma.user.create({
    data: { email: `wk-${randomUUID()}@marketcore.test`, passwordHash: 'x' },
  });
  for (const line of lines) {
    await prisma.inventory.update({
      where: { productId: line.product.id },
      data: { available: { decrement: line.quantity } },
    });
  }
  const total = lines.reduce((sum, line) => sum + line.quantity * line.product.priceMinor, 0);
  const checkout = await prisma.checkout.create({
    data: { buyerId: buyer.id, totalMinor: total, currency: CurrencyCodes.EGP, placedAt },
  });
  const bySeller = new Map<string, typeof lines>();
  for (const line of lines) {
    bySeller.set(line.product.organizationId, [...(bySeller.get(line.product.organizationId) ?? []), line]);
  }
  for (const [organizationId, sellerLines] of bySeller) {
    await prisma.order.create({
      data: {
        checkoutId: checkout.id,
        organizationId,
        buyerId: buyer.id,
        totalMinor: sellerLines.reduce((sum, line) => sum + line.quantity * line.product.priceMinor, 0),
        currency: CurrencyCodes.EGP,
        items: {
          create: sellerLines.map((line) => ({
            productId: line.product.id,
            productName: line.product.name,
            quantity: line.quantity,
            unitPriceMinor: line.product.priceMinor,
          })),
        },
      },
    });
  }
  return { checkoutId: checkout.id };
}

export const availableOf = async (productId: string): Promise<number> =>
  (await prisma.inventory.findUniqueOrThrow({ where: { productId } })).available;

/** Long-expired: sorts ahead of any real backlog the shared database holds. */
export const LONG_AGO = (offsetMs: number) => new Date(Date.UTC(2000, 0, 1) + offsetMs);
