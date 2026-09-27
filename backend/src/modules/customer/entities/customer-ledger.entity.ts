import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Customer } from './customer.entity';

export enum CustomerDocumentType {
  OPENING_BALANCE = 'OPENING_BALANCE',
  SALES_INVOICE = 'SALES_INVOICE',
  CREDIT_NOTE = 'CREDIT_NOTE',
  DEBIT_NOTE = 'DEBIT_NOTE',
  CUSTOMER_PAYMENT = 'CUSTOMER_PAYMENT',
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

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
