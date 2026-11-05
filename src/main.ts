import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './config/app.config.js';
import type { EnvironmentVariables } from './config/env.validation.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<EnvironmentVariables>);
  configureApp(app);
  await app.listen(config.getOrThrow('PORT', { infer: true }), '0.0.0.0');
}
await bootstrap();
