import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payments.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Payment])],
})
export class PaymentsModule {}
