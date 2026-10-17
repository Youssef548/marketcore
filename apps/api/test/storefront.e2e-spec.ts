import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  ErrorCodes,
  OrganizationStatuses,
  PublicProductPageSchema,
  PublicProductSchema,
  STOREFRONT_PAGE_SIZE,
  type PublicProduct,
} from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { expectContract } from './support/contracts';
import { testPrisma } from './support/db';
import {
  newTenant,
  productPayload,
  publishedProduct,
  registerAndLogin,
  tenantHeaders,
  unique,
} from './support/fixtures';
import { bearer, createProduct, createSeller } from './support/marketplace';

/**
 * AC-US-CAT-001-1/-2, AC-US-CAT-002-1, SRS-NFR-SEC-001.
 *
 * The suites share one database, so "exactly the two published products appear"
 * is asserted over this suite's two sellers — every other suite's published
 * products are legitimately public too (finding 19).
 */
describe('public catalog (e2e)', () => {
  let app: INestApplication;
  let buyerToken: string;
  let sellerA: Awaited<ReturnType<typeof newTenant>>;
  let sellerB: Awaited<ReturnType<typeof newTenant>>;
  const published: { id: string; name: string }[] = [];
  const drafts: { id: string; name: string }[] = [];

  const server = () => app.getHttpServer();
  const PUBLIC_KEYS = ['available', 'currency', 'id', 'name', 'priceMinor', 'seller'];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    sellerA = await newTenant(app, 'shopa');
    sellerB = await newTenant(app, 'shopb');
    // A buyer is a user with no membership at all (D53).
    buyerToken = await registerAndLogin(app, `${unique('buyer')}@marketcore.test`);

    for (const seller of [sellerA, sellerB]) {
      published.push(await publishedProduct(app, seller, { available: 1 }));
      const draft = await request(server())
        .post('/api/v1/products')
        .set(tenantHeaders(seller.accessToken, seller.organizationId))
        .send(productPayload({ name: unique('secret-draft') }))
        .expect(201);
      drafts.push({ id: draft.body.id, name: draft.body.name });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const list = (cursor?: string) =>
    request(server())
      .get('/api/v1/storefront/products')
      .query(cursor === undefined ? {} : { cursor })
      .set(bearer(buyerToken))
      .expect(200);

  it("lists both sellers' published products and neither draft (AC-US-CAT-001-1)", async () => {
    const res = await list();
    const page = expectContract(PublicProductPageSchema, res.body);
    const ours = page.items.filter((item) => [sellerA.slug, sellerB.slug].includes(item.seller.slug));

    expect(ours.map((item) => item.id).sort()).toEqual(published.map((p) => p.id).sort());
    expect(JSON.stringify(res.body)).not.toContain('secret-draft');
  });

  it('answers 404 for a draft by id, without its name (AC-US-CAT-001-2)', async () => {
    const res = await request(server())
      .get(`/api/v1/storefront/products/${drafts[0].id}`)
      .set(bearer(buyerToken))
      .expect(404);

    expect(res.body.error.code).toBe(ErrorCodes.NOT_FOUND);
    expect(JSON.stringify(res.body)).not.toContain(drafts[0].name);
  });

  it('shows stock 1 and the seller name (AC-US-CAT-002-1)', async () => {
    const res = await request(server())
      .get(`/api/v1/storefront/products/${published[0].id}`)
      .set(bearer(buyerToken))
      .expect(200);

    const product: PublicProduct = expectContract(PublicProductSchema, res.body);
    expect(product.available).toBe(1);
    expect(product.seller).toEqual({ name: 'shopa co', slug: sellerA.slug });
  });

  it('returns exactly the public keys, nothing more (SRS-NFR-SEC-001)', async () => {
    const res = await request(server())
      .get(`/api/v1/storefront/products/${published[0].id}`)
      .set(bearer(buyerToken))
      .expect(200);

    expect(Object.keys(res.body).sort()).toEqual(PUBLIC_KEYS);
    expect(Object.keys(res.body.seller).sort()).toEqual(['name', 'slug']);
  });

  it("hides an inactive organization's products from the list and by id", async () => {
    const inactive = await createSeller('inactive');
    const product = await createProduct(inactive.organizationId);
    await testPrisma.organization.update({
      where: { id: inactive.organizationId },
      data: { status: OrganizationStatuses.DISABLED },
    });

    await request(server())
      .get(`/api/v1/storefront/products/${product.id}`)
      .set(bearer(buyerToken))
      .expect(404);
    const res = await list();
    expect(res.body.items.some((item: PublicProduct) => item.id === product.id)).toBe(false);
  });

  it('pages 24 at a time, newest first, without overlap (SRS-FR-CAT-001)', async () => {
    const seller = await createSeller('paging');
    const created: string[] = [];
    for (let i = 0; i <= STOREFRONT_PAGE_SIZE; i++) {
      created.push((await createProduct(seller.organizationId)).id);
    }

    const first = expectContract(PublicProductPageSchema, (await list()).body);
    expect(first.items).toHaveLength(STOREFRONT_PAGE_SIZE);
    expect(first.nextCursor).not.toBeNull();

    const second = expectContract(PublicProductPageSchema, (await list(first.nextCursor!)).body);
    const firstIds = first.items.map((item) => item.id);
    expect(second.items.some((item) => firstIds.includes(item.id))).toBe(false);
    // The 25 just created are the newest rows: 24 on page one, the 25th first on page two.
    expect([...firstIds, second.items[0].id].sort()).toEqual([...created].sort());
  });

  it('requires a signed-in user (SRS §5)', async () => {
    await request(server()).get('/api/v1/storefront/products').expect(401);
  });
});
