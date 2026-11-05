import {
  Check,
  Column,
  Entity,
  Exclusion,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('parking_schedules')
@Check('"dayOfWeek" BETWEEN 1 AND 7')
@Check('"startTime" < "endTime"')
// The fixed date lets PostgreSQL compare time periods as half-open ranges.
@Exclusion(`USING gist (
  "dayOfWeek" WITH =,
  tsrange(DATE '2000-01-01' + "startTime", DATE '2000-01-01' + "endTime", '[)') WITH &&
)`)
export class ParkingSchedule {
  @PrimaryGeneratedColumn()
  id: number;

  // 1 = Monday, 7 = Sunday.
  @Column('smallint')
  dayOfWeek: number;

  @Column('time')
  startTime: string;

  @Column('time')
  endTime: string;
}
