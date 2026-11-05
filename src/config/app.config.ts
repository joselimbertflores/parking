import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { EnvironmentVariables } from './env.validation.js';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<EnvironmentVariables>);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors({
    origin: config.getOrThrow('FRONTEND_ORIGIN', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

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
}
