import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import type { PublicProduct, PublicProductPage } from '@app/contracts';
import { TenantFree } from '../security/decorators/tenant-free.decorator';
import { PageQueryDto, PublicProductDto, PublicProductPageDto } from './dto/storefront.dto';
import { StorefrontService } from './storefront.service';

/** Signed-in, tenant-free (SRS §5): any user reads the public catalog. */
@Controller('storefront/products')
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Get()
  @TenantFree()
  @ApiOkResponse({ type: PublicProductPageDto })
  list(@Query() query: PageQueryDto): Promise<PublicProductPage> {
    return this.storefrontService.list(query.cursor);
  }

  @Get(':id')
  @TenantFree()
  @ApiOkResponse({ type: PublicProductDto })
  findOne(@Param('id') id: string): Promise<PublicProduct> {
    return this.storefrontService.findOne(id);
  }
}
