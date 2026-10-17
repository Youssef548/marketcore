import { Module } from '@nestjs/common';
import { StorefrontRepository } from './repositories/storefront.repository';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';

@Module({
  controllers: [StorefrontController],
  providers: [StorefrontRepository, StorefrontService],
})
export class StorefrontModule {}
