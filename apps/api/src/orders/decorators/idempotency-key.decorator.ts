import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { IDEMPOTENCY_KEY_HEADER, IdempotencyKeySchema } from '@app/contracts';
import { ZodValidationPipe } from 'nestjs-zod';

/**
 * `Idempotency-Key`, validated the way the body is (SRS-FR-CHK-008).
 *
 * `@Headers(name)` takes no pipe in Nest 11 — it is declared `(property?: string) =>
 * ParameterDecorator`, and pipes bind to a route parameter's metadata, not to a header's —
 * so this decorator does for one header what the global `ZodValidationPipe` does for a
 * body: it runs the contract schema through the very same pipe class. A missing or
 * malformed key therefore leaves as the identical `400 VALIDATION_ERROR` envelope with the
 * schema's `issues` as `details`, and the rule for the header lives in one place: the
 * schema `@app/contracts` exports, which the API validates with, the browser mints to, and
 * the database repeats as a CHECK.
 *
 * Node lowercases every incoming header name (`x-organization-id` was written lowercase for
 * that reason), while this constant is written the way HTTP writes it — so it is lowercased
 * to find the value.
 */
const pipe = new ZodValidationPipe(IdempotencyKeySchema);

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const raw = context
      .switchToHttp()
      .getRequest<Request>().headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()];
    return pipe.transform(Array.isArray(raw) ? raw[0] : raw, {
      type: 'custom',
      data: IDEMPOTENCY_KEY_HEADER,
    });
  },
);
