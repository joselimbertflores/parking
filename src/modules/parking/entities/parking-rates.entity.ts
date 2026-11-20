import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('parking_rates')
@Check('"id" = 1')
@Check('"intervalMinutes" > 0')
@Check(`"amount" >= 0 AND "amount" <> 'NaN'`)
export class ParkingRate {
  @PrimaryColumn('integer', { default: 1 })
  id: number;

  @Column('integer')
  intervalMinutes: number;

  @Column('numeric', { precision: 10, scale: 2 })
  amount: string;
}
