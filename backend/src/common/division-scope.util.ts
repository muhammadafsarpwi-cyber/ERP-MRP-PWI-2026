import { ForbiddenException } from '@nestjs/common';
import { SelectQueryBuilder, ObjectLiteral, In, IsNull, Or, Raw } from 'typeorm';

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
  options: { includeUnassigned?: boolean } = {},
): void {
  if (isUnrestricted(access)) return;

  const ids = toDivisionList(access);
  if (ids.length === 0) {
    // Deny-all: caller has an empty effective division set. `includeUnassigned`
    // is deliberately ignored here — a deny-all caller sees no unassigned
    // master rows either, otherwise "no access" would still return data.
    queryBuilder.andWhere('1 = 0');
    return;
  }

  // Master data (Items, Customers, Suppliers) may legitimately be company-wide,
  // i.e. assigned to no division. Such a row belongs to no division, so it
  // cannot disclose another division's records and must stay visible.
  // Transactional documents (orders, receipts, ledger) must NOT use this.
  if (options.includeUnassigned) {
    queryBuilder.andWhere(`(${column} IN (:...${paramName}) OR ${column} IS NULL)`, {
      [paramName]: ids,
    });
    return;
  }

  queryBuilder.andWhere(`${column} IN (:...${paramName})`, { [paramName]: ids });
}

/**
 * PROMPT #27 — refuse a SINGLE record whose division is outside the caller's
 * effective scope.
 *
 * This is the by-id counterpart of {@link applyDivisionScopeFilter}. Every
 * `:id` endpoint must call it after loading the record, so a leaked or guessed
 * UUID can never read, mutate, or even confirm the existence of a document in
 * another division.
 *
 * Deliberate semantics, matching the convention already proven by
 * `RawMaterialReceivingService.assertDivisionAllowed`:
 *
 *  - unrestricted caller  → allowed
 *  - empty effective set  → denied (TEST G: no division access ⇒ no data)
 *  - `divisionId` NULL    → DENIED. An unattributed document is not inside the
 *    caller's permitted divisions, so a restricted caller must not see it.
 *    Callers that legitimately need unassigned rows use
 *    {@link applyDivisionScopeFilter} with `includeUnassigned` on master data.
 *
 * @param access the value produced by `divisionScopeFromRequest(request)` —
 *   i.e. server-derived, never a client-supplied id.
 */
