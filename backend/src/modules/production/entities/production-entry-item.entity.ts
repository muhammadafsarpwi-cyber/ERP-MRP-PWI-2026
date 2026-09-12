import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { ProductionEntry } from './production-entry.entity';

/** Role of a production-entry item line. */
export enum ProductionEntryItemKind {
  /** The produced item (receipt). */
  OUTPUT = 'OUTPUT',
  /** A consumed material (issue), recorded with its exact configured item ID. */
  INPUT = 'INPUT',
}

@Entity('production_entry_items')
@Index(['productionEntryId'])
export class ProductionEntryItem extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'production_entry_id', type: 'uuid' })
  productionEntryId: string;

  @ManyToOne(() => ProductionEntry, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'production_entry_id' })
  productionEntry: ProductionEntry;

  @Column({ name: 'line_number', type: 'int', default: 1 })
  lineNumber: number;

  /** OUTPUT (produced) or INPUT (consumed material). Defaults to OUTPUT for legacy rows. */
  @Column({ name: 'entry_kind', type: 'varchar', length: 20, default: ProductionEntryItemKind.OUTPUT })
  entryKind: ProductionEntryItemKind;

  /** Store the consumed INPUT materials are deducted from (INPUT lines only). */
  @Column({ name: 'source_warehouse_id', type: 'uuid', nullable: true })
  sourceWarehouseId: string | null;

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'source_warehouse_id' })
  sourceWarehouse: Warehouse | null;

  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  @ManyToOne(() => Item, { nullable: true })
  @JoinColumn({ name: 'item_id' })
  item: Item | null;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId: string | null;

  @ManyToOne(() => Uom, { nullable: true })
  @JoinColumn({ name: 'uom_id' })
  uom: Uom | null;

  @Column({ name: 'target_quantity', type: 'numeric', precision: 19, scale: 4, default: 0 })
  targetQuantity: number;

  @Column({ name: 'actual_quantity', type: 'numeric', precision: 19, scale: 4, default: 0 })
  actualQuantity: number;

  @Column({ name: 'scrap_quantity', type: 'numeric', precision: 19, scale: 4, default: 0 })
  scrapQuantity: number;

  @Column({ name: 'running_hours', type: 'numeric', precision: 6, scale: 2, default: 0 })
  runningHours: number;

  @Column({ name: 'standard_hours', type: 'numeric', precision: 6, scale: 2, nullable: true })
  standardHours: number | null;

  @Column({ name: 'calculated_target', type: 'numeric', precision: 19, scale: 4, nullable: true })
  calculatedTarget: number | null;

  @Column({ name: 'achievement_percentage', type: 'numeric', precision: 7, scale: 2, default: 0 })
  achievementPercentage: number;

  @Column({ name: 'efficiency_percentage', type: 'numeric', precision: 7, scale: 2, default: 0 })
  efficiencyPercentage: number;

  @Column({ name: 'routing_code', type: 'varchar', length: 50, nullable: true })
  routingCode: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}