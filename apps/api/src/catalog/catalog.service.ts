import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ProductStatuses,
  type CurrencyCode,
  type Inventory,
  type Product,
  type ProductStatus,
} from '@app/contracts';
import {
  ProductTransitionOutcomes,
  planProductTransition,
  type TenantContext,
} from '@app/domain';
import { ProductMessages, ProductTransitionMessages } from './catalog.constants';
import { CatalogRepository } from './catalog.repository';

@Injectable()
export class CatalogService {
  constructor(private readonly catalogRepository: CatalogRepository) {}

  create(
    tenant: TenantContext,
    input: { name: string; priceMinor: number; currency: CurrencyCode },
  ): Promise<Product> {
    return this.catalogRepository.create(tenant, input);
  }

  list(tenant: TenantContext): Promise<Product[]> {
    return this.catalogRepository.listByTenant(tenant);
  }

  /**
   * 404 rather than 403. A resource identifier is a probe: answering 403 would
   * confirm that a product with that id exists in some other tenant, which is the
   * disclosure INV-9 forbids.
   */
  async findOne(tenant: TenantContext, id: string): Promise<Product> {
    const product = await this.catalogRepository.findById(tenant, id);
    if (product === null) throw new NotFoundException(ProductMessages.NOT_FOUND);
    return product;
  }

  async update(
    tenant: TenantContext,
    id: string,
    input: { name?: string; priceMinor?: number },
  ): Promise<void> {
    const updated = await this.catalogRepository.update(tenant, id, input);
    if (updated === 0) throw new NotFoundException(ProductMessages.NOT_FOUND);
  }

  publish(tenant: TenantContext, id: string): Promise<void> {
    return this.transition(tenant, id, ProductStatuses.PUBLISHED);
  }

  unpublish(tenant: TenantContext, id: string): Promise<void> {
    return this.transition(tenant, id, ProductStatuses.DRAFT);
  }

  async inventory(tenant: TenantContext, id: string): Promise<Inventory> {
    const inventory = await this.catalogRepository.findInventory(tenant, id);
    if (inventory === null) throw new NotFoundException(ProductMessages.NOT_FOUND);
    return inventory;
  }

  private async transition(tenant: TenantContext, id: string, to: ProductStatus): Promise<void> {
    const product = await this.catalogRepository.findById(tenant, id);
    if (product === null) throw new NotFoundException(ProductMessages.NOT_FOUND);

    // The rule is pure and lives in @app/domain, so both processes answer the same
    // way once the worker exists; this layer only turns the verdict into a status.
    const outcome = planProductTransition(product.status, to, product.priceMinor);
    if (outcome !== ProductTransitionOutcomes.ALLOWED) {
      throw new ConflictException(ProductTransitionMessages[outcome]);
    }

    await this.catalogRepository.updateStatus(tenant, id, to);
  }
}
