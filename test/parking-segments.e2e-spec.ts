import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { configureApp } from '../src/config/app.config.js';
import { ParkingModule } from '../src/modules/parking/parking.module.js';
import { ParkingSegment } from '../src/modules/parking/entities/parking-segments.entity.js';
import { ParkingSession } from '../src/modules/parking/entities/parking-sessions.entity.js';
import { ParkingHoliday } from '../src/modules/parking/entities/parking-holidays.entity.js';
import { ParkingSchedule } from '../src/modules/parking/entities/parking-schedules.entity.js';
import { ParkingRate } from '../src/modules/parking/entities/parking-rates.entity.js';
import { Payment } from '../src/modules/payments/entities/payments.entity.js';
import { User } from '../src/modules/users/entities/users.entity.js';

// Supply TEST_DATABASE_URL explicitly; all writes stay in a temporary schema.
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'Parking segments (PostgreSQL)',
  () => {
    const schema = `parking_segments_test_${randomUUID().replaceAll('-', '')}`;
    const parkingEntities = [
      ParkingSegment,
      ParkingSession,
      ParkingHoliday,
      ParkingSchedule,
      ParkingRate,
    ];
    const dataSource = new DataSource({
      type: 'postgres',
      url: process.env.TEST_DATABASE_URL,
      schema,
      entities: [...parkingEntities, Payment, User],
      synchronize: false,
    });
    let app: INestApplication;

    const segmentData = () => ({
      code: `TEST-${randomUUID()}`,
      streetName: 'Avenida Central',
      reference: 'Entre calle 1 y calle 2',
      active: true,
    });

    async function createApp(nodeEnv: 'test' | 'production') {
      const builder = Test.createTestingModule({
        imports: [ParkingModule],
        providers: [
          {
            provide: ConfigService,
            useValue: new ConfigService({
              NODE_ENV: nodeEnv,
              FRONTEND_ORIGIN: [
                'http://localhost:4200',
                'https://frontend.example.com',
              ],
            }),
          },
        ],
      });
      for (const entity of parkingEntities) {
        builder
          .overrideProvider(getRepositoryToken(entity))
          .useValue(dataSource.getRepository(entity));
      }
      const module = await builder.compile();
      const application = module.createNestApplication();
      configureApp(application);
      await application.init();
      return application;
    }

    beforeAll(async () => {
      await dataSource.initialize();
      await dataSource.query(`CREATE SCHEMA "${schema}"`);
      // Only the tables needed by these tests; no synchronize or existing tables.
      await dataSource.query(`CREATE TABLE "${schema}".parking_segments (
      id serial PRIMARY KEY,
      code varchar NOT NULL UNIQUE,
      "streetName" varchar NOT NULL,
      reference varchar NOT NULL,
      side varchar,
      active boolean NOT NULL
    )`);
      await dataSource.query(`CREATE TABLE "${schema}".parking_sessions (
      id serial PRIMARY KEY,
      "parkingSegmentId" integer NOT NULL REFERENCES "${schema}".parking_segments(id)
    )`);
      await dataSource.query(`CREATE TABLE "${schema}".payments (
      id uuid PRIMARY KEY,
      "parkingSegmentId" integer NOT NULL REFERENCES "${schema}".parking_segments(id)
    )`);
      app = await createApp('test');
    }, 15000);

    afterAll(async () => {
      await app?.close();
      if (dataSource.isInitialized) {
        try {
          await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        } finally {
          await dataSource.destroy();
        }
      }
    });

    it('creates, lists, reads and updates a segment, including nullable side', async () => {
      const dto = segmentData();
      const created = await request(app.getHttpServer())
        .post('/api/parking-segments')
        .send({ ...dto, code: ` ${dto.code} ` })
        .expect(201);
      const id = created.body.id as number;
      expect(created.body).toEqual({ ...dto, id, side: null });

      const list = await request(app.getHttpServer())
        .get('/api/parking-segments')
        .expect(200);
      expect(list.body).toContainEqual(created.body);
      await request(app.getHttpServer())
        .get(`/api/parking-segments/${id}`)
        .expect(200, created.body);

      const updated = await request(app.getHttpServer())
        .patch(`/api/parking-segments/${id}`)
        .send({ side: ' Sur ', active: false })
        .expect(200);
      expect(updated.body).toEqual({
        ...created.body,
        side: 'Sur',
        active: false,
      });
      const cleared = await request(app.getHttpServer())
        .patch(`/api/parking-segments/${id}`)
        .send({ side: null })
        .expect(200);
      expect(cleared.body.side).toBeNull();
    });

    it('returns 409 on duplicate codes for both create and update', async () => {
      const dto = segmentData();
      await request(app.getHttpServer())
        .post('/api/parking-segments')
        .send(dto)
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/parking-segments')
        .send(dto)
        .expect(409);
      const other = await request(app.getHttpServer())
        .post('/api/parking-segments')
        .send(segmentData())
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/parking-segments/${other.body.id}`)
        .send({ code: dto.code })
        .expect(409);
    });

    it('deactivates a segment and preserves its session and payment history', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/parking-segments')
        .send(segmentData())
        .expect(201);
      const id = created.body.id as number;
      await dataSource.query(
        `INSERT INTO "${schema}".parking_sessions ("parkingSegmentId") VALUES ($1)`,
        [id],
      );
      await dataSource.query(
        `INSERT INTO "${schema}".payments (id, "parkingSegmentId") VALUES ($1, $2)`,
        [randomUUID(), id],
      );
      await request(app.getHttpServer())
        .delete(`/api/parking-segments/${id}`)
        .expect(204, '');
      await request(app.getHttpServer())
        .delete(`/api/parking-segments/${id}`)
        .expect(204);
      const segment = await request(app.getHttpServer())
        .get(`/api/parking-segments/${id}`)
        .expect(200);
      expect(segment.body.active).toBe(false);
      const list = await request(app.getHttpServer())
        .get('/api/parking-segments')
        .expect(200);
      expect(list.body).toContainEqual(segment.body);
      for (const table of ['parking_sessions', 'payments']) {
        const rows = await dataSource.query(
          `SELECT id FROM "${schema}"."${table}" WHERE "parkingSegmentId" = $1`,
          [id],
        );
        expect(rows).toHaveLength(1);
      }
    });

    it.each(['get', 'patch', 'delete'] as const)(
      'returns 404 for a missing segment (%s)',
      async (method) => {
        await request(app.getHttpServer())
          [method]('/api/parking-segments/2147483647')
          .send({})
          .expect(404);
      },
    );

    it.each([
      'invalid',
      '0',
      '-1',
      '1.5',
      '2147483648',
      '999999999999999999999',
    ])('rejects invalid IDs: %s', async (id) => {
      for (const method of ['get', 'patch', 'delete'] as const) {
        await request(app.getHttpServer())
          [method](`/api/parking-segments/${id}`)
          .send({})
          .expect(400);
      }
    });

    it.each([
      { code: '   ' },
      { streetName: 42 },
      { reference: '' },
      { side: 42 },
      { active: 'false' },
      { active: null },
      { unexpected: true },
    ])('rejects invalid creation data: %j', async (invalid) => {
      await request(app.getHttpServer())
        .post('/api/parking-segments')
        .send({ ...segmentData(), ...invalid })
        .expect(400);
    });

    it('rejects missing required fields on create and nulls on patch', async () => {
      await request(app.getHttpServer())
        .post('/api/parking-segments')
        .send({})
        .expect(400);
      const created = await request(app.getHttpServer())
        .post('/api/parking-segments')
        .send(segmentData())
        .expect(201);
      for (const field of ['code', 'streetName', 'reference', 'active']) {
        await request(app.getHttpServer())
          .patch(`/api/parking-segments/${created.body.id}`)
          .send({ [field]: null })
          .expect(400);
      }
      await request(app.getHttpServer())
        .patch(`/api/parking-segments/${created.body.id}`)
        .send({ unexpected: true })
        .expect(400);
    });

    it('serves the UI and one OpenAPI document describing all five operations', async () => {
      await request(app.getHttpServer())
        .get('/docs/')
        .expect(200)
        .expect('Content-Type', /html/);
      const { body } = await request(app.getHttpServer())
        .get('/docs-json')
        .expect(200);
      expect(body.paths['/api/parking-segments']).toHaveProperty('get');
      expect(body.paths['/api/parking-segments']).toHaveProperty('post');
      expect(body.paths['/api/parking-segments/{id}']).toHaveProperty('get');
      expect(body.paths['/api/parking-segments/{id}']).toHaveProperty('patch');
      expect(body.paths['/api/parking-segments/{id}']).toHaveProperty('delete');
      expect(
        body.paths['/api/parking-segments/{id}'].get.parameters,
      ).toContainEqual(
        expect.objectContaining({
          name: 'id',
          in: 'path',
          required: true,
          schema: expect.objectContaining({ type: 'integer' }),
        }),
      );
      const schemas = body.components.schemas;
      expect(schemas.CreateParkingSegmentDto.required).toEqual([
        'code',
        'streetName',
        'reference',
        'active',
      ]);
      expect(schemas.UpdateParkingSegmentDto.required ?? []).toEqual([]);
      expect(schemas.ParkingSegmentDto.required).toContain('id');
      expect(schemas.ParkingSegmentDto.required).toContain('side');
      expect(schemas.ParkingSegmentDto.properties.side.nullable).toBe(true);
    });

    it('allows configured CORS origins with credentials and rejects other origins', async () => {
      for (const origin of [
        'http://localhost:4200',
        'https://frontend.example.com',
      ]) {
        await request(app.getHttpServer())
          .options('/api/parking-segments')
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'PATCH')
          .set('Access-Control-Request-Headers', 'content-type,authorization')
          .expect(204)
          .expect('Access-Control-Allow-Origin', origin)
          .expect('Access-Control-Allow-Credentials', 'true')
          .expect('Access-Control-Allow-Methods', /PATCH/)
          .expect('Access-Control-Allow-Headers', /Content-Type/);
      }
      const response = await request(app.getHttpServer())
        .get('/api/parking-segments')
        .set('Origin', 'https://untrusted.example.com')
        .expect(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('disables Swagger in production while keeping the API available', async () => {
      const productionApp = await createApp('production');
      try {
        await request(productionApp.getHttpServer()).get('/docs').expect(404);
        await request(productionApp.getHttpServer())
          .get('/docs-json')
          .expect(404);
        await request(productionApp.getHttpServer())
          .get('/api/parking-segments')
          .expect(200);
      } finally {
        await productionApp.close();
      }
    });
  },
);
