import { createZodDto } from 'nestjs-zod';
import {
  BuyerOrderPageSchema,
  BuyerOrderSchema,
  CheckoutSchema,
  CreateCheckoutRequestSchema,
} from '@app/contracts';

export class CreateCheckoutRequestDto extends createZodDto(CreateCheckoutRequestSchema) {}
export class CheckoutDto extends createZodDto(CheckoutSchema) {}
export class BuyerOrderPageDto extends createZodDto(BuyerOrderPageSchema) {}
export class BuyerOrderDto extends createZodDto(BuyerOrderSchema) {}
