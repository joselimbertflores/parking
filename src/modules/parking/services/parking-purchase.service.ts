import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, MoreThan } from 'typeorm';
import type { EntityManager } from 'typeorm';

import type { CreateParkingPaymentDto } from '../../payments/dto/payment.dto.js';
import type { ParkingPurchaseOptionDto } from '../dto/parking-purchase.dto.js';
import { calculateParkingAmount, parkingWindows } from '../parking-purchase.js';
import { ParkingSegmentsService } from './parking-segments.service.js';
import { ParkingRate } from '../entities/parking-rates.entity.js';
import { ParkingSession } from '../entities/parking-sessions.entity.js';
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
    const manager = this.dataSource.manager;
    const { intervals } = await getPurchaseTime(manager);

    if (!intervals.length) return [];

    const { amount: blockAmount, intervalMinutes } = await this.requireRate(manager);
    const options: ParkingPurchaseOptionDto[] = [];
    for (const { durationMinutes } of parkingWindows(intervals, intervalMinutes)) {
      const amount = calculateParkingAmount(blockAmount, durationMinutes / intervalMinutes);
      options.push({ durationMinutes, amount });
    }
    return options;
  }

  async getQuote(
    { parkingSegmentId, plate, durationMinutes }: CreateParkingPaymentDto,
    manager = this.dataSource.manager,
  ) {
    const { purchasedAt, intervals, session, nextStartsAt } = await this.getAvailability(
      parkingSegmentId,
      plate,
      manager,
    );
    if (!intervals.length && !session) {
      throw new ConflictException('En este momento no hay horario de cobro.');
    }
    const { amount: blockAmount, intervalMinutes } = await this.requireRate(manager);
    if (durationMinutes % intervalMinutes !== 0) {
      throw new BadRequestException('La duración debe ser un múltiplo de los minutos por bloque.');
    }
    const window = this.requireWindow(intervals, intervalMinutes, durationMinutes, nextStartsAt);
    const amount = calculateParkingAmount(blockAmount, durationMinutes / intervalMinutes);
    return { purchasedAt, session, ...window, amount, intervalMinutes };
  }

  async getSessionWindow(
    { parkingSegmentId, plate, durationMinutes }: CreateParkingPaymentDto,
    intervalMinutes: number,
    manager: EntityManager,
  ) {
    const { purchasedAt, intervals, session, nextStartsAt } = await this.getAvailability(
      parkingSegmentId,
      plate,
      manager,
    );
    return { purchasedAt, session, ...this.requireWindow(intervals, intervalMinutes, durationMinutes, nextStartsAt) };
  }

  private async getAvailability(parkingSegmentId: number, plate: string, manager: EntityManager) {
    const { startsAt: purchasedAt, intervals } = await getPurchaseTime(manager);
    if (!intervals.length) {
      return { purchasedAt, intervals, session: null, nextStartsAt: undefined };
    }

    // Las dos primeras sesiones aún sin vencer bastan para detectar duplicados o un próximo solapamiento.
    const [first, second] = await manager.find(ParkingSession, {
      where: { plate, parkingSegmentId, expiresAt: MoreThan(purchasedAt) },
      order: { startsAt: 'ASC' },
      take: 2,
    });
    const session = first && first.startsAt <= purchasedAt ? first : null;
    const nextStartsAt = (session ? second : first)?.startsAt;
    if (nextStartsAt && nextStartsAt <= purchasedAt) {
      throw new ConflictException('La placa tiene más de una sesión vigente en este tramo.');
    }

    // La compra ocurre en horario de cobro. La ampliación consume solo los intervalos restantes tras el vencimiento.
    const available = session
      ? intervals
          .filter(({ endsAt }) => endsAt > session.expiresAt)
          .map((interval) =>
            interval.startsAt < session.expiresAt ? { ...interval, startsAt: session.expiresAt } : interval,
          )
      : intervals;
    return { purchasedAt, intervals: available, session, nextStartsAt };
  }

  private requireWindow(
    intervals: ChargeableInterval[],
    intervalMinutes: number,
    durationMinutes: number,
    nextStartsAt?: Date,
  ) {
    const { value: window } = parkingWindows(intervals, intervalMinutes, durationMinutes).next();
    if (!window) {
      throw new ConflictException('La duración solicitada no cabe en el horario de cobro disponible.');
    }
    const { expiresAt, truncatedAtClose } = window;
    if (nextStartsAt && nextStartsAt < expiresAt) {
      throw new ConflictException(
        'La placa ya tiene una sesión que se solapa con la vigencia solicitada en este tramo.',
      );
    }
    return { expiresAt, quotedExpiresAt: truncatedAtClose ? expiresAt : null };
  }

  private async requireRate(manager: EntityManager) {
    const rate = await manager.findOneBy(ParkingRate, { id: 1 });
    if (!rate) throw new ServiceUnavailableException('No se configuró la tarifa general de parqueo.');
    return rate;
  }
}
