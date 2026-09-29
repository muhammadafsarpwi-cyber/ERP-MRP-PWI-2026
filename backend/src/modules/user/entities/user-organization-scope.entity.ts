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
  /**
   * PROMPT #26 — explicit "no division at all" marker.
   *
   * Written by `ErpUserService.setDivisionAccess({ divisionIds: [] })` when an
   * admin deliberately denies every division. It is the only shape that
   * `deriveUserDivisionIds()` can read as "deny":
   *
   *  - `division_id IS NULL` can never be a deny, because the pre-existing
   *    `Super Administrator` row is exactly `scope_level='COMPANY'`,
   *    `division_id IS NULL`, `is_full_scope=false` and MUST stay unrestricted.
   *  - a row with only `status='INACTIVE'` cannot be a deny either, because the
   *    resolution queries filter on `status='ACTIVE'` and would see zero rows,
   *    which the backward-compatibility rule (§12) defines as "nothing
   *    configured ⇒ unrestricted". A persisted revoke would silently become
   *    full access again — exactly the escalation this prompt is fixing.
   *
   * So the deny is stored as an ACTIVE row with a scope level that cannot be
   * produced by any pre-existing code path (the enum only ever held the four
   * values above), which makes it both unambiguous and backward compatible.
   */
  NONE = 'NONE',
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
