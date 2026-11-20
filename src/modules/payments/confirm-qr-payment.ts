import { NestFactory } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { PaymentsService } from './services/payments.service.js';

async function confirmFromCommandLine() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('La confirmación simulada requiere NODE_ENV=development.');
  }

  const id = process.argv[2];
  if (!id || !isUUID(id)) {
    throw new Error('Uso: npm run payment:confirm -- <uuid>');
  }

  const { AppModule } = await import('../../app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
    abortOnError: false,
  });
  try {
    const payment = await app.get(PaymentsService).confirmQrPayment(id);
    console.log(JSON.stringify(payment, null, 2));
  } finally {
    await app.close();
  }
}

try {
  await confirmFromCommandLine();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
