import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource, IsNull } from 'typeorm';
import type { EntitySubscriberInterface } from 'typeorm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { VehicleType } from '../src/common/enums/vehicle-type.enum.js';
import { ParkingHoliday } from '../src/modules/parking/entities/parking-holidays.entity.js';
import { ParkingRate } from '../src/modules/parking/entities/parking-rates.entity.js';
import { ParkingSchedule } from '../src/modules/parking/entities/parking-schedules.entity.js';
import { ParkingSegment } from '../src/modules/parking/entities/parking-segments.entity.js';
import { ParkingSession } from '../src/modules/parking/entities/parking-sessions.entity.js';
import { Payment } from '../src/modules/payments/entities/payments.entity.js';
import { PaymentsModule } from '../src/modules/payments/payments.module.js';
import { PaymentsService } from '../src/modules/payments/services/payments.service.js';
import { User } from '../src/modules/users/entities/users.entity.js';
import { UsersModule } from '../src/modules/users/users.module.js';

const temporaryCluster = Boolean(process.env.PG_CLUSTER_CONF_ROOT && process.env.PGPORT);
const databaseUrl = temporaryCluster ? undefined : process.env.PARKING_TEST_DATABASE_URL;
const at = (time: string, day = '18') => new Date(`2026-11-${day}T${time}:00-04:00`);
const verification = '/api/parking/verification';
const cash = '/api/payments/cash';
const qr = '/api/payments/qr';

