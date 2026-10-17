import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/runtime';
import { NEWEST_FIRST } from '../../common/pagination/pagination.constants';
import type { PublicProductRow } from '../interfaces/public-product.interface';
import { PUBLIC_PRODUCT_SELECT, PUBLIC_PRODUCT_WHERE } from '../storefront.constants';

/**
 * The public read path (ADR 010 amendment). It takes no TenantContext because a
 * published product is public by design (INV-9 as narrowed); what keeps it safe
 * is PUBLIC_PRODUCT_WHERE here and the strict schema in the mapper.
 */
@Injectable()
export class StorefrontRepository {
  constructor(private readonly prisma: PrismaService) {}

  listPublished(cursor: string | undefined, size: number): Promise<PublicProductRow[]> {
    return this.prisma.product.findMany({
      where: PUBLIC_PRODUCT_WHERE,
      select: PUBLIC_PRODUCT_SELECT,
      orderBy: [...NEWEST_FIRST],
      take: size + 1,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    });
  }

  findPublished(id: string): Promise<PublicProductRow | null> {
    return this.prisma.product.findFirst({
      where: { id, ...PUBLIC_PRODUCT_WHERE },
      select: PUBLIC_PRODUCT_SELECT,
    });
  }
}
