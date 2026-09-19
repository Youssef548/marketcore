import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, configureSwagger } from './app.setup';
import { createLogger, validateEnv } from '@app/runtime';

async function bootstrap() {
  // Validate before anything else, so a bad deploy fails at boot with a list of
  // what is wrong rather than deep inside the first request.
  const env = validateEnv();

  const app = await NestFactory.create(AppModule, { logger: createLogger('api') });
  configureApp(app);
  configureSwagger(app);
  app.enableCors({ origin: env.WEB_URL.split(','), credentials: true });

  await app.listen(env.PORT);
}
void bootstrap();
