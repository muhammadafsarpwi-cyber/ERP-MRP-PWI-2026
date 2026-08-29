import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';

@Entity('maintenance_technicians')
@Index(['employeeId'], { unique: true })
@Index(['status'])
@Index(['department'])
@Index(['skill'])
export class MaintenanceTechnician extends BaseEntity {
  @Column({ name: 'employee_id', type: 'varchar', length: 50 })
  employeeId: string;

  @Column({ name: 'technician_name', type: 'varchar', length: 255 })
  technicianName: string;

  @Column({ type: 'varchar', length: 100, default: 'Maintenance' })
  department: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  skill: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  shift: string | null;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: ErpUser | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}