// Ejecutar con pg_virtualenv -t o con la URL de una base de datos descartable.
describe.skipIf(!databaseUrl && !temporaryCluster)('Control municipal y pagos', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let dataSource: DataSource;
  let paymentsService: PaymentsService;
  let segment: ParkingSegment;
  let otherSegment: ParkingSegment;
  let controller: User;
  let manager: User;

  const paymentInput = (plate: string, durationMinutes = 120) => ({
    plate,
    vehicleType: VehicleType.Motorcycle,
    parkingSegmentId: segment.id,
    durationMinutes,
  });
  const getOptions = () => http.get(`/api/parking/segments/${segment.id}/options`);

  beforeAll(async () => {
    const connection = databaseUrl
      ? { url: databaseUrl }
      : {
          host: '127.0.0.1',
          port: Number(process.env.PGPORT),
          username: process.env.PGUSER,
          password: process.env.PGPASSWORD,
          database: process.env.PGDATABASE,
        };
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          ...connection,
          autoLoadEntities: true,
          synchronize: true,
        }),
        UsersModule,
        PaymentsModule,
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    dataSource = app.get(DataSource);
    paymentsService = app.get(PaymentsService);
    const location = {
      streetName: 'Avenida Central',
      reference: 'Calle 1',
      side: null,
      active: true,
    };
    [segment, otherSegment] = await dataSource.getRepository(ParkingSegment).save([
      { ...location, code: 'TR-001' },
      { ...location, code: 'TR-002' },
    ]);
    [controller, manager] = await dataSource.getRepository(User).save([
      {
        identityUserId: 'test-controller',
        fullName: 'Controladora de prueba',
        roles: ['controller'],
      },
      {
        identityUserId: 'test-manager',
        fullName: 'Gestora de prueba',
        roles: ['manager'],
      },
    ]);
    await dataSource.getRepository(ParkingRate).insert({ intervalMinutes: 30, amount: '1.25' });
    await dataSource.getRepository(ParkingSchedule).insert([
      { dayOfWeek: 3, startTime: '08:00', endTime: '12:00' },
      { dayOfWeek: 3, startTime: '14:00', endTime: '18:00' },
      { dayOfWeek: 4, startTime: '08:00', endTime: '12:00' },
      { dayOfWeek: 6, startTime: '08:00', endTime: '12:00' },
    ]);
    await dataSource.getRepository(ParkingHoliday).insert({ date: '2026-11-19', name: 'Feriado de prueba' });

    const session = (plate: string, start: string, end: string, parkingSegmentId = segment.id, day = '18') => ({
      plate,
      parkingSegmentId,
      vehicleType: VehicleType.Car,
      startsAt: at(start, day),
      expiresAt: at(end, day),
    });
    await dataSource
      .getRepository(ParkingSession)
      .insert([
        session('1234ABC', '10:00', '10:30'),
        session('1234ABC', '08:00', '08:30'),
        session('1234ABC', '19:30', '20:30', segment.id, '17'),
        session('1234ABC', '09:00', '09:30', otherSegment.id),
        session('1234ABC', '10:01', '10:31'),
        session('HISTORY', '09:00', '09:30'),
        session('ATEND', '09:30', '10:00'),
        session('FUTURE', '10:01', '10:31'),
        session('MULTIPLE', '09:45', '10:30'),
        session('MULTIPLE', '09:50', '10:35', otherSegment.id),
        session('DUPLICATE', '09:45', '10:30'),
        session('DUPLICATE', '09:50', '10:35'),
        session('BRIDGE', '11:55', '14:10'),
      ]);

    await app.listen(0, '127.0.0.1');
    http = request(await app.getUrl());
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  }, 20_000);

  beforeEach(() => {
    vi.setSystemTime(at('10:00'));
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app?.close();
  });

  it('normaliza la placa y devuelve únicamente la sesión vigente', async () => {
    const { body } = await http.get(verification).query({ plate: '1234- aBc', segmentId: segment.id }).expect(200);
    expect(body).toEqual({
      plate: '1234ABC',
      segmentId: segment.id,
      session: {
        id: expect.any(Number),
        plate: '1234ABC',
        segment,
        vehicleType: 'car',
        startsAt: at('10:00').toISOString(),
        expiresAt: at('10:30').toISOString(),
        remainingSeconds: 1800,
      },
    });
  });

  it.each(['UNKNOWN', 'HISTORY', 'ATEND', 'FUTURE'])('devuelve null para %s sin sesión vigente', async (plate) => {
    await http.get(verification).query({ plate, segmentId: segment.id }).expect(200, {
      plate,
      segmentId: segment.id,
      session: null,
    });
  });

  it('devuelve null si la sesión vigente pertenece a otro tramo', async () => {
    await http.get(verification).query({ plate: '1234ABC', segmentId: otherSegment.id }).expect(200, {
      plate: '1234ABC',
      segmentId: otherSegment.id,
      session: null,
    });
  });

  it('valida cada sesión cuando hay vigencias simultáneas en distintos tramos', async () => {
    for (const { id: segmentId } of [segment, otherSegment]) {
      const { body } = await http.get(verification).query({ plate: 'MULTIPLE', segmentId }).expect(200);
      expect(body).toMatchObject({
        segmentId,
        session: { segment: { id: segmentId } },
      });
    }
  });

  it('responde 409 ante vigencias simultáneas en el mismo tramo', async () => {
    await http.get(verification).query({ plate: 'DUPLICATE', segmentId: segment.id }).expect(409);
  });

  it('conserva la vigencia durante una pausa del horario de cobro', async () => {
    vi.setSystemTime(at('13:59'));
    const duringBreak = await http.get(verification).query({ plate: 'BRIDGE', segmentId: segment.id }).expect(200);
    expect(duringBreak.body).toMatchObject({
      session: { remainingSeconds: 660 },
    });
  });

  it('valida los parámetros y conserva el acceso a los tramos por código', async () => {
    await http.get(verification).query({ plate: '1234ABC' }).expect(400);
    await http.get(verification).query({ segmentId: segment.id }).expect(400);
    await http.get(verification).query({ plate: '!!!', segmentId: segment.id }).expect(400);
    await http.get(verification).query({ plate: '1234ABC', segmentId: 0 }).expect(400);
    await http.get('/api/parking/segments/by-code/tr-002').expect(200, otherSegment);
    await http.get('/api/parking/segments').query({ search: ' tr-002 ' }).expect(200, [otherSegment]);
    await http.get(`/api/parking/segments/${segment.id}/monitoring`).expect(404);
  });

  it('acepta IDs enteros de tramo y rechaza valores no enteros en la ruta', async () => {
    await getOptions().expect(200);
    await http.get('/api/parking/segments/0/options').expect(404);
    for (const id of ['1.5', 'abc']) {
      const segmentPath = `/api/parking-segments/${id}`;
      await http.get(`/api/parking/segments/${id}/options`).expect(400);
      await http.patch(segmentPath).send({ active: true }).expect(400);
      await http.delete(segmentPath).expect(400);
    }
  });

  it('registra el importe, la sesión y el controlador para un pago en efectivo', async () => {
    vi.setSystemTime(at('11:30'));
    const result = await paymentsService.createCash(paymentInput('cas-h123'), controller.id);
    expect(result).toEqual({
      id: expect.any(String),
      amount: '5.00',
      method: 'cash',
      status: 'confirmed',
      paidAt: at('11:30'),
      session: {
        id: expect.any(Number),
        startsAt: at('11:30'),
        expiresAt: at('15:30'),
      },
    });

    const payment = await dataSource.getRepository(Payment).findOneByOrFail({ id: result.id });
    expect(payment).toMatchObject({
      plate: 'CASH123',
      amount: '5.00',
      method: 'cash',
      status: 'confirmed',
      paidAt: at('11:30'),
      recordedByUserId: controller.id,
      parkingSessionId: result.session.id,
    });
    const session = await dataSource.getRepository(ParkingSession).findOneByOrFail({ id: result.session.id });
    expect(session).toMatchObject({
      plate: 'CASH123',
      vehicleType: VehicleType.Motorcycle,
      parkingSegmentId: segment.id,
      expiresAt: at('15:30'),
    });
  });

  it('revierte la sesión si falla la escritura del pago', async () => {
    const failure: EntitySubscriberInterface<Payment> = {
      listenTo: () => Payment,
      async beforeInsert({ entity, manager }) {
        if (entity.plate === 'ROLLBACK') {
          const session = await manager.findOneBy(ParkingSession, {
            plate: entity.plate,
          });
          expect(session?.id).toBe(entity.parkingSessionId);
          throw new Error('Fallo de escritura del pago');
        }
      },
    };
    dataSource.subscribers.push(failure);
    try {
      await expect(paymentsService.createCash(paymentInput('ROLLBACK'), controller.id)).rejects.toThrow(
        'Fallo de escritura del pago',
      );
      expect(await dataSource.getRepository(ParkingSession).countBy({ plate: 'ROLLBACK' })).toBe(0);
      expect(await dataSource.getRepository(Payment).countBy({ plate: 'ROLLBACK' })).toBe(0);
    } finally {
      dataSource.subscribers.splice(dataSource.subscribers.indexOf(failure), 1);
    }
  });

  it('rechaza el efectivo si la placa ya tiene una sesión vigente en el tramo', async () => {
    await expect(paymentsService.createCash(paymentInput('1234-aBc'), controller.id)).rejects.toMatchObject({
      status: 409,
    });
    await http.post(qr).send(paymentInput('1234-aBc')).expect(409);
    expect(await dataSource.getRepository(Payment).countBy({ plate: '1234ABC' })).toBe(0);
  });

  it('rechaza una compra que se solapa con una sesión que todavía no empezó', async () => {
    const input = paymentInput('FUTURE', 30);
    await expect(paymentsService.createCash(input, controller.id)).rejects.toMatchObject({ status: 409 });
    await http.post(qr).send(input).expect(409);
    expect(await dataSource.getRepository(ParkingSession).countBy({ plate: input.plate })).toBe(1);
    expect(await dataSource.getRepository(Payment).countBy({ plate: input.plate })).toBe(0);
  });

  it('permite una compra que empieza justo cuando vence la sesión anterior', async () => {
    const result = await paymentsService.createCash(paymentInput('ATEND', 30), controller.id);
    expect(result.session).toMatchObject({ startsAt: at('10:00'), expiresAt: at('10:30') });
  });

  it('solo registra un pago cuando dos cobros en efectivo llegan al mismo tiempo', async () => {
    const input = paymentInput('CONCURRENT');
    const results = await Promise.allSettled([
      paymentsService.createCash(input, controller.id),
      paymentsService.createCash(input, controller.id),
    ]);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'fulfilled' }),
        expect.objectContaining({
          status: 'rejected',
          reason: expect.objectContaining({ status: 409 }),
        }),
      ]),
    );
    expect(await dataSource.getRepository(ParkingSession).countBy({ plate: input.plate })).toBe(1);
    expect(await dataSource.getRepository(Payment).countBy({ plate: input.plate })).toBe(1);
  });

  it('registra ambos cobros simultáneos para placas distintas en el mismo tramo', async () => {
    const [first, second] = await Promise.all([
      paymentsService.createCash(paymentInput('CONCURRENT1'), controller.id),
      paymentsService.createCash(paymentInput('CONCURRENT2'), controller.id),
    ]);
    expect(first.session.id).not.toBe(second.session.id);
    expect(first.session.startsAt).toEqual(second.session.startsAt);

    const payments = dataSource.getRepository(Payment);
    await expect(payments.findOneByOrFail({ id: first.id })).resolves.toMatchObject({
      plate: 'CONCURRENT1',
      parkingSegmentId: segment.id,
      parkingSessionId: first.session.id,
    });
    await expect(payments.findOneByOrFail({ id: second.id })).resolves.toMatchObject({
      plate: 'CONCURRENT2',
      parkingSegmentId: segment.id,
      parkingSessionId: second.session.id,
    });
  });

  it('exige un controlador real y reutiliza las validaciones del pago QR', async () => {
    const input = paymentInput('UNAUTHORIZED');
    await expect(paymentsService.createCash(input, manager.id)).rejects.toMatchObject({ status: 403 });
    await expect(paymentsService.createCash(input, 2147483647)).rejects.toMatchObject({ status: 403 });
    await expect(paymentsService.createCash({ ...input, durationMinutes: 31 }, controller.id)).rejects.toMatchObject({
      status: 400,
    });
    vi.setSystemTime(at('12:00'));
    await expect(paymentsService.createCash(input, controller.id)).rejects.toMatchObject({ status: 409 });
    expect(await dataSource.getRepository(Payment).countBy({ plate: input.plate })).toBe(0);
  });

  it('rechaza el pago en efectivo por HTTP incluso con identidad enviada por el cliente', async () => {
    const input = paymentInput('BLOCKED');
    await http.post(cash).send(input).expect(403);
    await http
      .post(cash)
      .set('Authorization', 'Bearer token-de-prueba')
      .send({ ...input, recordedByUserId: controller.id })
      .expect(403);
    expect(await dataSource.getRepository(ParkingSession).countBy({ plate: input.plate })).toBe(0);
    expect(await dataSource.getRepository(Payment).countBy({ plate: input.plate })).toBe(0);
  });

  it.each([
    ['11:45', 270, '11.25'],
    ['17:15', 60, '2.50'],
    ['17:45', 30, '1.25'],
    ['17:51', 30, '1.25'],
    ['17:59', 30, '1.25'],
  ])(
    'ofrece y cobra el último bloque completo con vigencia hasta el cierre a las %s',
    async (time, durationMinutes, amount) => {
      vi.setSystemTime(at(time));
      const input = paymentInput(`CLOSE${time.replace(':', '')}`, durationMinutes);
      const { body } = await getOptions().expect(200);
      expect(body).toEqual(
        Array.from({ length: durationMinutes / 30 }, (_, index) =>
          expect.objectContaining({
            durationMinutes: (index + 1) * 30,
            amount: ((index + 1) * 1.25).toFixed(2),
          }),
        ),
      );
      expect(body.at(-1).expiresAt).toBe(at('18:00').toISOString());
      const result = await paymentsService.createCash(input, controller.id);
      expect(result).toMatchObject({
        amount,
        session: { startsAt: at(time), expiresAt: at('18:00') },
      });
      await expect(dataSource.getRepository(Payment).findOneByOrFail({ id: result.id })).resolves.toMatchObject({
        durationMinutes,
        intervalMinutes: 30,
      });
    },
  );

  it('ofrece un solo bloque a las 17:30 y permite comprarlo hasta las 18:00', async () => {
    vi.setSystemTime(at('17:30'));
    await getOptions().expect(200, [{ durationMinutes: 30, amount: '1.25', expiresAt: at('18:00').toISOString() }]);
    await http.post(qr).send(paymentInput('EXACT', 60)).expect(409);
    await expect(paymentsService.createCash(paymentInput('EXACT', 30), controller.id)).resolves.toMatchObject({
      amount: '1.25',
      session: { expiresAt: at('18:00') },
    });
  });

  it.each([
    ['18:00', '18'],
    ['12:00', '18'],
    ['13:30', '18'],
    ['11:45', '19'],
    ['11:45', '22'],
  ])('bloquea opciones y compras a las %s del día %s sin cobro', async (time, day) => {
    vi.setSystemTime(at(time, day));
    await getOptions().expect(200, []);
    const input = paymentInput('OUTSIDE', 30);
    await http.post(qr).send(input).expect(409);
    await expect(paymentsService.createCash(input, controller.id)).rejects.toMatchObject({ status: 409 });
  });

  it('usa el cierre del sábado y exige un tramo activo', async () => {
    vi.setSystemTime(at('11:45', '21'));
    await getOptions().expect(200, [
      { durationMinutes: 30, amount: '1.25', expiresAt: at('12:00', '21').toISOString() },
    ]);
    const input = paymentInput('SATURDAY', 30);
    const { body } = await http.post(qr).send(input).expect(201);
    await expect(paymentsService.confirmQrPayment(body.id)).resolves.toMatchObject({
      amount: '1.25',
      session: { expiresAt: at('12:00', '21') },
    });
    const segments = dataSource.getRepository(ParkingSegment);
    await segments.update(otherSegment.id, { active: false });
    try {
      await http.get(`/api/parking/segments/${otherSegment.id}/options`).expect(404);
      await http
        .post(qr)
        .send({ ...input, parkingSegmentId: otherSegment.id })
        .expect(404);
    } finally {
      await segments.update(otherSegment.id, { active: true });
    }
  });

  it('permite confirmar un QR previo a la desactivación y conserva las sesiones pagadas', async () => {
    const input = { ...paymentInput('QRINACTIVE', 30), parkingSegmentId: otherSegment.id };
    const paid = await paymentsService.createCash({ ...input, plate: 'PAIDINACTIVE' }, controller.id);
    const { body } = await http.post(qr).send(input).expect(201);
    const segments = dataSource.getRepository(ParkingSegment);
    await segments.update(otherSegment.id, { active: false });
    try {
      const newPurchase = { ...input, plate: 'NEWINACTIVE' };
      await http.get(`/api/parking/segments/${otherSegment.id}/options`).expect(404);
      await http.post(qr).send(newPurchase).expect(404);
      await expect(paymentsService.createCash(newPurchase, controller.id)).rejects.toMatchObject({ status: 404 });

      vi.setSystemTime(at('10:05'));
      const confirmed = await paymentsService.confirmQrPayment(body.id);
      expect(confirmed).toMatchObject({
        status: 'confirmed',
        session: { startsAt: at('10:05'), expiresAt: at('10:35') },
      });
      await expect(paymentsService.confirmQrPayment(body.id)).resolves.toEqual(confirmed);
      await expect(paymentsService.getStatus(paid.id)).resolves.toMatchObject({
        status: 'confirmed',
        session: paid.session,
      });
    } finally {
      await segments.update(otherSegment.id, { active: true });
    }
  });

  it('rechaza el QR si se elimina el tramo antes de guardar la intención', async () => {
    const segments = dataSource.getRepository(ParkingSegment);
    const temporarySegment = await segments.save({
      code: 'TR-DELETED',
      streetName: 'Calle temporal',
      reference: 'Cruce de prueba',
      active: true,
    });
    const input = { ...paymentInput('QRDELETED'), parkingSegmentId: temporarySegment.id };
    const removeBeforeInsert: EntitySubscriberInterface<Payment> = {
      listenTo: () => Payment,
      async beforeInsert({ entity }) {
        if (entity.parkingSegmentId === temporarySegment.id) {
          await segments.delete(temporarySegment.id);
        }
      },
    };
    dataSource.subscribers.push(removeBeforeInsert);
    try {
      await http.post(qr).send(input).expect(404);
      expect(await dataSource.getRepository(Payment).countBy({ plate: input.plate })).toBe(0);
    } finally {
      dataSource.subscribers.splice(dataSource.subscribers.indexOf(removeBeforeInsert), 1);
    }
  });

  it('recalcula las opciones al cambiar el horario y rechaza un QR con otro cierre', async () => {
    vi.setSystemTime(at('17:51'));
    const paid = await paymentsService.createCash(paymentInput('PAIDCLOSE', 30), controller.id);
    const existing = await http.post(qr).send(paymentInput('OLDCLOSE', 30)).expect(201);
    const schedules = dataSource.getRepository(ParkingSchedule);
    const afternoon = { dayOfWeek: 3, startTime: '14:00' };
    await schedules.update(afternoon, { endTime: '18:15' });
    try {
      await getOptions().expect(200, [{ durationMinutes: 30, amount: '1.25', expiresAt: at('18:15').toISOString() }]);
      await expect(paymentsService.getStatus(paid.id)).resolves.toMatchObject({
        amount: paid.amount,
        session: paid.session,
      });
      await expect(paymentsService.confirmQrPayment(existing.body.id)).rejects.toMatchObject({ status: 409 });
      vi.setSystemTime(at('08:00'));
      const { body } = await getOptions().expect(200);
      expect(body).toHaveLength(17);
      expect(body.at(-1)).toEqual({
        durationMinutes: 510,
        amount: '21.25',
        expiresAt: at('18:15').toISOString(),
      });
      const extendedDay = await http.post(qr).send(paymentInput('LONGDAY', 510)).expect(201);
      expect(extendedDay.body).toMatchObject({
        amount: '21.25',
        quotedExpiresAt: at('18:15').toISOString(),
      });
      await http.post(qr).send(paymentInput('TOOLONG', 540)).expect(409);
      vi.setSystemTime(at('18:05'));
      await expect(paymentsService.createCash(paymentInput('NEWCLOSE', 30), controller.id)).resolves.toMatchObject({
        amount: '1.25',
        session: { expiresAt: at('18:15') },
      });
    } finally {
      await schedules.update(afternoon, { endTime: '18:00' });
    }
  });

  it('exige bloques válidos y rechaza el tipo anterior, importes y vencimientos del cliente', async () => {
    vi.setSystemTime(at('17:51'));
    const input = paymentInput('INVALID', 30);
    const legacyInput = { ...input, type: 'until_close' };
    for (const invalid of [
      { ...input, durationMinutes: undefined },
      { ...input, durationMinutes: 29 },
      { ...input, durationMinutes: 31 },
      { ...input, durationMinutes: 0 },
      { ...input, durationMinutes: 1.5 },
      legacyInput,
      { ...input, amount: '0.01' },
      { ...input, expiresAt: at('18:30') },
    ]) {
      await http.post(qr).send(invalid).expect(400);
    }
    await expect(paymentsService.createCash(legacyInput, controller.id)).rejects.toMatchObject({ status: 400 });
  });

  it('confirma un QR con el mismo cierre cotizado y conserva la idempotencia', async () => {
    vi.setSystemTime(at('17:51'));
    const { body } = await http.post(qr).send(paymentInput('QRCLOSE', 30)).expect(201);
    expect(body).toMatchObject({
      status: 'pending',
      amount: '1.25',
      quotedExpiresAt: at('18:00').toISOString(),
      session: null,
    });
    const pending = await http.get(`/api/payments/${body.id}`).expect(200);
    expect(pending.body.quotedExpiresAt).toBe(at('18:00').toISOString());
    await expect(dataSource.getRepository(Payment).findOneByOrFail({ id: body.id })).resolves.toMatchObject({
      durationMinutes: 30,
      intervalMinutes: 30,
      quotedExpiresAt: at('18:00'),
    });
    vi.setSystemTime(at('17:59'));
    const confirmed = await paymentsService.confirmQrPayment(body.id);
    expect(confirmed).toMatchObject({
      status: 'confirmed',
      amount: '1.25',
      session: { startsAt: at('17:59'), expiresAt: at('18:00') },
    });
    vi.setSystemTime(at('18:00'));
    await expect(paymentsService.confirmQrPayment(body.id)).resolves.toEqual(confirmed);
  });

  it('conserva el bloque cotizado para decidir si un QR al cierre aún puede activarse', async () => {
    vi.setSystemTime(at('17:15'));
    const first = await http.post(qr).send(paymentInput('QRONTIME', 60)).expect(201);
    const second = await http.post(qr).send(paymentInput('QRTOOLATE', 60)).expect(201);
    const rates = dataSource.getRepository(ParkingRate);
    await rates.update(1, { intervalMinutes: 60 });
    try {
      vi.setSystemTime(at('17:20'));
      await expect(paymentsService.confirmQrPayment(first.body.id)).resolves.toMatchObject({
        status: 'confirmed',
        amount: '2.50',
        session: { startsAt: at('17:20'), expiresAt: at('18:00') },
      });
      vi.setSystemTime(at('17:31'));
      await expect(paymentsService.confirmQrPayment(second.body.id)).rejects.toMatchObject({
        status: 409,
      });
    } finally {
      await rates.update(1, { intervalMinutes: 30 });
    }
  });

  it.each([
    ['17:15', 60, '17:31', '18', 'bloques distintos'],
    ['11:45', 270, '12:01', '18', 'pausa'],
    ['17:51', 30, '18:00', '18', 'cierre'],
    ['17:51', 30, '11:51', '21', 'otro día cobrable'],
  ])(
    'deja pendiente el QR de las %s por %i minutos al confirmar a las %s del día %s (%s)',
    async (start, durationMinutes, end, day) => {
      vi.setSystemTime(at(start));
      const { body } = await http.post(qr).send(paymentInput('QRLATE', durationMinutes)).expect(201);
      vi.setSystemTime(at(end, day));
      await expect(paymentsService.confirmQrPayment(body.id)).rejects.toMatchObject({ status: 409 });
      await expect(paymentsService.getStatus(body.id)).resolves.toMatchObject({
        status: 'pending',
        amount: body.amount,
        session: null,
      });
    },
  );

  it('deja pendiente un QR cotizado por bloques completos si ahora requiere recorte', async () => {
    vi.setSystemTime(at('17:00'));
    const { body } = await http.post(qr).send(paymentInput('BLOCKLATE', 60)).expect(201);
    vi.setSystemTime(at('17:15'));
    await expect(paymentsService.confirmQrPayment(body.id)).rejects.toMatchObject({
      status: 409,
    });
    await expect(paymentsService.getStatus(body.id)).resolves.toMatchObject({
      status: 'pending',
      session: null,
    });
  });

  it('rechaza el QR por bloques en otra fecha local aunque coincida la fecha UTC', async () => {
    const schedules = dataSource.getRepository(ParkingSchedule);
    const fridayNight = {
      dayOfWeek: 5,
      startTime: '22:00',
      endTime: '23:30',
    };
    await schedules.insert(fridayNight);
    try {
      vi.setSystemTime(at('22:00', '20'));
      const { body } = await http.post(qr).send(paymentInput('BLOCKNEXTDAY', 30)).expect(201);
      vi.setSystemTime(at('08:00', '21'));
      await expect(paymentsService.confirmQrPayment(body.id)).rejects.toMatchObject({
        status: 409,
      });
      await expect(paymentsService.getStatus(body.id)).resolves.toMatchObject({
        status: 'pending',
        session: null,
      });
    } finally {
      await schedules.delete(fridayNight);
    }
  });

  it('aplica el importe y los minutos nuevos solo a las cotizaciones nuevas', async () => {
    vi.setSystemTime(at('11:00'));
    const { body } = await http.post(qr).send(paymentInput('BLOCKPRICE')).expect(201);
    const rates = dataSource.getRepository(ParkingRate);
    await rates.update(1, { amount: '2.00', intervalMinutes: 45 });
    try {
      vi.setSystemTime(at('11:30'));
      const options = await getOptions().expect(200);
      expect(options.body[0]).toEqual({
        durationMinutes: 45,
        amount: '2.00',
        expiresAt: at('14:15').toISOString(),
      });
      await http.post(qr).send(paymentInput('OLDMINUTES')).expect(400);
      await expect(paymentsService.confirmQrPayment(body.id)).resolves.toMatchObject({
        status: 'confirmed',
        amount: '5.00',
        session: { startsAt: at('11:30'), expiresAt: at('15:30') },
      });
      await expect(paymentsService.createCash(paymentInput('CASHPRICE', 135), controller.id)).resolves.toMatchObject({
        amount: '6.00',
        session: { startsAt: at('11:30'), expiresAt: at('15:45') },
      });
    } finally {
      await rates.update(1, { amount: '1.25', intervalMinutes: 30 });
    }
  });

  it('impide insertar una segunda tarifa general', async () => {
    const rates = dataSource.getRepository(ParkingRate);
    const values = { amount: '2.00', intervalMinutes: 45 };
    await expect(rates.insert(values)).rejects.toMatchObject({
      driverError: { code: '23505' },
    });
    await expect(rates.insert({ id: 2, ...values })).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
  });

  it('ofrece todos los bloques hasta el cierre aunque su importe supere el de un bloque máximo', async () => {
    const rates = dataSource.getRepository(ParkingRate);
    await rates.update(1, { amount: '99999999.99' });
    try {
      vi.setSystemTime(at('17:15'));
      const { body } = await getOptions().expect(200);
      expect(body.at(-1)).toEqual({
        durationMinutes: 60,
        amount: '199999999.98',
        expiresAt: at('18:00').toISOString(),
      });
      const payment = await http.post(qr).send(paymentInput('HIGHAMOUNT', 60)).expect(201);
      expect(payment.body.amount).toBe('199999999.98');
    } finally {
      await rates.update(1, { amount: '1.25' });
    }
  });

  it('solo crea una sesión si compiten el efectivo y la confirmación de un QR', async () => {
    const input = paymentInput('MIXEDPAYMENT');
    const { body } = await http.post(qr).send(input).expect(201);
    const results = await Promise.allSettled([
      paymentsService.createCash(input, controller.id),
      paymentsService.confirmQrPayment(body.id),
    ]);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'fulfilled' }),
        expect.objectContaining({
          status: 'rejected',
          reason: expect.objectContaining({ status: 409 }),
        }),
      ]),
    );
    await http
      .get(verification)
      .query({
        plate: input.plate,
        segmentId: input.parkingSegmentId,
      })
      .expect(200);
    expect(await dataSource.getRepository(ParkingSession).countBy({ plate: input.plate })).toBe(1);
  });

  it('permite varias intenciones QR y solo confirma una si sus sesiones se solapan', async () => {
    const input = paymentInput('QRMULTIPLE');
    const [{ body: first }, { body: second }] = await Promise.all([
      http.post(qr).send(input).expect(201),
      http.post(qr).send(input).expect(201),
    ]);
    expect(first.id).not.toBe(second.id);
    expect(first.status).toBe('pending');
    expect(second.status).toBe('pending');

    const results = await Promise.allSettled([
      paymentsService.confirmQrPayment(first.id),
      paymentsService.confirmQrPayment(second.id),
    ]);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'fulfilled', value: expect.objectContaining({ status: 'confirmed' }) }),
        expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ status: 409 }) }),
      ]),
    );
    const payments = dataSource.getRepository(Payment);
    const scope = { plate: input.plate, parkingSegmentId: input.parkingSegmentId };
    expect(await payments.countBy({ ...scope, status: 'confirmed' })).toBe(1);
    expect(await payments.countBy({ ...scope, status: 'pending', parkingSessionId: IsNull() })).toBe(1);
    expect(await dataSource.getRepository(ParkingSession).countBy(scope)).toBe(1);
  });

  it('confirma de forma idempotente dos solicitudes simultáneas para el mismo UUID', async () => {
    const { body } = await http.post(qr).send(paymentInput('qr-test')).expect(201);
    expect(body).toEqual({
      id: expect.any(String),
      amount: '5.00',
      status: 'pending',
      quotedExpiresAt: null,
      session: null,
      qr: null,
    });
    await http.get(`/api/payments/${body.id}`).expect(200, {
      id: body.id,
      amount: '5.00',
      status: 'pending',
      quotedExpiresAt: null,
      session: null,
    });
    await http.get('/api/payments/invalid').expect(400);
    const [confirmed, retried] = await Promise.all([
      paymentsService.confirmQrPayment(body.id),
      paymentsService.confirmQrPayment(body.id),
    ]);
    expect(confirmed).toMatchObject({
      status: 'confirmed',
      session: { expiresAt: at('12:00') },
    });
    expect(retried).toEqual(confirmed);
    const payment = await dataSource.getRepository(Payment).findOneByOrFail({ id: body.id });
    expect(payment).toMatchObject({
      plate: 'QRTEST',
      method: 'qr',
      parkingSessionId: confirmed.session?.id,
      recordedByUserId: null,
    });
    expect(await dataSource.getRepository(ParkingSession).countBy({ plate: 'QRTEST' })).toBe(1);
  });

  it('revierte la sesión y la confirmación QR si falla la transacción', async () => {
    const input = paymentInput('QRROLLBACK');
    const { body } = await http.post(qr).send(input).expect(201);
    const failure: EntitySubscriberInterface<Payment> = {
      listenTo: () => Payment,
      async afterUpdate({ entity, manager }) {
        if (entity?.status !== 'confirmed') return;
        const payment = await manager.findOneByOrFail(Payment, { id: body.id });
        expect(payment).toMatchObject({ status: 'confirmed', parkingSessionId: expect.any(Number) });
        const session = await manager.findOneByOrFail(ParkingSession, { plate: input.plate });
        expect(session.id).toBe(payment.parkingSessionId);
        throw new Error('Fallo después de confirmar el QR');
      },
    };
    dataSource.subscribers.push(failure);
    try {
      await expect(paymentsService.confirmQrPayment(body.id)).rejects.toThrow('Fallo después de confirmar el QR');
      await expect(paymentsService.getStatus(body.id)).resolves.toMatchObject({ status: 'pending', session: null });
      expect(await dataSource.getRepository(ParkingSession).countBy({ plate: input.plate })).toBe(0);
    } finally {
      dataSource.subscribers.splice(dataSource.subscribers.indexOf(failure), 1);
    }
    await expect(paymentsService.confirmQrPayment(body.id)).resolves.toMatchObject({ status: 'confirmed' });
  });

  describe('Simulación de pagos QR', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it.each([
      ['development', undefined],
      ['development', 'false'],
      ['production', 'true'],
      ['test', 'true'],
    ])('mantiene el QR pendiente con NODE_ENV=%s y SIMULATE_QR_PAYMENTS=%s', async (environment, flag) => {
      vi.stubEnv('NODE_ENV', environment);
      vi.stubEnv('SIMULATE_QR_PAYMENTS', flag);
      const confirm = vi.spyOn(paymentsService, 'confirmQrPayment');
      const { body } = await http.post(qr).send(paymentInput('QRSIMOFF')).expect(201);

      await vi.advanceTimersByTimeAsync(3000);

      expect(confirm).not.toHaveBeenCalled();
      const status = await http.get(`/api/payments/${body.id}`).expect(200);
      expect(status.body).toMatchObject({ status: 'pending', session: null });
    });

    it('confirma el QR después de tres segundos y expone la sesión en la consulta', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('SIMULATE_QR_PAYMENTS', 'true');
      const confirm = vi.spyOn(paymentsService, 'confirmQrPayment');
      const input = paymentInput('QRSIMON', 30);
      const { body } = await http.post(qr).send(input).expect(201);
      expect(body).toMatchObject({ status: 'pending', session: null, qr: null });
      const statusUrl = `/api/payments/${body.id}`;

      await vi.advanceTimersByTimeAsync(2999);
      const pending = await http.get(statusUrl).expect('Cache-Control', 'no-store').expect(200);
      expect(pending.body).toMatchObject({ status: 'pending', session: null });
      expect(confirm).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(confirm).toHaveBeenCalledExactlyOnceWith(body.id);
      await expect(confirm.mock.results[0].value).resolves.toMatchObject({ status: 'confirmed' });
      const confirmed = await http.get(statusUrl).expect('Cache-Control', 'no-store').expect(200);
      expect(confirmed.body).toMatchObject({
        status: 'confirmed',
        session: { id: expect.any(Number), startsAt: new Date().toISOString() },
      });
      expect(await dataSource.getRepository(ParkingSession).countBy({ plate: input.plate })).toBe(1);
    });

    it('mantiene pendiente un QR cuando el intento automático llega después del cierre', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('SIMULATE_QR_PAYMENTS', 'true');
      vi.setSystemTime(at('18:00').getTime() - 2000);
      const confirm = vi.spyOn(paymentsService, 'confirmQrPayment');
      const input = paymentInput('QRSIMLATE', 30);
      const { body } = await http.post(qr).send(input).expect(201);

      await vi.advanceTimersByTimeAsync(3000);

      expect(confirm).toHaveBeenCalledExactlyOnceWith(body.id);
      await expect(confirm.mock.results[0].value).rejects.toMatchObject({ status: 409 });
      const status = await http.get(`/api/payments/${body.id}`).expect(200);
      expect(status.body).toMatchObject({ status: 'pending', session: null });
      expect(await dataSource.getRepository(ParkingSession).countBy({ plate: input.plate })).toBe(0);
    });
  });

  it('documenta la verificación, las opciones por bloques y los pagos en Swagger', () => {
    const { paths, components } = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    expect(paths[verification].get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'plate',
          in: 'query',
          required: true,
        }),
        expect.objectContaining({
          name: 'segmentId',
          in: 'query',
          required: true,
        }),
      ]),
    );
    expect(paths[verification].get?.responses).toHaveProperty('409');
    expect(components?.schemas?.ParkingVerificationDto).toHaveProperty('required', ['plate', 'segmentId', 'session']);
    expect(components?.schemas?.ParkingVerificationDto).toMatchObject({
      properties: {
        session: {
          oneOf: [{ $ref: '#/components/schemas/ParkingVerificationSessionDto' }, { nullable: true }],
        },
      },
    });
    expect(paths['/api/parking/segments/{id}/monitoring']).toBeUndefined();
    expect(Object.keys(paths[cash].post?.responses ?? {})).toEqual(['403']);
    expect(components?.schemas?.CreateParkingPaymentDto).toMatchObject({
      required: ['plate', 'vehicleType', 'parkingSegmentId', 'durationMinutes'],
      properties: {
        durationMinutes: { minimum: 1 },
      },
    });
    expect(components?.schemas?.CreateParkingPaymentDto).not.toHaveProperty('properties.type');
    expect(components?.schemas?.CreateParkingPaymentDto).not.toHaveProperty('properties.durationMinutes.maximum');
    expect(components?.schemas?.ParkingPurchaseOptionDto).toHaveProperty('properties.expiresAt.format', 'date-time');
    expect(components?.schemas?.PaymentStatusDto).toHaveProperty('properties.quotedExpiresAt.nullable', true);
    expect(paths[qr].post?.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CreateParkingPaymentDto' },
        },
      },
    });
    expect(paths['/api/parking/segments/{id}/options'].get?.responses?.['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            type: 'array',
            items: { $ref: '#/components/schemas/ParkingPurchaseOptionDto' },
          },
        },
      },
    });
  });
});
