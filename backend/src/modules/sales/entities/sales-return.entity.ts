import { Entity, Column, ManyToOne, JoinColumn, OneToMany, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { SalesCustomer } from './sales-customer.entity';
import { SalesOrder } from './sales-order.entity';
import { SalesInvoice } from './sales-invoice.entity';
import { SalesDelivery } from './sales-delivery.entity';
import { SalesReturnLine } from './sales-return-line.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';

@Entity('sales_returns', { schema: 'erp_sales' })
export class SalesReturn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'return_number', type: 'varchar', length: 50 })
  returnNumber: string;

  @Column({ name: 'sales_order_id', type: 'uuid', nullable: true })
  salesOrderId: string | null;

  @ManyToOne(() => SalesOrder, { nullable: true })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder: SalesOrder;

  @Column({ name: 'sales_invoice_id', type: 'uuid', nullable: true })
  salesInvoiceId: string | null;

  @ManyToOne(() => SalesInvoice, { nullable: true })
  @JoinColumn({ name: 'sales_invoice_id' })
  salesInvoice: SalesInvoice;

  @Column({ name: 'sales_delivery_id', type: 'uuid', nullable: true })
  salesDeliveryId: string | null;

  @ManyToOne(() => SalesDelivery, { nullable: true })
  @JoinColumn({ name: 'sales_delivery_id' })
  salesDelivery: SalesDelivery;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @ManyToOne(() => SalesCustomer)
  @JoinColumn({ name: 'customer_id' })
  customer: SalesCustomer;

  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId: string | null;

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'return_date', type: 'date' })
  returnDate: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  subtotal: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  taxAmount: number;

  @Column({ name: 'total_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  totalAmount: number;

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'credit_note_number', type: 'varchar', length: 50, nullable: true })
  creditNoteNumber: string | null;

  @Column({ name: 'credit_note_date', type: 'timestamp with time zone', nullable: true })
  creditNoteDate: Date | null;

  @Column({ name: 'stock_posted', type: 'boolean', default: false })
  stockPosted: boolean;

  @Column({ name: 'credit_posted', type: 'boolean', default: false })
  creditPosted: boolean;

  @Column({ type: 'varchar', length: 10, default: 'PKR' })
  currency: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamp with time zone', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @OneToMany(() => SalesReturnLine, (line) => line.salesReturn)
  lines: SalesReturnLine[];
}
