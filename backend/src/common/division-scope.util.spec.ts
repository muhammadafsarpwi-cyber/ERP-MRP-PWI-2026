import {
  ALL_DIVISIONS,
  DivisionAccess,
  applyDivisionScopeFilter,
  deriveUserDivisionIds,
  divisionScopeFromRequest,
  intersectDivisionAccess,
  isUnrestricted,
  narrowWhereByDivision,
  rawDivisionInClause,
  toDivisionList,
} from './division-scope.util';

/**
 * Prompt #16 — pure-helper contract tests.
 *
 * These are the invariants the whole feature depends on:
 *   • `undefined` (nothing configured)  ⇒ unrestricted, never deny-all
 *   • empty intersection                ⇒ deny
 *   • a user can never be granted a division they do not already hold
 */
describe('division-scope.util', () => {
  describe('isUnrestricted', () => {
    it('treats unset / legacy values as unrestricted (backward compatibility)', () => {
      expect(isUnrestricted(undefined)).toBe(true);
      expect(isUnrestricted(null)).toBe(true);
      expect(isUnrestricted('ALL')).toBe(true);
    });

    it('treats a concrete list — even an empty one — as restricted', () => {
      expect(isUnrestricted([])).toBe(false);
      expect(isUnrestricted(['division-a'])).toBe(false);
    });
  });

  describe('toDivisionList', () => {
    it('returns [] for unrestricted values', () => {
      expect(toDivisionList('ALL')).toEqual([]);
      expect(toDivisionList(undefined)).toEqual([]);
    });

    it('returns the elements of a concrete list', () => {
      expect(toDivisionList(['a', 'b'])).toEqual(['a', 'b']);
    });
  });

  describe('intersectDivisionAccess  (user scope ∩ role permission scope)', () => {
    it('returns the restricted side when the other side is unrestricted', () => {
      expect(intersectDivisionAccess('ALL', ['a', 'b'])).toEqual(['a', 'b']);
      expect(intersectDivisionAccess(['a', 'b'], 'ALL')).toEqual(['a', 'b']);
      expect(intersectDivisionAccess(undefined, ['a'])).toEqual(['a']);
      expect(intersectDivisionAccess(['a'], undefined)).toEqual(['a']);
    });

    it('keeps only shared divisions', () => {
      expect(intersectDivisionAccess(['a', 'b'], ['b', 'c'])).toEqual(['b']);
    });

    it('returns an empty array (deny) when nothing is shared', () => {
      const result: DivisionAccess = intersectDivisionAccess(['a'], ['x']);
      expect(result).toEqual([]);
      expect(isUnrestricted(result)).toBe(false);
    });

    it('never invents a division outside the user scope', () => {
      const userScope = ['ccd'];
      const roleScope = ['ccd', 'spd'];
      expect(intersectDivisionAccess(userScope, roleScope)).toEqual(['ccd']);
    });
  });

  describe('applyDivisionScopeFilter', () => {
    const makeQb = () => {
      const calls: Array<{ sql: string; params?: Record<string, unknown> }> = [];
      const qb: any = {
        andWhere: jest.fn((sql: string, params?: Record<string, unknown>) => {
          calls.push({ sql, params });
          return qb;
        }),
      };
      qb.calls = calls;
      return qb;
    };

    it('is a no-op when access is unrestricted (legacy behaviour preserved)', () => {
      const qb = makeQb();
      applyDivisionScopeFilter(qb as any, 'pe.divisionId', 'ALL');
      applyDivisionScopeFilter(qb as any, 'pe.divisionId', undefined);
      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('emits 1 = 0 for an empty division set instead of IN ()', () => {
      const qb = makeQb();
      applyDivisionScopeFilter(qb as any, 'pe.divisionId', []);
      expect(qb.andWhere).toHaveBeenCalledTimes(1);
      expect(qb.andWhere).toHaveBeenCalledWith('1 = 0');
    });

    it('emits a parameterised IN clause for a concrete set', () => {
      const qb = makeQb();
      applyDivisionScopeFilter(qb as any, 'pe.divisionId', ['d1', 'd2']);
      expect(qb.andWhere).toHaveBeenCalledWith('pe.divisionId IN (:...allowedDivisionIds)', {
        allowedDivisionIds: ['d1', 'd2'],
      });
    });
  });

  describe('rawDivisionInClause', () => {
    it('returns null when unrestricted so callers skip filtering', () => {
      expect(rawDivisionInClause('ALL')).toBeNull();
      expect(rawDivisionInClause(undefined)).toBeNull();
    });

    it('returns FALSE for an empty set', () => {
      expect(rawDivisionInClause([])).toEqual({ sql: 'FALSE', params: [] });
    });

    it('returns a positional IN clause for a concrete set', () => {
      expect(rawDivisionInClause(['d1', 'd2'])).toEqual({
        sql: 'IN ($1, $2)',
        params: ['d1', 'd2'],
      });
    });
  });

  describe('deriveUserDivisionIds  (user_organization_scopes → divisions)', () => {
    it('is unrestricted when the user has no scopes at all (legacy behaviour)', () => {
      expect(deriveUserDivisionIds(null)).toEqual(ALL_DIVISIONS);
      expect(deriveUserDivisionIds([])).toEqual(ALL_DIVISIONS);
    });

    it('is unrestricted for a company-wide scope (division_id NULL)', () => {
      expect(
        deriveUserDivisionIds([{ divisionId: null, scopeLevel: 'DIVISION', status: 'ACTIVE' }]),
      ).toEqual(ALL_DIVISIONS);
    });

    it('is unrestricted when isFullScope is set', () => {
      expect(
        deriveUserDivisionIds([{ divisionId: 'd1', isFullScope: true, status: 'ACTIVE' }]),
      ).toEqual(ALL_DIVISIONS);
    });

    it('is unrestricted when scope level is COMPANY', () => {
      expect(
        deriveUserDivisionIds([{ divisionId: 'd1', scopeLevel: 'COMPANY', status: 'ACTIVE' }]),
      ).toEqual(ALL_DIVISIONS);
    });

    it('returns the union of division-scoped rows', () => {
      expect(
        deriveUserDivisionIds([
          { divisionId: 'd1', scopeLevel: 'DIVISION', status: 'ACTIVE' },
          { divisionId: 'd2', scopeLevel: 'DIVISION', status: 'ACTIVE' },
          { divisionId: 'd1', scopeLevel: 'DIVISION', status: 'ACTIVE' },
        ]),
      ).toEqual(['d1', 'd2']);
    });

    it('ignores non-ACTIVE rows, and is unrestricted when nothing is active', () => {
      expect(
        deriveUserDivisionIds([
          { divisionId: 'd1', scopeLevel: 'DIVISION', status: 'INACTIVE' },
        ]),
      ).toEqual(ALL_DIVISIONS);
    });

    it('stays restricted when only inactive company-wide rows exist', () => {
      // An INACTIVE full-scope row must not silently widen access.
      expect(
        deriveUserDivisionIds([
          { divisionId: 'd1', scopeLevel: 'DIVISION', status: 'ACTIVE' },
          { divisionId: null, scopeLevel: 'COMPANY', status: 'INACTIVE' },
        ]),
      ).toEqual(['d1']);
    });

    /**
     * PROMPT #26 — THE REGRESSION THAT CAUSED THE INCIDENT.
     *
     * `ErpUserService.getUserOrganizationScopes()` auto-heals any account with
     * no scope row by writing a COMPANY-wide one
     * (`division_id IS NULL`, `is_full_scope = true`, `scope_level = 'COMPANY'`).
     * The previous implementation short-circuited to `'ALL'` the moment it saw
     * ANY company-wide row, so an admin who added DIV-CCD to a user who already
     * had that auto-heal row produced an account the API treated as
     * UNRESTRICTED while the Division Access popup showed only DIV-CCD.
     *
     * This is the exact row shape found in production for the reported user
     * (DIV-CCD scope `14df543b-…` + company-wide scope `facbee53-…`).
     */
    it('lets an explicit division restriction win over the auto-healed company-wide default', () => {
      expect(
        deriveUserDivisionIds([
          { divisionId: 'd1', scopeLevel: 'DIVISION', isFullScope: false, status: 'ACTIVE' },
          { divisionId: null, scopeLevel: 'COMPANY', isFullScope: true, status: 'ACTIVE' },
        ]),
      ).toEqual(['d1']);
    });

    it('applies the same precedence regardless of row order', () => {
      expect(
        deriveUserDivisionIds([
          { divisionId: null, scopeLevel: 'COMPANY', isFullScope: true, status: 'ACTIVE' },
          { divisionId: 'd1', scopeLevel: 'DIVISION', isFullScope: false, status: 'ACTIVE' },
        ]),
      ).toEqual(['d1']);
    });

    it('keeps the company-wide default authoritative when it is the ONLY scope', () => {
      // 13 production accounts (every ADMIN / SUPER_ADMIN) are in exactly this
      // state. They MUST stay unrestricted — the fix narrows, it never widens.
      expect(
        deriveUserDivisionIds([{ divisionId: null, scopeLevel: 'COMPANY', isFullScope: true, status: 'ACTIVE' }]),
      ).toEqual(ALL_DIVISIONS);
    });

    it('treats a company-wide row that also carries a division_id as a default, not a restriction', () => {
      // `isFullScope: true` with a division_id is the shape the auto-heal and
      // some legacy rows use; it must never be read as a restriction.
      expect(
        deriveUserDivisionIds([{ divisionId: 'd1', scopeLevel: 'COMPANY', isFullScope: true, status: 'ACTIVE' }]),
      ).toEqual(ALL_DIVISIONS);
    });

    it('yields an empty (deny-all) set for the explicit NONE marker', () => {
      // `setDivisionAccess({ divisionIds: [] })` persists an ACTIVE
      // `scope_level = 'NONE'` row. It has to be ACTIVE: every resolver filters
      // on `status = 'ACTIVE'`, so an INACTIVE row would be invisible and the
      // backward-compat rule below would turn the revoke back into full access.
      expect(deriveUserDivisionIds([{ divisionId: null, scopeLevel: 'NONE', status: 'ACTIVE' }])).toEqual([]);
    });

    it('does not let a company-wide default undo the NONE marker', () => {
      expect(
        deriveUserDivisionIds([
          { divisionId: null, scopeLevel: 'NONE', status: 'ACTIVE' },
          { divisionId: null, scopeLevel: 'COMPANY', isFullScope: true, status: 'ACTIVE' },
        ]),
      ).toEqual([]);
    });

    it('lets an explicit division row override a leftover NONE marker', () => {
      expect(
        deriveUserDivisionIds([
          { divisionId: null, scopeLevel: 'NONE', status: 'ACTIVE' },
          { divisionId: 'd1', scopeLevel: 'DIVISION', status: 'ACTIVE' },
        ]),
      ).toEqual(['d1']);
    });

    it('stays backward compatible when the only rows are inactive', () => {
      // §12 — nothing ACTIVE configured ⇒ legacy unrestricted. This is why the
      // deny marker must be ACTIVE rather than a deactivated company-wide row.
      expect(deriveUserDivisionIds([{ divisionId: null, scopeLevel: 'COMPANY', status: 'INACTIVE' }])).toEqual(
        ALL_DIVISIONS,
      );
    });

    it('stays backward compatible for a section-only account', () => {
      expect(
        deriveUserDivisionIds([{ divisionId: null, scopeLevel: 'SECTION', status: 'ACTIVE' }]),
      ).toEqual(ALL_DIVISIONS);
    });
  });

  describe('divisionScopeFromRequest  (controller → service scope handoff)', () => {
    it('returns undefined when the guard resolved "unrestricted"', () => {
      expect(divisionScopeFromRequest({ allowedDivisionIds: 'ALL' })).toBeUndefined();
      expect(divisionScopeFromRequest({})).toBeUndefined();
      expect(divisionScopeFromRequest(null)).toBeUndefined();
      expect(divisionScopeFromRequest(undefined)).toBeUndefined();
    });

    it('returns the concrete list when the guard restricted the caller', () => {
      expect(divisionScopeFromRequest({ allowedDivisionIds: ['d1', 'd2'] })).toEqual(['d1', 'd2']);
    });

    it('distinguishes deny-all ([]) from unrestricted (undefined)', () => {
      // This distinction is load-bearing: `undefined` means "no filter",
      // `[]` means the query must match nothing.
      expect(divisionScopeFromRequest({ allowedDivisionIds: [] })).toEqual([]);
    });
  });

  describe('narrowWhereByDivision  (Repository.find reference data)', () => {
    it('returns the where object untouched when unrestricted', () => {
      const where = { companyId: 'c1', status: 'ACTIVE' };
      expect(narrowWhereByDivision(where, 'divisionId', 'ALL')).toBe(where);
      expect(narrowWhereByDivision(where, 'divisionId', undefined)).toBe(where);
    });

    it('never mutates the caller object', () => {
      const where: Record<string, unknown> = { companyId: 'c1' };
      narrowWhereByDivision(where, 'divisionId', ['d1']);
      expect(where).toEqual({ companyId: 'c1' });
    });

    it('produces a restrictive find operator for a concrete set', () => {
      const result: any = narrowWhereByDivision({ companyId: 'c1' }, 'divisionId', ['d1', 'd2']);
      expect(result.companyId).toBe('c1');
      expect(result.divisionId).toBeDefined();
      // TypeORM FindOperator — serialised back to a parameterised IN clause.
      expect(JSON.stringify(result.divisionId)).toContain('d1');
    });

    it('fails closed for an empty set', () => {
      const result: any = narrowWhereByDivision({ companyId: 'c1' }, 'divisionId', []);
      expect(result.divisionId).toBeDefined();
    });

    it('keeps unassigned rows only when explicitly asked (company master data)', () => {
      const strict: any = narrowWhereByDivision({ companyId: 'c1' }, 'divisionId', ['d1']);
      const shared: any = narrowWhereByDivision({ companyId: 'c1' }, 'divisionId', ['d1'], { includeUnassigned: true });
      expect(strict.divisionId).not.toEqual(shared.divisionId);
    });
  });
});
