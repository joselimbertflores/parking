import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ArrayContains, DataSource, LessThanOrEqual, MoreThan } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { ParkingSession } from '../../parking/entities/parking-sessions.entity.js';
import { isSameParkingDay } from '../../parking/parking-schedule.js';
import { ParkingPurchaseService } from '../../parking/services/parking-purchase.service.js';
import { User } from '../../users/entities/users.entity.js';
import { CreateParkingPaymentDto } from '../dto/payment.dto.js';
import type { CashPayment, PaymentStatusDto, QrPaymentDto } from '../dto/payment.dto.js';
import { Payment } from '../entities/payments.entity.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly parkingPurchaseService: ParkingPurchaseService,
  ) {}

  createQr(input: CreateParkingPaymentDto): Promise<QrPaymentDto> {
    const { plate, vehicleType, parkingSegmentId, durationMinutes } = input;
    return this.dataSource.transaction(async (manager) => {
      const { startsAt, amount, intervalMinutes, quotedExpiresAt } = await this.parkingPurchaseService.getQuote(
        parkingSegmentId,
        durationMinutes,
        manager,
      );
      await this.requireNoActiveSession(manager, plate, parkingSegmentId, startsAt);
      const payment = await manager.save(
        manager.create(Payment, {
          plate,
          vehicleType,
          parkingSegmentId,
          durationMinutes,
          intervalMinutes,
          quotedExpiresAt,
          amount,
          method: 'qr',
          status: 'pending',
          parkingSessionId: null,
          recordedByUserId: null,
          // La intención queda vinculada a la fecha en que se calculó la cotización.
          createdAt: startsAt,
          paidAt: null,
        }),
      );

      // La integración bancaria completará el campo qr con los datos del proveedor.
      return Object.assign(this.toStatus(payment, null), { qr: null });
    });
  }

  async createCash(input: CreateParkingPaymentDto, controllerId: number): Promise<CashPayment> {
    if (!Number.isInteger(controllerId) || controllerId < 1 || controllerId > 2147483647) {
      throw new ForbiddenException('Se requiere un controlador autorizado.');
    }
    const dto = plainToInstance(CreateParkingPaymentDto, input);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length) {
      throw new BadRequestException('Datos del pago inválidos.');
    }
    const { plate, vehicleType, parkingSegmentId, durationMinutes } = dto;

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const isController = await manager.existsBy(User, {
        id: controllerId,
        roles: ArrayContains(['controller']),
      });
      if (!isController) {
        throw new ForbiddenException('Se requiere un controlador autorizado.');
      }

      const { startsAt, expiresAt, amount, intervalMinutes, quotedExpiresAt } =
        await this.parkingPurchaseService.getQuote(parkingSegmentId, durationMinutes, manager, 'for_no_key_update');
      await this.requireNoActiveSession(manager, plate, parkingSegmentId, startsAt);

      const session = await manager.save(
        manager.create(ParkingSession, {
          plate,
          vehicleType,
          parkingSegmentId,
          startsAt,
          expiresAt,
        }),
      );
      const payment = await manager.save(
        manager.create(Payment, {
          plate,
          vehicleType,
          parkingSegmentId,
          durationMinutes,
          intervalMinutes,
          quotedExpiresAt,
          amount,
          method: 'cash',
          status: 'confirmed',
          parkingSessionId: session.id,
          recordedByUserId: controllerId,
          paidAt: startsAt,
        }),
      );

      return {
        id: payment.id,
        amount: payment.amount,
        method: 'cash',
        status: 'confirmed',
        paidAt: startsAt,
        session: { id: session.id, startsAt, expiresAt },
      };
    });
  }

  async getStatus(id: string, manager = this.dataSource.manager): Promise<PaymentStatusDto> {
    const payment = await manager.findOne(Payment, {
      where: { id },
      relations: { parkingSession: true },
    });
    if (!payment) {
      throw new NotFoundException('No existe el pago solicitado.');
    }
    return this.toStatus(payment, payment.parkingSession);
  }

  confirmQrPayment(id: string): Promise<PaymentStatusDto> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const payment = await manager.findOne(Payment, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) {
        throw new NotFoundException('No existe el pago solicitado.');
      }
      if (payment.method !== 'qr' || payment.status === 'failed') {
        throw new ConflictException('Solo se pueden confirmar pagos QR pendientes.');
      }
      if (payment.status === 'confirmed') {
        return this.getStatus(id, manager);
      }

      // El QR conserva el importe y el tamaño del bloque de la cotización.
      const { startsAt, expiresAt, quotedExpiresAt } = await this.parkingPurchaseService.getSessionWindow(
        payment.parkingSegmentId,
        payment.durationMinutes,
        payment.intervalMinutes,
        manager,
      );
      if (!isSameParkingDay(payment.createdAt, startsAt)) {
        throw new ConflictException('El pago QR solo se puede confirmar en la fecha local de su cotización.');
      }
      // El bloque debe seguir cabiendo entero o vencer al mismo cierre cotizado.
      if (quotedExpiresAt?.getTime() !== payment.quotedExpiresAt?.getTime()) {
        throw new ConflictException('La vigencia del estacionamiento ya no coincide con la cotización del pago QR.');
      }
      await this.requireNoActiveSession(manager, payment.plate, payment.parkingSegmentId, startsAt);
      const session = await manager.save(
        manager.create(ParkingSession, {
          plate: payment.plate,
          vehicleType: payment.vehicleType,
          parkingSegmentId: payment.parkingSegmentId,
          startsAt,
          expiresAt,
        }),
      );
      payment.status = 'confirmed';
      payment.paidAt = startsAt;
      payment.parkingSessionId = session.id;
      await manager.save(payment);

      return this.toStatus(payment, session);
    });
  }

  private async requireNoActiveSession(
    manager: EntityManager,
    plate: string,
    parkingSegmentId: number,
    startsAt: Date,
  ) {
    const alreadyPaid = await manager.existsBy(ParkingSession, {
      plate,
      parkingSegmentId,
      startsAt: LessThanOrEqual(startsAt),
      expiresAt: MoreThan(startsAt),
    });
    if (alreadyPaid) {
      throw new ConflictException('La placa ya tiene una sesión vigente en este tramo.');
    }
  }

  private toStatus(payment: Payment, session: ParkingSession | null): PaymentStatusDto {
    return {
      id: payment.id,
      amount: payment.amount,
      status: payment.status,
      quotedExpiresAt: payment.quotedExpiresAt,
      session: session && {
        id: session.id,
        startsAt: session.startsAt,
        expiresAt: session.expiresAt,
      },
    };
  }
}
