import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { ProductionUnit } from './production-unit.entity';

export enum PrintEventType {
  PRINT   = 'PRINT',
  REPRINT = 'REPRINT',
}

/**
 * Immutable record of every print/reprint action on a production unit label.
 * Never delete; append-only. Answers: who printed, when, how many copies.
 */
@Entity('production_unit_print_logs')
@Index(['productionUnitId'])
@Index(['printJobId'])
export class ProductionUnitPrintLog extends BaseEntity {

  @Column({ name: 'production_unit_id', type: 'uuid' })
  productionUnitId: string;

  @ManyToOne(() => ProductionUnit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'production_unit_id' })
  productionUnit: ProductionUnit;

  /** Logical batch job that grouped multiple units in one print action */
  @Column({ name: 'print_job_id', type: 'varchar', length: 50, nullable: true })
  printJobId: string | null;

  @Column({
    name: 'event_type',
    type: 'varchar',
    length: 20,
    default: PrintEventType.PRINT,
  })
  eventType: PrintEventType;

  @Column({ name: 'printed_by', type: 'uuid', nullable: true })
  printedBy: string | null;

  @Column({ name: 'printed_at', type: 'timestamp with time zone' })
  printedAt: Date;

  @Column({ name: 'printer_name', type: 'varchar', length: 255, nullable: true })
  printerName: string | null;

  @Column({ name: 'copies', type: 'int', default: 1 })
  copies: number;

  @Column({ name: 'label_template', type: 'varchar', length: 50, nullable: true })
  labelTemplate: string | null;
}
