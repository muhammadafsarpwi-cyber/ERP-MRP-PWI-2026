import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository, Not, IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ErpUser, ErpUserStatus, UserRole, UserRoleStatus, UserOrganizationScope, ScopeLevel, OrgScopeStatus } from '../entities';
import { Company, CompanyStatus } from '../../organization/entities/company.entity';
import { Division } from '../../organization/entities/division.entity';
import { CreateErpUserDto, UpdateErpUserDto, AssignRolesDto, AssignOrgScopeDto, SetDefaultContextDto, CreateUserFullDto, SetDivisionAccessDto } from '../dto/user.dto';
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
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
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

      // Determine default company for the new user:
      let targetCompanyId = dto.companyId;
      if (!targetCompanyId && userId) {
        const creator = await this.userRepository.findOne({ where: { id: userId } });
        if (creator?.defaultCompanyId) {
          targetCompanyId = creator.defaultCompanyId;
        }
      }
      if (!targetCompanyId) {
        const defaultCompany = await this.companyRepository.findOne({ where: { status: CompanyStatus.ACTIVE } });
        if (defaultCompany) {
          targetCompanyId = defaultCompany.id;
        }
      }

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
        defaultCompanyId: targetCompanyId || null,
        status: ErpUserStatus.ACTIVE,
        createdBy: userId,
        updatedBy: userId,
      });

      const saved = await this.userRepository.save(erpUser);

      // Automatically provision organizational company scope for the new user
      if (targetCompanyId) {
        const scope = this.orgScopeRepository.create({
          userId: saved.id,
          companyId: targetCompanyId,
          scopeLevel: ScopeLevel.COMPANY,
          isFullScope: true,
          status: OrgScopeStatus.ACTIVE,
          isActive: true,
          createdBy: userId,
          updatedBy: userId,
        });
        await this.orgScopeRepository.save(scope);
      }

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
    queryBuilder.leftJoinAndSelect('user.organizationScopes', 'organizationScopes');
    queryBuilder.leftJoinAndSelect('organizationScopes.division', 'scopeDivision');
    queryBuilder.leftJoinAndSelect('organizationScopes.company', 'scopeCompany');

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

    if (dto.defaultCompanyId && dto.defaultCompanyId !== user.defaultCompanyId) {
      user.defaultCompanyId = dto.defaultCompanyId;
      const existingScope = await this.orgScopeRepository.findOne({
        where: { userId: id, companyId: dto.defaultCompanyId, status: OrgScopeStatus.ACTIVE },
      });
      if (!existingScope) {
        const scope = this.orgScopeRepository.create({
          userId: id,
          companyId: dto.defaultCompanyId,
          scopeLevel: ScopeLevel.COMPANY,
          isFullScope: true,
          status: OrgScopeStatus.ACTIVE,
          isActive: true,
          createdBy: userId,
          updatedBy: userId,
        });
        await this.orgScopeRepository.save(scope);
      }
    }

    Object.assign(user, dto, { updatedBy: userId });
    return this.userRepository.save(user);
  }

  /**
   * Self-service update: allows the authenticated user to edit their own
   * profile fields. Only the fields supplied in the DTO are applied and the
   * row is always resolved by the caller's auth user id, so a user can never
   * modify another user's profile.
   */
  async updateOwnProfile(
    authUserId: string,
    updates: Partial<Pick<ErpUser, 'displayName' | 'firstName' | 'lastName' | 'phone' | 'username'>>,
    actorUserId?: string,
  ): Promise<ErpUser> {
    const user = await this.findByAuthUserId(authUserId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    Object.assign(user, updates, { updatedBy: actorUserId ?? user.id });
    return this.userRepository.save(user);
  }

  /** Persist the avatar URL for the user resolved by their auth id. */
  async setAvatarUrl(authUserId: string, avatarUrl: string | null, actorUserId?: string): Promise<ErpUser> {
    const user = await this.findByAuthUserId(authUserId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.avatarUrl = avatarUrl;
    user.updatedBy = actorUserId ?? user.id;
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

  async setUserAvatarById(id: string, avatarUrl: string | null, actorUserId?: string): Promise<ErpUser> {
    const user = await this.findOne(id);
    user.avatarUrl = avatarUrl;
    user.updatedBy = actorUserId ?? user.id;
    return this.userRepository.save(user);
  }

  async assignRoles(id: string, dto: AssignRolesDto, userId?: string): Promise<ErpUser> {
    const user = await this.findOne(id);
    const targetRoleIds = new Set(dto.roleIds || []);

    const existingRoles = await this.userRoleRepository.find({
      where: { userId: id },
    });

    // Synchronize roles: remove any roles that are no longer selected
    const toRemove = existingRoles.filter((ur) => !targetRoleIds.has(ur.roleId));
    if (toRemove.length > 0) {
      await this.userRoleRepository.remove(toRemove);
    }

    // Add any newly selected roles
    const existingRoleIds = new Set(existingRoles.map((ur) => ur.roleId));
    for (const roleId of (dto.roleIds || [])) {
      if (!existingRoleIds.has(roleId)) {
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

  /**
   * PROMPT #26 — revoke one organization scope row.
   *
   * Hardening: when the removed row was the account's last DIVISION-level
   * restriction, a plain `remove()` left the user with zero rows, and the
   * auto-heal in {@link getUserOrganizationScopes} then interpreted "no rows"
   * as "brand-new user" and silently re-granted full company access. A one-click
   * "Remove" in the Division Access popup was therefore an escalation, not a
   * revocation.
   *
   * The fix writes an explicit ACTIVE `scope_level = 'NONE'` deny marker in the
   * same call, so the removal is durable. Re-granting is not blocked: the very
   * next `assignOrgScope()` / `setDivisionAccess()` deletes the marker again.
   */
  async removeOrgScope(id: string, scopeId: string): Promise<void> {
    const scope = await this.orgScopeRepository.findOne({ where: { id: scopeId, userId: id } });
    if (!scope) {
      throw new NotFoundException('Organizational scope not found');
    }
    await this.orgScopeRepository.remove(scope);

    if (scope.scopeLevel !== ScopeLevel.DIVISION || !scope.divisionId) return;

    const remainingDivisionRows = await this.orgScopeRepository.count({
      where: { userId: id, status: OrgScopeStatus.ACTIVE },
    });
    if (remainingDivisionRows > 0) return;

    const companyWideOrOther = await this.orgScopeRepository.findOne({
      where: { userId: id, companyId: scope.companyId, status: OrgScopeStatus.ACTIVE },
    });
    // A company-wide default still governs this company, so nothing to mark.
    if (companyWideOrOther) return;

    await this.orgScopeRepository.save(
      this.orgScopeRepository.create({
        userId: id,
        companyId: scope.companyId,
        divisionId: null,
        sectionId: null,
        departmentId: null,
        scopeLevel: ScopeLevel.NONE,
        isFullScope: false,
        isActive: true,
        status: OrgScopeStatus.ACTIVE,
      }),
    );
  }

  /**
   * PROMPT #26 — declarative, transactional replacement of a user's division
   * access. This is the real "Save Changes" behind the Division Access popup.
   *
   * Why this had to exist:
   *  - `POST /org-scopes` could only append ONE row, and `DELETE` removed one
   *    row, so there was no way to express a desired SET. Two admins editing
   *    the same user interleaved writes and produced contradictory rows.
   *  - The one-off append also left the auto-healed COMPANY row
   *    (`division_id IS NULL`, `is_full_scope = true`) in place next to the new
   *    division row. `deriveUserDivisionIds()` used to short-circuit to 'ALL'
   *    on that company-wide row, so "restricted" users kept full access while
   *    the popup showed only the divisions an admin had picked. This method
   *    removes that contradiction atomically, so the popup and the API can no
   *    longer disagree.
   *
   * Rules:
   *  - Restricted (`divisionIds` non-empty): every ACTIVE division row for the
   *    company is reconciled to the requested set AND any company-wide row is
   *    deleted. Rows for OTHER companies and non-division (SECTION /
   *    DEPARTMENT) rows are left alone — they are a different authorization
   *    axis and must not be silently destroyed here.
   *  - Unrestricted (`companyWide`): all division rows for the company are
   *    deleted and exactly one COMPANY row is written — the same shape
   *    `getUserOrganizationScopes()` auto-heals, so SUPER_ADMIN / ADMIN
   *    accounts keep working exactly as before.
   *  - Deny-all (`divisionIds: []`, no `companyWide`): rows are deleted and an
   *    ACTIVE `scope_level = 'NONE'` marker is written, so
   *    `deriveUserDivisionIds()` returns an empty set and `DivisionScopeGuard`
   *    answers 403. The auto-heal in `getUserOrganizationScopes()` cannot fire
   *    because a scope row for the company exists, and because the resolvers
   *    read `status = 'ACTIVE'` the marker is always visible to them — the
   *    deny therefore stays revoked until an admin widens it again.
   */
  async setDivisionAccess(
    id: string,
    dto: SetDivisionAccessDto,
    userId?: string,
  ): Promise<{ user: ErpUser; scopes: UserOrganizationScope[] }> {
    const user = await this.findOne(id);

    const companyWide = dto.companyWide === true;
    const requested = Array.from(new Set((dto.divisionIds ?? []).map((d) => d.trim()).filter(Boolean)));

    if (!companyWide && requested.length === 0 && dto.divisionIds === undefined) {
      throw new BadRequestException(
        'Provide divisionIds (possibly an empty array to deny all divisions) or set companyWide=true.',
      );
    }

    // Validate every requested division really exists and is ACTIVE in this
    // company — an admin must not be able to persist a scope that silently
    // grants (and later leaks) a division outside their company.
    if (requested.length > 0) {
      const found = await this.dataSource
        .getRepository(Division)
        .createQueryBuilder('d')
        .select('d.id', 'id')
        .where('d.company_id = :companyId', { companyId: dto.companyId })
        .andWhere('d.id IN (:...ids)', { ids: requested })
        .getRawMany<{ id: string }>();

      const foundIds = new Set(found.map((r) => r.id));
      const missing = requested.filter((d) => !foundIds.has(d));
      if (missing.length > 0) {
        throw new BadRequestException(
          `Division(s) not found or not ACTIVE in this company: ${missing.join(', ')}`,
        );
      }
    }

    await this.dataSource.transaction(async (manager) => {
      const scopeRepo = manager.getRepository(UserOrganizationScope);

      const existing = await scopeRepo.find({
        where: { userId: id, companyId: dto.companyId, status: OrgScopeStatus.ACTIVE },
      });

      // Company-wide default row: `division_id IS NULL`. This is the row the
      // auto-heal writes and the row that used to grant everything.
      const companyWideRows = existing.filter((s) => !s.divisionId);
      // Plain DIVISION-level rows. SECTION / DEPARTMENT rows are a different
      // axis and are intentionally left untouched.
      const divisionRows = existing.filter((s) => s.divisionId && !s.sectionId && !s.departmentId);

      if (companyWide) {
        const replaced = [...companyWideRows, ...divisionRows];
        if (replaced.length > 0) await scopeRepo.remove(replaced);
        const companyRow = scopeRepo.create({
          userId: id,
          companyId: dto.companyId,
          divisionId: null,
          sectionId: null,
          departmentId: null,
          scopeLevel: ScopeLevel.COMPANY,
          isFullScope: true,
          isActive: true,
          status: OrgScopeStatus.ACTIVE,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        });
        await scopeRepo.save(companyRow);
        return;
      }

      // Restricted (or explicit deny-all): the company-wide default must go,
      // otherwise it contradicts the restriction and, on the pre-fix
      // resolver, silently overrode it.
      if (companyWideRows.length > 0) await scopeRepo.remove(companyWideRows);

      const keep = new Set(requested);
      const toRemove = divisionRows.filter((s) => s.divisionId && !keep.has(s.divisionId));
      if (toRemove.length > 0) await scopeRepo.remove(toRemove);

      const have = new Set(divisionRows.map((s) => s.divisionId as string));
      const toCreate = requested
        .filter((d) => !have.has(d))
        .map((d) =>
          scopeRepo.create({
            userId: id,
            companyId: dto.companyId,
            divisionId: d,
            sectionId: null,
            departmentId: null,
            scopeLevel: ScopeLevel.DIVISION,
            isFullScope: false,
            isActive: true,
            status: OrgScopeStatus.ACTIVE,
            createdBy: userId ?? null,
            updatedBy: userId ?? null,
          }),
        );
      if (toCreate.length > 0) await scopeRepo.save(toCreate);

      if (requested.length === 0) {
        // Deny-all. PROMPT #26 — the marker must be ACTIVE and use
        // `scope_level = 'NONE'`, not an INACTIVE COMPANY row:
        //   • the resolvers query `status = 'ACTIVE'`, so an INACTIVE row is
        //     invisible to them and `deriveUserDivisionIds([])` answers 'ALL'
        //     (backward-compat rule §12) — the revoke would silently revert to
        //     full access on the very next request;
        //   • `division_id IS NULL` with `is_full_scope = false` is exactly the
        //     shape of the pre-existing `Super Administrator` row, so a NULL
        //     division cannot double as "deny".
        // `NONE` is a value the pre-fix enum could never emit, so this is
        // backward compatible: no existing account is re-interpreted.
        const marker = scopeRepo.create({
          userId: id,
          companyId: dto.companyId,
          divisionId: null,
          sectionId: null,
          departmentId: null,
          scopeLevel: ScopeLevel.NONE,
          isFullScope: false,
          isActive: true,
          status: OrgScopeStatus.ACTIVE,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        });
        await scopeRepo.save(marker);
      }
    });

    const scopes = await this.orgScopeRepository.find({
      where: { userId: id, companyId: dto.companyId },
      relations: ['division'],
      order: { createdAt: 'ASC' },
    });

    return { user, scopes };
  }

  async getUserOrganizationScopes(userId: string): Promise<UserOrganizationScope[]> {
    let scopes = await this.orgScopeRepository.find({
      where: { userId, status: OrgScopeStatus.ACTIVE },
      relations: ['company', 'division', 'section', 'department'],
    });

    // Auto-heal: If user has no active scopes, automatically provision full company scope
    // for their defaultCompanyId or the system's primary active company.
    //
    // PROMPT #26 SECURITY FIX — heal ONLY when the user has no scope row AT ALL.
    // The old condition was "no ACTIVE scope", which meant revoking every scope
    // (or persisting an explicit deny-all) silently handed the account full
    // company access back on the very next read. A revoke must stay revoked.
    if (!scopes || scopes.length === 0) {
      const anyScopeRow = await this.orgScopeRepository.findOne({ where: { userId } });
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!anyScopeRow && user && user.status === ErpUserStatus.ACTIVE) {
        let targetCompanyId = user.defaultCompanyId;
        if (!targetCompanyId) {
          const defaultCompany = await this.companyRepository.findOne({ where: { status: CompanyStatus.ACTIVE } });
          if (defaultCompany) {
            targetCompanyId = defaultCompany.id;
          }
        }
        if (targetCompanyId) {
          const newScope = this.orgScopeRepository.create({
            userId: user.id,
            companyId: targetCompanyId,
            scopeLevel: ScopeLevel.COMPANY,
            isFullScope: true,
            status: OrgScopeStatus.ACTIVE,
            isActive: true,
          });
          const savedScope = await this.orgScopeRepository.save(newScope);
          if (!user.defaultCompanyId) {
            user.defaultCompanyId = targetCompanyId;
            await this.userRepository.save(user);
          }
          const loadedScope = await this.orgScopeRepository.findOne({
            where: { id: savedScope.id },
            relations: ['company', 'division', 'section', 'department'],
          });
          if (loadedScope) {
            scopes = [loadedScope];
          }
        }
      }
    }

    return scopes;
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
