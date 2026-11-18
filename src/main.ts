import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import type { EnvironmentVariables } from './config/env.validation.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<EnvironmentVariables>);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  const frontendOrigin = config.get('FRONTEND_ORIGIN', { infer: true });
  if (frontendOrigin) {
    app.enableCors({
      origin: new URL(frontendOrigin).origin,
      credentials: true,
    });
  }

  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const options = new DocumentBuilder()
      .setTitle('Parking API')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, options);
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs-json',
      raw: ['json'],
    });
  }

  await app.listen(config.getOrThrow('PORT', { infer: true }), '0.0.0.0');
}
await bootstrap();
