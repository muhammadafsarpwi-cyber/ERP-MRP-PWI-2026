import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { FinanceFiscalYear } from './finance-fiscal-year.entity';

@Entity('finance_accounting_periods')
export class FinanceAccountingPeriod extends BaseEntity {
  @Column({ name: 'fiscal_year_id', type: 'uuid' })
  fiscalYearId: string;

  @ManyToOne(() => FinanceFiscalYear, { nullable: true })
  @JoinColumn({ name: 'fiscal_year_id' })
  fiscalYear: FinanceFiscalYear | null;

  @Column({ name: 'period_code', type: 'varchar', length: 20 })
  periodCode: string;

  @Column({ name: 'period_name', type: 'varchar', length: 100, nullable: true })
  periodName: string | null;

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date' })
  endDate: Date;

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: string;
}