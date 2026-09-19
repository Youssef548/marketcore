import { createZodDto } from 'nestjs-zod';
import { HealthSchema, ReadinessSchema } from '@app/contracts';

// DTOs exist only to give Swagger a named component for the response. The
// schema itself lives in @app/contracts, which is the source of truth.
export class HealthDto extends createZodDto(HealthSchema) {}
export class ReadinessDto extends createZodDto(ReadinessSchema) {}
