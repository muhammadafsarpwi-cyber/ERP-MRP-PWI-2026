import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';

@Entity('hr_leave_types')
export class HrLeaveType extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'leave_code', type: 'varchar', length: 50 })
  leaveCode: string;

  @Column({ name: 'leave_name', type: 'varchar', length: 255 })
  leaveName: string;

  @Column({ name: 'days_per_year', type: 'int', default: 0 })
  daysPerYear: number;

  @Column({ name: 'is_paid', type: 'boolean', default: true })
  isPaid: boolean;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;
}