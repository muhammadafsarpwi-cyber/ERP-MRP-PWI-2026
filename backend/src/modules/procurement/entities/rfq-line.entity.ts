import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { RequestForQuotation } from './request-for-quotation.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';

@Entity('rfq_lines')
export class RfqLine extends BaseEntity {
  @Column({ name: 'rfq_id', type: 'uuid' })
  rfqId: string;

  @ManyToOne(() => RequestForQuotation, (rfq) => rfq.lines)
  @JoinColumn({ name: 'rfq_id' })
  rfq: RequestForQuotation;

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

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
