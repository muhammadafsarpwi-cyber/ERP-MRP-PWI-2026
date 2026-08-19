import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Branch } from './branch.entity';
import { BusinessUnit } from './business-unit.entity';
import { Department } from './department.entity';
import { Warehouse } from './warehouse.entity';
import { Division } from './division.entity';
import { Section } from './section.entity';

export enum CompanyStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('companies')
export class Company extends BaseEntity {
  @Column({ name: 'legal_name', type: 'varchar', length: 255 })
  legalName: string;

  @Column({ name: 'trade_name', type: 'varchar', length: 255, nullable: true })
  tradeName: string;

  @Column({ name: 'company_code', type: 'varchar', length: 50, unique: true })
  companyCode: string;

  @Column({ name: 'registration_number', type: 'varchar', length: 100, nullable: true })
  registrationNumber: string;

  @Column({ name: 'tax_registration_number', type: 'varchar', length: 100, nullable: true })
  taxRegistrationNumber: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string;

  @Column({ name: 'address_line1', type: 'varchar', length: 255, nullable: true })
  addressLine1: string;

  @Column({ name: 'address_line2', type: 'varchar', length: 255, nullable: true })
  addressLine2: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string;

  @Column({ name: 'state_province', type: 'varchar', length: 100, nullable: true })
  stateProvince: string;

  @Column({ name: 'postal_code', type: 'varchar', length: 20, nullable: true })
  postalCode: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string;

  @Column({ name: 'base_currency', type: 'varchar', length: 3, default: 'USD' })
  baseCurrency: string;

  @Column({ name: 'fiscal_year_start', type: 'varchar', length: 5, default: '01-01' })
  fiscalYearStart: string;

  @Column({ type: 'varchar', length: 50, default: 'UTC' })
  timezone: string;

  @Column({ name: 'date_format', type: 'varchar', length: 20, default: 'YYYY-MM-DD' })
  dateFormat: string;

  @Column({ name: 'number_format', type: 'varchar', length: 20, default: '#,##0.00' })
  numberFormat: string;

  @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true })
  logoUrl: string | null;

  @Column({ type: 'varchar', length: 20, default: CompanyStatus.ACTIVE })
  status: CompanyStatus;

  @OneToMany(() => Branch, (branch) => branch.company)
  branches: Branch[];

  @OneToMany(() => BusinessUnit, (businessUnit) => businessUnit.company)
  businessUnits: BusinessUnit[];

  @OneToMany(() => Department, (department) => department.company)
  departments: Department[];

  @OneToMany(() => Warehouse, (warehouse) => warehouse.company)
  warehouses: Warehouse[];

  @OneToMany(() => Division, (division) => division.company)
  divisions: Division[];

  @OneToMany(() => Section, (section) => section.company)
  sections: Section[];
}
