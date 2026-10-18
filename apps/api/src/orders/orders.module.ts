import { Module } from '@nestjs/common';
import { createLogger } from '@app/runtime';
import { BuyerOrdersController } from './buyer-orders.controller';
import { BuyerOrdersService } from './buyer-orders.service';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { ORDERS_LOGGER } from './orders.constants';
import { BuyerOrdersRepository } from './repositories/buyer-orders.repository';
import { CheckoutRepository } from './repositories/checkout.repository';

@Module({
  controllers: [CheckoutController, BuyerOrdersController],
  providers: [
    { provide: ORDERS_LOGGER, useFactory: () => createLogger('orders') },
    CheckoutRepository,
    CheckoutService,
    BuyerOrdersRepository,
    BuyerOrdersService,
  ],
})
export class OrdersModule {}
