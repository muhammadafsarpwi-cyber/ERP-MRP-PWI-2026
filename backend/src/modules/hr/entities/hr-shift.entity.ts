import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';

@Entity('hr_shifts')
export class HrShift extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'shift_code', type: 'varchar', length: 50 })
  shiftCode: string;

  @Column({ name: 'shift_name', type: 'varchar', length: 255 })
  shiftName: string;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime: string | null;

  @Column({ name: 'working_hours', type: 'numeric', precision: 5, scale: 2, default: 8 })
  workingHours: number;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;
}