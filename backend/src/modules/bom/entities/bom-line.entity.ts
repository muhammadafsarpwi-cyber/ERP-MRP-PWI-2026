import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { BillOfMaterials } from './bill-of-materials.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';

@Entity('bom_lines')
export class BomLine extends BaseEntity {
  @Column({ name: 'bom_id', type: 'uuid' })
  bomId: string;

  @ManyToOne(() => BillOfMaterials, (bom) => bom.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bom_id' })
  bom: BillOfMaterials;

  @Column({ name: 'line_number', type: 'integer' })
  lineNumber: number;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ type: 'decimal', precision: 19, scale: 4, default: 1 })
  quantity: number;

  @Column({ name: 'uom_id', type: 'uuid' })
  uomId: string;

  @ManyToOne(() => Uom)
  @JoinColumn({ name: 'uom_id' })
  uom: Uom;

  @Column({ name: 'scrap_factor', type: 'decimal', precision: 5, scale: 4, default: 0 })
  scrapFactor: number;

  @Column({ name: 'yield_percentage', type: 'decimal', precision: 5, scale: 2, default: 100 })
  yieldPercentage: number;

  @Column({ name: 'alternate_group', type: 'integer', nullable: true })
  alternateGroup: number | null;

  @Column({ name: 'alternate_rank', type: 'integer', nullable: true })
  alternateRank: number | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}
