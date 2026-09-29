import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DivisionAccessService } from './division-access.service';
import { UserOrganizationScope } from '../../user/entities/user-organization-scope.entity';
import { RolePermissionDivisionScope } from '../../role/entities/role-permission-division-scope.entity';
import { Division } from '../../organization/entities/division.entity';

/**
 * Prompt #16 §10/§11/§12 — resolution contract for
 * `effective = user organization scope ∩ role permission division scope`.
 *
 * Backward compatibility is asserted explicitly: an empty (or unreachable)
 * `role_permission_division_scopes` table must never turn into a denial.
 */
describe('DivisionAccessService', () => {
  let service: DivisionAccessService;

  const orgScopeRepo = { find: jest.fn() };
  const roleScopeRepo = { manager: { query: jest.fn() } };
  const divisionRepo = { find: jest.fn() };
  const config = { get: jest.fn() };

  const D1 = '11111111-1111-1111-1111-111111111111';
  const D2 = '22222222-2222-2222-2222-222222222222';
  const D3 = '33333333-3333-3333-3333-333333333333';

  beforeEach(async () => {
    jest.clearAllMocks();
    config.get.mockReturnValue(undefined); // flag unset ⇒ default ON
    // Default role-side answer: "the user's roles grant nothing", so an
    // individual test only has to declare the rows it actually cares about
    // and cannot inherit an implementation from the previous test.
    roleScopeRepo.manager.query.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DivisionAccessService,
        { provide: getRepositoryToken(UserOrganizationScope), useValue: orgScopeRepo },
        { provide: getRepositoryToken(RolePermissionDivisionScope), useValue: roleScopeRepo },
        { provide: getRepositoryToken(Division), useValue: divisionRepo },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<DivisionAccessService>(DivisionAccessService);
  });

  describe('enforcement flag (§32)', () => {
    it('defaults to ON when DIVISION_SCOPE_ENFORCEMENT is not set', () => {
      config.get.mockReturnValue(undefined);
      expect(service.isEnforcementEnabled()).toBe(true);
    });

    it('is turned OFF only by an explicit negative value', () => {
      for (const value of ['false', '0', 'off', 'NO']) {
        config.get.mockReturnValue(value);
        expect(service.isEnforcementEnabled()).toBe(false);
      }
      for (const value of ['true', '1', 'yes', '']) {
        config.get.mockReturnValue(value);
        expect(service.isEnforcementEnabled()).toBe(true);
      }
    });
  });

  describe('role permission side (§12 — zero rows means unrestricted)', () => {
    it('is unrestricted when the permission has no restriction rows', async () => {
      // LEFT JOIN produced a row with scope_id NULL ⇒ grant with no restriction.
      roleScopeRepo.manager.query.mockResolvedValue([
        { permission_code: 'production.entry', role_id: 'role-a', scope_id: null, division_id: null },
      ]);

      await expect(service.getPermissionDivisionAccess('user-1', 'production.entry')).resolves.toEqual(
        'ALL',
      );
    });

    it('returns exactly the configured divisions', async () => {
      roleScopeRepo.manager.query.mockResolvedValue([
        { permission_code: 'production.entry', role_id: 'role-a', scope_id: 's1', division_id: D1 },
        { permission_code: 'production.entry', role_id: 'role-a', scope_id: 's2', division_id: D2 },
      ]);

      await expect(service.getPermissionDivisionAccess('user-1', 'production.entry')).resolves.toEqual(
        [D1, D2],
      );
    });

    it('unions across roles: one unrestricted role widens the grant', async () => {
      roleScopeRepo.manager.query.mockResolvedValue([
        { permission_code: 'production.entry', role_id: 'role-a', scope_id: 's1', division_id: D1 },
        { permission_code: 'production.entry', role_id: 'role-b', scope_id: null, division_id: null },
      ]);

      await expect(service.getPermissionDivisionAccess('user-1', 'production.entry')).resolves.toEqual(
        'ALL',
      );
    });

    it('treats an explicit division_id NULL row as a global grant', async () => {
      roleScopeRepo.manager.query.mockResolvedValue([
        { permission_code: 'production.entry', role_id: 'role-a', scope_id: 's1', division_id: null },
      ]);

      await expect(service.getPermissionDivisionAccess('user-1', 'production.entry')).resolves.toEqual(
        'ALL',
      );
    });

    it('falls back to unrestricted when the table cannot be reached', async () => {
      roleScopeRepo.manager.query.mockRejectedValue(new Error('relation does not exist'));

      await expect(service.getPermissionDivisionAccess('user-1', 'production.entry')).resolves.toEqual(
        'ALL',
      );
    });

    it('falls back to unrestricted when the user holds no grant at all', async () => {
      roleScopeRepo.manager.query.mockResolvedValue([]);

      await expect(service.getPermissionDivisionAccess('user-1', 'production.entry')).resolves.toEqual(
        'ALL',
      );
    });
  });

  describe('getEffectiveDivisions (§10 — user ∩ role)', () => {
    it('equals the user scope when the permission side is unrestricted', async () => {
      orgScopeRepo.find.mockResolvedValue([
        { divisionId: D1, scopeLevel: 'DIVISION', status: 'ACTIVE' },
        { divisionId: D2, scopeLevel: 'DIVISION', status: 'ACTIVE' },
      ]);
      roleScopeRepo.manager.query.mockResolvedValue([
        { permission_code: 'production.entry', role_id: 'r', scope_id: null, division_id: null },
      ]);

      await expect(service.getEffectiveDivisions('u1', 'production.entry')).resolves.toEqual([D1, D2]);
    });

    it('narrows the user scope by the role restriction', async () => {
      orgScopeRepo.find.mockResolvedValue([
        { divisionId: D1, scopeLevel: 'DIVISION', status: 'ACTIVE' },
        { divisionId: D2, scopeLevel: 'DIVISION', status: 'ACTIVE' },
      ]);
      roleScopeRepo.manager.query.mockResolvedValue([
        { permission_code: 'production.entry', role_id: 'r', scope_id: 's1', division_id: D2 },
        { permission_code: 'production.entry', role_id: 'r', scope_id: 's2', division_id: D3 },
      ]);

      await expect(service.getEffectiveDivisions('u1', 'production.entry')).resolves.toEqual([D2]);
    });

    it('never grants a division outside the user scope (deny on empty intersection)', async () => {
      orgScopeRepo.find.mockResolvedValue([
        { divisionId: D1, scopeLevel: 'DIVISION', status: 'ACTIVE' },
      ]);
      roleScopeRepo.manager.query.mockResolvedValue([
        { permission_code: 'production.entry', role_id: 'r', scope_id: 's1', division_id: D3 },
      ]);

      await expect(service.getEffectiveDivisions('u1', 'production.entry')).resolves.toEqual([]);
    });

    it('returns the raw user scope when no permission code is supplied', async () => {
      orgScopeRepo.find.mockResolvedValue([
        { divisionId: D1, scopeLevel: 'DIVISION', status: 'ACTIVE' },
      ]);

      await expect(service.getEffectiveDivisions('u1')).resolves.toEqual([D1]);
      expect(roleScopeRepo.manager.query).not.toHaveBeenCalled();
    });

    it('a company-wide user scope keeps every division the role allows', async () => {
      orgScopeRepo.find.mockResolvedValue([
        { divisionId: null, scopeLevel: 'COMPANY', status: 'ACTIVE' },
      ]);
      roleScopeRepo.manager.query.mockResolvedValue([
        { permission_code: 'production.entry', role_id: 'r', scope_id: 's1', division_id: D3 },
      ]);

      await expect(service.getEffectiveDivisions('u1', 'production.entry')).resolves.toEqual([D3]);
    });
  });

  /**
   * PROMPT #26 — regression for the reported leak, expressed at the service
   * that every guard delegates to.
   *
   * The production user (Anus) had TWO ACTIVE rows:
   *   - the DIV-CCD row the Division Access popup displayed, and
   *   - a stray company-wide row (`division_id IS NULL`, `is_full_scope = true`)
   *     that `ErpUserService.getUserOrganizationScopes()` had auto-healed.
   * The pre-fix resolver short-circuited to 'ALL' on the company-wide row, so
   * `GET /auth/me` reported `unrestricted: true` and Raw Material Receiving
   * returned every division's receipts to a DIV-CCD-only user.
   *
   * The invariant asserted here: an explicit DIVISION-level restriction is
   * authoritative and is never widened by a co-existing company-wide default.
   */
  describe('PROMPT #26 — contradictory scope rows (DIV-CCD user + company-wide default)', () => {
    const ANUS_SCOPES = [
      { divisionId: D1, sectionId: null, departmentId: null, scopeLevel: 'DIVISION', isFullScope: false, status: 'ACTIVE' },
      { divisionId: null, sectionId: null, departmentId: null, scopeLevel: 'COMPANY', isFullScope: true, status: 'ACTIVE' },
    ];

    it('resolves to the division row, not ALL', async () => {
      orgScopeRepo.find.mockResolvedValue(ANUS_SCOPES);
      await expect(service.getEffectiveDivisions('anus')).resolves.toEqual([D1]);
    });

    it('is rejected for a division outside the explicit restriction (the leak itself)', async () => {
      orgScopeRepo.find.mockResolvedValue(ANUS_SCOPES);
      const access = await service.getEffectiveDivisions('anus');
      expect(service.isDivisionAllowed(access, D1)).toBe(true);  // DIV-CCD
      expect(service.isDivisionAllowed(access, D2)).toBe(false); // DIV-SPD — was 200, must be 403
      expect(service.isDivisionAllowed(access, D3)).toBe(false);
    });

    it('projects only the allowed divisions in /auth/me master data', async () => {
      orgScopeRepo.find.mockResolvedValue(ANUS_SCOPES);
      divisionRepo.find.mockResolvedValue([
        { id: D1, divisionCode: 'DIV-CCD', status: 'ACTIVE' },
        { id: D2, divisionCode: 'DIV-SPD', status: 'ACTIVE' },
        { id: D3, divisionCode: 'DIV-PWI', status: 'ACTIVE' },
      ]);

      const result = await service.listAccessibleDivisions('anus');

      expect(result.unrestricted).toBe(false);
      expect(result.divisions.map((d) => d.divisionCode)).toEqual(['DIV-CCD']);
    });

    it('stays restricted through resolveForRequest, which is what the guard caches', async () => {
      orgScopeRepo.find.mockResolvedValue(ANUS_SCOPES);
      const request: any = { erpUser: { id: 'anus' } };

      await expect(service.resolveForRequest(request)).resolves.toEqual([D1]);
      expect(request.allowedDivisionIds).toEqual([D1]);
      expect(request.divisionAccessResolved).toBe(true);
    });

    it('still leaves a genuine company-wide-only user unrestricted (SUPER_ADMIN regression)', async () => {
      orgScopeRepo.find.mockResolvedValue([ANUS_SCOPES[1]]);
      await expect(service.getEffectiveDivisions('super-admin')).resolves.toBe('ALL');
      expect(service.isDivisionAllowed('ALL', D2)).toBe(true);
    });
  });

  describe('isDivisionAllowed', () => {
    it('allows everything when unrestricted', () => {
      expect(service.isDivisionAllowed('ALL', D1)).toBe(true);
      expect(service.isDivisionAllowed(undefined, D1)).toBe(true);
    });

    it('allows only listed divisions', () => {
      expect(service.isDivisionAllowed([D1], D1)).toBe(true);
      expect(service.isDivisionAllowed([D1], D2)).toBe(false);
    });

    it('denies everything for an empty division set', () => {
      expect(service.isDivisionAllowed([], D1)).toBe(false);
    });
  });

  describe('listAccessibleDivisions (§21 — never invents a division)', () => {
    const all = [
      { id: D1, divisionCode: 'DIV-CCD', name: 'CCD', status: 'ACTIVE' },
      { id: D2, divisionCode: 'DIV-SPD', name: 'SPD', status: 'ACTIVE' },
    ];

    it('returns the full master list for an unrestricted caller', async () => {
      orgScopeRepo.find.mockResolvedValue([]);
      divisionRepo.find.mockResolvedValue(all);

      const result = await service.listAccessibleDivisions('u1', 'production.entry');
      expect(result.unrestricted).toBe(true);
      expect(result.divisions).toHaveLength(2);
    });

    it('filters the real master rows for a restricted caller', async () => {
      orgScopeRepo.find.mockResolvedValue([
        { divisionId: D1, scopeLevel: 'DIVISION', status: 'ACTIVE' },
      ]);
      roleScopeRepo.manager.query.mockResolvedValue([
        { permission_code: 'production.entry', role_id: 'r', scope_id: null, division_id: null },
      ]);
      divisionRepo.find.mockResolvedValue(all);

      const result = await service.listAccessibleDivisions('u1', 'production.entry');
      expect(result.unrestricted).toBe(false);
      expect(result.divisions.map((d: any) => d.id)).toEqual([D1]);
    });
  });

  describe('resolveForRequest', () => {
    it('caches the resolved value on the request', async () => {
      orgScopeRepo.find.mockResolvedValue([
        { divisionId: D1, scopeLevel: 'DIVISION', status: 'ACTIVE' },
      ]);
      roleScopeRepo.manager.query.mockResolvedValue([
        { permission_code: 'production.entry', role_id: 'r', scope_id: null, division_id: null },
      ]);

      const request: any = { erpUser: { id: 'u1' } };
      const first = await service.resolveForRequest(request, 'production.entry');
      const second = await service.resolveForRequest(request, 'production.entry');

      expect(first).toEqual([D1]);
      expect(second).toEqual([D1]);
      expect(orgScopeRepo.find).toHaveBeenCalledTimes(1);
      expect(request.allowedDivisionIds).toEqual([D1]);
      expect(request.divisionAccessResolved).toBe(true);
    });

    it('does not resolve anything for an anonymous request', async () => {
      const request: any = {};
      await expect(service.resolveForRequest(request, 'production.entry')).resolves.toEqual('ALL');
      expect(orgScopeRepo.find).not.toHaveBeenCalled();
    });
  });
});
