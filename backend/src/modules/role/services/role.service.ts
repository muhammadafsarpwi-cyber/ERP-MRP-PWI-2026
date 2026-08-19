import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Role, RoleStatus, RolePermission, RolePermissionStatus } from '../entities';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto } from '../dto/role.dto';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepository: Repository<RolePermission>,
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

    return this.findOne(id);
  }

  async removePermissions(id: string, dto: AssignPermissionsDto, userId?: string): Promise<Role> {
    for (const permissionId of dto.permissionIds) {
      await this.rolePermissionRepository.delete({ roleId: id, permissionId });
    }
    return this.findOne(id);
  }

  async getRolePermissions(id: string): Promise<RolePermission[]> {
    const role = await this.findOne(id);
    return role.rolePermissions;
  }
}
