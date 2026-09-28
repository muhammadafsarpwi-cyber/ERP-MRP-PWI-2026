import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import {
  Role,
  RoleStatus,
  RolePermission,
  RolePermissionStatus,
  RolePermissionDivisionScope,
  RolePermissionDivisionScopeStatus,
  RolePermissionScopeLevel,
} from '../entities';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto } from '../dto/role.dto';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepository: Repository<RolePermission>,
    @InjectRepository(RolePermissionDivisionScope)
    private readonly roleDivisionScopeRepository: Repository<RolePermissionDivisionScope>,
  ) {}

  async create(dto: CreateRoleDto, userId?: string): Promise<Role> {
    const existing = await this.roleRepository.findOne({ where: { roleCode: dto.roleCode } });
    if (existing) {
      throw new ConflictException(`Role with code '${dto.roleCode}' already exists`);
    }

    const role = this.roleRepository.create({
      ...dto,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.roleRepository.save(role);
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: RoleStatus;
  }): Promise<{ data: Role[]; total: number }> {
    const { page = 1, limit = 20, search, status } = options || {};

    const queryBuilder = this.roleRepository.createQueryBuilder('role');
    queryBuilder.leftJoinAndSelect('role.rolePermissions', 'rolePermissions');
    queryBuilder.leftJoinAndSelect('rolePermissions.permission', 'permission');

    if (search) {
      queryBuilder.where(
        '(role.name ILIKE :search OR role.roleCode ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      queryBuilder.andWhere('role.status = :status', { status });
    }

    queryBuilder.orderBy('role.name', 'ASC');
    queryBuilder.skip((page - 1) * limit);
    queryBuilder.take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.roleRepository.findOne({
      where: { id },
      relations: ['rolePermissions', 'rolePermissions.permission'],
    });

    if (!role) {
      throw new NotFoundException(`Role with ID '${id}' not found`);
    }

    return role;
  }

  async update(id: string, dto: UpdateRoleDto, userId?: string): Promise<Role> {
    const role = await this.findOne(id);
    Object.assign(role, dto, { updatedBy: userId });
    return this.roleRepository.save(role);
  }

  async activate(id: string, userId?: string): Promise<Role> {
    const role = await this.findOne(id);
    if (role.status === RoleStatus.ACTIVE) {
      throw new BadRequestException('Role is already active');
    }
    role.status = RoleStatus.ACTIVE;
    role.updatedBy = userId || null;
    return this.roleRepository.save(role);
  }

  async deactivate(id: string, userId?: string): Promise<Role> {
    const role = await this.findOne(id);
    if (role.status === RoleStatus.INACTIVE) {
      throw new BadRequestException('Role is already inactive');
    }
    if (role.isSystemRole) {
      throw new BadRequestException('Cannot deactivate system role');
    }
    role.status = RoleStatus.INACTIVE;
    role.updatedBy = userId || null;
    return this.roleRepository.save(role);
  }

  async assignPermissions(id: string, dto: AssignPermissionsDto, userId?: string): Promise<Role> {
    const role = await this.findOne(id);

    for (const permissionId of dto.permissionIds) {
      const existing = await this.rolePermissionRepository.findOne({
        where: { roleId: id, permissionId },
      });

      if (!existing) {
        const rp = this.rolePermissionRepository.create({
          roleId: id,
          permissionId,
          createdBy: userId,
          status: RolePermissionStatus.ACTIVE,
        });
        await this.rolePermissionRepository.save(rp);
      }
    }

    // Prompt #16 §27 — OPTIONAL division scope per grant of this role.
    // The field is only present when Role Management explicitly configured it;
    // when omitted every existing restriction is left exactly as it was.
    if (Array.isArray(dto.divisionScopes)) {
      for (const entry of dto.divisionScopes) {
        if (!entry || typeof entry.permissionId !== 'string' || entry.permissionId.trim() === '') continue;
        await this.setDivisionScope(id, entry.permissionId, entry.divisionIds, userId);
      }
    }

    return this.findOne(id);
  }

  /**
   * Replace the division restrictions for one (role, permission) grant.
   *
   * - `null` / `[]`  → delete every restriction row ⇒ unrestricted, which is
   *   exactly how the system behaved before Prompt #16 (§12: zero rows = no
   *   restriction, never a denial).
   * - `[divisionId,…]` → keep only those rows.
   *
   * Rows are written one at a time so the expression unique index
   * `uq_rpd_scope` stays the single source of duplicate protection.
   */
  private async setDivisionScope(
    roleId: string,
    permissionId: string,
    divisionIds: string[] | null | undefined,
    userId?: string,
  ): Promise<void> {
    const wanted = Array.isArray(divisionIds)
      ? [...new Set(divisionIds.filter(d => typeof d === 'string' && d.trim() !== ''))].map(d => d.trim())
      : [];

    const existing = await this.roleDivisionScopeRepository.find({ where: { roleId, permissionId } });

    if (wanted.length === 0) {
      if (existing.length > 0) await this.roleDivisionScopeRepository.remove(existing);
      return;
    }

    const keep = existing.filter(row => row.divisionId && wanted.includes(row.divisionId));
    const drop = existing.filter(row => !keep.includes(row));
    if (drop.length > 0) await this.roleDivisionScopeRepository.remove(drop);

    const alreadyHave = new Set(keep.map(row => row.divisionId as string));
    for (const divisionId of wanted) {
      if (alreadyHave.has(divisionId)) continue;
      const row = this.roleDivisionScopeRepository.create({
        roleId,
        permissionId,
        divisionId,
        departmentId: null,
        scopeLevel: RolePermissionScopeLevel.DIVISION,
        status: RolePermissionDivisionScopeStatus.ACTIVE,
        createdBy: userId || null,
        updatedBy: userId || null,
      });
      try {
        await this.roleDivisionScopeRepository.save(row);
      } catch (error: any) {
        if (error?.code === '23505') continue; // concurrent duplicate → already applied
        if (error?.code === '23503') {
          throw new BadRequestException('One or more selected divisions do not exist');
        }
        throw error;
      }
    }
  }

  async removePermissions(id: string, dto: AssignPermissionsDto, userId?: string): Promise<Role> {
    for (const permissionId of dto.permissionIds) {
      await this.rolePermissionRepository.delete({ roleId: id, permissionId });
      // Prompt #16 — drop the now-orphaned division restrictions with the grant.
      await this.roleDivisionScopeRepository.delete({ roleId: id, permissionId });
    }
    return this.findOne(id);
  }

  async getRolePermissions(id: string): Promise<RolePermission[]> {
    const role = await this.findOne(id);
    return role.rolePermissions;
  }
}
