import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';

@Entity('hr_holidays')
export class HrHoliday extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'holiday_name', type: 'varchar', length: 255 })
  holidayName: string;

  @Column({ name: 'holiday_date', type: 'date' })
  holidayDate: Date;

  @Column({ name: 'is_recurring', type: 'boolean', default: false })
  isRecurring: boolean;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;
}