import { describe, expect, it } from 'vitest';
import { calculateParkingAmount, parkingWindows } from '../src/modules/parking/parking-purchase.js';

const at = (time: string) => new Date(`2026-11-18T${time}-04:00`);
const afternoon = (start = '14:00', end = '18:00') => ({
  startsAt: at(start),
  endsAt: at(end),
});
const splitSchedule = (start: string, end = '18:00') => [
  { startsAt: at(start), endsAt: at('12:00') },
  afternoon('14:00', end),
];

describe('parkingWindows', () => {
  it.each([
    ['08:00', 480, '18:00'],
    ['11:00', 120, '15:00'],
    ['11:30', 60, '14:30'],
    ['11:30', 30, '12:00'],
    ['11:30:45.123', 30, '14:00:45.123'],
  ])('desde las %s, %i minutos vencen a las %s', (start, durationMinutes, end) => {
    expect(parkingWindows(splitSchedule(start), 30, durationMinutes).next().value).toEqual({
      durationMinutes,
      expiresAt: at(end),
      truncatedAtClose: false,
    });
  });

  it('no ofrece opciones en un día sin intervalos cobrables', () => {
    expect([...parkingWindows([], 30)]).toEqual([]);
  });

  it('acepta un bloque completo durante el último milisegundo de cobro', () => {
    expect([...parkingWindows([afternoon('17:59:59.999')], 30)]).toEqual([
      { durationMinutes: 30, expiresAt: at('18:00'), truncatedAtClose: true },
    ]);
  });

  it('atraviesa la pausa y recorta solo el último bloque de la jornada', () => {
    const options = [...parkingWindows(splitSchedule('11:45'), 30)];
    expect(options.at(-2)).toEqual({
      durationMinutes: 240,
      expiresAt: at('17:45'),
      truncatedAtClose: false,
    });
    expect(options.at(-1)).toEqual({
      durationMinutes: 270,
      expiresAt: at('18:00'),
      truncatedAtClose: true,
    });
  });

  it('genera múltiplos del bloque configurado hasta el cierre, incluso por encima de 480 minutos', () => {
    const intervals = splitSchedule('08:00', '18:45');
    const options = [...parkingWindows(intervals, 45)];
    expect(options).toHaveLength(12);
    expect(options.map(({ durationMinutes }) => durationMinutes)).toEqual(
      Array.from({ length: 12 }, (_, index) => (index + 1) * 45),
    );
    expect(options.at(-1)).toEqual({
      durationMinutes: 540,
      expiresAt: at('18:45'),
      truncatedAtClose: true,
    });
    expect(parkingWindows(intervals, 45, 585).next().done).toBe(true);
  });

  it('no añade otro bloque cuando los minutos restantes caben exactamente en los bloques', () => {
    expect([...parkingWindows([afternoon('17:30')], 30)]).toEqual([
      { durationMinutes: 30, expiresAt: at('18:00'), truncatedAtClose: false },
    ]);
    expect(parkingWindows([afternoon('17:30')], 30, 60).next().done).toBe(true);
  });
});

describe('calculateParkingAmount', () => {
  it.each([
    ['1.25', 1, '1.25'],
    ['3.25', 2, '6.50'],
    ['0.99', 16, '15.84'],
    ['0.00', 4, '0.00'],
    ['99999999.99', 1440, '143999999985.60'],
  ])('cobra Bs %s por cada uno de %i bloques', (blockAmount, blocks, amount) => {
    expect(calculateParkingAmount(blockAmount, blocks)).toBe(amount);
  });
});
