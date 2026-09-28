import {
  ALL_DIVISIONS,
  DivisionAccess,
  applyDivisionScopeFilter,
  deriveUserDivisionIds,
  intersectDivisionAccess,
  isUnrestricted,
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
  });
});
