import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission, PermissionStatus } from '../entities';
import { ErpUser } from '../../user/entities/erp-user.entity';
import { DivisionAccessService } from './division-access.service';
import { DivisionAccess } from '../../../common/division-scope.util';

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    private readonly divisionAccessService: DivisionAccessService,
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
    // 1. Check if user has an active Admin or Super Admin role
    try {
      const adminCheck = await this.permissionRepository.manager.query(
        `SELECT 1 FROM user_roles ur
         INNER JOIN roles r ON r.id = ur.role_id
         INNER JOIN erp_users u ON u.id = ur.user_id
         WHERE u.id = $1 AND u.status = 'ACTIVE' AND ur.status = 'ACTIVE'
           AND (r.role_code IN ('SUPER_ADMIN', 'ADMIN', 'SYSTEM_ADMIN') OR r.name ILIKE '%admin%')
         LIMIT 1`,
        [userId],
      );
      if (adminCheck && adminCheck.length > 0) {
        return true;
      }
    } catch {
      // Fallback to regular permission query if raw query fails
    }

    // 2. Standard permission lookup
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

  /**
   * Prompt #16 §10/§11 — effective divisions for `(user, permission)`.
   *
   *   user organization scopes  ∩  role permission division scopes
   *
   * Returns `'ALL'` when either side is unrestricted (no configured role
   * restriction ⇒ legacy behaviour). An empty array means the intersection is
   * empty and therefore NO division may be accessed.
   */
  async getEffectiveDivisions(
    userId: string,
    permissionCode?: string,
  ): Promise<DivisionAccess> {
    return this.divisionAccessService.getEffectiveDivisions(userId, permissionCode);
  }

  /** True when division enforcement is switched on for this deployment. */
  isDivisionEnforcementEnabled(): boolean {
    return this.divisionAccessService.isEnforcementEnabled();
  }
}
