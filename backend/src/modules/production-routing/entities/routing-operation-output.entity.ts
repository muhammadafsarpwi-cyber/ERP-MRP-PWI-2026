import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { RoutingOperation } from './routing-operation.entity';

/** Nature of a routing-operation output item. */
export enum RoutingOutputType {
  /** The primary product of the operation. */
  MAIN = 'MAIN',
  /** Secondary product produced alongside the main output. */
  CO_PRODUCT = 'CO_PRODUCT',
  /** Incidental material (e.g. scrap/offcut) produced by the operation. */
  BY_PRODUCT = 'BY_PRODUCT',
}

@Index(['routingOperationId'])
@Entity('routing_operation_outputs')
export class RoutingOperationOutput extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'routing_operation_id', type: 'uuid' })
  routingOperationId: string;

  @ManyToOne(() => RoutingOperation, (op) => op.outputs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'routing_operation_id' })
  operation: RoutingOperation;

  /** Exact configured output item. */
  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  /** Quantity produced per routing base quantity. */
  @Column({ name: 'quantity', type: 'decimal', precision: 19, scale: 4, default: 0 })
  quantity: number;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId: string | null;

  @ManyToOne(() => Uom, { nullable: true })
  @JoinColumn({ name: 'uom_id' })
  uom: Uom | null;

  @Column({ name: 'output_type', type: 'varchar', length: 20, default: RoutingOutputType.MAIN })
  outputType: RoutingOutputType;

  /** Expected yield for this output (0-100); 100 = no yield loss. */
  @Column({ name: 'yield_percentage', type: 'decimal', precision: 7, scale: 2, default: 100 })
  yieldPercentage: number;

  /** First/primary output — synchronizes the legacy output_item_id/output_quantity columns. */
  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'line_number', type: 'integer', default: 10 })
  lineNumber: number;
}