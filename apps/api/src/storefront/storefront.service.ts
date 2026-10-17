import { Injectable, NotFoundException } from '@nestjs/common';
import { STOREFRONT_PAGE_SIZE, type PublicProduct, type PublicProductPage } from '@app/contracts';
import { toPage } from '../common/pagination/page';
import { toPublicProduct } from './public-product.mapper';
import { StorefrontRepository } from './repositories/storefront.repository';
import { StorefrontMessages } from './storefront.constants';

@Injectable()
export class StorefrontService {
  constructor(private readonly storefrontRepository: StorefrontRepository) {}

  async list(cursor: string | undefined): Promise<PublicProductPage> {
    const rows = await this.storefrontRepository.listPublished(cursor, STOREFRONT_PAGE_SIZE);
    return toPage(rows, STOREFRONT_PAGE_SIZE, toPublicProduct);
  }

  /** A draft, an unknown id and an inactive seller's product answer alike (SRS-FR-CAT-002). */
  async findOne(id: string): Promise<PublicProduct> {
    const row = await this.storefrontRepository.findPublished(id);
    if (row === null) throw new NotFoundException(StorefrontMessages.NOT_FOUND);
    return toPublicProduct(row);
  }
}
