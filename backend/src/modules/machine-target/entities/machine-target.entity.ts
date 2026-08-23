import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Machine } from '../../production/entities/machine.entity';
import { Shift } from '../../production/entities/shift.entity';
import { Uom } from '../../item/entities/uom.entity';

export enum MachineTargetStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/**
 * ERP-00016 — Machine Target Master
 *
 * One row = "machine M produces target_quantity UOM units in standard_hours
 * hours on shift S, effective [effective_from, effective_to]".
 *
 * History is never overwritten: a new revision gets its own row and the
 * previous row is closed (effective_to) or deactivated. Production entries
 * store a snapshot (machine_target_id / standard_hours / calculated_target)
 * so historical reports remain explainable after later revisions.
 */
@Entity('machine_targets')
@Index(['companyId'])
@Index(['machineId', 'shiftId'])
export class MachineTarget extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index({ unique: false })
  @Column({ name: 'machine_id', type: 'uuid' })
  machineId: string;

  @ManyToOne(() => Machine)
  @JoinColumn({ name: 'machine_id' })
  machine: Machine;

  @Index({ unique: false })
  @Column({ name: 'shift_id', type: 'uuid' })
  shiftId: string;

  @ManyToOne(() => Shift)
  @JoinColumn({ name: 'shift_id' })
  shift: Shift;

  @Index({ unique: false })
  @Column({ name: 'uom_id', type: 'uuid' })
  uomId: string;

  @ManyToOne(() => Uom)
  @JoinColumn({ name: 'uom_id' })
  uom: Uom;

  /** Standard working hours the target quantity is based on (> 0). */
  @Column({ name: 'standard_hours', type: 'numeric', precision: 19, scale: 4, default: 8 })
  standardHours: string | number;

  /** Standard production quantity over standard_hours (> 0). */
  @Column({ name: 'target_quantity', type: 'numeric', precision: 19, scale: 4 })
  targetQuantity: string | number;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ type: 'varchar', length: 20, default: MachineTargetStatus.ACTIVE })
  status: MachineTargetStatus;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}
