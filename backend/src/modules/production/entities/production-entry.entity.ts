import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { Department } from '../../organization/entities/department.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { ProductionOrder } from './production-order.entity';
import { ProductionOrderOperation } from './production-order-operation.entity';
import { Machine } from './machine.entity';
import { Shift } from './shift.entity';
import { DowntimeReason } from './downtime-reason.entity';

@Entity('production_entries')
@Index(['companyId'])
export class ProductionEntry extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  // Optional Production Order linkage (Make-to-Order); null = Make-to-Stock
  @Index({ unique: false })
  @Column({ name: 'production_order_id', type: 'uuid', nullable: true })
  productionOrderId: string | null;

  @ManyToOne(() => ProductionOrder, { nullable: true })
  @JoinColumn({ name: 'production_order_id' })
  productionOrder: ProductionOrder | null;

  @Column({ name: 'production_order_operation_id', type: 'uuid', nullable: true })
  productionOrderOperationId: string | null;

  @ManyToOne(() => ProductionOrderOperation, { nullable: true })
  @JoinColumn({ name: 'production_order_operation_id' })
  productionOrderOperation: ProductionOrderOperation | null;

  // Organization context (existing Division → Section → Department hierarchy)
  @Index({ unique: false })
  @Column({ name: 'division_id', type: 'uuid' })
  divisionId: string;

  @ManyToOne(() => Division)
  @JoinColumn({ name: 'division_id' })
  division: Division;

  @Index({ unique: false })
  @Column({ name: 'section_id', type: 'uuid' })
  sectionId: string;

  @ManyToOne(() => Section)
  @JoinColumn({ name: 'section_id' })
  section: Section;

  @Index({ unique: false })
  @Column({ name: 'department_id', type: 'uuid' })
  departmentId: string;

  @ManyToOne(() => Department)
  @JoinColumn({ name: 'department_id' })
  department: Department;

  // Day / Shift / Machine / People
  @Index({ unique: false })
  @Column({ name: 'entry_date', type: 'date' })
  entryDate: string;

  @Index({ unique: false })
  @Column({ name: 'shift_id', type: 'uuid' })
  shiftId: string;

  @ManyToOne(() => Shift)
  @JoinColumn({ name: 'shift_id' })
  shift: Shift;

  @Column({ name: 'machine_id', type: 'uuid', nullable: true })
  machineId: string | null;

  @ManyToOne(() => Machine, { nullable: true })
  @JoinColumn({ name: 'machine_id' })
  machine: Machine | null;

  @Column({ name: 'machine_no', type: 'varchar', length: 50 })
  machineNo: string;

  @Column({ name: 'operator_name', type: 'varchar', length: 255 })
  operatorName: string;

  @Column({ name: 'supervisor_name', type: 'varchar', length: 255, nullable: true })
  supervisorName: string | null;

  // Item context (UOM is item-driven)
  @Column({ name: 'coil_size', type: 'varchar', length: 50, nullable: true })
  coilSize: string | null;

  @Index({ unique: false })
  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'uom_id', type: 'uuid' })
  uomId: string;

  @ManyToOne(() => Uom)
  @JoinColumn({ name: 'uom_id' })
  uom: Uom;

  // Quantities: target never overwritten by actual
  @Column({ name: 'target_quantity', type: 'decimal', precision: 19, scale: 4 })
  targetQuantity: number;

  // ERP-00016 target snapshot: which Machine Target produced these numbers.
  // (FK fk_production_entries_machine_target → machine_targets.id; kept as a
  // plain column to avoid a cross-module entity import cycle.)
  @Column({ name: 'machine_target_id', type: 'uuid', nullable: true })
  machineTargetId: string | null;

  @Column({ name: 'standard_hours', type: 'decimal', precision: 6, scale: 2, nullable: true })
  standardHours: number | null;

  /** calculated_target = target × running_hours / standard_hours at entry time */
  @Column({ name: 'calculated_target', type: 'decimal', precision: 19, scale: 4, nullable: true })
  calculatedTarget: number | null;

  @Column({ name: 'actual_quantity', type: 'decimal', precision: 19, scale: 4, default: 0 })
  actualQuantity: number;

  // Calculated metrics (recomputed server-side on save)
  @Column({ name: 'achievement_percentage', type: 'decimal', precision: 7, scale: 2, default: 0 })
  achievementPercentage: number;

  @Column({ name: 'efficiency_percentage', type: 'decimal', precision: 7, scale: 2, default: 0 })
  efficiencyPercentage: number;

  // Time accounting: downtime NEVER inside running hours
  @Column({ name: 'running_hours', type: 'decimal', precision: 6, scale: 2, default: 0 })
  runningHours: number;

  @Column({ name: 'downtime_hours', type: 'decimal', precision: 6, scale: 2, default: 0 })
  downtimeHours: number;

  @Column({ name: 'downtime_reason_id', type: 'uuid', nullable: true })
  downtimeReasonId: string | null;

  @ManyToOne(() => DowntimeReason, { nullable: true })
  @JoinColumn({ name: 'downtime_reason_id' })
  downtimeReason: DowntimeReason | null;

  @Column({ name: 'downtime_reason', type: 'text', nullable: true })
  downtimeReasonText: string | null;

  // Quality: scrap kept separate from actual good output
  @Column({ name: 'scrap_quantity', type: 'decimal', precision: 19, scale: 4, default: 0 })
  scrapQuantity: number;

  // Stock-ledger receipt created when the entry posted directly to inventory
  // (make-to-stock). Order-linked entries leave this null — order completion
  // is the single authoritative posting point.
  @Column({ name: 'inventory_reference_id', type: 'uuid', nullable: true })
  inventoryReferenceId: string | null;

  /**
   * Raw Material Source Warehouse for automatic BOM consumption when the entry
   * posts to inventory. Intentionally NOT a mapped column: the live
   * `production_entries` table does not contain `raw_material_warehouse_id`
   * (migration erp_00012 added it only to `production_orders`). The value is
   * passed directly into the posting transaction instead of being persisted,
   * so production-entry inventory posting works against the existing schema.
   */
  rawMaterialWarehouseId: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}