export function assertDivisionInScope(
  divisionId: string | null | undefined,
  access: DivisionAccess | string[] | null | undefined,
  message = 'You do not have access to this division.',
): void {
  if (isUnrestricted(access)) return;
  const ids = toDivisionList(access);
  if (ids.length === 0 || !divisionId || !ids.includes(divisionId)) {
    throw new ForbiddenException(message);
  }
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
 * PROMPT #26 — narrow a TypeORM `find()` `where` object by a division property.
 *
 * Needed for the reference/master-data lookups (divisions, sections,
 * departments, items) that controllers serve with `Repository.find()` instead
 * of a query builder. Same rules as {@link applyDivisionScopeFilter}, so those
 * endpoints cannot become a second, looser authorization path.
 *
 * `includeUnassigned: true` additionally keeps rows whose division column is
 * NULL. That is ONLY correct for company-wide master data (an Item that is not
 * assigned to any division belongs to no division, so it cannot leak another
 * division's data). Transactional data (receipts / returns / stock ledger) must
 * never pass it — an unassigned ledger row still affects stock balances.
 */
export function narrowWhereByDivision<T extends ObjectLiteral>(
  where: T,
  property: string,
  access: DivisionAccess | string[] | null | undefined,
  options: { includeUnassigned?: boolean } = {},
): T {
  if (isUnrestricted(access)) return where;

  const ids = toDivisionList(access);
  const next: Record<string, unknown> = { ...(where as Record<string, unknown>) };

  if (ids.length === 0) {
    next[property] = options.includeUnassigned ? IsNull() : Raw('1 = 0');
    return next as T;
  }

  next[property] = options.includeUnassigned ? Or(IsNull(), In(ids)) : In(ids);
  return next as T;
}

/**
 * Read the EFFECTIVE division access that the guard chain resolved for this
 * request and narrow it to the `string[]` a service should filter with.
 *
 * Prompt #26 — this is the single entry point controllers use, so a controller
 * can never accidentally start reading `request.allowedDivisionIds` directly
 * (where `'ALL'` vs `[]` vs `undefined` are easy to confuse) and can never
 * forget that the value is server-derived rather than client-supplied.
 *
 * Returns:
 *   `undefined` → unrestricted (SUPER_ADMIN / company-wide scope) ⇒ no filter
 *   `[]`        → deny-all (empty effective set) ⇒ query must match nothing
 *   `[ids…]`    → restrict to exactly these divisions
 */
export function divisionScopeFromRequest(request: unknown): string[] | undefined {
  if (!request || typeof request !== 'object') return undefined;
  const access = (request as { allowedDivisionIds?: DivisionAccess | string[] | null })
    .allowedDivisionIds;
  if (isUnrestricted(access)) return undefined;
  return toDivisionList(access);
}

/**
 * Derive a user's allowed divisions from their `user_organization_scopes` rows.
 *
 * Pure function — no DI, no I/O — so it can be called from `OrgScopeGuard`
 * without introducing a new constructor dependency.
 *
 * Rules (Prompt #16 §4 / §12, backward compatible):
 *  - no active scopes              → `'ALL'` (legacy auto-heal grants full company)
 *  - only non-ACTIVE rows          → `'ALL'` (nothing scoped ⇒ legacy behaviour)
 *  - at least one EXPLICIT division-level scope
 *                                   → union of those `scope.division_id`,
 *                                     and company-wide rows are IGNORED
 *  - no division-level scope, but an explicit `scope_level = 'NONE'` deny marker
 *                                   → `[]` (deny every division)
 *  - no division-level scope, but a company-wide scope
 *                                   → `'ALL'`
 *      • `division_id IS NULL`, or
 *      • `is_full_scope = true`, or
 *      • `scope_level = 'COMPANY'`
 *
 * PROMPT #26 SECURITY FIX — "explicit restriction wins".
 *
 * `ErpUserService.getUserOrganizationScopes()` AUTO-HEALS every account that has
 * no scope row yet by writing a COMPANY-wide row (`division_id IS NULL`,
 * `is_full_scope = true`). That row is a *default*, not an authorization
 * decision — `DivisionAccessModal.isDivisionRestriction()` already treats it as
 * such on the UI.
 *
 * The previous implementation short-circuited to `'ALL'` the moment it saw ANY
 * company-wide row. Combined with the auto-heal default that meant: once an
 * admin granted a user DIV-CCD (leaving the auto-heal row in place), the user
 * silently kept full access to EVERY division, while the Division Access popup
 * displayed only DIV-CCD. The popup and the API disagreed, and the API was the
 * permissive one.
 *
 * Precedence (explicit beats default) is the only safe reading: it never widens
 * anybody's access, it only removes the silent escalation. Accounts that only
 * ever had the auto-heal company-wide row — i.e. every SUPER_ADMIN / ADMIN —
 * are completely unaffected and remain unrestricted.
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
  let denied = false;

  for (const scope of scopes) {
    if (scope.status && scope.status !== 'ACTIVE') continue;
    activeCount += 1;

    // PROMPT #26 — explicit deny marker (`scope_level = 'NONE'`). Checked
    // BEFORE the company-wide test because it has a NULL `division_id`, which
    // would otherwise be read as "unrestricted". Like an explicit division row
    // it outranks a company-wide default.
    if (scope.scopeLevel === 'NONE') {
      denied = true;
      continue;
    }

    const isCompanyWideRow =
      scope.isFullScope === true || scope.scopeLevel === 'COMPANY' || !scope.divisionId;

    if (isCompanyWideRow) {
      // Remembered, but NOT decisive: an explicit division restriction below
      // outranks it (see the PROMPT #26 SECURITY FIX note above).
      continue;
    }

    ids.add(scope.divisionId!);
  }

  if (activeCount === 0) return ALL_DIVISIONS;

  // Explicit division restrictions win over the auto-provisioned default.
  if (ids.size > 0) return [...ids];

  // An explicit "no division at all" marker. A co-existing company-wide
  // default does NOT undo it — the same "explicit beats default" precedence.
  if (denied) return [];

  // Backward compatibility (§12): rows exist and are active, but none of them
  // is a division-level restriction and none is an explicit deny (e.g. a
  // SECTION / DEPARTMENT-only account, or the company-wide default). Legacy
  // behaviour is unrestricted.
  return ALL_DIVISIONS;
}
