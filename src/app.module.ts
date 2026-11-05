import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { envValidationSchema } from './config/env.validation.js';
import type { EnvironmentVariables } from './config/env.validation.js';
import { ParkingModule } from './modules/parking/parking.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables>) => ({
        type: 'postgres',
        url: config.getOrThrow('DATABASE_URL', { infer: true }),
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV', { infer: true }) === 'development',
      }),
    }),
    ParkingModule,
    PaymentsModule,
    UsersModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
