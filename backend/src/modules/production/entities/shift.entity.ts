import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';

export enum ShiftStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('shifts')
@Index(['companyId'])
export class Shift extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index({ unique: false })
  @Column({ name: 'shift_code', type: 'varchar', length: 20 })
  shiftCode: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime: string | null;

  /**
   * Documented efficiency assumption (ERP-00013):
   * The system has no formal shift calendar / time-log module yet.
   * Efficiency % = running_hours / planned_hours × 100, where planned_hours
   * is taken from the shift master row selected on the production entry.
   */
  @Column({ name: 'planned_hours', type: 'decimal', precision: 5, scale: 2, default: 8 })
  plannedHours: number;

  @Column({ type: 'varchar', length: 20, default: ShiftStatus.ACTIVE })
  status: ShiftStatus;
}
