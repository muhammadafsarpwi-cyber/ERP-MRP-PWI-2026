import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { ErpUserService } from './erp-user.service';
import { ErpUser, ErpUserStatus, UserRole, UserOrganizationScope, ScopeLevel, OrgScopeStatus } from '../entities';
import { Company } from '../../organization/entities/company.entity';
import { Division } from '../../organization/entities/division.entity';
import { NotificationsService } from '../../notification/notifications.service';
import { SupabaseAuthService } from '../../auth/services/supabase-auth.service';
import { deriveUserDivisionIds } from '../../../common/division-scope.util';

/**
 * PROMPT #26 — tests T05..T09 (division-access persistence + revoke durability).
 *
 * The bug this locks down:
 *   Anus had TWO ACTIVE `user_organization_scopes` rows: the DIV-CCD row the
 *   popup displayed, plus an auto-healed company-wide row
 *   (`division_id IS NULL`, `is_full_scope = true`). `deriveUserDivisionIds()`
 *   short-circuited to 'ALL' on ANY company-wide row, so the UI said
 *   "DIV-CCD only" while the API happily returned every division.
 *
 * These tests pin the three properties that make that impossible again:
 *   1. saving a restricted set DELETES the contradictory company-wide row,
 *      transactionally (so a half-applied save cannot happen);
 *   2. re-saving is idempotent (no duplicate rows, no churn);
 *   3. a revoke / deny-all is durable — the auto-heal cannot re-grant it.
 */

/** Shape of the exact Anus contradiction (real ids kept so the test reads like production). */
const COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';
const USER_ID = '98d2e7c7-75af-44ab-a60a-190ac260a4ec';
const DIV_CCD = 'd1000000-0000-0000-0000-000000000002';
const DIV_SPD = 'd1000000-0000-0000-0000-000000000001';

const COMPANY_WIDE_SCOPE = {
  id: 'facbee53-ff02-49f2-bf01-9ba51dec1055',
  userId: USER_ID,
  companyId: COMPANY_ID,
  divisionId: null,
  sectionId: null,
  departmentId: null,
  scopeLevel: ScopeLevel.COMPANY,
  isFullScope: true,
  isActive: true,
  status: OrgScopeStatus.ACTIVE,
} as unknown as UserOrganizationScope;

const DIV_CCD_SCOPE = {
  id: '14df543b-d5e3-4867-bb69-d50dfec7a621',
  userId: USER_ID,
  companyId: COMPANY_ID,
  divisionId: DIV_CCD,
  sectionId: null,
  departmentId: null,
  scopeLevel: ScopeLevel.DIVISION,
  isFullScope: false,
  isActive: true,
  status: OrgScopeStatus.ACTIVE,
} as unknown as UserOrganizationScope;

const mockUser = {
  id: USER_ID,
  authUserId: '3c8bbf43-d64c-4bb6-b762-ea7b54cf8813',
  email: 'Anasccd71@gmail.com',
  displayName: 'Anus',
  status: ErpUserStatus.ACTIVE,
  defaultCompanyId: COMPANY_ID,
} as unknown as ErpUser;

