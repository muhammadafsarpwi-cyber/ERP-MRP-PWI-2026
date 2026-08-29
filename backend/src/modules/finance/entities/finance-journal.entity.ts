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
}

export enum JournalStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
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

  @OneToMany(() => FinanceJournalLine, (l) => l.journal, { cascade: true })
  lines: FinanceJournalLine[];
}