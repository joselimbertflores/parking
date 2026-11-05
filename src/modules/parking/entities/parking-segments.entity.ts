import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('parking_segments')
export class ParkingSegment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string;

  @Column()
  streetName: string;

  @Column()
  reference: string;

  @Column('varchar', { nullable: true })
  side: string | null;

  @Column()
  active: boolean;
}
