import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import type { Inventory, Product } from '@app/contracts';
import type { TenantContext } from '@app/domain';
import { Tenant } from '../security/decorators/tenant.decorator';
import {
  CreateProductRequestDto,
  InventoryDto,
  ProductDto,
  UpdateProductRequestDto,
} from './catalog.dto';
import { CatalogService } from './catalog.service';

/** Every route here is tenant-scoped: the header is resolved by the guard, not read here. */
@Controller('products')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  @ApiCreatedResponse({ type: ProductDto })
  create(@Tenant() tenant: TenantContext, @Body() body: CreateProductRequestDto): Promise<Product> {
    return this.catalogService.create(tenant, body);
  }

  @Get()
  @ApiOkResponse({ type: [ProductDto] })
  list(@Tenant() tenant: TenantContext): Promise<Product[]> {
    return this.catalogService.list(tenant);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProductDto })
  findOne(@Tenant() tenant: TenantContext, @Param('id') id: string): Promise<Product> {
    return this.catalogService.findOne(tenant, id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  update(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateProductRequestDto,
  ): Promise<void> {
    return this.catalogService.update(tenant, id, body);
  }

  /** Explicit transitions rather than PATCH { status }, so an illegal move is a 409. */
  @Post(':id/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  publish(@Tenant() tenant: TenantContext, @Param('id') id: string): Promise<void> {
    return this.catalogService.publish(tenant, id);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  unpublish(@Tenant() tenant: TenantContext, @Param('id') id: string): Promise<void> {
    return this.catalogService.unpublish(tenant, id);
  }

  @Get(':id/inventory')
  @ApiOkResponse({ type: InventoryDto })
  inventory(@Tenant() tenant: TenantContext, @Param('id') id: string): Promise<Inventory> {
    return this.catalogService.inventory(tenant, id);
  }
}
