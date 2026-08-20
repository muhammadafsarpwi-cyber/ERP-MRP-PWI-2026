import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { Supplier } from './supplier.entity';
import { PurchaseInvoiceLine } from './purchase-invoice-line.entity';

@Entity('purchase_invoices')
export class PurchaseInvoice extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'invoice_code', type: 'varchar', length: 50 })
  invoiceCode: string;

  @Column({ name: 'supplier_invoice_number', type: 'varchar', length: 100 })
  supplierInvoiceNumber: string;

  @Column({ name: 'po_id', type: 'uuid' })
  poId: string;

  @ManyToOne(() => PurchaseOrder)
  @JoinColumn({ name: 'po_id' })
  po: PurchaseOrder;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @Column({ name: 'invoice_date', type: 'date', nullable: true })
  invoiceDate: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ name: 'subtotal', type: 'decimal', precision: 15, scale: 6, default: 0 })
  subtotal: number;

  @Column({ name: 'tax_percent', type: 'decimal', precision: 5, scale: 2, default: 0 })
  taxPercent: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 6, default: 0 })
  taxAmount: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 15, scale: 6, default: 0 })
  discountAmount: number;

  @Column({ name: 'total_amount', type: 'decimal', precision: 15, scale: 6, default: 0 })
  totalAmount: number;

  @Column({ name: 'paid_amount', type: 'decimal', precision: 15, scale: 6, default: 0 })
  paidAmount: number;

  @Column({ name: 'currency_code', type: 'varchar', length: 3, default: 'PKR' })
  currencyCode: string;

  @Column({ name: 'payment_status', type: 'varchar', length: 20, default: 'UNPAID' })
  paymentStatus: string;

  @Column({ name: 'matching_status', type: 'varchar', length: 20, default: 'PENDING' })
  matchingStatus: string;

  @Column({ name: 'variance_amount', type: 'decimal', precision: 15, scale: 6, default: 0 })
  varianceAmount: number;

  @Column({ name: 'variance_notes', type: 'text', nullable: true })
  varianceNotes: string | null;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamp with time zone', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy: string | null;

  @Column({ name: 'posted_at', type: 'timestamp with time zone', nullable: true })
  postedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => PurchaseInvoiceLine, (line) => line.invoice)
  lines: PurchaseInvoiceLine[];
}
