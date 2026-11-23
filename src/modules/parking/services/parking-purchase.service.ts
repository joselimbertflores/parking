import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import type { ParkingPurchaseOptionDto } from '../dto/parking-purchase.dto.js';
import { calculateParkingAmount, parkingWindows } from '../parking-purchase.js';
import { ParkingSegmentsService } from './parking-segments.service.js';
import { ParkingRate } from '../entities/parking-rates.entity.js';
import { getPurchaseTime } from '../parking-schedule.js';
import type { ChargeableInterval } from '../parking-schedule.js';

@Injectable()
export class ParkingPurchaseService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly parkingSegmentsService: ParkingSegmentsService,
  ) {}

  async getOptions(parkingSegmentId: number) {
    await this.parkingSegmentsService.requireActive(parkingSegmentId);
    const { intervals } = await getPurchaseTime(this.dataSource.manager);

    if (!intervals.length) return [];

    const { amount: blockAmount, intervalMinutes } = this.requireRate(await this.getRate());
    const options: ParkingPurchaseOptionDto[] = [];
    for (const { durationMinutes, expiresAt } of parkingWindows(intervals, intervalMinutes)) {
      const amount = calculateParkingAmount(blockAmount, durationMinutes / intervalMinutes);
      options.push({ durationMinutes, amount, expiresAt });
    }
    return options;
  }

  async getQuote(durationMinutes: number, rate: ParkingRate | null, manager = this.dataSource.manager) {
    const { startsAt, intervals } = await getPurchaseTime(manager);
    if (!intervals.length) {
      throw new ConflictException('En este momento no hay horario de cobro.');
    }
    const { amount: blockAmount, intervalMinutes } = this.requireRate(rate);
    if (durationMinutes % intervalMinutes !== 0) {
      throw new BadRequestException('La duración debe ser un múltiplo de los minutos por bloque.');
    }
    const window = this.requireWindow(intervals, intervalMinutes, durationMinutes);
    const amount = calculateParkingAmount(blockAmount, durationMinutes / intervalMinutes);
    return { startsAt, ...window, amount, intervalMinutes };
  }

  async getSessionWindow(durationMinutes: number, intervalMinutes: number, manager: EntityManager) {
    const { startsAt, intervals } = await getPurchaseTime(manager);
    return { startsAt, ...this.requireWindow(intervals, intervalMinutes, durationMinutes) };
  }

  getRate() {
    return this.dataSource.manager.findOneBy(ParkingRate, { id: 1 });
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

  private requireRate(rate: ParkingRate | null) {
    if (!rate) throw new ServiceUnavailableException('No se configuró la tarifa general de parqueo.');
    return rate;
  }
}
