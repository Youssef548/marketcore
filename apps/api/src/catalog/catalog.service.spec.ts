import { ConflictException, NotFoundException } from '@nestjs/common';
import { MemberRoles, ProductStatuses } from '@app/contracts';
import { buildTenantContext } from '@app/domain';
import type { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';

const tenant = buildTenantContext('org_1', MemberRoles.OWNER);

const build = (findById: jest.Mock) =>
  new CatalogService({
    findById,
    create: jest.fn(),
    listByTenant: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    findInventory: jest.fn(),
  } as unknown as CatalogRepository);

const product = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'Dates',
  priceMinor: 100,
  currency: 'EGP',
  status: ProductStatuses.DRAFT,
  ...overrides,
});

describe('CatalogService', () => {
  it('answers NOT_FOUND for a product in another organization', async () => {
    // The repository returned null because its where clause carried the tenant.
    // The service must turn that into a 404, not a leak and not a 500.
    await expect(
      build(jest.fn().mockResolvedValue(null)).findOne(tenant, 'p1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the product when the tenant can see it', async () => {
    await expect(build(jest.fn().mockResolvedValue(product())).findOne(tenant, 'p1')).resolves.toMatchObject(
      { id: 'p1', name: 'Dates' },
    );
  });

  it('refuses to publish an unpriced product', async () => {
    const unpriced = build(jest.fn().mockResolvedValue(product({ priceMinor: 0 })));

    await expect(unpriced.publish(tenant, 'p1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a transition to the state the product is already in', async () => {
    const published = build(jest.fn().mockResolvedValue(product({ status: ProductStatuses.PUBLISHED })));

    await expect(published.publish(tenant, 'p1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('publishes a priced draft and unpublishes a published product', async () => {
    const draft = build(jest.fn().mockResolvedValue(product()));
    const published = build(
      jest.fn().mockResolvedValue(product({ status: ProductStatuses.PUBLISHED })),
    );

    await expect(draft.publish(tenant, 'p1')).resolves.toBeUndefined();
    await expect(published.unpublish(tenant, 'p1')).resolves.toBeUndefined();
  });

  it('reports a product as missing when the tenant-scoped update matched no rows', async () => {
    // updateMany returns a count, so "not visible in this tenant" and "does not
    // exist" are the same answer — which is the point.
    const service = new CatalogService({
      update: jest.fn().mockResolvedValue(0),
    } as unknown as CatalogRepository);

    await expect(service.update(tenant, 'p1', { name: 'Stolen' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
