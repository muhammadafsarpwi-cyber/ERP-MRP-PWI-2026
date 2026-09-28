import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DivisionScopeGuard } from './division-scope.guard';
import { DivisionAccessService } from '../../permission/services/division-access.service';

/**
 * Prompt #16 §15/§18/§19 — request-time behaviour of `DivisionScopeGuard`.
 *
 * Required outcomes:
 *   • explicit `divisionId` outside the caller's set  → 403
 *   • empty effective intersection                    → 403
 *   • no explicit division                            → allow, and publish
 *     `request.allowedDivisionIds` so the service filters the query
 *   • nothing configured / enforcement off            → exactly the old
 *     behaviour (never deny-by-default)
 */
describe('DivisionScopeGuard', () => {
  const D1 = '11111111-1111-1111-1111-111111111111';
  const D2 = '22222222-2222-2222-2222-222222222222';

  let guard: DivisionScopeGuard;
  let resolveForRequest: jest.Mock;
  let isEnforcementEnabled: jest.Mock;
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    resolveForRequest = jest.fn();
    isEnforcementEnabled = jest.fn().mockReturnValue(true);

    const divisionAccessService = {
      resolveForRequest,
      isEnforcementEnabled,
      // Mirrors the real service implementation (unrestricted ⇒ allow).
      isDivisionAllowed: (access: any, divisionId: string): boolean => {
        if (access === 'ALL' || access === undefined || access === null) return true;
        if (!Array.isArray(access)) return true;
        if (access.length === 0) return false;
        return access.includes(divisionId);
      },
    } as unknown as DivisionAccessService;

    reflector = { getAllAndOverride: jest.fn() };
    guard = new DivisionScopeGuard(reflector as unknown as Reflector, divisionAccessService);
  });

  const context = (request: any) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as any;

  it('rejects an explicit divisionId outside the effective set with 403', async () => {
    const request: any = { query: { divisionId: D2 } };
    resolveForRequest.mockResolvedValue([D1]);

    await expect(guard.canActivate(context(request))).rejects.toThrow(ForbiddenException);
    expect(request.allowedDivisionIds).toEqual([D1]);
  });

  it('accepts an explicit divisionId inside the effective set', async () => {
    const request: any = { query: { divisionId: D1 } };
    resolveForRequest.mockResolvedValue([D1]);

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
  });

  it('reads the explicit division from the body (writes) and route params', async () => {
    resolveForRequest.mockResolvedValue([D1]);

    const body: any = { body: { divisionId: D2 } };
    await expect(guard.canActivate(context(body))).rejects.toThrow(ForbiddenException);

    const params: any = { params: { divisionId: D2 } };
    await expect(guard.canActivate(context(params))).rejects.toThrow(ForbiddenException);

    const nestedKey: any = { body: { division_id: D2 } };
    await expect(guard.canActivate(context(nestedKey))).rejects.toThrow(ForbiddenException);
  });

  it('denies everything when the effective intersection is empty', async () => {
    const request: any = {};
    resolveForRequest.mockResolvedValue([]);

    await expect(guard.canActivate(context(request))).rejects.toThrow(ForbiddenException);
  });

  it('publishes allowedDivisionIds and allows the request when no division is specified', async () => {
    const request: any = { query: { page: '1' } };
    resolveForRequest.mockResolvedValue([D1, D2]);

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.allowedDivisionIds).toEqual([D1, D2]);
    expect(request.divisionAccessResolved).toBeUndefined(); // set by the service
  });

  it('is a no-op for an unrestricted caller (backward compatible)', async () => {
    const request: any = { query: { divisionId: D2 } };
    resolveForRequest.mockResolvedValue('ALL');

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.allowedDivisionIds).toBe('ALL');
  });

  it('never rejects when the DIVISION_SCOPE_ENFORCEMENT kill-switch is off', async () => {
    isEnforcementEnabled.mockReturnValue(false);
    const request: any = { query: { divisionId: D2 } };
    resolveForRequest.mockResolvedValue([D1]);

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    // The value is still published so downstream code stays consistent.
    expect(request.allowedDivisionIds).toEqual([D1]);
  });

  it('passes the permission code from @RequirePermission to the resolver', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === 'require_permission' ? 'production.entry.view' : false,
    );
    resolveForRequest.mockResolvedValue('ALL');

    await guard.canActivate(context({ query: {} }));

    expect(resolveForRequest).toHaveBeenCalledWith(expect.anything(), 'production.entry.view');
  });
});
