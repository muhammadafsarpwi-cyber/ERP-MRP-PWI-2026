import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { Department } from '../../organization/entities/department.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { ProductionRouting } from './production-routing.entity';

@Entity('routing_operations')
export class RoutingOperation extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'routing_id', type: 'uuid' })
  routingId: string;

  @ManyToOne(() => ProductionRouting, (r) => r.operations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'routing_id' })
  routing: ProductionRouting;

  @Column({ name: 'sequence_no', type: 'integer', default: 10 })
  sequenceNo: number;

  @Column({ name: 'operation_code', type: 'varchar', length: 50 })
  operationCode: string;

  @Column({ name: 'operation_name', type: 'varchar', length: 255 })
  operationName: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId: string | null;

  @ManyToOne(() => Division, { nullable: true })
  @JoinColumn({ name: 'division_id' })
  division: Division;

  @Column({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId: string | null;

  @ManyToOne(() => Section, { nullable: true })
  @JoinColumn({ name: 'section_id' })
  section: Section;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @Column({ name: 'setup_time_minutes', type: 'decimal', precision: 19, scale: 4, default: 0 })
  setupTimeMinutes: number;

  @Column({ name: 'run_time_minutes', type: 'decimal', precision: 19, scale: 4, default: 0 })
  runTimeMinutes: number;

  @Column({ name: 'queue_time_minutes', type: 'decimal', precision: 19, scale: 4, default: 0 })
  queueTimeMinutes: number;

  @Column({ name: 'wait_time_minutes', type: 'decimal', precision: 19, scale: 4, default: 0 })
  waitTimeMinutes: number;

  @Column({ name: 'labor_required', type: 'boolean', default: true })
  laborRequired: boolean;

  @Column({ name: 'machine_required', type: 'boolean', default: false })
  machineRequired: boolean;

  @Column({ name: 'input_item_id', type: 'uuid', nullable: true })
  inputItemId: string | null;

  @ManyToOne(() => Item, { nullable: true })
  @JoinColumn({ name: 'input_item_id' })
  inputItem: Item;

  @Column({ name: 'output_item_id', type: 'uuid', nullable: true })
  outputItemId: string | null;

  @ManyToOne(() => Item, { nullable: true })
  @JoinColumn({ name: 'output_item_id' })
  outputItem: Item;

  @Column({ name: 'input_quantity', type: 'decimal', precision: 19, scale: 4, default: 0 })
  inputQuantity: number;

  @Column({ name: 'output_quantity', type: 'decimal', precision: 19, scale: 4, default: 0 })
  outputQuantity: number;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId: string | null;

  @ManyToOne(() => Uom, { nullable: true })
  @JoinColumn({ name: 'uom_id' })
  uom: Uom;

  @Column({ name: 'scrap_percentage', type: 'decimal', precision: 5, scale: 2, default: 0 })
  scrapPercentage: number;

  @Column({ name: 'setup_scrap_percentage', type: 'decimal', precision: 5, scale: 2, default: 0 })
  setupScrapPercentage: number;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}
