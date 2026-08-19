import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from './company.entity';
import { BusinessUnit } from './business-unit.entity';
import { Department } from './department.entity';
import { Warehouse } from './warehouse.entity';

export enum BranchStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('branches')
export class Branch extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company, (company) => company.branches)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'branch_code', type: 'varchar', length: 50 })
  branchCode: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'registration_number', type: 'varchar', length: 100, nullable: true })
  registrationNumber: string;

  @Column({ name: 'tax_registration_number', type: 'varchar', length: 100, nullable: true })
  taxRegistrationNumber: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string;

  @Column({ name: 'state_province', type: 'varchar', length: 100, nullable: true })
  stateProvince: string;

  @Column({ name: 'postal_code', type: 'varchar', length: 20, nullable: true })
  postalCode: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string;

  @Column({ type: 'varchar', length: 20, default: BranchStatus.ACTIVE })
  status: BranchStatus;

  @OneToMany(() => BusinessUnit, (businessUnit) => businessUnit.branch)
  businessUnits: BusinessUnit[];

  @OneToMany(() => Department, (department) => department.branch)
  departments: Department[];

  @OneToMany(() => Warehouse, (warehouse) => warehouse.branch)
  warehouses: Warehouse[];
}
