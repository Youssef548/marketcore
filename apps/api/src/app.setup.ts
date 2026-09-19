import type { INestApplication, LoggerService } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { createLogger, requestIdMiddleware, requestLoggerMiddleware } from '@app/runtime';
import { ErrorEnvelopeFilter } from './filters/error-envelope.filter';

/**
 * The one place global HTTP behaviour is configured.
 *
 * main.ts and the e2e harnesses both call this. A global registered only in
 * main.ts is not installed in tests, so a test that boots a differently
 * configured app proves less than it appears to — the first e2e assertion about
 * request ids failed for exactly this reason.
 */
export function configureApp(
  app: INestApplication,
  logger: LoggerService = createLogger('http'),
): void {
  app.setGlobalPrefix('api/v1');
  // The id first, so every later stage — including the request log, a validation
  // rejection and the error envelope — can be correlated to it.
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware((fields) => logger.log('http.request.completed', fields)));
  // Every request body/query/param built from a contract schema is validated
  // here, before a handler runs.
  app.useGlobalPipes(new ZodValidationPipe());
  // Every uncaught failure leaves through here, in one shape.
  app.useGlobalFilters(new ErrorEnvelopeFilter());
}
