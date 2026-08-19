import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { Department } from '../../organization/entities/department.entity';
import { UserRole } from './user-role.entity';
import { UserOrganizationScope } from './user-organization-scope.entity';

export enum ErpUserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('erp_users')
export class ErpUser extends BaseEntity {
  @Column({ name: 'auth_user_id', type: 'uuid', unique: true })
  authUserId: string;

  @Column({ name: 'employee_id', type: 'varchar', length: 100, nullable: true })
  employeeId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  username: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 255 })
  displayName: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @Column({ name: 'default_company_id', type: 'uuid', nullable: true })
  defaultCompanyId: string | null;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'default_company_id' })
  defaultCompany: Company;

  @Column({ name: 'default_division_id', type: 'uuid', nullable: true })
  defaultDivisionId: string | null;

  @ManyToOne(() => Division, { nullable: true })
  @JoinColumn({ name: 'default_division_id' })
  defaultDivision: Division;

  @Column({ name: 'default_section_id', type: 'uuid', nullable: true })
  defaultSectionId: string | null;

  @ManyToOne(() => Section, { nullable: true })
  @JoinColumn({ name: 'default_section_id' })
  defaultSection: Section;

  @Column({ name: 'default_department_id', type: 'uuid', nullable: true })
  defaultDepartmentId: string | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'default_department_id' })
  defaultDepartment: Department;

  @Column({ type: 'varchar', length: 20, default: ErpUserStatus.ACTIVE })
  status: ErpUserStatus;

  @Column({ name: 'last_login_at', type: 'timestamp with time zone', nullable: true })
  lastLoginAt: Date | null;

  @OneToMany(() => UserRole, (ur) => ur.user)
  userRoles: UserRole[];

  @OneToMany(() => UserOrganizationScope, (uos) => uos.user)
  organizationScopes: UserOrganizationScope[];
}
