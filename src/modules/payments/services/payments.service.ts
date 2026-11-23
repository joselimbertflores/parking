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
import { ArrayContains, DataSource, LessThan, MoreThan, QueryFailedError } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type { EnvironmentVariables } from '../../../config/env.validation.js';
import { ParkingSession } from '../../parking/entities/parking-sessions.entity.js';
import { isSameParkingDay } from '../../parking/parking-schedule.js';
import { ParkingPurchaseService } from '../../parking/services/parking-purchase.service.js';
import { ParkingSegmentsService } from '../../parking/services/parking-segments.service.js';
import { User } from '../../users/entities/users.entity.js';
import { CreateParkingPaymentDto } from '../dto/payment.dto.js';
import type { CashPayment, PaymentStatusDto, QrPaymentDto } from '../dto/payment.dto.js';
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
    const rate = await this.parkingPurchaseService.getRate();
    const quote = await this.parkingPurchaseService.getQuote(durationMinutes, rate);
    const { startsAt, amount, intervalMinutes, quotedExpiresAt } = quote;
    await this.requireNoOverlappingSession(manager, plate, parkingSegmentId, quote);
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
          createdAt: startsAt,
          paidAt: null,
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

    const isController = await this.dataSource.manager.existsBy(User, {
      id: controllerId,
      roles: ArrayContains(['controller']),
    });
    if (!isController) {
      throw new ForbiddenException('Se requiere un controlador autorizado.');
    }
    await this.parkingSegmentsService.requireActive(parkingSegmentId);
    const rate = await this.parkingPurchaseService.getRate();

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await this.parkingSegmentsService.lockForSessionCreation(parkingSegmentId, manager);
      const quote = await this.parkingPurchaseService.getQuote(durationMinutes, rate, manager);
      const { startsAt, expiresAt, amount, intervalMinutes, quotedExpiresAt } = quote;
      await this.requireNoOverlappingSession(manager, plate, parkingSegmentId, quote);

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

      await this.parkingSegmentsService.lockForSessionCreation(payment.parkingSegmentId, manager);
      // El QR conserva el importe y el tamaño del bloque de la cotización.
      const window = await this.parkingPurchaseService.getSessionWindow(
        payment.durationMinutes,
        payment.intervalMinutes,
        manager,
      );
      const { startsAt, expiresAt, quotedExpiresAt } = window;
      if (!isSameParkingDay(payment.createdAt, startsAt)) {
        throw new ConflictException('El pago QR solo se puede confirmar en la fecha local de su cotización.');
      }
      // El bloque debe seguir cabiendo entero o vencer al mismo cierre cotizado.
      if (quotedExpiresAt?.getTime() !== payment.quotedExpiresAt?.getTime()) {
        throw new ConflictException('La vigencia del estacionamiento ya no coincide con la cotización del pago QR.');
      }
      await this.requireNoOverlappingSession(manager, payment.plate, payment.parkingSegmentId, window);
      const session = await manager.save(
        manager.create(ParkingSession, {
          plate: payment.plate,
          vehicleType: payment.vehicleType,
          parkingSegmentId: payment.parkingSegmentId,
          startsAt,
          expiresAt,
        }),
      );
      await manager.update(Payment, id, {
        status: 'confirmed',
        paidAt: startsAt,
        parkingSessionId: session.id,
      });

      payment.status = 'confirmed';
      return this.toStatus(payment, session);
    });
  }

  private async requireNoOverlappingSession(
    manager: EntityManager,
    plate: string,
    parkingSegmentId: number,
    { startsAt, expiresAt }: Pick<ParkingSession, 'startsAt' | 'expiresAt'>,
  ) {
    const overlaps = await manager.existsBy(ParkingSession, {
      plate,
      parkingSegmentId,
      startsAt: LessThan(expiresAt),
      expiresAt: MoreThan(startsAt),
    });
    if (overlaps) {
      throw new ConflictException('La placa ya tiene una sesión que se solapa con la vigencia solicitada en este tramo.');
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
