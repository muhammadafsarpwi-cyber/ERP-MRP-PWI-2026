import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Division } from '../../organization/entities/division.entity';
import { CustomerReceiptAllocation } from './customer-receipt-allocation.entity';

export enum CustomerReceiptType {
  INVOICE_PAYMENT = 'INVOICE_PAYMENT',
  ADVANCE_PAYMENT = 'ADVANCE_PAYMENT',
  ON_ACCOUNT = 'ON_ACCOUNT',
}

export enum CustomerPaymentMode {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHEQUE = 'CHEQUE',
  ONLINE = 'ONLINE',
  OTHER = 'OTHER',
}

export enum ChequeClearanceStatus {
  CLEARED = 'CLEARED',
  PENDING_CLEARANCE = 'PENDING_CLEARANCE',
  BOUNCED = 'BOUNCED',
}

@Entity('customer_receipts', { schema: 'erp_sales' })
export class CustomerReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId: string | null;

  @ManyToOne(() => Division, { nullable: true })
  @JoinColumn({ name: 'division_id' })
  division?: Division | null;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'receipt_number', type: 'varchar', length: 50, unique: true })
  receiptNumber: string;

  @Column({ name: 'receipt_date', type: 'date' })
  receiptDate: string;

  @Column({ name: 'sales_order_id', type: 'uuid', nullable: true })
  salesOrderId: string | null;

  @Column({ name: 'soc_number', type: 'varchar', length: 60, nullable: true })
  socNumber: string | null;

  @Column({ name: 'po_reference', type: 'varchar', length: 100, nullable: true })
  poReference: string | null;

  @Column({ name: 'receipt_type', type: 'varchar', length: 30, default: CustomerReceiptType.INVOICE_PAYMENT })
  receiptType: string;

  @Column({ name: 'payment_mode', type: 'varchar', length: 30, default: CustomerPaymentMode.BANK_TRANSFER })
  paymentMode: string;

  @Column({ name: 'bank_account_id', type: 'uuid', nullable: true })
  bankAccountId: string | null;

  @Column({ name: 'bank_name', type: 'varchar', length: 150, nullable: true })
  bankName: string | null;

  @Column({ name: 'cheque_number', type: 'varchar', length: 80, nullable: true })
  chequeNumber: string | null;

  @Column({ name: 'cheque_date', type: 'date', nullable: true })
  chequeDate: string | null;

  @Column({ name: 'clearance_date', type: 'date', nullable: true })
  clearanceDate: string | null;

  @Column({ name: 'clearance_status', type: 'varchar', length: 30, default: ChequeClearanceStatus.CLEARED })
  clearanceStatus: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  amount: number;

  @Column({ name: 'allocated_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  allocatedAmount: number;

  @Column({ name: 'unallocated_advance_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  unallocatedAdvanceAmount: number;

  @Column({ type: 'varchar', length: 3, default: 'PKR' })
  currency: string;

  @Column({ name: 'reference_no', type: 'varchar', length: 120, nullable: true })
  referenceNo: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'journal_id', type: 'uuid', nullable: true })
  journalId: string | null;

  @Column({ name: 'ledger_entry_id', type: 'uuid', nullable: true })
  ledgerEntryId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'POSTED' })
  status: string;

  @OneToMany(() => CustomerReceiptAllocation, (alloc) => alloc.receipt)
  allocations?: CustomerReceiptAllocation[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp with time zone', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy: string | null;
}
