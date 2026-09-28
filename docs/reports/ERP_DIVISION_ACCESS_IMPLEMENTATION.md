# Prompt #16 — Division-Wise User & Permission Access

**System:** ERP/MRP — Pakistan Wire Industries (PWI)
**Date:** 2026-09-27
**Preceded by:** `docs/reports/ERP_AUTH_DIVISION_PERMISSION_AUDIT.md` (Prompt #15 audit),
`docs/reports/ERP_DIVISION_SCOPE_AUDIT.md` (pre-implementation scope audit)
**Follow-up:** §9 is Prompt #16A — the `divisionId must be a UUID` grant defect and its fix,
verified end-to-end in the running app (grant → database → revoke).

---

## 1. Access Model

### 1.1 Two independent scopes, combined by intersection

```
effectiveDivisions(user, permission)  =  userOrganizationScope  ∩  rolePermissionDivisionScope
```

| Side | Table | Meaning |
|---|---|---|
| **User side** | `user_organization_scopes` (pre-existing) | Which divisions this *user* may touch |
| **Role side** | `role_permission_division_scopes` (new) | Which divisions this *role × permission* grant applies to |

Rules enforced:

- Empty intersection ⇒ **no access** (deny).
- A user can **never** be granted a division outside their own organization scope — the
  user side is always a ceiling, never widened by the role side.
- Neither side is invented: division lists always come from the existing `divisions`
  master (`DIV-CCD`, `DIV-SPD`, `DIV-NB`, `DIV-PWI`, …). No mock or placeholder
  division records were created.

### 1.2 Backward-compatibility contract (§4 / §12)

| Configuration | Result |
|---|---|
| `role_permission_division_scopes` has **0 rows** for a (role, permission) | **Unrestricted** — *never* deny-all |
| Row with `division_id IS NULL` | Explicit all-divisions grant ⇒ unrestricted |
| `divisionIds: []` (explicitly sent) | Deny-all **for that grant only** |
| Field **absent** from an update payload | Existing restrictions left untouched |
| User has no active scopes / company-wide scope (`division_id IS NULL`, `is_full_scope`, `scope_level = 'COMPANY'`) | Unrestricted user side |
| `DIVISION_SCOPE_ENFORCEMENT=false` | Kill-switch: access still *resolved*, not *applied* |

Because of the first row, turning enforcement ON today changes no existing user's access —
proven by the scope audit (§4): **0 of 13 users** hold a division-level scope and the new
table starts with **0 rows**.

### 1.3 Four layers (defence in depth)

1. **`PermissionGuard`** — unchanged; still decides whether the permission is allowed at all.
   Division scoping can never turn a denial into an allowance.
2. **`OrgScopeGuard`** — extended (not replaced) to publish `request.allowedDivisionIds`
   from the user's organization scopes via the pure helper `deriveUserDivisionIds()`.
   No new DI dependency was added to it.
3. **`DivisionScopeGuard`** (new) — reads `@RequirePermission` via `Reflector`, refines the
   value to `user ∩ role`, caches it on `request.allowedDivisionIds`, and rejects an
   **explicit** `divisionId` in query/body/route with **403**.
4. **Service/repository filtering** — `applyDivisionScopeFilter()` turns the resolved set into
   `column IN (:...ids)`, `1 = 0` for an empty set (never `IN ()`), and a no-op when
   unrestricted.

`PermissionGuard` / `OrgScopeGuard` were **not** replaced; `PermissionGate.tsx` was not touched.

### 1.4 Resolution semantics

- **Per-role matrix, then union.** A role with no scope rows ⇒ that grant is unrestricted;
  if *any* granting role is unrestricted the union is `'ALL'`.
- **Failure to reach the table** (not migrated / transient DB error) ⇒ `'ALL'`. A guarded
  endpoint must never hard-fail because of a feature table.
- **Deny is explicit, not implicit.** Deny only arises from a genuine empty intersection
  or an explicitly empty selection.

---

## 2. Database

### 2.1 New migration (applied)

`supabase/migrations/20260927000000_erp_00068_role_permission_division_scopes.sql`

- New additive table **`role_permission_division_scopes`**
  (`id`, `role_id` → `roles`, `permission_id` → `permissions`, `division_id` → `divisions`
  nullable, `department_id` → `departments` nullable, `scope_level`, `status`,
  BaseEntity audit columns).
- Expression unique index **`uq_rpd_scope`** using
  `COALESCE(division_id, '00000000-0000-0000-0000-000000000000')` so a
  `division_id IS NULL` row is unique per (role, permission) instead of allowing duplicates.
- Supporting indexes: `idx_rpd_scope_division`, `idx_rpd_scope_permission`,
  `idx_rpd_scope_department`.
- Helper function `erp_core.division_in_scope(...)`.
- Idempotent (`IF NOT EXISTS` guards throughout) — safe to re-run.

Applied via the new **`scripts/apply-migration.js`**, which reads `backend/.env`
(`DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` / `DB_SSL*`)
and contains **no hardcoded credentials**.

### 2.2 Post-migration verification (live, read-only query)

| Object / counter | Value |
|---|---|
| `role_permission_division_scopes` exists | ✅ |
| Indexes | `…_pkey`, **`uq_rpd_scope`**, `idx_rpd_scope_division`, `idx_rpd_scope_department`, `idx_rpd_scope_permission` |
| `role_permission_division_scopes` rows | **0** |
| `divisions` | 9 total / **4 ACTIVE** (`DIV-CCD`, `DIV-SPD`, `DIV-NB`, `DIV-PWI`) |
| `erp_users` | 13 total / 13 active |
| `user_organization_scopes` | 12 |
| Users with a **division-level** scope | **0** |
| `roles` | 11 |
| `permissions` | 596 |
| `role_permissions` | 2110 |

### 2.3 What was NOT changed

No column was added to `permissions`, `role_permissions`, `user_roles`, `roles` or
`divisions`. No existing row was deleted or rewritten. No second auth store was created —
Supabase Auth remains the identity provider.

---

## 3. Backend

### 3.1 New files

| File | Purpose |
|---|---|
| `backend/src/common/division-scope.util.ts` | Pure helpers: `DivisionAccess`, `isUnrestricted`, `toDivisionList`, `intersectDivisionAccess`, `applyDivisionScopeFilter`, `rawDivisionInClause`, `deriveUserDivisionIds` |
| `backend/src/modules/auth/guards/division-scope.guard.ts` | `DivisionScopeGuard`, `@RequireDivisionScope()`, `divisionFilterFromRequest()` |
| `backend/src/modules/permission/services/division-access.service.ts` | Core resolution: enforcement flag, user/role access, `getEffectiveDivisions`, `resolveForRequest`, `listAccessibleDivisions`, `getRestrictedPermissionScopes`, `loadPermissionScopeMatrix`, `isDivisionAllowed` |
| `backend/src/modules/role/entities/role-permission-division-scope.entity.ts` | Entity for the new table |
| + 3 spec files | See §6 Testing |

### 3.2 Enforcement targets

**Mandatory first target — the production module (§18/§19):**

| Concern | `production-entry` | `production-order` | `production-unit` | `production-inventory-report` |
|---|---|---|---|---|
| Class guard | ✅ `SupabaseJwtGuard, OrgScopeGuard, DivisionScopeGuard` | ✅ | ✅ | ✅ |
| List filtering | ✅ `findAll`, `getReport`, `findMachines`, `getMachineEntryStatus` | ✅ `dashboard`, `findAll` | ✅ list + stats | ✅ item rows |
| Read-by-ID | ✅ `findOne` | ✅ `findOne` + `assertDivisionAccessForOrder` | ✅ 4 read endpoints | ✅ item ledger |
| Write protection | ✅ `create`/`update`/`remove` (incl. moving a record *into* another division) | ✅ all 10 mutations via `assertOrderAccess()` | ✅ update, bulk, print, void, generate | n/a (read-only) |
| Explicit out-of-scope `divisionId` ⇒ 403 | ✅ | ✅ | ✅ | ✅ |

**Also enforced (extending the same mechanism):**

- `dashboard` — `GET /dashboard/divisions` (handler renamed internally to `listDivisions`;
  the HTTP route is unchanged), `sections`, `departments`, `summary`, `production-summary`,
  `production-trend`, `machine-performance`, `item-overview`, `alerts`.
  `FilterShifts`, `InventorySummary`, `PurchaseOrderSummary`, `SalesOrderSummary`,
  `ItemRoute`, `RecentActivity` are deliberately unfiltered — see §7.
- `machine-target` — all 9 endpoints. `MachineTarget` has no `division_id`; scope is applied
  through `machine.divisionId` (the same relation the pre-existing explicit filter used).
  CSV import returns a per-row 403 including the target code.
- `production-unit` — `ProductionUnit` has no `division_id`; scope is applied through
  `productionEntry.divisionId`. Rows with a null division link are **excluded from lists** but
  **allowed by read-by-ID** (same precedent as `ProductionEntryService.assertDivisionAccess`).
- `organization` — Division master itself: list, detail, create, update, activate,
  deactivate, remove are all scope-checked and the controller now carries
  `OrgScopeGuard` + `DivisionScopeGuard`.
- `role` — `POST /admin/roles/:id/permissions` accepts an **optional** `divisionScopes`
  array (§27). Omitted ⇒ unchanged; `[]` ⇒ clear; `[ids]` ⇒ restrict. Unknown division ids
  produce a 400 rather than a 500.
- `permission` — `PUT /admin/permissions-matrix` reads/writes `divisionIds` per toggle and
  returns the `divisions` master.
- `auth` — `/auth/me`, `login` and `refresh` now return
  `divisions: { unrestricted, items[], permissionScopes }`.
- `user` — reuses the **existing** `POST /admin/users/:id/org-scopes` and
  `DELETE /admin/users/:id/org-scopes/:scopeId` endpoints unchanged.

### 3.3 Feature flag

`DIVISION_SCOPE_ENFORCEMENT` (read through `ConfigService`), **default ON**.
Justified by §4 of the audit: enforcement is currently a no-op for every existing user.
It is a kill-switch, not a bypass — when off, access is still resolved and published, it
simply is not applied.

### 3.4 Endpoints left unfiltered on purpose

`divisions`/`shifts`/`suppliers`/`customers`/PO/SO/route/activity data carry no
`division_id`; inventing one was out of scope. `ProductionUnit` and `MachineTarget` are
scoped through their owning entity rather than by adding a column.

---

## 4. Frontend

### 4.1 New shared components

- **`frontend/src/components/shared/DivisionSelect.tsx`** — division picker sourced from the
  existing `GET /divisions` (backend already scope-filters it). Accepts a `divisions` prop
  so a page rendering many pickers performs **zero** extra requests; shows
  `CODE · Name`; a 403 renders as "no access" rather than "no divisions".
- **`usePermission` extended** with `allowedDivisions`, `allowedDivisionIds`,
  `divisionsUnrestricted`, `permissionDivisionScopes`, `canInDivision()`,
  `roleBlocksInDivision()`. **`can` / `canAny` / `canAll` / `canModule` are untouched**, so
  every existing component keeps its exact previous behaviour.

### 4.2 Admin UI (§24 / §25 / §26 / §27)

- **`PermissionMatrix.tsx`** — per-resource **Division Access** expandable row
  (`data-testid="division-access-toggle-…"` / `"division-access-row-…"`): a picker per
  role × permission, empty = unrestricted, edits tracked separately from permission
  toggles, counted in the save dock ("N division scope(s)"), and sent as `divisionIds` in
  `PUT /admin/permissions-matrix`. A field is omitted when untouched, which is what tells
  the backend "leave the scope alone".
- **`UserManagement.tsx`** — **Divisions** action per user
  (`data-testid="user-division-access"`) opening a Division Access modal that lists current
  organization scopes (company-wide rows shown distinctly) and grants new ones through the
  **existing** `POST /admin/users/:id/org-scopes`. Explicitly explains that effective
  access is the *intersection* of the user scope and the role restriction (§26).
- **`RoleManagement.tsx`** — optional **"Limit to divisions"** checkbox in the Assign
  Permissions modal (`data-testid="role-division-scope"`), off by default; only when
  checked does the payload carry `divisionScopes`.
- **`services/api.ts`** — 403 responses now also raise a deduplicated antd toast
  (`key: 'api-403'`) with generic wording (never echoing backend text) in addition to the
  existing `console.warn`. The user is **not** logged out.

No frontend-only enforcement was added: the UI mirrors state that the server enforces.

---

## 5. Scope Audit

Source: `docs/reports/ERP_DIVISION_SCOPE_AUDIT.md` (generated 2026-09-27, read-only SELECTs).

**Division master** — 9 rows, 4 ACTIVE:

| Code | Name | Status |
|---|---|---|
| `DIV-CCD` | Control Cable Division | ACTIVE |
| `DIV-SPD` | Spoke Division | ACTIVE |
| `DIV-NB` | NB Division | ACTIVE |
| `DIV-PWI` | Main Division E-51 | ACTIVE |
| `DIV-001` … `DIV-005` | Manufacturing / Sales / Supply Chain / Finance / Quality | INACTIVE |

**Users (13 total) bucketed by blast radius of turning enforcement ON:**

| Bucket | Definition | Count | Impact |
|---|---|---|---|
| **A** | No organization scope (auto-healed to full company on first guarded request) | **1** (`system.replenishment`) | None — resolves to unrestricted |
| **B** | Company-level full scope | **12** | **None — enforcement is a NO-OP** |
| **C** | Division-level scope | **0** | — |
| **D** | Department-level scope | **0** | — |
| **E** | Section-level scope | **0** | — |
| **F** | Inactive users holding scopes | **0** | — |

**Conclusion:** 0 users are at risk of losing access when enforcement is enabled; the new
table begins with 0 rows. Enabling it today changes **no** existing user's effective
permissions.

**Post-implementation re-check (§2.2):** still 0 division-scoped users, 0 scope rows —
so the audit's conclusion still holds after the migration.

---

## 6. Testing

Commands were run from the stated working directories. No test was skipped or weakened.

### 6.1 TypeScript

| Check | Command | Result |
|---|---|---|
| Backend type-check | `cd backend && npx tsc --noEmit -p tsconfig.json` (`NODE_OPTIONS=--max-old-space-size=6144`) | **PASS — exit 0** (verified after every backend edit batch) |
| Frontend type-check | `cd frontend && npx tsc --noEmit -p tsconfig.json` (`NODE_OPTIONS=--max-old-space-size=4096`) | **PASS — exit 0** |

### 6.2 ESLint (no `--fix`)

| Scope | Result |
|---|---|
| Backend — 38 changed/new files (35 from Prompt #16, `user.dto.ts` + `user.dto.spec.ts` from Prompt #16A, plus pre-existing `sales-analytics.dto.ts`) | **PASS — 0 errors**, 26 warnings (all pre-existing `no-unused-vars`) |
| Frontend — 10 changed/new files | **PASS — 0 errors**, 9 warnings (all pre-existing `no-unused-vars`) |

Four of the 26 backend warnings sit in `backend/src/modules/user/dto/user.dto.ts`
(`ValidateNested`, `Type`, `ErpUserStatus`, `OrgScopeStatus` — unused imports on the untouched
line 1/2/4). They pre-date Prompt #16A and were only surfaced because the file became
modified; the import line was deliberately left alone to keep the diff minimal.

### 6.3 Build

| Check | Result |
|---|---|
| `cd frontend && npm run build` | **PASS — exit 0** (bundle emitted; pre-existing warnings only, incl. a `postcss-calc` parse warning in unrelated CSS) |

### 6.4 Backend tests

**Targeted run — modules touched by Prompt #16**

```
npx jest --runInBand --forceExit "src/modules/permission" "src/modules/role" \
  "src/modules/auth" "src/modules/user" "src/modules/organization"
→ Test Suites: 6 passed, 6 total   Tests: 47 passed, 47 total   PASS (exit 0)

npx jest --runInBand --forceExit "src/modules/production" "src/modules/dashboard" \
  "src/modules/machine-target"
→ Test Suites: 8 passed, 1 failed, 9 total   Tests: 191 passed, 3 failed, 194 total   FAIL (exit 1)
   (the 3 failures are the pre-existing `production-entry.service.spec.ts` BOM-consumption
    assertions — see baseline comparison below)
```

**New Prompt #16 suites**

```
npx jest --runInBand --forceExit \
  "src/common/division-scope.util.spec.ts" \
  "src/modules/permission/services/division-access.service.spec.ts" \
  "src/modules/auth/guards/division-scope.guard.spec.ts"
→ Test Suites: 3 passed, 3 total   Tests: 49 passed, 49 total   PASS (exit 0)
```

**Prompt #16A (UUID validation fix) — re-run of every touched area**

```
npx jest --runInBand --forceExit --testPathPattern \
  "(permission|role|auth|user|organization|division-scope\.util)"
→ Test Suites: 9 passed, 9 total   Tests: 96 passed, 96 total   PASS (exit 0)

npx jest --runInBand --forceExit --testPathPattern "user.dto.spec"
→ Test Suites: 1 passed, 1 total   Tests: 11 passed, 11 total   PASS (exit 0)
```

**Full backend suite (in-band)**

```
npx jest --runInBand --forceExit
→ Test Suites: 4 failed, 57 passed, 61 total
  Tests:       6 failed, 1108 passed, 1114 total
  Time: 67.8 s   FAIL (exit 1)
```

Failing suites: `production-entry.service.spec.ts`, `dispatch-package.service.spec.ts`,
`bom.service.spec.ts`, `barcode.service.spec.ts`.

**Baseline comparison (run at `HEAD` with all Prompt #16 changes stashed):**

```
git stash push -m prompt16-verify
npx jest --runInBand --forceExit "src/modules/dispatch" "src/modules/bom" "src/modules/barcode"
→ Test Suites: 3 failed, 3 total   Tests: 3 failed, 53 passed, 56 total   FAIL (exit 1)

git checkout -- …/production-entry.service.ts   (isolated file swap)
npx jest --runInBand "…/production-entry.service.spec.ts"
→ Test Suites: 1 failed, 1 total   Tests: 3 failed, 79 passed, 82 total   FAIL (exit 1)
```

**⇒ Baseline is 4 failed suites / 6 failed tests; with Prompt #16 it is also 4 failed suites
/ 6 failed tests. Identical set, identical counts → ZERO regressions.**

> This full-suite number predates Prompt #16A's one-line DTO change. It was not re-run after
> it, per "do not rerun the entire repository suite unnecessarily" — instead every suite that
> touches the changed file was re-run (9 suites / 96 tests + the new DTO suite, PASS).

**OOM note:** running the backend suite with default parallel workers on this 16 GB machine
fails with `FATAL ERROR: Zone Allocation failed - process out of memory` / `jest worker
process … SIGTERM` (exit 134). All numbers above were produced with `--runInBand`, which
completes reliably. This is an **environment limitation**, not a test failure.

### 6.5 Frontend tests

| Run | Result |
|---|---|
| Existing admin suites (`PermissionMatrix`, `RoleManagement`, `UserManagement`, `permission-gating`) | **PASS — 4 suites, 34 tests** |
| New `usePermission.divisions.test.ts` + `PermissionMatrix.divisionAccess.test.tsx` | **PASS — 2 suites, 11 tests** |
| New `UserManagement.divisionAccess.test.tsx` (§16A: CCD/SPD grant payload + revoke) | **PASS — 1 suite, 5 tests** |
| Prompt #16A combined run (`--maxWorkers=1`) | **PASS — 7 suites, 50 tests, exit 0** |
| Full frontend suite (`--maxWorkers=1`) | see §6.5.1 |

#### 6.5.1 Full frontend suite

**Not re-run for Prompt #16A.** The instruction for this round was *"Do not rerun the entire
repository suite unnecessarily if focused tests are sufficient"*, and every suite that
touches the changed files was run (7 suites / 50 tests, PASS, exit 0).

For the record: the last attempt to run the whole frontend suite in background was started
with a 3600 s budget and **timed out with no output** (`Command exceeded timeout of 3600000
ms`), so no full-suite number is claimed here rather than reporting a stale or fabricated
one. On this 16 GB machine the frontend suite also OOMs at the default worker count, which
is why it needs `--maxWorkers=1` and a wall-clock budget well above one hour.

**OOM note:** with the default worker count the frontend suite aborts with
`Jest worker encountered 4 child process exceptions` and
`FATAL ERROR: Committing semi space failed … JavaScript heap out of memory` (exit 134).
It must be run with `--maxWorkers=1`; this is an **environment limitation**.

### 6.6 Runtime smoke check (live dev server, port 3001)

Unauthenticated requests against the running backend (global prefix `api/v1`), issued after
all edits were picked up by `start:dev`:

| Route | Result |
|---|---|
| `GET /api/v1/auth/me` | **401** `No authentication token provided` |
| `GET /api/v1/divisions` | **401** |
| `GET /api/v1/admin/users` | **401** |
| `GET /api/v1/admin/roles` | **401** |
| `GET /api/v1/admin/permissions-matrix` | **401** |
| `GET /api/v1/production/entries?page=1&limit=1` | **401** |
| `GET /api/v1/production/entries/report` | **401** |
| `GET /api/v1/production/entries/machines` | **401** |
| `GET /api/v1/production/orders?page=1&limit=1` | **401** |
| `GET /api/v1/production/orders/<uuid>` | **401** |
| `GET /api/v1/production/units?page=1&limit=1` | **401** |
| `GET /api/v1/production/units/stats` | **401** |
| `GET /api/v1/production/inventory-report` | **401** |
| `GET /api/v1/production/inventory-report/movement-types` | **401** |
| `GET /api/v1/production/inventory-report/<uuid>/ledger` | **401** |
| `GET /api/v1/production/machine-targets` | **401** |
| `GET /api/v1/dashboard/divisions` | **401** |
| `GET /api/v1/dashboard/summary` | **401** |
| `GET /api/v1/dashboard/sections` | **401** |
| `GET /api/v1/dashboard/alerts` | **401** |

**PASS.** Every guarded route reached `SupabaseJwtGuard` and returned 401 — proving the new
`DivisionScopeGuard` + `DivisionAccessService` dependencies resolve in the real Nest DI
container (a missing provider would surface as a 500/bootstrap failure). No authenticated
end-to-end request was made; see §8.11.

### 6.7 Behavioural test coverage added

**Backend (49 assertions across 3 suites, + 11 in the Prompt #16A suite)**

- `division-scope.util.spec.ts` — backward compatibility of `isUnrestricted`; intersection
  (shared / disjoint / one-sided); `1 = 0` instead of `IN ()`; `FALSE` for raw SQL;
  `deriveUserDivisionIds` for no-scope / company-wide / `is_full_scope` / `scope_level` /
  inactive-only / mixed rows.
- `division-access.service.spec.ts` — enforcement flag default ON and its negative values;
  zero scope rows ⇒ unrestricted; configured rows ⇒ exact set; cross-role union;
  `division_id IS NULL` ⇒ global grant; table unreachable ⇒ unrestricted; `user ∩ role`;
  empty intersection ⇒ `[]`; never widens beyond user scope; `isDivisionAllowed`;
  `listAccessibleDivisions` filters real master rows and invents nothing; request caching.
- `division-scope.guard.spec.ts` — **explicit out-of-scope `divisionId` ⇒ 403** (query, body,
  route param and `division_id` key); **empty intersection ⇒ 403**; no division specified ⇒
  allow + publish `allowedDivisionIds`; unrestricted ⇒ no-op; **kill-switch off ⇒ never
  rejects**; `@RequirePermission` code forwarded to the resolver.
- `user.dto.spec.ts` (Prompt #16A) — `UUID_LOOSE` accepts every id the database stores and
  still rejects `DIV-CCD` / truncated / non-hex ids; **`AssignOrgScopeDto` accepts the seeded
  DIV-CCD and DIV-SPD ids** and still answers `divisionId must be a UUID` for `DIV-CCD`,
  `''`, `not-a-uuid` and a truncated uuid; omitted `divisionId` still means company-wide;
  **`companyId` stays on strict `@IsUUID()`**; `scopeLevel` still constrained to the enum;
  `SetDefaultContextDto` gets the same treatment for a default division.

**Frontend (11 assertions across 2 suites, + 5 in the Prompt #16A suite)**

- `usePermission.divisions.test.ts` — missing `divisions` payload ⇒ unrestricted (legacy
  user); **`can`/`canAny`/`canAll`/`canModule` unchanged**; user-scope filtering; role scope
  applied *on top of* user scope; **never grants a division outside user scope**; never
  turns a missing permission into a grant; no-division argument ≡ `can()`.
- `PermissionMatrix.divisionAccess.test.tsx` — toggle present on every resource row;
  panel shows one picker per role × permission and explains the intersection rule;
  collapse/expand; **an unrestricted cell edited to a single division produces
  `divisionIds: [D_SPD]` in `PUT /admin/permissions-matrix` with `granted` preserved**.

**Existing regression suites** — `permission.service.spec.ts` and `role.service.spec.ts` were
extended (not weakened): `DivisionAccessService` is now provided as a mock dependency, and
three new cases assert that omitting `divisionScopes` writes nothing, `[]` clears rows, and a
concrete list de-duplicates and stores exactly those divisions.

---

## 7. Files Changed

### Backend — modified (29)

Prompt #16 (28) + Prompt #16A (1, `user.dto.ts`):

```
backend/src/modules/auth/auth.module.ts
backend/src/modules/auth/guards/index.ts
backend/src/modules/auth/guards/org-scope.guard.ts
backend/src/modules/auth/services/auth.service.ts
backend/src/modules/dashboard/controllers/dashboard.controller.ts
backend/src/modules/dashboard/services/dashboard.service.ts
backend/src/modules/machine-target/controllers/machine-target.controller.ts
backend/src/modules/machine-target/services/machine-target.service.ts
backend/src/modules/organization/controllers/division.controller.ts
backend/src/modules/organization/services/division.service.ts
backend/src/modules/permission/dto/permission-matrix.dto.ts
backend/src/modules/permission/permission.module.ts
backend/src/modules/permission/services/permission-matrix.service.ts
backend/src/modules/permission/services/permission.service.spec.ts
backend/src/modules/permission/services/permission.service.ts
backend/src/modules/production/controllers/production-entry.controller.ts
backend/src/modules/production/controllers/production-inventory-report.controller.ts
backend/src/modules/production/controllers/production-order.controller.ts
backend/src/modules/production/controllers/production-unit.controller.ts
backend/src/modules/production/services/production-entry.service.ts
backend/src/modules/production/services/production-inventory-report.service.ts
backend/src/modules/production/services/production-order.service.ts
backend/src/modules/production/services/production-unit.service.ts
backend/src/modules/role/dto/role.dto.ts
backend/src/modules/role/entities/index.ts
backend/src/modules/role/role.module.ts
backend/src/modules/role/services/role.service.spec.ts
backend/src/modules/role/services/role.service.ts
backend/src/modules/user/dto/user.dto.ts
```

### Backend — added (8)

Prompt #16 (7) + Prompt #16A (1, `user.dto.spec.ts`):

```
backend/src/common/division-scope.util.ts
backend/src/common/division-scope.util.spec.ts
backend/src/modules/auth/guards/division-scope.guard.ts
backend/src/modules/auth/guards/division-scope.guard.spec.ts
backend/src/modules/permission/services/division-access.service.ts
backend/src/modules/permission/services/division-access.service.spec.ts
backend/src/modules/role/entities/role-permission-division-scope.entity.ts
backend/src/modules/user/dto/user.dto.spec.ts
```

### Frontend — modified (6)

```
frontend/src/components/shared/index.ts
frontend/src/hooks/usePermission.ts
frontend/src/pages/admin/PermissionMatrix.tsx
frontend/src/pages/admin/RoleManagement.tsx
frontend/src/pages/admin/UserManagement.tsx
frontend/src/services/api.ts
```

### Frontend — added (4)

```
frontend/src/components/shared/DivisionSelect.tsx
frontend/src/hooks/usePermission.divisions.test.ts
frontend/src/pages/admin/PermissionMatrix.divisionAccess.test.tsx
frontend/src/pages/admin/UserManagement.divisionAccess.test.tsx
```

### Migration / tooling / docs (5)

```
supabase/migrations/20260927000000_erp_00068_role_permission_division_scopes.sql
scripts/apply-migration.js
docs/reports/ERP_AUTH_DIVISION_PERMISSION_AUDIT.md        (Prompt #15, previously uncommitted)
docs/reports/ERP_DIVISION_SCOPE_AUDIT.md
docs/reports/ERP_DIVISION_ACCESS_IMPLEMENTATION.md        (this report)
```

### Pre-existing changes NOT touched by Prompt #16

```
backend/src/modules/sales/dto/sales-analytics.dto.ts
scripts/.erp-dev-pids.json
```

---

## 8. Remaining Limitations

1. **Full parallel test runs OOM on this machine.** Backend `jest` with default workers and
   frontend `react-scripts test` with default workers both exhaust the 16 GB heap
   (exit 134). Every reported number used `--runInBand` / `--maxWorkers=1`. This is an
   environment limitation; on a larger machine the parallel runs should be re-verified.
2. **6 pre-existing backend test failures remain** (`production-entry` BOM quantities ×3,
   `dispatch-package`, `bom`, `barcode`). They fail identically at `HEAD` and are unrelated
   to division scoping. They were **not** fixed here — out of scope for Prompt #16.
3. **Unit / section granularity is modelled but not exposed.** `role_permission_division_scopes`
   carries `department_id` and `scope_level` so `SECTION`/`DEPARTMENT` can be added later,
   but no UI or resolution path uses them yet. Only `DIVISION` is wired end-to-end.
4. **No Location master.** Deliberately deferred until the Visitor Management module, per the
   Prompt #15 recommendation.
5. **`ProductionEntry`, `ProductionOrder`, `Machine` rows with a NULL `division_id` are
   excluded from list results when restricted, but permitted by read-by-ID** (they inherit
   company access). This mirrors the pre-existing `assertDivisionAccess` precedent; if a
   future requirement wants NULL-division rows hidden entirely, that is a one-line change in
   `applyDivisionScopeFilter` usage, not an architecture change.
6. **Dashboard summaries that have no division column are company-wide by design**
   (`shifts`, `purchase-order`, `sales-order`, `inventory summary`, `recent activity`,
   `item route`). Exposing them per-division requires adding `division_id` to those domain
   tables, which Prompt #16 deliberately did not do.
7. **Role Management's division control is role-granular, not permission-granular.**
   The "Limit to divisions" toggle applies the same list to every permission selected in
   that save. Fine-grained per-permission control lives in the Permission Matrix (§24), which
   is the intended place for it.
8. **`assignPermissions` only *adds* grants** (pre-existing behaviour — it never removes a
   grant not present in `permissionIds`). Prompt #16 did not change that; a stale grant can
   therefore retain a division restriction until explicitly removed. Removing a grant now
   also cleans up its orphaned division rows.
9. **Known pre-existing issues flagged, not fixed:** the `ILIKE '%admin%'` search bypass;
   `canModule()`'s case-sensitivity (`action.toUpperCase()` compared against a lowercase code);
   dead `PermissionGate.tsx`; 403s were previously only `console.warn`ed (now additionally
   toasted). Fixing them is outside Prompt #16's "do not modify unrelated functionality"
   constraint.
10. **Enforcement default is ON.** Although justified by a 0-user blast radius, this is a
    behaviour change in principle. If a rollout needs a grace period, set
    `DIVISION_SCOPE_ENFORCEMENT=false` — but note that this disables *all* division filtering,
    including the production-module protections.
11. **No automated end-to-end HTTP test** exercises the guard through a real request with a
    real JWT; coverage is at unit level (guard + service + helper). A supertest integration
    suite would need database fixtures that Prompt #16 did not create.
12. **Only `AssignOrgScopeDto` / `SetDefaultContextDto` were moved to `UUID_LOOSE` (§9).**
    The same strict `@IsUUID()` still guards `AssignOrgScopeDto.sectionId` /
    `.departmentId` and the section/department fields of `SetDefaultContextDto`. Neither is
    sent by the Division Access modal (it posts only `companyId`, `divisionId`, `scopeLevel`,
    `isFullScope`), so nothing is broken today — but seeding a section or department with a
    non-RFC id (7 sections and 13 departments already are, §9.3) would fail the same way.
    `companyId` was deliberately left on `@IsUUID()`: every row in `companies` is a genuine
    RFC-4122 uuid (0 non-conforming).
13. **Two seeded divisions carry non-RFC-4122 `divisions.id` values.** That is data debt, not
    code debt. Repairing it (rewriting `d1000000-…0001/0002` to genuine v4 ids) would mean a
    migration over ~1,770 referencing rows across 14+ tables with `ON UPDATE NO ACTION`
    foreign keys, so it was explicitly rejected as riskier than aligning the validator with
    the database and with the project's own existing convention.
14. **The full frontend suite was not re-run for Prompt #16A** (§6.5.1); the focused run of
    the 7 affected suites (50 tests, exit 0) is the evidence offered instead.

---

## 9. Prompt #16A — "Grant Division Access" fails with `divisionId must be a UUID`

### 9.1 Root cause (the frontend was already correct)

The reported diagnosis ("the UI posts `DIV-CCD` instead of the UUID") does **not** hold.
Driving the real running app and capturing the actual request bodies disproves it:

```
POST http://localhost:3001/api/v1/admin/users/98d2e7c7-75af-44ab-a60a-190ac260a4ec/org-scopes
{"companyId":"7725aa04-a270-4314-9e82-90949cbe7791",
 "divisionId":"d1000000-0000-0000-0000-000000000002",   ← correct divisions.id, not a code
 "scopeLevel":"DIVISION","isFullScope":false}
→ 400 {"message":["divisionId must be a UUID"],"error":"Bad Request","statusCode":400}
```

The id **is** a UUID in shape and **is** the row's primary key, and the API still rejects it.
The real fault line is the *validator*, not the payload:

| Division | `divisions.id` | version nibble | variant nibble | `validator.isUUID()` (13.15.35) |
|---|---|---|---|---|
| DIV-CCD | `d1000000-0000-0000-0000-000000000002` | `0` | `0` | **false** |
| DIV-SPD | `d1000000-0000-0000-0000-000000000001` | `0` | `0` | **false** |
| DIV-PWI | `83ecd746-1cc9-4849-bec4-d00bcc3ceeec` | `4` | `9` | true |
| DIV-NB | `0653339b-94d0-4cc5-b880-e07908b2015f` | `4` | `b` | true |

PostgreSQL's `uuid` type stores all four happily (0 orphan references — §9.4), but
class-validator's `@IsUUID()` delegates to validator.js, which *additionally* enforces the
RFC-4122 version `[1-5]` and variant `[89ab]` nibbles — **even for `isUUID(x, 'all')`**.
The two seeded divisions fail that check, so `AssignOrgScopeDto` rejected a correct id.

Control that isolates the cause: the identical request with a genuine v4 division returned
**201**, persisted, and revoked with **200**, while the same request with the code `DIV-CCD`
returned **400 `divisionId must be a UUID`** — i.e. one message, two very different inputs.

### 9.2 Fix (approved deviation from instruction #5)

`@IsUUID()` was **not** weakened to `@IsString()`, and no DTO field was renamed. Each
`divisionId` in the user module now uses the project's *own existing* loose-uuid convention,
which is already defined and used for `divisionId` elsewhere in this codebase
(`machine-target.dto.ts:73`, `production-routing.dto.ts:104`, `machine-component*.dto.ts`):

```ts
export const UUID_LOOSE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// AssignOrgScopeDto.divisionId      & SetDefaultContextDto.divisionId
- @IsUUID()
+ @Matches(UUID_LOOSE, { message: 'divisionId must be a UUID' })   // message unchanged
  @IsOptional()
  divisionId?: string;
```

What this preserves: an 8-4-4-4-12 hexadecimal uuid is still mandatory, `DIV-CCD` /
`DIV-SPD` / `COMP-001` are still rejected, the error string is byte-identical, the database
columns stay `uuid`, and `companyId` stays on strict `@IsUUID()`.

### 9.3 Files changed in Prompt #16A

| File | Change |
|---|---|
| `backend/src/modules/user/dto/user.dto.ts` | `UUID_LOOSE` constant + `@Matches` on both `divisionId` fields |
| `backend/src/modules/user/dto/user.dto.spec.ts` | **new** — 11 assertions pinning both halves of the contract |
| `frontend/src/pages/admin/UserManagement.tsx` | `openDivisionModal` now re-reads scopes from `GET /admin/users/:id` (§9.5) |
| `frontend/src/pages/admin/UserManagement.divisionAccess.test.tsx` | fixtures use the real production UUIDs + `UUID_RE` guards |

No frontend id-mapping code was changed: `DivisionSelect` already submitted `row.id`, and
`handleAddDivisionScope` already posted `{companyId, divisionId, scopeLevel, isFullScope}`.

### 9.4 End-to-end result — grant, list, DB, revoke (real browser, real API)

| Step | Evidence | Result |
|---|---|---|
| **CCD grant** | `POST …/org-scopes` body `divisionId: "d1000000-…000000000002"` | **HTTP 201** |
| **SPD grant** | `POST …/org-scopes` body `divisionId: "d1000000-…000000000001"` | **HTTP 201** |
| **Toast** | `Division access granted` | PASS |
| **List after save** | `DIV-CCD Control Cable Division`, `DIV-SPD Spoke Division`, plus the pre-existing `Full company access · …` tag | PASS — friendly label shown, **no UUID exposed in the UI** |
| **DB `user_organization_scopes`** | `user_id=98d2e7c7…`, `company_id=7725aa04-…`, `division_id=d1000000-…000000000002` / `…000000000001`, `scope_level=DIVISION`, `is_full_scope=false`, `status=ACTIVE` | **PASS — both are the correct UUIDs** |
| **FK integrity** | `LEFT JOIN divisions d ON d.id = s.division_id` → `id_matches_divisions_pk = true`, `orphan_division_refs = 0` | PASS |
| **Totals** | `org_scopes = 14` (= 12 baseline + 2 granted) | PASS |
| **Revoke ×2** | `DELETE …/org-scopes/898b284f-…` → **200**; `DELETE …/org-scopes/fee95889-…` → **200**; toast `Division access removed` | PASS |
| **DB after revoke** | `org_scopes = 12`, `division_level_rows = 0`, `division_level_users = 0`, company-wide scope intact | **PASS — back to the §5 baseline** |

Captured artefacts: `flow-log-grant.json` (2 POSTs), `flow-log-revoke.json` (2 DELETEs across
the two revoke passes).

**Final API-level confirmation (after a backend dev-server restart), same target user:**

```
DIV-CCD (seeded, non-RFC)                 HTTP 201  revoke=200
DIV-SPD (seeded, non-RFC)                 HTTP 201  revoke=200
DIV-PWI (real v4, control)                HTTP 201  revoke=200
DIV-CCD as a code (must still fail)       HTTP 400  {"message":["divisionId must be a UUID"]}
DIV-SPD as a code (must still fail)       HTTP 400  {"message":["divisionId must be a UUID"]}
scopes before = 1   scopes after = 1   residue = NONE
→ final DB: org_scopes = 12, division_level_rows = 0
```

Housekeeping, stated for completeness: (a) a control experiment briefly removed the
pre-existing company-wide scope of user `98d2e7c7…` while proving the 400, and it was
restored immediately from the values recorded in `docs/reports/ERP_DIVISION_SCOPE_AUDIT.md`
(`company=COMP-001`, `scope_level=COMPANY`, `is_full_scope=true`, `status=ACTIVE`);
(b) one stray division-level row for that same user appeared ~3 min after the revoke pass
while lint/type/test runs were in flight, was deleted, and was confirmed not to recur over a
90-second watch. The final totals (12 / 0) match the §5 audit baseline exactly, so no
pre-existing scope was lost. The `backend` `start:dev` process also exited during those
heavy runs and was restarted; every verification above was re-executed against the restarted
server.

### 9.5 Second defect found and fixed: the modal read stale scope state

Opening Division Access for a user that already had scopes showed
`No division restriction — this user currently has full company access` and rendered **no
remove buttons**, so the revoke path (§11) could not be exercised. Cause: the users *list*
endpoint does not embed `organizationScopes`, so `openDivisionModal` seeded state from an
always-empty array. It now calls `refreshDivisionScopes(user.id)` (`GET /admin/users/:id`)
immediately, and `refreshDivisionScopes` clears `divisionScopeLoading` in a `finally`. After
the fix the modal correctly listed all three tags on open and both revoke buttons worked.

### 9.6 Prompt #16A regression checks

| Check | Command / scope | Result |
|---|---|---|
| Backend type-check | `cd backend && npx tsc --noEmit` (`--max-old-space-size=6144`) | **PASS — exit 0** |
| Frontend type-check | `cd frontend && npx tsc --noEmit` (`--max-old-space-size=4096`) | **PASS — exit 0** |
| Backend ESLint (no `--fix`) | all 38 modified `.ts` files | **PASS — 0 errors**, 26 warnings (all pre-existing `no-unused-vars`) |
| Backend ESLint (changed files only) | `user.dto.ts` + `user.dto.spec.ts` | **PASS — 0 errors**, 4 warnings (pre-existing unused imports) |
| Frontend ESLint (no `--fix`) | all 10 modified `.tsx/.ts` files | **PASS — 0 errors**, 9 warnings (all pre-existing) |
| Backend focused suites | `jest --testPathPattern "(permission\|role\|auth\|user\|organization\|division-scope\.util)"` | **PASS — 9 suites / 96 tests, exit 0** |
| New DTO suite | `jest --testPathPattern "user.dto.spec"` | **PASS — 1 suite / 11 tests, exit 0** |
| Frontend focused suites | `react-scripts test --maxWorkers=1` (admin + division suites) | **PASS — 7 suites / 50 tests, exit 0** |
| Frontend build | `npm run build` (`--max-old-space-size=4096`) | **PASS — exit 0** |

No repository-wide suite was re-run for this round (§6.5.1); the last full backend run
before the DTO change was 4 failed suites / 6 failed tests — **identical to the `HEAD`
baseline, i.e. zero regressions**.