describe('ErpUserService division access (PROMPT #26)', () => {
  let service: ErpUserService;
  let scopeRepo: jest.Mocked<Repository<UserOrganizationScope>>;
  let userRepo: jest.Mocked<Repository<ErpUser>>;
  let divisionRepo: { createQueryBuilder: jest.Mock };
  let divisionQb: { getRawMany: jest.Mock; [k: string]: any };
  let txScopeRepo: {
    find: jest.Mock;
    remove: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let transaction: jest.Mock;

  const makeRepo = () => ({
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((dto: any) => ({ id: `new-${dto.divisionId ?? 'company'}`, ...dto })),
    save: jest.fn(),
    remove: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getRawMany: jest.fn().mockResolvedValue([]),
    })),
  });

  beforeEach(async () => {
    const mockScopeRepo = makeRepo();
    const mockUserRepo = makeRepo();
    const mockCompanyRepo = makeRepo();

    // One stable query-builder instance: the service builds the whole chain in
    // a single expression, so a factory would hand each test a throwaway.
    divisionQb = makeRepo().createQueryBuilder() as unknown as { getRawMany: jest.Mock };
    divisionRepo = { createQueryBuilder: jest.fn(() => divisionQb) };
    txScopeRepo = {
      find: jest.fn().mockResolvedValue([]),
      remove: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((dto: any) => ({ id: `new-${dto.divisionId ?? 'company'}`, ...dto })),
      save: jest.fn().mockImplementation(async (rows: any) => rows),
    };
    transaction = jest.fn(async (cb: (m: any) => Promise<unknown>) =>
      cb({ getRepository: jest.fn(() => txScopeRepo) }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ErpUserService,
        { provide: getRepositoryToken(ErpUser), useValue: mockUserRepo },
        { provide: getRepositoryToken(UserRole), useValue: makeRepo() },
        { provide: getRepositoryToken(UserOrganizationScope), useValue: mockScopeRepo },
        { provide: getRepositoryToken(Company), useValue: mockCompanyRepo },
        { provide: getDataSourceToken(), useValue: { transaction, getRepository: jest.fn(() => divisionRepo) } },
        { provide: NotificationsService, useValue: { notifyActiveUsers: jest.fn() } },
        { provide: SupabaseAuthService, useValue: { signUpWithPassword: jest.fn() } },
      ],
    }).compile();

    service = module.get<ErpUserService>(ErpUserService);
    scopeRepo = module.get(getRepositoryToken(UserOrganizationScope));
    userRepo = module.get(getRepositoryToken(ErpUser));
  });

  it('is defined', () => expect(service).toBeDefined());

  // ── T05: the contradiction is removed, atomically ──────────────────────────
  describe('setDivisionAccess — restricted save', () => {
    it('deletes the contradictory company-wide row so the restriction can no longer be overridden', async () => {
      txScopeRepo.find.mockResolvedValue([COMPANY_WIDE_SCOPE, DIV_CCD_SCOPE]);
      userRepo.findOne.mockResolvedValue(mockUser);
      divisionQb.getRawMany = jest
        .fn()
        .mockResolvedValue([{ id: DIV_CCD }]);
      scopeRepo.find.mockResolvedValue([DIV_CCD_SCOPE]);

      await service.setDivisionAccess(USER_ID, { companyId: COMPANY_ID, divisionIds: [DIV_CCD] });

      // Runs in ONE transaction so a partially applied save is impossible.
      expect(transaction).toHaveBeenCalledTimes(1);

      const removed = txScopeRepo.remove.mock.calls.flatMap((c) => c[0] as unknown[]);
      expect(removed).toContainEqual(COMPANY_WIDE_SCOPE);
      // The division row the admin wants to keep is NOT deleted.
      expect(removed).not.toContainEqual(DIV_CCD_SCOPE);
      // Nothing new is inserted — the desired set already matched.
      expect(txScopeRepo.save).not.toHaveBeenCalled();

      // The persisted state now resolves to DIV-CCD only.
      expect(deriveUserDivisionIds([DIV_CCD_SCOPE])).toEqual([DIV_CCD]);
    });

    it('inserts a newly granted division and removes a revoked one in the same transaction', async () => {
      const spdScope = { ...DIV_CCD_SCOPE, id: 'spd-row', divisionId: DIV_SPD } as UserOrganizationScope;
      txScopeRepo.find.mockResolvedValue([spdScope]);
      userRepo.findOne.mockResolvedValue(mockUser);
      divisionQb.getRawMany = jest.fn().mockResolvedValue([{ id: DIV_CCD }]);
      scopeRepo.find.mockResolvedValue([DIV_CCD_SCOPE]);

      await service.setDivisionAccess(USER_ID, { companyId: COMPANY_ID, divisionIds: [DIV_CCD] });

      expect(txScopeRepo.remove).toHaveBeenCalledWith([spdScope]);
      expect(txScopeRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({
          userId: USER_ID,
          companyId: COMPANY_ID,
          divisionId: DIV_CCD,
          scopeLevel: ScopeLevel.DIVISION,
          isFullScope: false,
          status: OrgScopeStatus.ACTIVE,
        }),
      ]);
    });

    it('is idempotent: saving the same set twice writes the same rows', async () => {
      txScopeRepo.find.mockResolvedValue([DIV_CCD_SCOPE]);
      userRepo.findOne.mockResolvedValue(mockUser);
      divisionQb.getRawMany = jest.fn().mockResolvedValue([{ id: DIV_CCD }]);
      scopeRepo.find.mockResolvedValue([DIV_CCD_SCOPE]);

      await service.setDivisionAccess(USER_ID, { companyId: COMPANY_ID, divisionIds: [DIV_CCD] });
      await service.setDivisionAccess(USER_ID, { companyId: COMPANY_ID, divisionIds: [DIV_CCD] });

      expect(txScopeRepo.save).not.toHaveBeenCalled();
      expect(txScopeRepo.remove).not.toHaveBeenCalled();
    });

    it('de-duplicates the requested set before writing', async () => {
      txScopeRepo.find.mockResolvedValue([]);
      userRepo.findOne.mockResolvedValue(mockUser);
      divisionQb.getRawMany = jest
        .fn()
        .mockResolvedValue([{ id: DIV_CCD }, { id: DIV_SPD }]);
      scopeRepo.find.mockResolvedValue([]);

      await service.setDivisionAccess(USER_ID, {
        companyId: COMPANY_ID,
        divisionIds: [DIV_CCD, ` ${DIV_SPD} `, DIV_CCD],
      });

      const written = (txScopeRepo.save.mock.calls[0][0] as unknown[]).length;
      expect(written).toBe(2);
    });
  });

  // ── T06: cannot persist a scope for a division outside the company ─────────
  describe('setDivisionAccess — validation', () => {
    it('rejects a division that does not exist in the company (no partial write)', async () => {
      userRepo.findOne.mockResolvedValue(mockUser);
      divisionQb.getRawMany = jest.fn().mockResolvedValue([{ id: DIV_CCD }]);

      await expect(
        service.setDivisionAccess(USER_ID, { companyId: COMPANY_ID, divisionIds: [DIV_CCD, 'ghost-division'] }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(transaction).not.toHaveBeenCalled();
      expect(txScopeRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a request that expresses no intent at all', async () => {
      userRepo.findOne.mockResolvedValue(mockUser);

      await expect(
        service.setDivisionAccess(USER_ID, { companyId: COMPANY_ID }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.setDivisionAccess(USER_ID, { companyId: COMPANY_ID, companyWide: false }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rejects an unknown user', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(
        service.setDivisionAccess('missing', { companyId: COMPANY_ID, companyWide: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── T07: unrestricted / SUPER_ADMIN regression ────────────────────────────
  describe('setDivisionAccess — unrestricted', () => {
    it('replaces every division row with a single company-wide row (backward compatible)', async () => {
      txScopeRepo.find.mockResolvedValue([DIV_CCD_SCOPE, { ...DIV_CCD_SCOPE, id: 'b', divisionId: DIV_SPD }]);
      userRepo.findOne.mockResolvedValue(mockUser);
      scopeRepo.find.mockResolvedValue([COMPANY_WIDE_SCOPE]);

      await service.setDivisionAccess(USER_ID, { companyId: COMPANY_ID, companyWide: true });

      const removed = txScopeRepo.remove.mock.calls.flatMap((c) => c[0] as unknown[]);
      expect(removed).toHaveLength(2);
      expect(txScopeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          divisionId: null,
          scopeLevel: ScopeLevel.COMPANY,
          isFullScope: true,
          status: OrgScopeStatus.ACTIVE,
        }),
      );
      // Unrestricted users stay unrestricted.
      expect(deriveUserDivisionIds([COMPANY_WIDE_SCOPE])).toBe('ALL');
    });
  });

  // ── T08: deny-all survives ────────────────────────────────────────────────
  describe('setDivisionAccess — deny all', () => {
    it('removes every row and writes an explicit ACTIVE deny marker', async () => {
      txScopeRepo.find.mockResolvedValue([DIV_CCD_SCOPE, COMPANY_WIDE_SCOPE]);
      userRepo.findOne.mockResolvedValue(mockUser);
      scopeRepo.find.mockResolvedValue([]);

      await service.setDivisionAccess(USER_ID, { companyId: COMPANY_ID, divisionIds: [] });

      const removed = txScopeRepo.remove.mock.calls.flatMap((c) => c[0] as unknown[]);
      expect(removed).toEqual(expect.arrayContaining([DIV_CCD_SCOPE, COMPANY_WIDE_SCOPE]));
      expect(txScopeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          divisionId: null,
          isFullScope: false,
          isActive: true,
          status: OrgScopeStatus.ACTIVE,
          scopeLevel: ScopeLevel.NONE,
        }),
      );

      // The marker resolves to "no division at all" for the guard chain.
      const marker = txScopeRepo.save.mock.calls[0][0];
      expect(deriveUserDivisionIds([marker])).toEqual([]);
    });
  });

  // ── T09: the auto-heal itself ─────────────────────────────────────────────
  describe('getUserOrganizationScopes — auto-heal', () => {
    it('still provisions full company scope for a brand-new user with no rows', async () => {
      const healed = {
        id: 'healed',
        companyId: COMPANY_ID,
        scopeLevel: ScopeLevel.COMPANY,
        isFullScope: true,
        status: OrgScopeStatus.ACTIVE,
        isActive: true,
      };
      const healRepo = {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest
          .fn()
          .mockResolvedValueOnce(null) // anyScopeRow → none, so healing is allowed
          .mockResolvedValueOnce(healed), // re-read of the row just written
        create: jest.fn((dto: any) => ({ id: 'healed', ...dto })),
        save: jest.fn().mockImplementation(async (row: any) => row),
      };
      const companyRepo: any = { findOne: jest.fn() };
      const healUserRepo: any = {
        findOne: jest.fn().mockResolvedValue({ ...mockUser, defaultCompanyId: COMPANY_ID }),
        save: jest.fn(),
      };

      const module = await Test.createTestingModule({
        providers: [
          ErpUserService,
          { provide: getRepositoryToken(ErpUser), useValue: healUserRepo },
          { provide: getRepositoryToken(UserRole), useValue: makeRepo() },
          { provide: getRepositoryToken(UserOrganizationScope), useValue: healRepo },
          { provide: getRepositoryToken(Company), useValue: companyRepo },
          { provide: getDataSourceToken(), useValue: { transaction } },
          { provide: NotificationsService, useValue: { notifyActiveUsers: jest.fn() } },
          { provide: SupabaseAuthService, useValue: { signUpWithPassword: jest.fn() } },
        ],
      }).compile();
      const healService = module.get<ErpUserService>(ErpUserService);

      const scopes = await healService.getUserOrganizationScopes(USER_ID);

      expect(healRepo.save).toHaveBeenCalled();
      expect(scopes).toHaveLength(1);
      expect(deriveUserDivisionIds(scopes)).toBe('ALL');
    });

    it('does NOT re-grant full access when a persisted deny marker exists', async () => {
      // `setDivisionAccess({ divisionIds: [] })` writes this ACTIVE row. Every
      // resolver filters on `status = 'ACTIVE'`, so the marker is always
      // visible and the deny survives every subsequent read.
      const marker = {
        divisionId: null,
        scopeLevel: ScopeLevel.NONE,
        isFullScope: false,
        status: OrgScopeStatus.ACTIVE,
      };
      scopeRepo.find.mockResolvedValue([marker] as unknown as UserOrganizationScope[]);

      const scopes = await service.getUserOrganizationScopes(USER_ID);

      expect(scopes).toEqual([marker]);
      expect(scopeRepo.save).not.toHaveBeenCalled(); // no heal
      expect(deriveUserDivisionIds(scopes)).toEqual([]); // deny-all, not ALL
    });

    it('does NOT re-grant full access when only inactive rows exist (a hard revoke)', async () => {
      // The legacy `DELETE /org-scopes/:scopeId` path removes the row outright.
      // Auto-heal must not treat "no rows" as "brand-new user" when a revoke is
      // already on record for the account.
      const inactive = {
        id: 'revoked',
        divisionId: null,
        scopeLevel: ScopeLevel.COMPANY,
        status: OrgScopeStatus.INACTIVE,
        isActive: false,
      };
      scopeRepo.find.mockResolvedValue([]); // no ACTIVE scopes
      scopeRepo.findOne.mockResolvedValue(inactive as unknown as UserOrganizationScope);
      userRepo.findOne.mockResolvedValue(mockUser);

      const scopes = await service.getUserOrganizationScopes(USER_ID);

      expect(scopeRepo.save).not.toHaveBeenCalled();
      expect(scopes).toEqual([]);
    });
  });
});
