import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type { ParkingPurchaseOptionDto } from '../dto/parking-purchase.dto.js';
import { ParkingRate } from '../entities/parking-rates.entity.js';
import { calculateParkingAmount, parkingWindows } from '../parking-purchase.js';
import { getRemainingParkingSchedule } from '../parking-schedule.js';
import type { ChargeableInterval } from '../parking-schedule.js';
import { ParkingSegmentsService } from './parking-segments.service.js';

@Injectable()
export class ParkingPurchaseService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly parkingSegmentsService: ParkingSegmentsService,
  ) {}

  async getOptions(parkingSegmentId: number) {
    const { intervals } = await this.getPurchaseTime(parkingSegmentId);
    if (!intervals.length) {
      return [];
    }

    const { amount: blockAmount, intervalMinutes } = await this.getRate(this.dataSource.manager);
    const options: ParkingPurchaseOptionDto[] = [];
    for (const { durationMinutes, expiresAt } of parkingWindows(intervals, intervalMinutes)) {
      const amount = calculateParkingAmount(blockAmount, durationMinutes / intervalMinutes);
      options.push({ durationMinutes, amount, expiresAt });
    }
    return options;
  }

  async getQuote(
    parkingSegmentId: number,
    durationMinutes: number,
    manager: EntityManager,
    lockMode?: 'for_no_key_update',
  ) {
    const { startsAt, intervals } = await this.getPurchaseTime(parkingSegmentId, manager, lockMode);
    if (!intervals.length) {
      throw new ConflictException('En este momento no hay horario de cobro.');
    }
    const { amount: blockAmount, intervalMinutes } = await this.getRate(manager);
    if (durationMinutes % intervalMinutes !== 0) {
      throw new BadRequestException('La duración debe ser un múltiplo de los minutos por bloque.');
    }
    const window = this.requireWindow(intervals, intervalMinutes, durationMinutes);
    const amount = calculateParkingAmount(blockAmount, durationMinutes / intervalMinutes);
    return { startsAt, ...window, amount, intervalMinutes };
  }

  async getSessionWindow(
    parkingSegmentId: number,
    durationMinutes: number,
    intervalMinutes: number,
    manager: EntityManager,
  ) {
    const { startsAt, intervals } = await this.getPurchaseTime(parkingSegmentId, manager, 'for_no_key_update');
    return { startsAt, ...this.requireWindow(intervals, intervalMinutes, durationMinutes) };
  }

  private async getPurchaseTime(parkingSegmentId: number, manager?: EntityManager, lockMode?: 'for_no_key_update') {
    await this.parkingSegmentsService.requireActive(parkingSegmentId, manager, lockMode);
    const startsAt = new Date();
    const intervals = await getRemainingParkingSchedule(startsAt, manager ?? this.dataSource.manager);
    return { startsAt, intervals };
  }

  private requireWindow(intervals: ChargeableInterval[], intervalMinutes: number, durationMinutes: number) {
    const { value: window } = parkingWindows(intervals, intervalMinutes, durationMinutes).next();
    if (!window) {
      throw new ConflictException(
        'La duración solicitada no cabe en el horario de cobro disponible desde este momento.',
      );
    }
    const { expiresAt, truncatedAtClose } = window;
    return { expiresAt, quotedExpiresAt: truncatedAtClose ? expiresAt : null };
  }

  private async getRate(manager: EntityManager) {
    const rate = await manager.findOneBy(ParkingRate, { id: 1 });
    if (!rate) {
      throw new ServiceUnavailableException('No se configuró la tarifa general de parqueo.');
    }
    return rate;
  }
}
