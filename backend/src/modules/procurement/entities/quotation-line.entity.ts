import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Quotation } from './quotation.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';

@Entity('quotation_lines')
export class QuotationLine extends BaseEntity {
  @Column({ name: 'quotation_id', type: 'uuid' })
  quotationId: string;

  @ManyToOne(() => Quotation, (quotation) => quotation.lines)
  @JoinColumn({ name: 'quotation_id' })
  quotation: Quotation;

  @Column({ name: 'line_number', type: 'integer' })
  lineNumber: number;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'uom_id', type: 'uuid' })
  uomId: string;

  @ManyToOne(() => Uom)
  @JoinColumn({ name: 'uom_id' })
  uom: Uom;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantity: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 15, scale: 6 })
  unitPrice: number;

  @Column({ name: 'discount_percent', type: 'decimal', precision: 5, scale: 2, default: 0 })
  discountPercent: number;

  @Column({ name: 'total_price', type: 'decimal', precision: 15, scale: 6, nullable: true })
  totalPrice: number | null;

  @Column({ name: 'lead_time_days', type: 'integer', default: 0 })
  leadTimeDays: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
