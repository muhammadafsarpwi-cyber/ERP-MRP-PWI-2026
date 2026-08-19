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

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: SpecificationStatus.ACTIVE })
  status: SpecificationStatus;
}
