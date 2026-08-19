import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';

export enum PermissionStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('permissions')
export class Permission extends BaseEntity {
  @Column({ name: 'permission_code', type: 'varchar', length: 100, unique: true })
  permissionCode: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100 })
  module: string;

  @Column({ type: 'varchar', length: 100 })
  resource: string;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 20, default: PermissionStatus.ACTIVE })
  status: PermissionStatus;
}
