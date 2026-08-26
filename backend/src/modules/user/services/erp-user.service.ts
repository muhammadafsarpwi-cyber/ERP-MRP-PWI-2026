import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository, Not, IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ErpUser, ErpUserStatus, UserRole, UserRoleStatus, UserOrganizationScope, ScopeLevel, OrgScopeStatus } from '../entities';
import { CreateErpUserDto, UpdateErpUserDto, AssignRolesDto, AssignOrgScopeDto, SetDefaultContextDto, CreateUserFullDto } from '../dto/user.dto';
import { SupabaseUser } from '../../auth/interfaces/supabase-user.interface';
import { SupabaseAuthService } from '../../auth/services/supabase-auth.service';
import { NotificationsService } from '../../notification/notifications.service';

@Injectable()
export class ErpUserService {
  private readonly logger = new Logger(ErpUserService.name);

  constructor(
    @InjectRepository(ErpUser)
    private readonly userRepository: Repository<ErpUser>,
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(UserOrganizationScope)
    private readonly orgScopeRepository: Repository<UserOrganizationScope>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly supabaseAuthService: SupabaseAuthService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findByAuthUserId(authUserId: string): Promise<ErpUser | null> {
    return this.userRepository.findOne({
      where: { authUserId },
      relations: ['userRoles', 'userRoles.role', 'defaultCompany'],
    });
  }

  async createFromAuthUser(supabaseUser: SupabaseUser): Promise<ErpUser> {
    const existing = await this.findByAuthUserId(supabaseUser.id);
    if (existing) {
      return existing;
    }

    const user = this.userRepository.create({
      authUserId: supabaseUser.id,
      email: supabaseUser.email || '',
      displayName: supabaseUser.email || 'New User',
      username: supabaseUser.email?.split('@')[0] || '',
      status: ErpUserStatus.ACTIVE,
    });

    return this.userRepository.save(user);
  }

  async create(dto: CreateErpUserDto, userId?: string): Promise<ErpUser> {
    const existing = await this.userRepository.findOne({
      where: { authUserId: dto.authUserId },
    });

    if (existing) {
      throw new ConflictException('User with this auth ID already exists');
    }

    const user = this.userRepository.create({
      ...dto,
      createdBy: userId,
      updatedBy: userId,
    });

    const saved = await this.userRepository.save(user);

    await this.notificationsService.notifyActiveUsers({
      type: 'user.created',
      title: 'New user added',
      message: `${saved.displayName || saved.email} was registered as a user`,
      entityType: 'user',
      entityId: saved.id,
      actorAuthUserId: userId || null,
    });

    return saved;
  }

  async createFull(dto: CreateUserFullDto, userId?: string): Promise<ErpUser> {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Disable the on_auth_user_created trigger (erp_core.users table doesn't exist)
      await queryRunner.query(`SET LOCAL session_replication_role = 'replica'`);

      // Create auth user — match provisioning script exactly
      const authId = crypto.randomUUID();
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      const now = new Date().toISOString();
      await queryRunner.query(
        `INSERT INTO auth.users (
          instance_id, id, aud, role, email, encrypted_password,
          email_confirmed_at, recovery_token, recovery_sent_at,
          email_change_token_new, email_change, email_change_sent_at,
          confirmation_token, confirmation_sent_at,
          raw_app_meta_data, raw_user_meta_data,
          is_super_admin, created_at, updated_at,
          is_sso_user, is_anonymous
        ) VALUES (
          $1, $2, 'authenticated', 'authenticated', $3, $4,
          $5, '', NULL,
          '', '', NULL,
          '', NULL,
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{}'::jsonb,
          false, $5, $5,
          false, false
        )`,
        ['00000000-0000-0000-0000-000000000000', authId, dto.email, hashedPassword, now],
      );

      // Create auth identity
      const identityId = crypto.randomUUID();
      await queryRunner.query(
        `INSERT INTO auth.identities (
          id, provider_id, provider, identity_data, user_id, created_at, updated_at, last_sign_in_at
        ) VALUES (
          $1::uuid, $2, 'email',
          $3::jsonb,
          $4::uuid, $5, $5, $5
        )`,
        [identityId, authId, JSON.stringify({ sub: authId, email: dto.email, email_verified: true, phone_verified: false }), authId, now],
      );

      await queryRunner.commitTransaction();

      // Create ERP user via TypeORM (outside transaction since it's a different schema)
      const erpUser = this.userRepository.create({
        authUserId: authId,
        email: dto.email,
        displayName: dto.displayName,
        username: dto.username || dto.email.split('@')[0],
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        employeeId: dto.employeeId,
        status: ErpUserStatus.ACTIVE,
        createdBy: userId,
        updatedBy: userId,
      });

      const saved = await this.userRepository.save(erpUser);

      if (dto.roleIds && dto.roleIds.length > 0) {
        for (const roleId of dto.roleIds) {
          const userRole = this.userRoleRepository.create({
            userId: saved.id,
            roleId,
            createdBy: userId,
            status: UserRoleStatus.ACTIVE,
          });
          await this.userRoleRepository.save(userRole);
        }
      }

      await this.notificationsService.notifyActiveUsers({
        type: 'user.created',
        title: 'New user added',
        message: `${saved.displayName} (${saved.email}) was registered as a new user`,
        entityType: 'user',
        entityId: saved.id,
        actorAuthUserId: userId || null,
      });

      return this.findOne(saved.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error instanceof ConflictException || error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Failed to create user: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: ErpUserStatus;
    companyId?: string;
  }): Promise<{ data: ErpUser[]; total: number }> {
    const { page = 1, limit = 20, search, status, companyId } = options || {};

    const queryBuilder = this.userRepository.createQueryBuilder('user');
    queryBuilder.leftJoinAndSelect('user.defaultCompany', 'defaultCompany');
    queryBuilder.leftJoinAndSelect('user.userRoles', 'userRoles');
    queryBuilder.leftJoinAndSelect('userRoles.role', 'role');

    if (search) {
      queryBuilder.where(
        '(user.displayName ILIKE :search OR user.email ILIKE :search OR user.username ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      queryBuilder.andWhere('user.status = :status', { status });
    }

    if (companyId) {
      queryBuilder.andWhere('user.defaultCompanyId = :companyId', { companyId });
    }

    queryBuilder.orderBy('user.createdAt', 'DESC');
    queryBuilder.skip((page - 1) * limit);
    queryBuilder.take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<ErpUser> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: [
        'defaultCompany', 'defaultDivision', 'defaultSection', 'defaultDepartment',
        'userRoles', 'userRoles.role',
        'organizationScopes', 'organizationScopes.company',
        'organizationScopes.division', 'organizationScopes.section', 'organizationScopes.department',
      ],
    });

    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }

    return user;
  }

