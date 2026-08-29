import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { FinanceAccountingPeriod } from './finance-accounting-period.entity';

@Entity('finance_fiscal_years')
export class FinanceFiscalYear extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'fy_name', type: 'varchar', length: 50 })
  fyName: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date' })
  endDate: Date;

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: string;

  @OneToMany(() => FinanceAccountingPeriod, (p) => p.fiscalYear)
  periods: FinanceAccountingPeriod[];
}