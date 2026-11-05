import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateParkingSegmentDto } from '../dto/create-parking-segment.dto.js';
import { UpdateParkingSegmentDto } from '../dto/update-parking-segment.dto.js';
import { ParkingSegment } from '../entities/parking-segments.entity.js';

@Injectable()
export class ParkingSegmentsService {
  constructor(
    @InjectRepository(ParkingSegment)
    private readonly parkingSegmentsRepository: Repository<ParkingSegment>,
  ) {}

  findAll(): Promise<ParkingSegment[]> {
    return this.parkingSegmentsRepository.find({ order: { id: 'ASC' } });
  }

  async findOne(id: number): Promise<ParkingSegment> {
    const segment = await this.parkingSegmentsRepository.findOneBy({ id });
    if (!segment) {
      throw new NotFoundException(`No existe el tramo ${id}.`);
    }
    return segment;
  }

  create(dto: CreateParkingSegmentDto): Promise<ParkingSegment> {
    const segment = this.parkingSegmentsRepository.create(dto);
    segment.side ??= null;
    return this.save(segment);
  }

  async update(
    id: number,
    dto: UpdateParkingSegmentDto,
  ): Promise<ParkingSegment> {
    const segment = await this.findOne(id);
    this.parkingSegmentsRepository.merge(segment, dto);
    return this.save(segment);
  }

  async remove(id: number): Promise<void> {
    const segment = await this.findOne(id);
    segment.active = false;
    await this.save(segment);
  }

  private async save(segment: ParkingSegment): Promise<ParkingSegment> {
    try {
      return await this.parkingSegmentsRepository.save(segment);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const { code } = error.driverError as { code?: string };
        if (code === '23505') {
          throw new ConflictException('Ya existe un tramo con ese código.');
        }
        if (code === '23503') {
          throw new ConflictException('El tramo tiene registros asociados.');
        }
      }
      throw error;
    }
  }
}
