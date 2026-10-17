import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  CurrencyCodes,
  ProductStatuses,
  type CurrencyCode,
  type ProductStatus,
} from '@app/contracts';
import { TokenService } from '../../src/auth/token.service';
import { testPrisma } from './db';

const suffix = (): string => randomUUID().slice(0, 8);

/** Placeholder hash: these users never log in, they are handed a signed token. */
const UNUSABLE_PASSWORD_HASH = 'x';

export interface SellerFixture {
  organizationId: string;
  name: string;
  slug: string;
}

export interface ProductFixture {
  id: string;
  organizationId: string;
  name: string;
  priceMinor: number;
  currency: CurrencyCode;
}

export async function createSeller(prefix: string): Promise<SellerFixture> {
  const organization = await testPrisma.organization.create({
    data: { name: `${prefix} seller`, slug: `${prefix}-${suffix()}` },
    select: { id: true, name: true, slug: true },
  });
  return { organizationId: organization.id, name: organization.name, slug: organization.slug };
}

export async function createProduct(
  organizationId: string,
  options: Partial<{
    name: string;
    priceMinor: number;
    currency: CurrencyCode;
    status: ProductStatus;
    available: number;
  }> = {},
): Promise<ProductFixture> {
  const {
    name = `Item ${suffix()}`,
    priceMinor = 1000,
    currency = CurrencyCodes.EGP,
    status = ProductStatuses.PUBLISHED,
    available = 5,
  } = options;
  return testPrisma.product.create({
    data: { organizationId, name, priceMinor, currency, status, inventory: { create: { available } } },
    select: { id: true, organizationId: true, name: true, priceMinor: true, currency: true },
  });
}

export async function createBuyer(): Promise<{ id: string }> {
  return testPrisma.user.create({
    data: { email: `buyer-${randomUUID()}@marketcore.test`, passwordHash: UNUSABLE_PASSWORD_HASH },
    select: { id: true },
  });
}

/**
 * Many buyers, each with a valid access token, without touching /auth.
 *
 * The auth routes are throttled to AUTH_THROTTLE_LIMIT per minute (20), so a
 * hundred registrations through HTTP would be refused with 429 long before the
 * race starts (finding 14). The token is signed by the application's own
 * TokenService, so the guard chain the race goes through is the real one.
 */
export async function mintBuyers(
  app: INestApplication,
  count: number,
): Promise<{ id: string; token: string }[]> {
  const ids = Array.from({ length: count }, () => randomUUID());
  await testPrisma.user.createMany({
    data: ids.map((id) => ({
      id,
      email: `racer-${id}@marketcore.test`,
      passwordHash: UNUSABLE_PASSWORD_HASH,
    })),
  });
  const tokens = app.get(TokenService);
  return Promise.all(ids.map(async (id) => ({ id, token: await tokens.signAccessToken(id) })));
}

export async function cartWith(
  buyerId: string,
  lines: { productId: string; quantity: number; addedUnitPriceMinor: number }[],
): Promise<{ id: string }> {
  return testPrisma.cart.create({ data: { buyerId, items: { create: lines } }, select: { id: true } });
}

export async function availableOf(productId: string): Promise<number> {
  const row = await testPrisma.inventory.findUniqueOrThrow({
    where: { productId },
    select: { available: true },
  });
  return row.available;
}

export const bearer = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});

/** A placed checkout with one order of one item, written directly — for list and paging fixtures. */
export async function placedOrder(
  buyerId: string,
  product: ProductFixture,
  quantity = 1,
): Promise<{ checkoutId: string; orderId: string }> {
  const totalMinor = product.priceMinor * quantity;
  const checkout = await testPrisma.checkout.create({
    data: { buyerId, totalMinor, currency: product.currency },
    select: { id: true },
  });
  const order = await testPrisma.order.create({
    data: {
      checkoutId: checkout.id,
      organizationId: product.organizationId,
      buyerId,
      totalMinor,
      currency: product.currency,
      items: {
        create: { productId: product.id, productName: product.name, quantity, unitPriceMinor: product.priceMinor },
      },
    },
    select: { id: true },
  });
  return { checkoutId: checkout.id, orderId: order.id };
}
