import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { OrganizationSchema, TokenPairSchema } from '@app/contracts';
import { serviceLogs } from '../support/compose';
import {
  SEEDED_SELLERS,
  TEST_PASSWORD,
  bearer,
  credentials,
  productPayload,
  tenantHeaders,
  unique,
} from '../support/fixtures';

const API = '/api/v1';
const WEB = 'https://web.marketcore.test:8443';

interface Seller {
  accessToken: string;
  organizationId: string;
}

async function login(request: APIRequestContext, email: string, password = TEST_PASSWORD): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(res.status()).toBe(200);
  return TokenPairSchema.parse(await res.json()).accessToken;
}

async function seller(request: APIRequestContext, email: string): Promise<Seller> {
  const accessToken = await login(request, email);
  const orgs = await request.get(`${API}/organizations`, { headers: bearer(accessToken) });
  const [organization] = OrganizationSchema.array().parse(await orgs.json());
  return { accessToken, organizationId: organization.id };
}

async function stockedProduct(
  request: APIRequestContext,
  owner: Seller,
  { priceMinor, available }: { priceMinor: number; available: number },
): Promise<{ id: string; name: string }> {
  const headers = tenantHeaders(owner.accessToken, owner.organizationId);
  const name = unique('Storefront item');
  const created = await request.post(`${API}/products`, { headers, data: productPayload({ name, priceMinor }) });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  expect((await request.put(`${API}/products/${id}/inventory`, { headers, data: { available } })).status()).toBe(200);
  expect((await request.post(`${API}/products/${id}/publish`, { headers })).status()).toBe(204);
  return { id, name };
}

async function availableOf(request: APIRequestContext, owner: Seller, productId: string): Promise<number> {
  const res = await request.get(`${API}/products/${productId}/inventory`, {
    headers: tenantHeaders(owner.accessToken, owner.organizationId),
  });
  return ((await res.json()) as { available: number }).available;
}

async function newBuyer(request: APIRequestContext): Promise<string> {
  const email = `${unique('shopper')}@marketcore.test`;
  expect((await request.post(`${API}/auth/register`, { data: credentials(email) })).status()).toBe(201);
  return email;
}

async function signInTo(page: Page, email: string, next: string): Promise<void> {
  await page.goto(`${WEB}/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(next.replace(/[/?]/g, '\\$&')));
}

async function addToCart(page: Page, productId: string): Promise<void> {
  await page.goto(`${WEB}/p/${productId}`);
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByRole('status')).toContainText('Added');
}

async function buyerPage(browser: Browser): Promise<Page> {
  // A context of its own per buyer: separate cookie jars, separate sessions.
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  return context.newPage();
}

test.describe('storefront: a buyer in a real browser', () => {
  let nile: Seller;
  let delta: Seller;

  test.beforeAll(async ({ request }) => {
    nile = await seller(request, SEEDED_SELLERS.NILE.email);
    delta = await seller(request, SEEDED_SELLERS.DELTA.email);
  });

  test('Journey 1: buys from two sellers in one checkout and sees both orders', async ({ page, request }) => {
    const shirt = await stockedProduct(request, nile, { priceMinor: 24_900, available: 5 });
    const oil = await stockedProduct(request, delta, { priceMinor: 18_900, available: 5 });
    await signInTo(page, await newBuyer(request), '/browse');

    await expect(page.getByRole('link', { name: shirt.name })).toBeVisible();
    await addToCart(page, shirt.id);
    await addToCart(page, oil.id);

    await page.goto(`${WEB}/cart`);
    await expect(page.getByRole('region', { name: SEEDED_SELLERS.NILE.name })).toBeVisible();
    await expect(page.getByRole('region', { name: SEEDED_SELLERS.DELTA.name })).toBeVisible();

    await page.getByRole('link', { name: 'Review order' }).click();
    await expect(page.getByText(/Total .*438\.00/)).toBeVisible();
    await page.getByRole('button', { name: 'Place order' }).click();

    await expect(page).toHaveURL(/\/orders\/[^/]+\/placed$/);
    await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible();
    await expect(page.getByText(/2 orders in one checkout/)).toBeVisible();

    await page.goto(`${WEB}/account/orders`);
    await expect(page.getByRole('link', { name: SEEDED_SELLERS.NILE.name })).toBeVisible();
    await expect(page.getByRole('link', { name: SEEDED_SELLERS.DELTA.name })).toBeVisible();
    expect(await availableOf(request, nile, shirt.id)).toBe(4);
  });

  test('Journey 2: two buyers want the last unit — one wins, the other is back at the cart, flagged', async ({
    browser,
    request,
  }) => {
    const lamp = await stockedProduct(request, nile, { priceMinor: 9_900, available: 1 });
    const first = await buyerPage(browser);
    const second = await buyerPage(browser);
    await signInTo(first, await newBuyer(request), '/browse');
    await signInTo(second, await newBuyer(request), '/browse');

    for (const page of [first, second]) {
      await addToCart(page, lamp.id);
      await page.goto(`${WEB}/checkout`);
      await expect(page.getByRole('button', { name: 'Place order' })).toBeEnabled();
    }

    await first.getByRole('button', { name: 'Place order' }).click();
    await expect(first).toHaveURL(/\/placed$/);

    await second.getByRole('button', { name: 'Place order' }).click();
    await expect(second).toHaveURL(/\/cart\?conflict=lines$/);
    await expect(second.getByRole('alert')).toContainText(/changed/i);
    await expect(second.getByText('Sold out')).toBeVisible();

    // Nothing was created for the loser (D57).
    await second.goto(`${WEB}/account/orders`);
    await expect(second.getByText(/no orders yet/i)).toBeVisible();
    expect(await availableOf(request, nile, lamp.id)).toBe(0);
  });

  test('an abandoned checkout is cancelled by the worker process and restocked exactly once (D70)', async ({
    request,
  }) => {
    test.setTimeout(90_000);
    const kettle = await stockedProduct(request, nile, { priceMinor: 5_000, available: 2 });
    const email = await newBuyer(request);
    const token = await login(request, email);

    expect((await request.put(`${API}/cart/items/${kettle.id}`, { headers: bearer(token), data: { quantity: 2 } })).status()).toBe(200);
    const placed = await request.post(`${API}/checkouts`, {
      headers: bearer(token),
      data: { lines: [{ productId: kettle.id, quantity: 2, unitPriceMinor: 5_000 }] },
    });
    expect(placed.status()).toBe(201);
    const orderId = ((await placed.json()) as { orders: { id: string }[] }).orders[0].id;
    expect(await availableOf(request, nile, kettle.id)).toBe(0);

    // The stack's window is 20 s and its interval 1 s (D87): cancelled well inside 60 s.
    await expect
      .poll(
        async () =>
          ((await (await request.get(`${API}/buyer/orders/${orderId}`, { headers: bearer(token) })).json()) as { status: string })
            .status,
        { timeout: 60_000, intervals: [1_000] },
      )
      .toBe('CANCELLED');
    expect(await availableOf(request, nile, kettle.id)).toBe(2);

    // Several more runs pass; the stock must not rise again (INV-15).
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    expect(await availableOf(request, nile, kettle.id)).toBe(2);

    // And it was the worker process that did it, in its own log.
    const runs = serviceLogs('worker')
      .split('\n')
      .filter((line) => line.includes('"event":"checkout.autocancel.run"'))
      .map((line) => JSON.parse(line) as { cancelled: number });
    expect(runs.some((run) => run.cancelled >= 1)).toBe(true);
  });
});
