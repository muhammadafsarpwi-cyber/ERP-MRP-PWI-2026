import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Division } from '../../organization/entities/division.entity';
import { Department } from '../../organization/entities/department.entity';
import { Machine } from './machine.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';

export type ReworkReturnStatus =
  | 'DISPATCHED'
  | 'ACKNOWLEDGED'
  | 'IN_REWORK'
  | 'RECTIFIED'
  | 'SCRAPPED'
  | 'CLOSED';

export type ReworkPriority = 'NORMAL' | 'HIGH' | 'URGENT';

@Entity('production_rework_returns')
@Index(['companyId'])
@Index(['returnDate'])
@Index(['fromDepartmentId', 'toDepartmentId'])
@Index(['status'])
export class ProductionReworkReturn extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'return_number', type: 'varchar', length: 50 })
  returnNumber: string;

  @Column({ name: 'return_date', type: 'date' })
  returnDate: string;

  @Column({ name: 'division_id', type: 'uuid' })
  divisionId: string;

  @ManyToOne(() => Division, { nullable: true })
  @JoinColumn({ name: 'division_id' })
  division?: Division;

  @Column({ name: 'from_department_id', type: 'uuid' })
  fromDepartmentId: string;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'from_department_id' })
  fromDepartment?: Department;

  @Column({ name: 'to_department_id', type: 'uuid' })
  toDepartmentId: string;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'to_department_id' })
  toDepartment?: Department;

  @Column({ name: 'from_machine_id', type: 'uuid', nullable: true })
  fromMachineId?: string | null;

  @ManyToOne(() => Machine, { nullable: true })
  @JoinColumn({ name: 'from_machine_id' })
  fromMachine?: Machine | null;

  @Column({ name: 'to_machine_id', type: 'uuid', nullable: true })
  toMachineId?: string | null;

  @ManyToOne(() => Machine, { nullable: true })
  @JoinColumn({ name: 'to_machine_id' })
  toMachine?: Machine | null;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item, { nullable: true })
  @JoinColumn({ name: 'item_id' })
  item?: Item;

  @Column({ name: 'uom_id', type: 'uuid' })
  uomId: string;

  @ManyToOne(() => Uom, { nullable: true })
  @JoinColumn({ name: 'uom_id' })
  uom?: Uom;

  @Column({ name: 'quantity', type: 'numeric', precision: 15, scale: 4 })
  quantity: number;

  @Column({ name: 'quantity_pcs', type: 'numeric', precision: 15, scale: 2, nullable: true })
  quantityPcs?: number | null;

  @Column({ name: 'quantity_grs', type: 'numeric', precision: 15, scale: 4, nullable: true })
  quantityGrs?: number | null;

  @Column({ name: 'defect_reason', type: 'varchar', length: 100 })
  defectReason: string;

  @Column({ name: 'defect_description', type: 'text', nullable: true })
  defectDescription?: string | null;

  @Column({ name: 'corrective_action', type: 'varchar', length: 100 })
  correctiveAction: string;

  @Column({ name: 'priority', type: 'varchar', length: 20, default: 'NORMAL' })
  priority: ReworkPriority;

  @Column({ name: 'status', type: 'varchar', length: 30, default: 'DISPATCHED' })
  status: ReworkReturnStatus;

  @Column({ name: 'returned_by', type: 'varchar', length: 100, nullable: true })
  returnedBy?: string | null;

  @Column({ name: 'received_by', type: 'varchar', length: 100, nullable: true })
  receivedBy?: string | null;

  @Column({ name: 'rectified_quantity', type: 'numeric', precision: 15, scale: 4, default: 0 })
  rectifiedQuantity: number;

  @Column({ name: 'scrapped_quantity', type: 'numeric', precision: 15, scale: 4, default: 0 })
  scrappedQuantity: number;

  @Column({ name: 'is_rework', type: 'boolean', default: true })
  isRework: boolean;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks?: string | null;
}

