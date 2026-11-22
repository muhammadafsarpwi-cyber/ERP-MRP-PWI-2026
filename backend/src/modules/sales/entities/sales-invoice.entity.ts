import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { SalesCustomer } from './sales-customer.entity';
import { SalesOrder } from './sales-order.entity';
import { SalesDelivery } from './sales-delivery.entity';
import { SalesInvoiceLine } from './sales-invoice-line.entity';
import { Division } from '../../organization/entities/division.entity';

@Entity('sales_invoices', { schema: 'erp_sales' })
export class SalesInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'invoice_no', type: 'varchar', length: 50 })
  invoiceNo: string;

  @Column({ name: 'sales_order_id', type: 'uuid', nullable: true })
  salesOrderId: string | null;

  @ManyToOne(() => SalesOrder, { nullable: true })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder: SalesOrder;

  @Column({ name: 'sales_delivery_id', type: 'uuid', nullable: true })
  salesDeliveryId?: string | null;

  @ManyToOne(() => SalesDelivery, { nullable: true })
  @JoinColumn({ name: 'sales_delivery_id' })
  salesDelivery?: SalesDelivery | null;

  @Column({ name: 'delivery_number', type: 'varchar', length: 60, nullable: true })
  deliveryNumber?: string | null;

  @Column({ name: 'gate_pass_number', type: 'varchar', length: 60, nullable: true })
  gatePassNumber?: string | null;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId?: string | null;

  @ManyToOne(() => Division, { nullable: true })
  @JoinColumn({ name: 'division_id' })
  division?: Division | null;

  @Column({ name: 'payment_terms', type: 'varchar', length: 60, nullable: true })
  paymentTerms?: string | null;

  @Column({ name: 'document_type', type: 'varchar', length: 40, nullable: true, default: 'Tax Invoice' })
  documentType?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @OneToMany(() => SalesInvoiceLine, (line) => line.invoice)
  lines?: SalesInvoiceLine[];

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @ManyToOne(() => SalesCustomer)
  @JoinColumn({ name: 'customer_id' })
  customer: SalesCustomer;

  @Column({ name: 'invoice_date', type: 'date' })
  invoiceDate: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  subtotal: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 15, scale: 4, nullable: true })
  discountAmount: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, nullable: true })
  taxAmount: number;

  @Column({ name: 'total_amount', type: 'decimal', precision: 15, scale: 4 })
  totalAmount: number;

  @Column({ name: 'paid_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  paidAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  balance: number;

  @Column({ type: 'varchar', length: 30, default: 'Pending' })
  status: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  /**
   * Recycle Bin columns — see `sales-order.entity.ts` for why these are
   * declared inline instead of inheriting `SoftDeletableEntity`.
   */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp with time zone', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy: string | null;
}
