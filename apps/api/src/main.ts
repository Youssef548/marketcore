import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { createLogger, validateEnv } from '@app/runtime';

async function bootstrap() {
  // Validate before anything else, so a bad deploy fails at boot with a list of
  // what is wrong rather than deep inside the first request.
  const env = validateEnv();

  const app = await NestFactory.create(AppModule, { logger: createLogger('api') });
  configureApp(app);
  app.enableCors({ origin: env.WEB_URL.split(','), credentials: true });

  // Documentation only. Nothing reads this at build time — there is no
  // generated client, and the contract lives in packages/contracts.
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

  await app.listen(env.PORT);
}
void bootstrap();
