import type { INestApplication, LoggerService } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ZodValidationPipe, cleanupOpenApiDoc } from 'nestjs-zod';
import { createLogger, requestIdMiddleware, requestLoggerMiddleware, validateEnv } from '@app/runtime';
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

/**
 * Documentation only. Nothing reads this at build time — there is no generated
 * client, and the contract lives in packages/contracts.
 *
 * Shared with the e2e harness so "Swagger describes the contract" is a tested
 * claim rather than one verified by hand once. A route that ships without a
 * documented response becomes visible in the suite.
 */
export function configureSwagger(app: INestApplication): void {
  const env = validateEnv();
  const document = cleanupOpenApiDoc(
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle(`${env.APP_NAME} API`)
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    ),
  );
  SwaggerModule.setup('docs', app, document);
}
