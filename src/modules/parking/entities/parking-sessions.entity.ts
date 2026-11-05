import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Payment } from '../../payments/entities/payments.entity.js';
import { ParkingSegment } from './parking-segments.entity.js';

@Entity('parking_sessions')
@Index(['plate', 'expiresAt'])
@Check('"expiresAt" > "startsAt"')
export class ParkingSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  plate: string;

  @Index()
  @Column('integer')
  parkingSegmentId: number;

  @Column('timestamptz')
  startsAt: Date;

  @Column('timestamptz')
  expiresAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => ParkingSegment, { nullable: false })
  parkingSegment: Relation<ParkingSegment>;

  @OneToMany(() => Payment, (payment) => payment.parkingSession)
  payments: Relation<Payment[]>;
}
