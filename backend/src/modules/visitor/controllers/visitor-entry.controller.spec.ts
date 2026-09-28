import 'reflect-metadata';
import { BadRequestException, RequestMethod } from '@nestjs/common';
import { VisitorEntryController } from './visitor-entry.controller';
import { LocationController } from './location.controller';
import { PermissionGuard, REQUIRE_PERMISSION_KEY } from '../../auth/guards/permission.guard';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard, REQUIRE_ORG_SCOPE_KEY } from '../../auth/guards/org-scope.guard';
import { DivisionScopeGuard } from '../../auth/guards/division-scope.guard';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';

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
    // Prompt #18 §21 — the exit is an UPDATE in the same permission family,
    // NOT folded into `visitor.entry.create`.
    ['checkOut', 'visitor.entry.update'],
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

/**
 * Prompt #18 §4 / §23 / §24 — the exit endpoint.
 *
 * The handler is the last line of defence for "the server owns the Time-Out":
 * a client that tries to send `time_out`, `status` or a forged actor never
 * reaches the service, and the division set the guard resolved is the same one
 * the service then enforces row by row.
 */
describe('VisitorEntryController — exit / Time-Out', () => {
  const req = {
    erpUser: { id: 'u1', defaultCompanyId: COMPANY },
    allowedDivisionIds: [CCD],
  };

  it('is declared as PATCH entries/:id/exit and forwards the caller scope', async () => {
    const handler: any = VisitorEntryController.prototype.checkOut;
    expect(meta(PATH_METADATA, handler)).toBe('entries/:id/exit');
    expect(meta(METHOD_METADATA, handler)).toBe(RequestMethod.PATCH);
    expect(handler).toBe(VisitorEntryController.prototype.checkOut);
  });

  it('forwards the company, the actor and the effective division set to the service', async () => {
    const service = { checkOut: jest.fn().mockResolvedValue({ id: ENTRY, status: 'COMPLETED' }) };
    const controller = new VisitorEntryController(service as any);

    const res = await controller.checkOut(ENTRY, {} as any, req);

    expect(service.checkOut).toHaveBeenCalledWith(ENTRY, COMPANY, 'u1', [CCD]);
    // §24 — the project's existing response wrapper, carrying the updated record.
    expect(res).toEqual({
      success: true,
      data: { id: ENTRY, status: 'COMPLETED' },
      message: 'Visitor exit recorded successfully',
    });
  });

  it.each([
    ['timeOut'],
    ['time_out'],
    ['exitTime'],
    ['completed_at'],
    ['status'],
    ['exitedBy'],
    ['divisionId'],
    ['updatedBy'],
  ])('400s when the client sends %s — the Time-Out is the server’s to set', async (key) => {
    const service = { checkOut: jest.fn() };
    const controller = new VisitorEntryController(service as any);

    await expect(
      controller.checkOut(ENTRY, { [key]: '2020-01-01T00:00:00.000Z' } as any, req),
    ).rejects.toThrow(BadRequestException);
    // Rejected before any state is read or written.
    expect(service.checkOut).not.toHaveBeenCalled();
  });

  it('accepts an empty body (a double-clicked confirm sends nothing)', async () => {
    const service = { checkOut: jest.fn().mockResolvedValue({ id: ENTRY }) };
    const controller = new VisitorEntryController(service as any);

    await expect(controller.checkOut(ENTRY, {} as any, req)).resolves.toBeDefined();
    await expect(controller.checkOut(ENTRY, undefined as any, req)).resolves.toBeDefined();
    expect(service.checkOut).toHaveBeenCalledTimes(2);
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
