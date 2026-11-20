import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { ParkingSegment } from '../src/modules/parking/entities/parking-segments.entity.js';
import { ParkingSegmentsService } from '../src/modules/parking/services/parking-segments.service.js';

const activeSegment = {
  id: 1,
  code: 'TR-001',
  streetName: 'Avenida Central',
  reference: 'Entre calle 1 y calle 2',
  side: null,
  active: true,
} satisfies ParkingSegment;
const inactiveSegment = {
  ...activeSegment,
  id: 2,
  code: 'TR-002',
  active: false,
} satisfies ParkingSegment;

describe('ParkingSegmentsService.findActiveByCode', () => {
  const repository = new DataSource({ type: 'postgres' }).getRepository(
    ParkingSegment,
  );
  const service = new ParkingSegmentsService(repository);

  vi.spyOn(repository, 'findOneBy').mockImplementation(async (where) => {
    if (Array.isArray(where)) {
      throw new Error('Se esperaba un filtro por código.');
    }

    return (
      [activeSegment, inactiveSegment].find(
        (segment) =>
          segment.code === where.code && segment.active === where.active,
      ) ?? null
    );
  });

  it('devuelve el tramo activo aunque el código use otras mayúsculas', async () => {
    await expect(service.findActiveByCode('tr-001')).resolves.toEqual(
      activeSegment,
    );
  });

  it.each(['TR-999', 'TR-00', 'TR-00%_'])(
    'rechaza el código inexistente %s',
    async (code) => {
      await expect(service.findActiveByCode(code)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    },
  );

  it('rechaza el código de un tramo inactivo', async () => {
    await expect(service.findActiveByCode('TR-002')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
