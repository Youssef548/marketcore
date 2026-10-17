import { createZodDto } from 'nestjs-zod';
import { PageQuerySchema, PublicProductPageSchema, PublicProductSchema } from '@app/contracts';

export class PageQueryDto extends createZodDto(PageQuerySchema) {}
export class PublicProductDto extends createZodDto(PublicProductSchema) {}
export class PublicProductPageDto extends createZodDto(PublicProductPageSchema) {}
