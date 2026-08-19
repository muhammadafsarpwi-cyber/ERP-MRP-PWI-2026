import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { ErpUser } from './erp-user.entity';
import { Company } from '../../organization/entities/company.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { Department } from '../../organization/entities/department.entity';

export enum ScopeLevel {
  COMPANY = 'COMPANY',
  DIVISION = 'DIVISION',
  SECTION = 'SECTION',
  DEPARTMENT = 'DEPARTMENT',
}

export enum OrgScopeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('user_organization_scopes')
export class UserOrganizationScope extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => ErpUser, (user) => user.organizationScopes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: ErpUser;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId: string | null;

  @ManyToOne(() => Division, { nullable: true })
  @JoinColumn({ name: 'division_id' })
  division: Division;

  @Column({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId: string | null;

  @ManyToOne(() => Section, { nullable: true })
  @JoinColumn({ name: 'section_id' })
  section: Section;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @Column({ name: 'scope_level', type: 'varchar', length: 20 })
  scopeLevel: ScopeLevel;

  @Column({ name: 'is_full_scope', type: 'boolean', default: false })
  isFullScope: boolean;

  @Column({ type: 'varchar', length: 20, default: OrgScopeStatus.ACTIVE })
  status: OrgScopeStatus;
}
