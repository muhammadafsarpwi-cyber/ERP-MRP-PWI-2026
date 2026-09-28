import { renderHook } from '@testing-library/react';
import { usePermission } from './usePermission';

/**
 * Prompt #16 §28 — division-aware helpers on the existing `usePermission`
 * hook.
 *
 * Contract under test:
 *   • `can` / `canAny` / `canAll` / `canModule` behave EXACTLY as before
 *     (backward compatibility — no existing component may change behaviour).
 *   • `canInDivision` = user organization scope ∩ role permission scope.
 *   • A user can never be granted a division outside their own scope.
 *   • Missing/legacy `divisions` payload ⇒ unrestricted, never deny-all.
 */

const D_CCD = '11111111-1111-1111-1111-111111111111';
const D_SPD = '22222222-2222-2222-2222-222222222222';
const D_NB = '33333333-3333-3333-3333-333333333333';

const PERMISSION = 'production.entry.create';

function seed(overrides: { permissions?: string[]; divisions?: any }) {
  const user: any = {
    id: 'u1',
    email: 'user@pwi.test',
    displayName: 'Division User',
    permissions: overrides.permissions ?? [PERMISSION],
  };
  if (overrides.divisions !== undefined) user.divisions = overrides.divisions;

  localStorage.setItem('erp_user', JSON.stringify(user));
  localStorage.setItem('erp_permissions_ts', Date.now().toString());
}

describe('usePermission — division access (Prompt #16 §28)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is unrestricted when /auth/me returns no divisions payload (legacy user)', () => {
    seed({});

    const { result } = renderHook(() => usePermission());

    expect(result.current.divisionsUnrestricted).toBe(true);
    expect(result.current.allowedDivisionIds).toEqual([]);
    expect(result.current.permissionDivisionScopes).toEqual({});
    // No restriction configured ⇒ nothing is denied.
    expect(result.current.canInDivision(PERMISSION, D_SPD)).toBe(true);
  });

  it('leaves the legacy can() API untouched', () => {
    seed({
      permissions: [
        'production.entry.view',
        'production.entry.create',
        // `canModule` compares `action.toUpperCase()` against the raw code, so
        // it only matches codes whose action part is ALREADY upper-case. That
        // case inconsistency is pre-existing (flagged in the Prompt #15 audit)
        // and is deliberately NOT changed by this work.
        'production.entry.CREATE',
      ],
    });

    const { result } = renderHook(() => usePermission());

    expect(result.current.can('production.entry.create')).toBe(true);
    expect(result.current.can('production.entry.delete')).toBe(false);
    expect(result.current.canAny('a.b', 'production.entry.create')).toBe(true);
    expect(result.current.canAll('production.entry.view', 'production.entry.create')).toBe(true);
    expect(result.current.canModule('production', 'CREATE')).toBe(true);
    expect(result.current.canModule('store', 'CREATE')).toBe(false);
  });

  it('restricts to the divisions the user actually holds', () => {
    seed({
      divisions: {
        unrestricted: false,
        items: [
          { id: D_CCD, divisionCode: 'DIV-CCD', name: 'CCD' },
          { id: D_SPD, divisionCode: 'DIV-SPD', name: 'SPD' },
        ],
        permissionScopes: {},
      },
    });

    const { result } = renderHook(() => usePermission());

    expect(result.current.divisionsUnrestricted).toBe(false);
    expect(result.current.allowedDivisionIds).toEqual([D_CCD, D_SPD]);
    expect(result.current.canInDivision(PERMISSION, D_CCD)).toBe(true);
    expect(result.current.canInDivision(PERMISSION, D_SPD)).toBe(true);
    // Outside the user's organization scope ⇒ denied.
    expect(result.current.canInDivision(PERMISSION, D_NB)).toBe(false);
    expect(result.current.roleBlocksInDivision(PERMISSION, D_NB)).toBe(false);
  });

  it('applies the role permission division scope on top of the user scope (§11)', () => {
    seed({
      divisions: {
        unrestricted: false,
        items: [
          { id: D_CCD, divisionCode: 'DIV-CCD', name: 'CCD' },
          { id: D_SPD, divisionCode: 'DIV-SPD', name: 'SPD' },
        ],
        permissionScopes: { [PERMISSION]: [D_CCD] },
      },
    });

    const { result } = renderHook(() => usePermission());

    // Inside both scopes.
    expect(result.current.canInDivision(PERMISSION, D_CCD)).toBe(true);
    // The user holds SPD, but the ROLE limits this permission to CCD.
    expect(result.current.canInDivision(PERMISSION, D_SPD)).toBe(false);
    expect(result.current.roleBlocksInDivision(PERMISSION, D_SPD)).toBe(true);
    expect(result.current.roleBlocksInDivision(PERMISSION, D_CCD)).toBe(false);
  });

  it('never grants a division outside the user scope, even if the role allows it', () => {
    seed({
      divisions: {
        unrestricted: false,
        items: [{ id: D_CCD, divisionCode: 'DIV-CCD', name: 'CCD' }],
        permissionScopes: { [PERMISSION]: [D_CCD, D_SPD] },
      },
    });

    const { result } = renderHook(() => usePermission());

    expect(result.current.canInDivision(PERMISSION, D_SPD)).toBe(false);
  });

  it('never turns a missing permission into a grant', () => {
    seed({
      permissions: ['production.entry.view'],
      divisions: {
        unrestricted: true,
        items: [{ id: D_CCD, divisionCode: 'DIV-CCD', name: 'CCD' }],
        permissionScopes: { [PERMISSION]: [D_CCD] },
      },
    });

    const { result } = renderHook(() => usePermission());

    expect(result.current.can(PERMISSION)).toBe(false);
    expect(result.current.canInDivision(PERMISSION, D_CCD)).toBe(false);
    expect(result.current.roleBlocksInDivision(PERMISSION, D_CCD)).toBe(false);
  });

  it('behaves exactly like can() when no division is specified', () => {
    seed({});

    const { result } = renderHook(() => usePermission());

    expect(result.current.canInDivision(PERMISSION)).toBe(result.current.can(PERMISSION));
    expect(result.current.canInDivision('production.entry.delete')).toBe(
      result.current.can('production.entry.delete'),
    );
  });
});
