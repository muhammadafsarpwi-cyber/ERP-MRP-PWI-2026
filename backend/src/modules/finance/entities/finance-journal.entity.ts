import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { FinanceAccountingPeriod } from './finance-accounting-period.entity';
import { FinanceFiscalYear } from './finance-fiscal-year.entity';
import { FinanceJournalLine } from './finance-journal-line.entity';

export enum JournalType {
  GENERAL = 'GENERAL',
  RECEIPT = 'RECEIPT',
  PAYMENT = 'PAYMENT',
  EXPENSE = 'EXPENSE',
  SALES_INVOICE = 'SALES_INVOICE',
  PURCHASE_INVOICE = 'PURCHASE_INVOICE',
  CONTRA = 'CONTRA',
  SALES_RETURN = 'SALES_RETURN',
  GRN_ACCRUAL = 'GRN_ACCRUAL',
}

export enum JournalStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
  ARCHIVED = 'ARCHIVED',
}

@Entity('finance_journals')
export class FinanceJournal extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'journal_number', type: 'varchar', length: 50 })
  journalNumber: string;

  @Column({ name: 'journal_type', type: 'varchar', length: 30, default: JournalType.GENERAL })
  journalType: JournalType;

  @Column({ name: 'entry_date', type: 'date' })
  entryDate: Date;

  @Column({ name: 'period_id', type: 'uuid', nullable: true })
  periodId: string | null;

  @ManyToOne(() => FinanceAccountingPeriod, { nullable: true })
  @JoinColumn({ name: 'period_id' })
  period: FinanceAccountingPeriod | null;

  @Column({ name: 'fiscal_year_id', type: 'uuid', nullable: true })
  fiscalYearId: string | null;

  @ManyToOne(() => FinanceFiscalYear, { nullable: true })
  @JoinColumn({ name: 'fiscal_year_id' })
  fiscalYear: FinanceFiscalYear | null;

  @Column({ name: 'reference_type', type: 'varchar', length: 50, nullable: true })
  referenceType: string | null;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: JournalStatus.DRAFT })
  status: JournalStatus;

  @Column({ name: 'total_debit', type: 'numeric', precision: 19, scale: 4, default: 0 })
  totalDebit: number;

  @Column({ name: 'total_credit', type: 'numeric', precision: 19, scale: 4, default: 0 })
  totalCredit: number;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt: Date | null;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy: string | null;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId: string | null;

  @Column({ name: 'voucher_type', type: 'varchar', length: 20, nullable: true })
  voucherType: string | null;

  @Column({ name: 'party_type', type: 'varchar', length: 30, nullable: true })
  partyType: string | null;

  @Column({ name: 'party_id', type: 'uuid', nullable: true })
  partyId: string | null;

  @Column({ name: 'payment_mode', type: 'varchar', length: 30, nullable: true })
  paymentMode: string | null;

  @Column({ name: 'cheque_number', type: 'varchar', length: 60, nullable: true })
  chequeNumber: string | null;

  @Column({ name: 'cheque_date', type: 'date', nullable: true })
  chequeDate: Date | null;

  @Column({ name: 'bank_account_id', type: 'uuid', nullable: true })
  bankAccountId: string | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @Column({ name: 'archive_reason', type: 'text', nullable: true })
  archiveReason: string | null;

  @OneToMany(() => FinanceJournalLine, (l) => l.journal, { cascade: true })
  lines: FinanceJournalLine[];
}