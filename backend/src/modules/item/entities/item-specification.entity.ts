import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Item } from './item.entity';
import { Uom } from './uom.entity';

export enum SpecificationStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('item_specifications')
export class ItemSpecification extends BaseEntity {
  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item, (item) => item.specifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'specification_name', type: 'varchar', length: 255 })
  specName: string;

  @Column({ name: 'specification_value', type: 'varchar', length: 500 })
  specValue: string;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId: string | null;

  @ManyToOne(() => Uom, { nullable: true })
  @JoinColumn({ name: 'uom_id' })
  uom: Uom;

  @Column({ name: 'min_value', type: 'numeric', precision: 19, scale: 6, nullable: true })
  minValue: number | null;

  @Column({ name: 'max_value', type: 'numeric', precision: 19, scale: 6, nullable: true })
  maxValue: number | null;

  @Column({ name: 'target_value', type: 'numeric', precision: 19, scale: 6, nullable: true })
  targetValue: number | null;

  @Column({ name: 'tolerance_plus', type: 'numeric', precision: 19, scale: 6, nullable: true })
  tolerancePlus: number | null;

  @Column({ name: 'tolerance_minus', type: 'numeric', precision: 19, scale: 6, nullable: true })
  toleranceMinus: number | null;

  @Column({ name: 'is_critical', type: 'boolean', default: false })
  isCritical: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'varchar', length: 20, default: SpecificationStatus.ACTIVE })
  status: SpecificationStatus;
}
