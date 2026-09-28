import { SelectQueryBuilder, ObjectLiteral } from 'typeorm';

/**
 * Result of resolving a caller's division access.
 *
 * - `'ALL'`       → unrestricted (admin, company-wide scope, or a permission
 *                   with no role-level division restriction configured).
 * - `string[]`    → the exact division UUIDs the caller may see.
 *                   An EMPTY array means "no division at all" (deny).
 *
 * `undefined` / `null` means "not resolved / enforcement off" — callers must
 * treat that as no filtering (legacy behaviour).
 */
export type DivisionAccess = 'ALL' | string[];

export const ALL_DIVISIONS: DivisionAccess = 'ALL';

/** True when the access grants every division (or enforcement is not resolved). */
export function isUnrestricted(access: DivisionAccess | string[] | null | undefined): boolean {
  if (access === undefined || access === null) return true;
  if (access === 'ALL') return true;
  return false;
}

/** Narrow a resolved access value to a concrete list (returns [] for 'ALL'/unset). */
export function toDivisionList(access: DivisionAccess | string[] | null | undefined): string[] {
  if (!access || access === 'ALL') return [];
  return Array.isArray(access) ? access : [];
}

/**
 * INTERSECTION of two division-access values. Used to combine
 *   user organization scope  ∩  role permission division scope
 * (Prompt #16 §11). An empty intersection means NO access.
 */
export function intersectDivisionAccess(
  a: DivisionAccess | string[] | null | undefined,
  b: DivisionAccess | string[] | null | undefined,
): DivisionAccess {
  if (isUnrestricted(a)) return normalizeAccess(b);
  if (isUnrestricted(b)) return normalizeAccess(a);
  const left = new Set(toDivisionList(a));
  const right = new Set(toDivisionList(b));
  return [...left].filter((id) => right.has(id));
}

function normalizeAccess(access: DivisionAccess | string[] | null | undefined): DivisionAccess {
  if (access === undefined || access === null) return 'ALL';
  if (access === 'ALL') return 'ALL';
  return Array.isArray(access) ? [...access] : 'ALL';
}

/**
 * Apply a division filter to a TypeORM query.
 *
 * - unrestricted / unresolved → no-op (existing behaviour preserved)
 * - empty list                → matches nothing (`1 = 0`), never `IN ()`
 * - list                      → `column IN (:...allowedDivisionIds)`
 *
 * `column` must be a fully-qualified column expression such as `pe.divisionId`.
 */
export function applyDivisionScopeFilter<T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  column: string,
  access: DivisionAccess | string[] | null | undefined,
  paramName = 'allowedDivisionIds',
): void {
  if (isUnrestricted(access)) return;

  const ids = toDivisionList(access);
  if (ids.length === 0) {
    // Deny-all: caller has an empty effective division set.
    queryBuilder.andWhere('1 = 0');
    return;
  }

  queryBuilder.andWhere(`${column} IN (:...${paramName})`, { [paramName]: ids });
}

/** Same as {@link applyDivisionScopeFilter} but for raw SQL parameter arrays. */
export function rawDivisionInClause(
  access: DivisionAccess | string[] | null | undefined,
): { sql: string; params: string[] } | null {
  if (isUnrestricted(access)) return null;
  const ids = toDivisionList(access);
  if (ids.length === 0) return { sql: 'FALSE', params: [] };
  return { sql: `IN (${ids.map((_, i) => `$${i + 1}`).join(', ')})`, params: ids };
}

/**
 * Derive a user's allowed divisions from their `user_organization_scopes` rows.
 *
 * Pure function — no DI, no I/O — so it can be called from `OrgScopeGuard`
 * without introducing a new constructor dependency.
 *
 * Rules (Prompt #16 §4 / §12, backward compatible):
 *  - no active scopes              → `'ALL'` (legacy auto-heal grants full company)
 *  - any company-wide scope        → `'ALL'`
 *      • `division_id IS NULL`, or
 *      • `is_full_scope = true`, or
 *      • `scope_level = 'COMPANY'`
 *  - otherwise                     → union of `scope.division_id`
 *  - only non-ACTIVE rows          → `'ALL'` (nothing scoped ⇒ legacy behaviour)
 */
export function deriveUserDivisionIds(
  scopes: ReadonlyArray<{
    divisionId: string | null;
    isFullScope?: boolean | null;
    scopeLevel?: string | null;
    status?: string | null;
  }> | null | undefined,
): DivisionAccess {
  if (!scopes || scopes.length === 0) return ALL_DIVISIONS;

  const ids = new Set<string>();
  let activeCount = 0;

  for (const scope of scopes) {
    if (scope.status && scope.status !== 'ACTIVE') continue;
    activeCount += 1;

    const isCompanyWide = scope.isFullScope === true || scope.scopeLevel === 'COMPANY';
    // `division_id IS NULL` on an active scope means company-wide.
    if (isCompanyWide || !scope.divisionId) return ALL_DIVISIONS;

    ids.add(scope.divisionId);
  }

  if (activeCount === 0) return ALL_DIVISIONS;

  return [...ids];
}
