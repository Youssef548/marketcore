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
  // CORS is registered inside configureApp, so the e2e harness installs the same
  // policy this process serves. Registering it here would make it untestable.
  configureApp(app);
  configureSwagger(app);

  await app.listen(env.PORT);
}
void bootstrap();
