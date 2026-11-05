import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('parking_holidays')
export class ParkingHoliday {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('date', { unique: true })
  date: string;

  @Column()
  name: string;
}
