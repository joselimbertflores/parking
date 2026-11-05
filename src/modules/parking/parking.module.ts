import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParkingHoliday } from './entities/parking-holidays.entity.js';
import { ParkingRate } from './entities/parking-rates.entity.js';
import { ParkingSchedule } from './entities/parking-schedules.entity.js';
import { ParkingSegment } from './entities/parking-segments.entity.js';
import { ParkingSession } from './entities/parking-sessions.entity.js';
import { ParkingSegmentsController } from './controllers/parking-segments.controller.js';
import { ParkingSegmentsService } from './services/parking-segments.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ParkingSegment,
      ParkingRate,
      ParkingSchedule,
      ParkingHoliday,
      ParkingSession,
    ]),
  ],
  controllers: [ParkingSegmentsController],
  providers: [ParkingSegmentsService],
})
export class ParkingModule {}
