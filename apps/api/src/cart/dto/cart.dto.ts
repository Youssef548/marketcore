import { createZodDto } from 'nestjs-zod';
import { CartSchema, SetCartLineRequestSchema } from '@app/contracts';

export class CartDto extends createZodDto(CartSchema) {}
export class SetCartLineRequestDto extends createZodDto(SetCartLineRequestSchema) {}
