import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/runtime';
import type { CurrencyCode, Inventory, Product, ProductStatus } from '@app/contracts';
import { tenantScope, type TenantContext } from '@app/domain';

export interface ProductRecord {
  id: string;
  name: string;
  priceMinor: number;
  currency: CurrencyCode;
  status: ProductStatus;
}

/**
 * Every method takes a TenantContext, never a bare organization id, and every
 * `where` composes `tenantScope(tenant)`. The signature is the enforcement: a
 * tenant-scoped query cannot be written without a tenant, and the filter's shape
 * has exactly one definition.
 */
@Injectable()
export class CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Product and inventory commit together: a product with no stock row cannot be ordered. */
  async create(
    tenant: TenantContext,
    input: { name: string; priceMinor: number; currency: CurrencyCode },
  ): Promise<Product> {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          organizationId: tenant.organizationId,
          name: input.name,
          priceMinor: input.priceMinor,
          currency: input.currency,
        },
        select: { id: true, name: true, priceMinor: true, currency: true, status: true },
      });
      await tx.inventory.create({ data: { productId: product.id, available: 0, reserved: 0 } });
      return product;
    });
  }

  async listByTenant(tenant: TenantContext): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { ...tenantScope(tenant) },
      select: { id: true, name: true, priceMinor: true, currency: true, status: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(tenant: TenantContext, id: string): Promise<ProductRecord | null> {
    return this.prisma.product.findFirst({
      where: { id, ...tenantScope(tenant) },
      select: { id: true, name: true, priceMinor: true, currency: true, status: true },
    });
  }

  /**
   * `updateMany`, not `update`. `update` accepts only a unique where, so it could
   * not carry the tenant filter — the row would be written before anyone noticed
   * the tenant did not match. The affected count is what tells the caller whether
   * the product was visible in this tenant at all.
   */
  async update(
    tenant: TenantContext,
    id: string,
    input: { name?: string; priceMinor?: number },
  ): Promise<number> {
    const updated = await this.prisma.product.updateMany({
      where: { id, ...tenantScope(tenant) },
      data: input,
    });
    return updated.count;
  }

  async updateStatus(tenant: TenantContext, id: string, status: ProductStatus): Promise<number> {
    const updated = await this.prisma.product.updateMany({
      where: { id, ...tenantScope(tenant) },
      data: { status },
    });
    return updated.count;
  }

  async findInventory(tenant: TenantContext, productId: string): Promise<Inventory | null> {
    // The tenant filter goes through the relation, so inventory is never reachable
    // by product id alone.
    return this.prisma.inventory.findFirst({
      where: { productId, product: { ...tenantScope(tenant) } },
      select: { productId: true, available: true, reserved: true },
    });
  }
}
