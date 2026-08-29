import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { FinanceJournal } from './finance-journal.entity';
import { FinanceAccount } from './finance-account.entity';

@Entity('finance_journal_lines')
export class FinanceJournalLine extends BaseEntity {
  @Column({ name: 'journal_id', type: 'uuid' })
  journalId: string;

  @ManyToOne(() => FinanceJournal, (j) => j.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journal_id' })
  journal: FinanceJournal;

  @Column({ name: 'line_number', type: 'int' })
  lineNumber: number;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => FinanceAccount, { nullable: true })
  @JoinColumn({ name: 'account_id' })
  account: FinanceAccount | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  debit: number;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  credit: number;

  @Column({ name: 'reference_type', type: 'varchar', length: 50, nullable: true })
  referenceType: string | null;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId: string | null;
}