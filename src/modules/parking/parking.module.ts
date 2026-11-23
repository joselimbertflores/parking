import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParkingControlController } from './controllers/parking-control.controller.js';
import { ParkingPurchaseController } from './controllers/parking-purchase.controller.js';
import { ParkingSegmentsController } from './controllers/parking-segments.controller.js';
import { ParkingHoliday } from './entities/parking-holidays.entity.js';
import { ParkingRate } from './entities/parking-rates.entity.js';
import { ParkingSchedule } from './entities/parking-schedules.entity.js';
import { ParkingSegment } from './entities/parking-segments.entity.js';
import { ParkingSession } from './entities/parking-sessions.entity.js';
import { ParkingControlService } from './services/parking-control.service.js';
import { ParkingPurchaseService } from './services/parking-purchase.service.js';
import { ParkingSegmentsService } from './services/parking-segments.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ParkingSegment, ParkingRate, ParkingSchedule, ParkingHoliday, ParkingSession])],
  controllers: [ParkingSegmentsController, ParkingPurchaseController, ParkingControlController],
  providers: [ParkingSegmentsService, ParkingPurchaseService, ParkingControlService],
  exports: [ParkingPurchaseService, ParkingSegmentsService],
})
export class ParkingModule {}
