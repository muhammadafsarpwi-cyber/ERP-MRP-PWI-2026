import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission, PermissionStatus } from '../entities';
import { ErpUser } from '../../user/entities/erp-user.entity';

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  async findAll(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: PermissionStatus;
    module?: string;
    resource?: string;
    action?: string;
  }): Promise<{ data: Permission[]; total: number }> {
    const { page = 1, limit = 100, search, status, module: mod, resource, action } = options || {};

    const queryBuilder = this.permissionRepository.createQueryBuilder('perm');

    if (search) {
      queryBuilder.where(
        '(perm.name ILIKE :search OR perm.permissionCode ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      queryBuilder.andWhere('perm.status = :status', { status });
    }

    if (mod) {
      queryBuilder.andWhere('perm.module = :module', { module: mod });
    }

    if (resource) {
      queryBuilder.andWhere('perm.resource = :resource', { resource });
    }

    if (action) {
      queryBuilder.andWhere('perm.action = :action', { action });
    }

    queryBuilder.orderBy('perm.module', 'ASC');
    queryBuilder.addOrderBy('perm.resource', 'ASC');
    queryBuilder.addOrderBy('perm.action', 'ASC');
    queryBuilder.skip((page - 1) * limit);
    queryBuilder.take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<Permission> {
    const permission = await this.permissionRepository.findOne({ where: { id } });
    if (!permission) {
      throw new NotFoundException(`Permission with ID '${id}' not found`);
    }
    return permission;
  }

  async findByCode(code: string): Promise<Permission | null> {
    return this.permissionRepository.findOne({ where: { permissionCode: code } });
  }

  async getModules(): Promise<string[]> {
    const result = await this.permissionRepository
      .createQueryBuilder('perm')
      .select('DISTINCT perm.module', 'module')
      .where('perm.status = :status', { status: PermissionStatus.ACTIVE })
      .getRawMany();
    return result.map((r: any) => r.module);
  }

  async checkUserPermission(userId: string, permissionCode: string): Promise<boolean> {
    const result = await this.permissionRepository
      .createQueryBuilder('perm')
      .innerJoin('role_permissions', 'rp', 'rp.permission_id = perm.id')
      .innerJoin('roles', 'r', 'r.id = rp.role_id')
      .innerJoin('user_roles', 'ur', 'ur.role_id = r.id')
      .innerJoin('erp_users', 'u', 'u.id = ur.user_id')
      .where('perm.permission_code = :permissionCode', { permissionCode })
      .andWhere('u.id = :userId', { userId })
      .andWhere('perm.status = :status', { status: PermissionStatus.ACTIVE })
      .andWhere('rp.status = :rpStatus', { rpStatus: 'ACTIVE' })
      .andWhere('ur.status = :urStatus', { urStatus: 'ACTIVE' })
      .andWhere('u.status = :userStatus', { userStatus: 'ACTIVE' })
      .getCount();

    return result > 0;
  }
}
