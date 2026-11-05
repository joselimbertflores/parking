import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 64, unique: true })
  identityUserId: string;

  @Column({ length: 200 })
  fullName: string;

  @Column('enum', { enum: ['admin', 'manager', 'controller'], array: true })
  roles: ('admin' | 'manager' | 'controller')[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
