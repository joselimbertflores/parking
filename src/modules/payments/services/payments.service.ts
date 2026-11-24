import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ArrayContains, DataSource, QueryFailedError } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type { EnvironmentVariables } from '../../../config/env.validation.js';
import { ParkingSession } from '../../parking/entities/parking-sessions.entity.js';
import { isSameParkingDay } from '../../parking/parking-schedule.js';
import { ParkingPurchaseService } from '../../parking/services/parking-purchase.service.js';
import { ParkingSegmentsService } from '../../parking/services/parking-segments.service.js';
import { User } from '../../users/entities/users.entity.js';
import { CreateParkingPaymentDto } from '../dto/payment.dto.js';
import type { CashPaymentDto, PaymentStatusDto, QrPaymentDto } from '../dto/payment.dto.js';
import { Payment } from '../entities/payments.entity.js';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly parkingPurchaseService: ParkingPurchaseService,
    private readonly parkingSegmentsService: ParkingSegmentsService,
    private readonly config: ConfigService<EnvironmentVariables>,
  ) {}

  async createQr(input: CreateParkingPaymentDto): Promise<QrPaymentDto> {
    const { plate, vehicleType, parkingSegmentId, durationMinutes } = input;
    const manager = this.dataSource.manager;
    await this.parkingSegmentsService.requireActive(parkingSegmentId);
    const { purchasedAt, amount, intervalMinutes, quotedExpiresAt } = await this.parkingPurchaseService.getQuote(input);
    const payment = await manager
      .save(
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
          createdAt: purchasedAt,
        }),
      )
      .catch((error: unknown) => {
        if (error instanceof QueryFailedError && (error.driverError as { code?: string }).code === '23503') {
          throw new NotFoundException(`No existe el tramo ${parkingSegmentId}.`);
        }
        throw error;
      });

    // TODO: Eliminar esta simulación al integrar el proveedor bancario real.
    if (
      this.config.get('NODE_ENV', { infer: true }) === 'development' &&
      this.config.get('SIMULATE_QR_PAYMENTS', { infer: true }) === 'true'
    ) {
      setTimeout(() => {
        void this.confirmQrPayment(payment.id).catch((error: unknown) => {
          this.logger.warn(`La simulación no pudo confirmar el pago QR ${payment.id}.`, error);
        });
      }, 3000).unref();
    }

    // La integración bancaria completará el campo qr con los datos del proveedor.
    return Object.assign(this.toStatus(payment, null), { qr: null });
  }

  async createCash(input: CreateParkingPaymentDto, controllerId: number | null): Promise<CashPaymentDto> {
    // TODO: Exigir el controlador autenticado de SIAU y volver a rechazar controllerId nulo en todos los entornos.
    if (controllerId === null && this.config.get('NODE_ENV', { infer: true }) !== 'development') {
      throw new ForbiddenException('El registro en efectivo sin autenticación solo está habilitado en desarrollo.');
    }
    if (controllerId !== null && (!Number.isInteger(controllerId) || controllerId < 1 || controllerId > 2147483647)) {
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

    if (controllerId !== null) {
      const isController = await this.dataSource.manager.existsBy(User, {
        id: controllerId,
        roles: ArrayContains(['controller']),
      });
      if (!isController) {
        throw new ForbiddenException('Se requiere un controlador autorizado.');
      }
    }
    await this.parkingSegmentsService.requireActive(parkingSegmentId);

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await this.parkingSegmentsService.lockForSessionPurchase(parkingSegmentId, manager);
      const quote = await this.parkingPurchaseService.getQuote(dto, manager);
      const { purchasedAt, amount, intervalMinutes, quotedExpiresAt } = quote;

      const session = await this.saveSession(manager, dto, quote);
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
          paidAt: purchasedAt,
        }),
      );

      return {
        id: payment.id,
        amount: payment.amount,
        method: 'cash',
        status: 'confirmed',
        paidAt: purchasedAt,
        session: { id: session.id, startsAt: session.startsAt, expiresAt: session.expiresAt },
      };
    });
  }

  async getStatus(id: string): Promise<PaymentStatusDto> {
    const payment = await this.dataSource.manager.findOne(Payment, {
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
      // Las confirmaciones del mismo pago esperan aquí y comprueban el estado antes de ampliar.
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
        const session =
          payment.parkingSessionId === null
            ? null
            : await manager.findOneBy(ParkingSession, { id: payment.parkingSessionId });
        return this.toStatus(payment, session);
      }

      await this.parkingSegmentsService.lockForSessionPurchase(payment.parkingSegmentId, manager);
      // El QR conserva el importe y el tamaño del bloque de la cotización.
      const window = await this.parkingPurchaseService.getSessionWindow(payment, payment.intervalMinutes, manager);
      const { purchasedAt, quotedExpiresAt } = window;
      if (!isSameParkingDay(payment.createdAt, purchasedAt)) {
        throw new ConflictException('El pago QR solo se puede confirmar en la fecha local de su cotización.');
      }
      // El bloque debe seguir cabiendo entero o vencer al mismo cierre cotizado.
      if (quotedExpiresAt?.getTime() !== payment.quotedExpiresAt?.getTime()) {
        throw new ConflictException('La vigencia del estacionamiento ya no coincide con la cotización del pago QR.');
      }
      const session = await this.saveSession(manager, payment, window);
      await manager.update(Payment, id, {
        status: 'confirmed',
        paidAt: purchasedAt,
        parkingSessionId: session.id,
      });

      payment.status = 'confirmed';
      return this.toStatus(payment, session);
    });
  }

  private saveSession(
    manager: EntityManager,
    { plate, vehicleType, parkingSegmentId }: CreateParkingPaymentDto,
    { session, purchasedAt, expiresAt }: { session: ParkingSession | null; purchasedAt: Date; expiresAt: Date },
  ) {
    const target =
      session ?? manager.create(ParkingSession, { plate, vehicleType, parkingSegmentId, startsAt: purchasedAt });
    target.expiresAt = expiresAt;
    return manager.save(target);
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
