import { Module } from '@nestjs/common';
import { createLogger } from '@app/runtime';
import { OrdersModule } from '../orders/orders.module';
import { PaymentService } from './payment.service';
import { PaymentsController } from './payments.controller';
import { PAYMENTS_LOGGER, PAYMENT_PROVIDER, PROVIDER_CHARGE_STORE } from './payments.constants';
import { PaymentRepository } from './repositories/payment.repository';
import { ProviderChargeRepository } from './repositories/provider-charge.repository';
import { SimulatorPaymentProvider } from './simulator-payment.provider';

/**
 * The payment boundary (phase 6).
 *
 * The port is provided under a token and the simulator sits behind it, so phase 7 replaces
 * one binding with a Stripe adapter and nothing above notices. Both are exported: the
 * capture (task 4) needs the port, and the integration suite needs the store to write
 * around the adapter.
 */
@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [
    { provide: PAYMENTS_LOGGER, useFactory: () => createLogger('payments') },
    ProviderChargeRepository,
    { provide: PROVIDER_CHARGE_STORE, useExisting: ProviderChargeRepository },
    SimulatorPaymentProvider,
    { provide: PAYMENT_PROVIDER, useExisting: SimulatorPaymentProvider },
    PaymentRepository,
    PaymentService,
  ],
  exports: [PAYMENT_PROVIDER, PROVIDER_CHARGE_STORE, ProviderChargeRepository, PaymentService],
})
export class PaymentsModule {}
