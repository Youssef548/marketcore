import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogRepository } from './repositories/catalog.repository';
import { InventoryRepository } from './repositories/inventory.repository';
import { CatalogService } from './catalog.service';

// InventoryRepository is exported so the checkout transaction can decrement stock
// through the module that owns it (D93).
@Module({
  controllers: [CatalogController],
  providers: [CatalogRepository, InventoryRepository, CatalogService],
  exports: [InventoryRepository],
})
export class CatalogModule {}
