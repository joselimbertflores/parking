import { ConflictException, NotFoundException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, QueryFailedError, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';

import type { CreateParkingSegmentDto, UpdateParkingSegmentDto } from '../dto/parking-segment.dto.js';

import { ParkingSegment } from '../entities/parking-segments.entity.js';

@Injectable()
export class ParkingSegmentsService {
  constructor(
    @InjectRepository(ParkingSegment)
    private parkingSegmentsRepository: Repository<ParkingSegment>,
  ) {}

  findAll() {
    return this.parkingSegmentsRepository.find({ order: { id: 'ASC' } });
  }

  async searchActive(search?: string) {
    if (!search)
      return await this.parkingSegmentsRepository.find({
        where: { active: true },
        order: { streetName: 'ASC' },
      });

    const escapedTerm = search.replace(/[\\%_]/g, '\\$&');
    const pattern = ILike(`%${escapedTerm}%`);

    return this.parkingSegmentsRepository.find({
      where: [
        { active: true, code: pattern },
        { active: true, streetName: pattern },
      ],
      order: { streetName: 'ASC' },
      take: 20,
    });
  }

  async findActiveByCode(code: string) {
    const segment = await this.parkingSegmentsRepository.findOneBy({
      code: code.toUpperCase(),
      active: true,
    });
    if (!segment) {
      throw new NotFoundException('Tramo inexistente o inactivo.');
    }
    return segment;
  }

  async requireActive(id: number) {
    const active = await this.parkingSegmentsRepository.existsBy({ id, active: true });
    if (!active) {
      throw new NotFoundException(`No existe el tramo activo ${id}.`);
    }
  }

  async lockForSessionCreation(id: number, manager: EntityManager) {
    const segment = await manager.findOne(ParkingSegment, {
      select: { id: true },
      where: { id },
      lock: { mode: 'for_no_key_update' },
    });
    if (!segment) {
      throw new NotFoundException(`No existe el tramo ${id}.`);
    }
  }

  create(dto: CreateParkingSegmentDto) {
    const segment = this.parkingSegmentsRepository.create(dto);
    return this.save(segment);
  }

  async update(id: number, dto: UpdateParkingSegmentDto) {
    const segment = await this.findOne(id);
    this.parkingSegmentsRepository.merge(segment, dto);
    return this.save(segment);
  }

  async remove(id: number) {
    try {
      const result = await this.parkingSegmentsRepository.delete(id);
      if (!result.affected) {
        throw new NotFoundException(`No existe el tramo ${id}.`);
      }
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const { code } = error.driverError as { code?: string };
        if (code === '23503') throw new ConflictException('No se puede eliminar un tramo con registros asociados.');
      }
      throw error;
    }
  }

  private async findOne(id: number) {
    const segment = await this.parkingSegmentsRepository.findOneBy({ id });
    if (!segment) throw new NotFoundException(`No existe el tramo ${id}.`);
    return segment;
  }

  private async save(segment: ParkingSegment) {
    try {
      return await this.parkingSegmentsRepository.save(segment);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const { code } = error.driverError as { code?: string };
        if (code === '23505') {
          throw new ConflictException('Ya existe un tramo con ese código.');
        }
      }
      throw error;
    }
  }
}
