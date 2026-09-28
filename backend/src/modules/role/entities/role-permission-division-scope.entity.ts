import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Role } from './role.entity';
import { Permission } from '../../permission/entities/permission.entity';
import { Division } from '../../organization/entities/division.entity';
import { Department } from '../../organization/entities/department.entity';

export enum RolePermissionDivisionScopeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum RolePermissionScopeLevel {
  DIVISION = 'DIVISION',
  DEPARTMENT = 'DEPARTMENT',
}

/**
 * Optional DIVISION scope for an existing role → permission grant.
 *
 * Backward-compatibility rule (Prompt #16 §4 / §12):
 *   ZERO rows for a (role, permission) pair ⇒ the permission is UNRESTRICTED
 *   and behaves exactly as it did before this table existed.
 *
 * A row with `divisionId === null` explicitly means "all divisions".
 */
@Entity('role_permission_division_scopes')
// NOTE: the unique constraint `uq_rpd_scope` is an expression index over
// COALESCE(division_id, …) / COALESCE(department_id, …) and therefore lives in
// supabase/migrations/20260927000000_erp_00068_role_permission_division_scopes.sql.
// TypeORM cannot express expression indexes, so it is intentionally not
// declared here (synchronize is disabled — see src/database/data-source.ts).
export class RolePermissionDivisionScope extends BaseEntity {
  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @Column({ name: 'permission_id', type: 'uuid' })
  permissionId: string;

  @ManyToOne(() => Permission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_id' })
  permission: Permission;

  /** NULL ⇒ every division */
  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId: string | null;

  @ManyToOne(() => Division, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'division_id' })
  division: Division | null;

  /** NULL ⇒ whole division. Reserved for department-level access. */
  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;

  @Column({
    name: 'scope_level',
    type: 'varchar',
    length: 20,
    default: RolePermissionScopeLevel.DIVISION,
  })
  scopeLevel: RolePermissionScopeLevel;

  @Column({ type: 'varchar', length: 20, default: RolePermissionDivisionScopeStatus.ACTIVE })
  status: RolePermissionDivisionScopeStatus;
}
