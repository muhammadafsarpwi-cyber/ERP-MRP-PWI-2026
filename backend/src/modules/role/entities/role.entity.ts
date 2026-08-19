import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { RolePermission } from './role-permission.entity';

export enum RoleStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('roles')
export class Role extends BaseEntity {
  @Column({ name: 'role_code', type: 'varchar', length: 50, unique: true })
  roleCode: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'is_system_role', type: 'boolean', default: false })
  isSystemRole: boolean;

  @Column({ type: 'varchar', length: 20, default: RoleStatus.ACTIVE })
  status: RoleStatus;

  @OneToMany(() => RolePermission, (rp) => rp.role)
  rolePermissions: RolePermission[];
}
