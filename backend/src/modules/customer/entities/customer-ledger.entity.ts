import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Customer } from './customer.entity';

export enum CustomerDocumentType {
  OPENING_BALANCE = 'OPENING_BALANCE',
  SALES_INVOICE = 'SALES_INVOICE',
  CREDIT_NOTE = 'CREDIT_NOTE',
  DEBIT_NOTE = 'DEBIT_NOTE',
  CUSTOMER_PAYMENT = 'CUSTOMER_PAYMENT',
  ADVANCE_RECEIPT = 'ADVANCE_RECEIPT',
  ADVANCE_ADJUSTMENT = 'ADVANCE_ADJUSTMENT',
  SALES_RETURN = 'SALES_RETURN',
  ADJUSTMENT = 'ADJUSTMENT',
}

@Entity('customer_ledger')
@Index(['companyId', 'customerId', 'transactionDate'])
export class CustomerLedgerEntry extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @ManyToOne(() => Customer, (customer) => (customer as any).ledgerEntries, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ name: 'transaction_date', type: 'date' })
  transactionDate: Date;

  @Column({ name: 'document_type', type: 'varchar', length: 50, default: CustomerDocumentType.OPENING_BALANCE })
  documentType: CustomerDocumentType;

  @Column({ name: 'document_number', type: 'varchar', length: 100 })
  documentNumber: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  debit: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  credit: number;

  @Column({ name: 'running_balance', type: 'decimal', precision: 15, scale: 4, default: 0 })
  runningBalance: number;

  @Column({ type: 'varchar', length: 3, default: 'PKR' })
  currency: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: Date | null;

  @Column({ name: 'payment_terms', type: 'varchar', length: 50, nullable: true })
  paymentTerms: string | null;

  @Column({ type: 'varchar', length: 20, default: 'POSTED' })
  status: string;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId?: string | null;

  @Column({ name: 'sales_order_id', type: 'uuid', nullable: true })
  salesOrderId?: string | null;

  @Column({ name: 'soc_number', type: 'varchar', length: 60, nullable: true })
  socNumber?: string | null;

  @Column({ name: 'po_reference', type: 'varchar', length: 100, nullable: true })
  poReference?: string | null;

  @Column({ name: 'payment_mode', type: 'varchar', length: 30, nullable: true })
  paymentMode?: string | null;

  @Column({ name: 'receipt_id', type: 'uuid', nullable: true })
  receiptId?: string | null;

  @Column({ name: 'sales_invoice_id', type: 'uuid', nullable: true })
  salesInvoiceId?: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
