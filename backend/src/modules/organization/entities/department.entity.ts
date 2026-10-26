import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from './company.entity';
import { Branch } from './branch.entity';
import { BusinessUnit } from './business-unit.entity';
import { Division } from './division.entity';
import { Section } from './section.entity';
import { DepartmentDivisionScope } from './department-division-scope.entity';

export enum DepartmentStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum PrimaryUom {
  KG = 'KG',
  METER = 'METER',
  PCS = 'PCS',
  GRS = 'GRS',
}

export enum SecondaryUom {
  KG = 'KG',
  METER = 'METER',
  PCS = 'PCS',
  GRS = 'GRS',
  NONE = 'NONE',
}

@Entity('departments')
export class Department extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company, (company) => company.departments)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string;

  @ManyToOne(() => Branch, (branch) => branch.departments, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @Column({ name: 'business_unit_id', type: 'uuid', nullable: true })
  businessUnitId: string;

  @ManyToOne(() => BusinessUnit, (businessUnit) => businessUnit.departments, { nullable: true })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit: BusinessUnit;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId: string;

  @ManyToOne(() => Division, (division) => division.departments, { nullable: true })
  @JoinColumn({ name: 'division_id' })
  division: Division;

  @Column({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId: string;

  @ManyToOne(() => Section, (section) => section.departments, { nullable: true })
  @JoinColumn({ name: 'section_id' })
  section: Section;

  @Column({ name: 'department_code', type: 'varchar', length: 50 })
  departmentCode: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'parent_department_id', type: 'uuid', nullable: true })
  parentDepartmentId: string;

  @ManyToOne(() => Department, (department) => department.children, { nullable: true })
  @JoinColumn({ name: 'parent_department_id' })
  parentDepartment: Department;

  @OneToMany(() => Department, (department) => department.parentDepartment)
  children: Department[];

  @Column({ type: 'varchar', length: 20, default: DepartmentStatus.ACTIVE })
  status: DepartmentStatus;

  @Column({ name: 'reporting_uom', type: 'varchar', length: 20, default: 'PCS' })
  reportingUom: string;

  @Column({ name: 'primary_uom', type: 'varchar', length: 20, default: 'PCS' })
  primaryUom: string;

  @Column({ name: 'secondary_uom', type: 'varchar', length: 20, default: 'NONE', nullable: true })
  secondaryUom: string | null;

  @Column({ name: 'enable_conversion_bridge', type: 'boolean', default: false })
  enableConversionBridge: boolean;

  @Column({ name: 'bridge_conversion', type: 'boolean', default: false })
  bridgeConversion: boolean;

  @OneToMany(() => DepartmentDivisionScope, (scope) => scope.department)
  divisionScopes: DepartmentDivisionScope[];
}
