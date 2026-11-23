import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParkingModule } from '../parking/parking.module.js';
import { PaymentsController } from './controllers/payments.controller.js';
import { Payment } from './entities/payments.entity.js';
import { PaymentsService } from './services/payments.service.js';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Payment]), ParkingModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
