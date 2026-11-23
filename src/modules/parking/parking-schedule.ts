import type { EntityManager } from 'typeorm';

const PARKING_TIME_ZONE = 'America/La_Paz';
const parkingDate = new Intl.DateTimeFormat('en', {
  timeZone: PARKING_TIME_ZONE,
  dateStyle: 'medium',
});

export interface ChargeableInterval {
  startsAt: Date;
  endsAt: Date;
}

export function isSameParkingDay(first: Date, second: Date): boolean {
  return parkingDate.format(first) === parkingDate.format(second);
}

export async function getPurchaseTime(manager: EntityManager) {
  const startsAt = new Date();
  // La fecha local determina qué horario semanal y qué feriados se aplican.
  const intervals = await manager.query<ChargeableInterval[]>(
    `WITH local_day AS (
       SELECT ($1::timestamptz AT TIME ZONE $2)::date AS date
     )
     SELECT (local_day.date + schedule."startTime") AT TIME ZONE $2 AS "startsAt",
            (local_day.date + schedule."endTime") AT TIME ZONE $2 AS "endsAt"
     FROM local_day
     JOIN parking_schedules AS schedule
       ON schedule."dayOfWeek" = EXTRACT(ISODOW FROM local_day.date)
     WHERE NOT EXISTS (SELECT 1 FROM parking_holidays AS holiday WHERE holiday.date = local_day.date)
     ORDER BY schedule."startTime"`,
    [startsAt.toISOString(), PARKING_TIME_ZONE],
  );
  const current = intervals.findIndex((interval) => interval.startsAt <= startsAt && startsAt < interval.endsAt);
  if (current === -1) {
    return { startsAt, intervals: [] };
  }
  return {
    startsAt,
    intervals: [{ startsAt, endsAt: intervals[current].endsAt }, ...intervals.slice(current + 1)],
  };
}
