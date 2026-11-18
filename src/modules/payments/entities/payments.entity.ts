import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { VehicleType } from '../../../common/enums/vehicle-type.enum.js';
import { ParkingSegment } from '../../parking/entities/parking-segments.entity.js';
import { ParkingSession } from '../../parking/entities/parking-sessions.entity.js';
import { User } from '../../users/entities/users.entity.js';

@Entity('payments')
@Check('"durationMinutes" > 0')
@Check('"amount" >= 0')
@Check(`"status" = 'confirmed' OR "parkingSessionId" IS NULL`)
@Check(
  `"method" <> 'cash' OR ("status" = 'confirmed' AND "recordedByUserId" IS NOT NULL)`,
)
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  plate: string;

  @Column('enum', { enum: VehicleType })
  vehicleType: VehicleType;

  @Index()
  @Column('integer')
  parkingSegmentId: number;

  @Index()
  @Column('integer', { nullable: true })
  parkingSessionId: number | null;

  @Column('integer')
  durationMinutes: number;

  @Column('numeric', { precision: 10, scale: 2 })
  amount: string;

  @Column('enum', { enum: ['cash', 'qr'] })
  method: 'cash' | 'qr';

  @Column('enum', { enum: ['pending', 'confirmed', 'failed'] })
  status: 'pending' | 'confirmed' | 'failed';

  @Index()
  @Column('integer', { nullable: true })
  recordedByUserId: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column('timestamptz', { nullable: true })
  paidAt: Date | null;

  @ManyToOne(() => ParkingSegment, { nullable: false })
  parkingSegment: Relation<ParkingSegment>;

  @ManyToOne(() => ParkingSession, (session) => session.payments)
  parkingSession: Relation<ParkingSession> | null;

  @ManyToOne(() => User)
  recordedByUser: Relation<User> | null;
}
