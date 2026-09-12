import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { RoutingOperation } from './routing-operation.entity';

/** Consumption basis applied to a routing-operation input quantity. */
export enum RoutingInputScrapBasis {
  /** Input is consumed for the whole production quantity (good output + scrap). */
  WITH_SCRAP = 'WITH_SCRAP',
  /** Input is consumed only for the good output quantity. */
  GOOD_ONLY = 'GOOD_ONLY',
}

@Index(['routingOperationId'])
@Entity('routing_operation_inputs')
export class RoutingOperationInput extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'routing_operation_id', type: 'uuid' })
  routingOperationId: string;

  @ManyToOne(() => RoutingOperation, (op) => op.inputs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'routing_operation_id' })
  operation: RoutingOperation;

  /** Exact configured input item. */
  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  /** Quantity consumed per routing base quantity (scaled by base_quantity at execution). */
  @Column({ name: 'quantity', type: 'decimal', precision: 19, scale: 4, default: 0 })
  quantity: number;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId: string | null;

  @ManyToOne(() => Uom, { nullable: true })
  @JoinColumn({ name: 'uom_id' })
  uom: Uom | null;

  /** Optional source store for this input (e.g. a procured item entering via store). */
  @Column({ name: 'source_warehouse_id', type: 'uuid', nullable: true })
  sourceWarehouseId: string | null;

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'source_warehouse_id' })
  sourceWarehouse: Warehouse | null;

  @Column({ name: 'scrap_basis', type: 'varchar', length: 20, default: RoutingInputScrapBasis.WITH_SCRAP })
  scrapBasis: RoutingInputScrapBasis;

  /** First/primary input — synchronizes the legacy input_item_id/input_quantity columns. */
  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'line_number', type: 'integer', default: 10 })
  lineNumber: number;
}