  async update(id: string, dto: UpdateErpUserDto, userId?: string): Promise<ErpUser> {
    const user = await this.findOne(id);

    if (dto.email && dto.email !== user.email) {
      const existing = await this.userRepository.findOne({
        where: { email: dto.email, id: Not(id) },
      });
      if (existing) {
        throw new ConflictException('Email already in use');
      }
    }

    Object.assign(user, dto, { updatedBy: userId });
    return this.userRepository.save(user);
  }

  async activate(id: string, userId?: string): Promise<ErpUser> {
    const user = await this.findOne(id);
    if (user.status === ErpUserStatus.ACTIVE) {
      throw new BadRequestException('User is already active');
    }
    user.status = ErpUserStatus.ACTIVE;
    user.updatedBy = userId || null;
    return this.userRepository.save(user);
  }

  async deactivate(id: string, userId?: string): Promise<ErpUser> {
    const user = await this.findOne(id);
    if (user.status === ErpUserStatus.INACTIVE) {
      throw new BadRequestException('User is already inactive');
    }
    user.status = ErpUserStatus.INACTIVE;
    user.updatedBy = userId || null;
    return this.userRepository.save(user);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.userRepository.update(id, { lastLoginAt: new Date() });
  }

  async assignRoles(id: string, dto: AssignRolesDto, userId?: string): Promise<ErpUser> {
    const user = await this.findOne(id);

    for (const roleId of dto.roleIds) {
      const existing = await this.userRoleRepository.findOne({
        where: { userId: id, roleId },
      });

      if (!existing) {
        const userRole = this.userRoleRepository.create({
          userId: id,
          roleId,
          createdBy: userId,
          status: UserRoleStatus.ACTIVE,
        });
        await this.userRoleRepository.save(userRole);
      }
    }

    return this.findOne(id);
  }

