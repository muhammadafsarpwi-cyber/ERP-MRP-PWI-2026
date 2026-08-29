import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { FinanceAccount } from './finance-account.entity';

export enum AccountGroupClass {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

@Entity('finance_account_groups')
export class FinanceAccountGroup extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'group_code', type: 'varchar', length: 50 })
  groupCode: string;

  @Column({ name: 'group_name', type: 'varchar', length: 255 })
  groupName: string;

  @Column({ name: 'group_class', type: 'varchar', length: 20 })
  groupClass: AccountGroupClass;

  @Column({ name: 'parent_group_id', type: 'uuid', nullable: true })
  parentGroupId: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;

  @OneToMany(() => FinanceAccount, (a) => a.group)
  accounts: FinanceAccount[];
}