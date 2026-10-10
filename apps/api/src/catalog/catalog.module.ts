import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogRepository } from './repositories/catalog.repository';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogRepository, CatalogService],
})
export class CatalogModule {}
