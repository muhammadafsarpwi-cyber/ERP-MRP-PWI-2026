import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CustomerReceipt } from './customer-receipt.entity';
import { SalesInvoice } from './sales-invoice.entity';

export enum AllocationType {
  DIRECT = 'DIRECT',
  ADVANCE_ADJUSTMENT = 'ADVANCE_ADJUSTMENT',
}

@Entity('customer_receipt_allocations', { schema: 'erp_sales' })
export class CustomerReceiptAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'receipt_id', type: 'uuid' })
  receiptId: string;

  @ManyToOne(() => CustomerReceipt, (receipt) => receipt.allocations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receipt_id' })
  receipt: CustomerReceipt;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'sales_invoice_id', type: 'uuid' })
  salesInvoiceId: string;

  @ManyToOne(() => SalesInvoice, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sales_invoice_id' })
  salesInvoice?: SalesInvoice;

  @Column({ name: 'invoice_no', type: 'varchar', length: 50 })
  invoiceNo: string;

  @Column({ name: 'allocation_date', type: 'date' })
  allocationDate: string;

  @Column({ name: 'allocation_type', type: 'varchar', length: 30, default: AllocationType.DIRECT })
  allocationType: string;

  @Column({ name: 'allocated_amount', type: 'decimal', precision: 15, scale: 4 })
  allocatedAmount: number;

  @Column({ name: 'journal_id', type: 'uuid', nullable: true })
  journalId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'POSTED' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;
}
