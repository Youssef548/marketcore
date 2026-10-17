import { createZodDto } from 'nestjs-zod';
import {
  CreateProductRequestSchema,
  InventorySchema,
  ProductSchema,
  SetInventoryRequestSchema,
  UpdateProductRequestSchema,
} from '@app/contracts';

export class CreateProductRequestDto extends createZodDto(CreateProductRequestSchema) {}
export class UpdateProductRequestDto extends createZodDto(UpdateProductRequestSchema) {}
export class ProductDto extends createZodDto(ProductSchema) {}
export class InventoryDto extends createZodDto(InventorySchema) {}
export class SetInventoryRequestDto extends createZodDto(SetInventoryRequestSchema) {}
