import type { ChargeableInterval } from './parking-schedule.js';

const MILLISECONDS_PER_MINUTE = 60_000;

export function* parkingWindows(
  intervals: ChargeableInterval[],
  intervalMinutes: number,
  durationMinutes = intervalMinutes,
) {
  let elapsed = 0;
  for (const { startsAt, endsAt } of intervals) {
    const start = startsAt.getTime();
    const chargeableUntil = elapsed + endsAt.getTime() - start;
    while (durationMinutes * MILLISECONDS_PER_MINUTE <= chargeableUntil) {
      // Cada yield entrega una opción. Al restar lo acumulado, solo se suman los minutos que caben en este intervalo.
      yield {
        durationMinutes,
        expiresAt: new Date(start + durationMinutes * MILLISECONDS_PER_MINUTE - elapsed),
        truncatedAtClose: false,
      };
      durationMinutes += intervalMinutes;
    }
    elapsed = chargeableUntil;
  }

  const closing = intervals.at(-1);
  // Hay un bloque parcial solo si queda tiempo después del bloque anterior.
  if (closing && (durationMinutes - intervalMinutes) * MILLISECONDS_PER_MINUTE < elapsed) {
    yield { durationMinutes, expiresAt: closing.endsAt, truncatedAtClose: true };
  }
}

export function calculateParkingAmount(blockAmount: string, blocks: number): string {
  const blockCents = Math.round(Number(blockAmount) * 100);
  return ((blockCents * blocks) / 100).toFixed(2);
}
