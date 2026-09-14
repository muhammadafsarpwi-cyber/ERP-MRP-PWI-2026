import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';

@Entity('hr_shift_roster')
export class HrShiftRoster extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'shift_id', type: 'uuid' })
  shiftId: string;

  @Column({ name: 'roster_date', type: 'date' })
  rosterDate: Date;

  @Column({ name: 'assignment_status', type: 'varchar', length: 20, default: 'ASSIGNED' })
  assignmentStatus: string;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}