import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { SalesInvoice } from './sales-invoice.entity';

@Entity('sales_invoice_lines', { schema: 'erp_sales' })
export class SalesInvoiceLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId: string;

  @ManyToOne(() => SalesInvoice, (inv) => inv.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: SalesInvoice;

  @Column({ name: 'line_number', type: 'integer', nullable: true })
  lineNumber: number | null;

  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  @ManyToOne(() => Item, { nullable: true })
  @JoinColumn({ name: 'item_id' })
  item?: Item | null;

  @Column({ name: 'item_code', type: 'varchar', length: 60, nullable: true })
  itemCode: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'soc_number', type: 'varchar', length: 60, nullable: true })
  socNumber: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  quantity: number;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId: string | null;

  @ManyToOne(() => Uom, { nullable: true })
  @JoinColumn({ name: 'uom_id' })
  uom?: Uom | null;

  @Column({ name: 'uom_code', type: 'varchar', length: 30, nullable: true })
  uomCode: string | null;

  @Column({ name: 'unit_price', type: 'decimal', precision: 15, scale: 6, default: 0 })
  unitPrice: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  discountAmount: number;

  @Column({ name: 'tax_rate', type: 'decimal', precision: 6, scale: 2, default: 0 })
  taxRate: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  taxAmount: number;

  @Column({ name: 'line_total', type: 'decimal', precision: 15, scale: 4, default: 0 })
  lineTotal: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;
}
