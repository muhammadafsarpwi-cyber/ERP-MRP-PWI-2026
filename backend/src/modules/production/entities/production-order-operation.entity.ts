import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { Department } from '../../organization/entities/department.entity';
import { Uom } from '../../item/entities/uom.entity';
import { RoutingOperation } from '../../production-routing/entities/routing-operation.entity';
import { ProductionOrder } from './production-order.entity';
import { ProductionOrderOperationLog } from './production-order-operation-log.entity';

export enum ProductionOperationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

@Entity('production_order_operations')
export class ProductionOrderOperation extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'production_order_id', type: 'uuid' })
  productionOrderId: string;

  @ManyToOne(() => ProductionOrder, (order) => order.operations)
  @JoinColumn({ name: 'production_order_id' })
  productionOrder: ProductionOrder;

  @Column({ name: 'routing_operation_id', type: 'uuid', nullable: true })
  routingOperationId: string | null;

  @ManyToOne(() => RoutingOperation)
  @JoinColumn({ name: 'routing_operation_id' })
  routingOperation: RoutingOperation | null;

  @Column({ name: 'sequence_no', type: 'integer' })
  sequenceNo: number;

  @Column({ name: 'operation_code', type: 'varchar', length: 50 })
  operationCode: string;

  @Column({ name: 'operation_name', type: 'varchar', length: 255 })
  operationName: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId: string | null;

  @ManyToOne(() => Division)
  @JoinColumn({ name: 'division_id' })
  division: Division | null;

  @Column({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId: string | null;

  @ManyToOne(() => Section)
  @JoinColumn({ name: 'section_id' })
  section: Section | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @ManyToOne(() => Department)
  @JoinColumn({ name: 'department_id' })
  department: Department | null;

  @Column({ name: 'setup_time_minutes', type: 'decimal', precision: 19, scale: 4, default: 0 })
  setupTimeMinutes: number;

  @Column({ name: 'run_time_minutes', type: 'decimal', precision: 19, scale: 4, default: 0 })
  runTimeMinutes: number;

  @Column({ name: 'planned_quantity', type: 'decimal', precision: 19, scale: 4, default: 0 })
  plannedQuantity: number;

  @Column({ name: 'input_quantity', type: 'decimal', precision: 19, scale: 4, nullable: true })
  inputQuantity: number | null;

  @Column({ name: 'output_quantity', type: 'decimal', precision: 19, scale: 4, nullable: true })
  outputQuantity: number | null;

  @Column({ name: 'scrapped_quantity', type: 'decimal', precision: 19, scale: 4, default: 0 })
  scrappedQuantity: number;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId: string | null;

  @ManyToOne(() => Uom)
  @JoinColumn({ name: 'uom_id' })
  uom: Uom | null;

  @Column({ type: 'varchar', length: 20, default: ProductionOperationStatus.PENDING })
  status: ProductionOperationStatus;

  @Column({ name: 'actual_start_date', type: 'timestamp with time zone', nullable: true })
  actualStartDate: Date | null;

  @Column({ name: 'actual_end_date', type: 'timestamp with time zone', nullable: true })
  actualEndDate: Date | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @OneToMany(() => ProductionOrderOperationLog, (log) => log.operation)
  logs: ProductionOrderOperationLog[];
}
