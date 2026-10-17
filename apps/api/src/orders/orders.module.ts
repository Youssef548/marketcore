import { Module } from '@nestjs/common';
import { createLogger } from '@app/runtime';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { ORDERS_LOGGER } from './orders.constants';
import { CheckoutRepository } from './repositories/checkout.repository';

@Module({
  controllers: [CheckoutController],
  providers: [
    { provide: ORDERS_LOGGER, useFactory: () => createLogger('orders') },
    CheckoutRepository,
    CheckoutService,
  ],
})
export class OrdersModule {}
