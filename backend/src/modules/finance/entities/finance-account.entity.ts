import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { FinanceAccountGroup } from './finance-account-group.entity';

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

export enum NormalBalance {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

@Entity('finance_accounts')
export class FinanceAccount extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'account_code', type: 'varchar', length: 50 })
  accountCode: string;

  @Column({ name: 'account_name', type: 'varchar', length: 255 })
  accountName: string;

  @Column({ name: 'account_type', type: 'varchar', length: 20 })
  accountType: AccountType;

  @Column({ name: 'normal_balance', type: 'varchar', length: 10 })
  normalBalance: NormalBalance;

  @Column({ name: 'group_id', type: 'uuid', nullable: true })
  groupId: string | null;

  @ManyToOne(() => FinanceAccountGroup, { nullable: true })
  @JoinColumn({ name: 'group_id' })
  group: FinanceAccountGroup | null;

  @Column({ name: 'parent_account_id', type: 'uuid', nullable: true })
  parentAccountId: string | null;

  @ManyToOne(() => FinanceAccount, { nullable: true })
  @JoinColumn({ name: 'parent_account_id' })
  parentAccount: FinanceAccount | null;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ name: 'is_bank_cash', type: 'boolean', default: false })
  isBankCash: boolean;

  @Column({ name: 'is_ar', type: 'boolean', default: false })
  isAr: boolean;

  @Column({ name: 'is_ap', type: 'boolean', default: false })
  isAp: boolean;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;
}