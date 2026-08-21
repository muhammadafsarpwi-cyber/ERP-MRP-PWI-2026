import { Entity, Column, ManyToOne, JoinColumn, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Company } from '../../organization/entities/company.entity';
import { ProductionOrderOperation } from './production-order-operation.entity';

export enum OperationLogEventType {
  STARTED = 'STARTED',
  COMPLETED = 'COMPLETED',
}

@Entity('production_order_operation_logs')
export class ProductionOrderOperationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'production_order_operation_id', type: 'uuid' })
  productionOrderOperationId: string;

  @ManyToOne(() => ProductionOrderOperation, (op) => op.logs)
  @JoinColumn({ name: 'production_order_operation_id' })
  operation: ProductionOrderOperation;

  @Column({ name: 'event_type', type: 'varchar', length: 20 })
  eventType: OperationLogEventType;

  @Column({ name: 'input_quantity', type: 'decimal', precision: 19, scale: 4, nullable: true })
  inputQuantity: number | null;

  @Column({ name: 'output_quantity', type: 'decimal', precision: 19, scale: 4, nullable: true })
  outputQuantity: number | null;

  @Column({ name: 'scrapped_quantity', type: 'decimal', precision: 19, scale: 4, nullable: true })
  scrappedQuantity: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'logged_by', type: 'uuid', nullable: true })
  loggedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;
}
