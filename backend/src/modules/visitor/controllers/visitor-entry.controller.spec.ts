import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { VisitorEntryController } from './visitor-entry.controller';
import { LocationController } from './location.controller';
import { PermissionGuard, REQUIRE_PERMISSION_KEY } from '../../auth/guards/permission.guard';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard, REQUIRE_ORG_SCOPE_KEY } from '../../auth/guards/org-scope.guard';
import { DivisionScopeGuard } from '../../auth/guards/division-scope.guard';
import { PATH_METADATA } from '@nestjs/common/constants';

/**
 * Prompt #17 §7 / §11 / §21 — authorization wiring of the Visitor APIs.
 *
 * These assertions prove the endpoints are declared inside the project's
 * existing authorization stack (JWT → PermissionGuard → OrgScopeGuard →
 * DivisionScopeGuard) with the seeded permission codes, and that the handler
 * hands the resolved division set to the service — the same data the service
 * tests then enforce.
 */
const GUARDS_METADATA = '__guards__';

const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
const CCD = 'd1000000-0000-0000-0000-000000000002';
const SPD = 'd1000000-0000-0000-0000-000000000001';
const ENTRY = 'f1000000-0000-0000-0000-000000000001';

const meta = (key: string, handler: any) => Reflect.getMetadata(key, handler);

describe('VisitorEntryController authorization', () => {
  it('runs the existing guard chain (no parallel auth system)', () => {
    const guards: any[] = Reflect.getMetadata(GUARDS_METADATA, VisitorEntryController) || [];
    expect(guards).toEqual(
      expect.arrayContaining([SupabaseJwtGuard, PermissionGuard, OrgScopeGuard, DivisionScopeGuard]),
    );
    expect(Reflect.getMetadata(PATH_METADATA, VisitorEntryController)).toBe('visitor');
  });

  it.each([
    ['findHosts', 'visitor.entry.create'],
    ['findAll', 'visitor.entry.view'],
    ['create', 'visitor.entry.create'],
    ['findOne', 'visitor.entry.view'],
    ['uploadPhoto', 'visitor.entry.create'],
    ['getPhoto', 'visitor.entry.view'],
  ])('%s is protected by %s', (method, permission) => {
    const handler = (VisitorEntryController.prototype as any)[method];
    expect(handler).toBeDefined();
    expect(meta(REQUIRE_PERMISSION_KEY, handler)).toBe(permission);
    expect(meta(REQUIRE_ORG_SCOPE_KEY, handler)).toBe(true);
  });

  it('forwards the caller company and effective division set to the service', async () => {
    const service = { findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }) };
    const controller = new VisitorEntryController(service as any);

    await controller.findAll({ page: 1 } as any, {
      erpUser: { id: 'u', defaultCompanyId: COMPANY },
      allowedDivisionIds: [CCD],
    });

    expect(service.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY, allowedDivisionIds: [CCD], page: 1 }),
    );
  });

  it('passes "ALL" through as undefined (unrestricted legacy behaviour)', async () => {
    const service = { findOne: jest.fn().mockResolvedValue({ id: ENTRY }) };
    const controller = new VisitorEntryController(service as any);

    await controller.findOne(ENTRY, {
      erpUser: { id: 'u', defaultCompanyId: COMPANY },
      allowedDivisionIds: 'ALL',
    });

    expect(service.findOne).toHaveBeenCalledWith(ENTRY, COMPANY, undefined);
  });

  it('400s instead of guessing a company when the caller has no company scope', async () => {
    const controller = new VisitorEntryController({ findAll: jest.fn() } as any);
    await expect(
      controller.findAll({} as any, { erpUser: { id: 'u' }, allowedDivisionIds: [CCD] }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('LocationController authorization', () => {
  it('uses the same guard chain and permission codes', () => {
    const guards: any[] = Reflect.getMetadata(GUARDS_METADATA, LocationController) || [];
    expect(guards).toEqual(
      expect.arrayContaining([SupabaseJwtGuard, PermissionGuard, OrgScopeGuard, DivisionScopeGuard]),
    );

    expect(meta(REQUIRE_PERMISSION_KEY, LocationController.prototype.create)).toBe('location.create');
    expect(meta(REQUIRE_PERMISSION_KEY, LocationController.prototype.findAll)).toBe('location.view');
    expect(meta(REQUIRE_PERMISSION_KEY, LocationController.prototype.findOne)).toBe('location.view');
    expect(meta(REQUIRE_PERMISSION_KEY, LocationController.prototype.update)).toBe('location.update');
    expect(meta(REQUIRE_PERMISSION_KEY, LocationController.prototype.remove)).toBe('location.delete');
  });

  it('forwards the caller division set to the service', async () => {
    const service = { findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }) };
    const controller = new LocationController(service as any);

    await controller.findAll({} as any, {
      erpUser: { id: 'u', defaultCompanyId: COMPANY },
      allowedDivisionIds: [SPD],
    });

    expect(service.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY, allowedDivisionIds: [SPD] }),
    );
  });
});
