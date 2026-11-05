import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('parking_rates')
@Index(['active'], { unique: true, where: '"active" = true' })
@Check('"intervalMinutes" > 0')
@Check('"amount" >= 0')
export class ParkingRate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('integer')
  intervalMinutes: number;

  @Column('numeric', { precision: 10, scale: 2 })
  amount: string;

  @Column()
  active: boolean;
}