  async removeRoles(id: string, dto: AssignRolesDto, userId?: string): Promise<ErpUser> {
    for (const roleId of dto.roleIds) {
      await this.userRoleRepository.delete({ userId: id, roleId });
    }
    return this.findOne(id);
  }

  async assignOrgScope(id: string, dto: AssignOrgScopeDto, userId?: string): Promise<UserOrganizationScope> {
    const user = await this.findOne(id);

    const existingScope = await this.orgScopeRepository.findOne({
      where: {
        userId: id,
        companyId: dto.companyId,
        divisionId: dto.divisionId || IsNull(),
        sectionId: dto.sectionId || IsNull(),
        departmentId: dto.departmentId || IsNull(),
      },
    });

    if (existingScope) {
      throw new ConflictException('This organizational scope already assigned to user');
    }

    const scope = this.orgScopeRepository.create({
      userId: id,
      companyId: dto.companyId,
      divisionId: dto.divisionId,
      sectionId: dto.sectionId,
      departmentId: dto.departmentId,
      scopeLevel: dto.scopeLevel,
      isFullScope: dto.isFullScope || false,
      createdBy: userId,
      updatedBy: userId,
      status: OrgScopeStatus.ACTIVE,
    });

    return this.orgScopeRepository.save(scope);
  }

  async removeOrgScope(id: string, scopeId: string): Promise<void> {
    const scope = await this.orgScopeRepository.findOne({ where: { id: scopeId, userId: id } });
    if (!scope) {
      throw new NotFoundException('Organizational scope not found');
    }
    await this.orgScopeRepository.remove(scope);
  }

  async getUserOrganizationScopes(userId: string): Promise<UserOrganizationScope[]> {
    return this.orgScopeRepository.find({
      where: { userId, status: OrgScopeStatus.ACTIVE },
      relations: ['company', 'division', 'section', 'department'],
    });
  }

  async setDefaultContext(id: string, dto: SetDefaultContextDto, userId?: string): Promise<ErpUser> {
    const user = await this.findOne(id);

    const scope = await this.orgScopeRepository.findOne({
      where: { userId: id, companyId: dto.companyId, status: OrgScopeStatus.ACTIVE },
    });
    if (!scope) {
      throw new ForbiddenException('Default company must be within the user organization scope');
    }

    user.defaultCompanyId = dto.companyId;
    user.defaultDivisionId = dto.divisionId || null;
    user.defaultSectionId = dto.sectionId || null;
    user.defaultDepartmentId = dto.departmentId || null;
    user.updatedBy = userId || null;

    return this.userRepository.save(user);
  }

  async checkUserHasPermission(userId: string, permissionCode: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { id: userId, status: ErpUserStatus.ACTIVE },
      relations: ['userRoles', 'userRoles.role', 'userRoles.role.rolePermissions', 'userRoles.role.rolePermissions.permission'],
    });

    if (!user || !user.userRoles) return false;

    return user.userRoles.some(ur =>
      ur.role?.rolePermissions?.some(rp =>
        rp.permission?.permissionCode === permissionCode && rp.status === 'ACTIVE'
      )
    );
  }
}
