import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { RawMaterialReceipt } from './raw-material-receipt.entity';

@Entity('raw_material_receipt_lines')
@Index(['receiptId'])
@Index(['itemId'])
@Index(['companyId'])
export class RawMaterialReceiptLine extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'receipt_id', type: 'uuid' })
  receiptId: string;

  @ManyToOne(() => RawMaterialReceipt, (receipt) => receipt.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receipt_id' })
  receipt: RawMaterialReceipt;

  @Column({ name: 'line_number', type: 'int', default: 1 })
  lineNumber: number;

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

  @Column({ name: 'gate_pass_quantity', type: 'numeric', precision: 15, scale: 4, default: 0 })
  gatePassQuantity: number;

  @Column({ name: 'received_quantity', type: 'numeric', precision: 15, scale: 4, default: 0 })
  receivedQuantity: number;

  @Column({ type: 'numeric', precision: 15, scale: 4, default: 0 })
  difference: number;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}