import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from './company.entity';
import { Branch } from './branch.entity';
import { Department } from './department.entity';
import { Warehouse } from './warehouse.entity';

export enum BusinessUnitStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('business_units')
export class BusinessUnit extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company, (company) => company.businessUnits)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string;

  @ManyToOne(() => Branch, (branch) => branch.businessUnits, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 20, default: BusinessUnitStatus.ACTIVE })
  status: BusinessUnitStatus;

  @OneToMany(() => Department, (department) => department.businessUnit)
  departments: Department[];

  @OneToMany(() => Warehouse, (warehouse) => warehouse.businessUnit)
  warehouses: Warehouse[];
}
