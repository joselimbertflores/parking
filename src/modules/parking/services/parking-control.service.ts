import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type {
  ParkingVerificationDto,
  ParkingVerificationQueryDto,
} from '../dto/parking-control.dto.js';
import { ParkingSession } from '../entities/parking-sessions.entity.js';

@Injectable()
export class ParkingControlService {
  constructor(
    @InjectRepository(ParkingSession)
    private readonly sessions: Repository<ParkingSession>,
  ) {}

  async verify({
    plate,
    segmentId,
  }: ParkingVerificationQueryDto): Promise<ParkingVerificationDto> {
    const now = new Date();
    const sessions = await this.sessions
      .createQueryBuilder('session')
      .innerJoinAndSelect('session.parkingSegment', 'segment')
      .where('session.plate = :plate', { plate })
      .andWhere('session.parkingSegmentId = :segmentId', { segmentId })
      .andWhere('session.startsAt <= :now AND session.expiresAt > :now', {
        now,
      })
      .limit(2)
      .getMany();

    if (sessions.length > 1) {
      throw new ConflictException(
        'La placa tiene más de una sesión vigente en este tramo.',
      );
    }

    const [session] = sessions;
    return {
      plate,
      segmentId,
      session: session
        ? {
            id: session.id,
            plate: session.plate,
            segment: session.parkingSegment,
            vehicleType: session.vehicleType,
            startsAt: session.startsAt,
            expiresAt: session.expiresAt,
            remainingSeconds: Math.ceil(
              (session.expiresAt.getTime() - now.getTime()) / 1000,
            ),
          }
        : null,
    };
  }
}
