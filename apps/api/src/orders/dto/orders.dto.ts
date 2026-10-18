import { createZodDto } from 'nestjs-zod';
import { CheckoutSchema, CreateCheckoutRequestSchema } from '@app/contracts';

export class CreateCheckoutRequestDto extends createZodDto(CreateCheckoutRequestSchema) {}
export class CheckoutDto extends createZodDto(CheckoutSchema) {}
