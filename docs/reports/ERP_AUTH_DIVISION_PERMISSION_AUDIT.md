# Prompt #15 — ERP User, Division & Permission Architecture Audit

**Project:** ERP / MRP System — Pakistan Wire Industries (Pvt) Ltd.
**Phase:** Architecture / audit only — **no source code was modified**.
**Prerequisite for:** Prompt #16 (Visitor Management System).

---

## 0. Summary

The ERP already has a complete, mature authorization stack:

```
Supabase Auth (identity)
  → SupabaseJwtGuard        (global APP_GUARD — authentication)
  → PermissionGuard         (@RequirePermission — module/action permission)
  → OrgScopeGuard           (@RequireOrgScope — company/org scope presence)
  → Service layer           (companyId extracted from scope)
```

**Division exists as a first-class master** (`divisions` table, Company → Division → Section → Department), and a **per-user division scope already exists** (`user_organization_scopes.division_id`).

**The gap:** the division dimension is *stored* but never *enforced*.
`PermissionGuard` has no division input, `OrgScopeGuard` only checks that *some* scope exists, no service filters queries by the caller's allowed divisions, and the RLS helper is company-level only. Result: `Production = ALLOWED` applies to **every** division.

The safest extension is **additive**: keep `role_permissions` untouched, add one new optional scope table, and start enforcing the org-scope division data that is already being written.

---

## 1. Existing Architecture

### Authentication

| Aspect | Finding | Location |
|---|---|---|
| Identity provider | **Supabase Auth** (`auth.users`), with a local bcrypt/JWT fallback when the Supabase API is down or quota-exhausted | `backend/src/modules/auth/services/supabase-auth.service.ts` |
| Token verification | 4-tier fallback: local HS256 (`SUPABASE_JWT_SECRET`) → Supabase API → direct `auth.users` DB lookup → local `JWT_SECRET` token | same file, `verifyToken()` |
| Global guard | `SupabaseJwtGuard` registered as `APP_GUARD` | `backend/src/modules/auth/auth.module.ts:22-25` |
| Login flow | `POST /auth/login` → `AuthService.login()` → `{ token, refreshToken, user, permissions }` | `backend/src/modules/auth/controllers/auth.controller.ts:14-23` |
| Refresh | `POST /auth/refresh` | `auth.controller.ts:25-37` |
| Current user | `GET /auth/me` → profile **+ flat `permissions: string[]`** | `auth.controller.ts:39-48`, `auth.service.ts:114-125` |
| Rate limiting | `AuthRateLimitGuard` (in-memory Map) | `backend/src/modules/auth/guards/auth-rate-limit.guard.ts` |
| Public routes | `@Public()` decorator | `backend/src/modules/auth/decorators/public.decorator.ts` |
| Frontend storage | `localStorage.token`, `localStorage.refresh_token`, `localStorage.erp_user` (JSON incl. `permissions[]`), `localStorage.erp_permissions_ts` (5-min TTL) | `frontend/src/pages/auth/Login.tsx`, `frontend/src/services/api.ts` |
| Frontend client | Single axios wrapper; 401 → silent refresh; **403 → `console.warn` only** | `frontend/src/services/api.ts:115-181` |

> There is exactly **one** authentication system. No second user system exists or should be created.

### Users

| Aspect | Finding | Location |
|---|---|---|
| Table | `erp_users` | created by `supabase/migrations/20260818130000_users_roles_permissions.sql` |
| Entity | `ErpUser` | `backend/src/modules/user/entities/erp-user.entity.ts` |
| Identity link | `auth_user_id UUID UNIQUE` → Supabase `auth.users.id` | entity line 17 |
| Org defaults | `default_company_id`, `default_division_id`, `default_section_id`, `default_department_id` (all nullable FKs) | entity lines 44-70 |
| Status | `ACTIVE` / `INACTIVE` (also `is_active` boolean column) | entity line 72 |
| User ↔ Role | `user_roles` (`user_id`, `role_id`, `status`, **`UNIQUE(user_id, role_id)`**) | `backend/src/modules/user/entities/user-role.entity.ts` |
| User ↔ Org scope | `user_organization_scopes` | `backend/src/modules/user/entities/user-organization-scope.entity.ts` |
| Service | `ErpUserService` incl. `assignOrgScope`, `removeOrgScope`, `getUserOrganizationScopes`, `setDefaultContext` | `backend/src/modules/user/services/erp-user.service.ts` |
| Admin API | `POST /admin/users/:id/org-scopes`, `DELETE /admin/users/:id/org-scopes/:scopeId` (gated by `admin.users.manage_scope`) — **already exist, but the frontend never calls them** | `backend/src/modules/user/controllers/user.controller.ts:148-168` |

**`user_organization_scopes`** — the only authorization table that already carries a division:

```
user_id → erp_users            company_id → companies      (NOT NULL)
division_id → divisions        (NULLABLE)
section_id → sections          (NULLABLE)
department_id → departments    (NULLABLE)
scope_level ∈ {COMPANY, DIVISION, SECTION, DEPARTMENT}
is_full_scope boolean
status ∈ {ACTIVE, INACTIVE}
UNIQUE(user_id, company_id, division_id, section_id, department_id)
```

### Roles

| Aspect | Finding | Location |
|---|---|---|
| Table / entity | `roles` / `Role` — `role_code` (unique), `name`, `description`, `is_system_role`, `status` | `backend/src/modules/role/entities/role.entity.ts` |
| Seeded roles (11) | `SUPER_ADMIN`, `ADMIN`, `MANAGEMENT`, `SALES`, `PROCUREMENT`, `INVENTORY`, `PRODUCTION`, `QUALITY_CONTROL`, `FINANCE`, `HR`, `REPORT_VIEWER` | `20260818130000_users_roles_permissions.sql` |
| Admin detection | `role_code IN ('SUPER_ADMIN','ADMIN','SYSTEM_ADMIN')` **OR `name ILIKE '%admin%'`** | `backend/src/modules/permission/services/permission.service.ts:84-95` |

### Permissions

| Aspect | Finding | Location |
|---|---|---|
| Table / entity | `permissions` — `permission_code` (unique), `name`, `module`, `resource`, `action`, `description`, `status` | `backend/src/modules/permission/entities/permission.entity.ts` |
| Role ↔ Permission | `role_permissions` (`role_id`, `permission_id`, `status`, **`UNIQUE(role_id, permission_id)`**) | `backend/src/modules/role/entities/role-permission.entity.ts` |
| Code convention | `module.resource.action` (dominant) and legacy `resource.action` | e.g. `manufacturing.production.entries.view`, `admin.users.manage_scope`, `division.view` |
| Actions | Mixed case: `VIEW/CREATE/UPDATE/DELETE/POST/APPROVE/...` and lowercase `view/create/...` in some seeds | pre-existing inconsistency |
| Grant logic | `PermissionService.checkUserPermission(userId, code)` — admin bypass, then join `permissions → role_permissions → roles → user_roles → erp_users` | `permission.service.ts:81-116` |
| Flat list for UI | `PermissionMatrixService.getUserPermissions(userId)` → `string[]` → returned by `/auth/me` | `permission-matrix.service.ts:308-323` |
| Admin matrix | `GET/PUT /admin/permissions-matrix`, `GET /admin/permissions-matrix/my-permissions` | `permission-matrix.controller.ts` |
| **No `division_id`** | Confirmed: **no division column on `permissions`, `role_permissions`, `user_roles`, or `roles`** | grep across all 80 migrations |

### Divisions

| Aspect | Finding | Location |
|---|---|---|
| Table / entity | `divisions` — `company_id` (NOT NULL), `division_code`, `name`, `description`, `status`, `UNIQUE(division_code, company_id)` | `backend/src/modules/organization/entities/division.entity.ts` |
| Hierarchy | `companies → divisions → sections → departments` (`sections.division_id` NOT NULL; `departments.division_id` nullable) | `20260818120000_initial_organization_schema.sql` |
| Seeded divisions | **Real:** `SPD` (Spoke Division), `CCD` (Control Cable Division). **Placeholders:** `DIV-001..DIV-005` created then deactivated. | `20260821150000_erp_00010`, `20260821160000_erp_00011` |
| Sections | `SEC-010..SEC-017` under SPD/CCD | same |
| Departments | `SPD-DEPT001..009`, `CCD-DEPT001..004`, plus company-wide `CENT-*` | same |
| Central-department mapping | `department_division_scopes (department_id, division_id)` — maps company-level departments to divisions | `20260821160000_erp_00011` |
| Master CRUD UI | `frontend/src/pages/organization/DivisionManagement.tsx` → `/divisions` | gated by `division.view` |
| **Location master** | **Does not exist.** No `locations` / `sites` / `plants` / `facilities` table. Only `branches`, `warehouses`, `warehouse_locations`, `stores`. Migration `erp_00060` states outright: *"there is no location table"*. | grep across all 80 migrations |

### Authorization

| Guard / mechanism | Purpose | Coverage | Location |
|---|---|---|---|
| `SupabaseJwtGuard` (`APP_GUARD`) | Authentication | Global | `auth.module.ts:22-25` |
| `PermissionGuard` + `@RequirePermission(code)` | Role → permission check | ~200+ controller methods | `backend/src/modules/auth/guards/permission.guard.ts` |
| `OrgScopeGuard` + `@RequireOrgScope()` | Loads `request.erpUser` + `request.orgScopes`; rejects only if **zero** scopes | ~267 usages (dashboard, production, dispatch, inventory, sales, bom, qc, hr, store…) | `backend/src/modules/auth/guards/org-scope.guard.ts` |
| Company extraction | `req.erpUser?.defaultCompanyId \|\| req.orgScopes?.[0]?.companyId` | repeated per controller | e.g. `production-entry.controller.ts:39-45` |
| DB RLS | `erp_core.is_admin()`, `erp_core.has_role()`, **`erp_core.company_in_scope(company_id)`** (company only) | `20260829120000_erp_00028`, `20260829130000_erp_00029` | supabase/migrations |
| Frontend route guard | `ProtectedRoute` — ANY-of semantics on `navigationConfig.tsx` `NavItem.permissions` | wraps entire authenticated tree in `App.tsx` | `frontend/src/components/auth/ProtectedRoute.tsx` |
| Sidebar gating | `MainLayout` `can()` → hides items with no matching permission | fails **open** while permissions hydrate | `frontend/src/components/layout/MainLayout.tsx:70-185` |
| Permission hook | `usePermission()` → `can/canAny/canAll`, 5-min cache | ~40 files | `frontend/src/hooks/usePermission.ts` |
| `PermissionGate` component | Working but **imported by zero files** (dead code) | — | `frontend/src/components/auth/PermissionGate.tsx` |

---

## 2. Current Limitation — why `Production` applies across all divisions

**It does apply across all divisions.** Five independent confirmations:

1. **The permission has no division dimension.**
   `PermissionService.checkUserPermission(userId, 'manufacturing.production.entries.view')`
   (`permission.service.ts:81-116`) takes only `(userId, permissionCode)`. `role_permissions`
   has no `division_id`. A single `PRODUCTION` role grant satisfies the check for every division.

2. **`OrgScopeGuard` never filters and never rejects by division.**
   `org-scope.guard.ts:45-56` loads scopes into `request.orgScopes` and throws only when the list
   is **empty**. It never inspects `scope.divisionId`. Grep for `scope.divisionId` /
   `orgScopes.*divisionId` across `backend/src` returns **zero matches**.

3. **No service filters by the caller's divisions.**
   `production-entry.service.ts:162` — `if (divisionId) qb.andWhere('pe.divisionId = :divisionId')`.
   The filter is applied **only if the client supplies it**. `GET /production/entries` with no
   `divisionId` returns entries for **all** divisions; `GET /production/entries?divisionId=<CCD>`
   returns CCD entries to a user who was only ever granted SPD. Grep for any
   `ForbiddenException` mentioning division returns **zero matches**.

4. **RLS is company-level only.**
   `erp_core.company_in_scope()` (`erp_00029:62-73`) checks `user_organization_scopes.company_id`.
   There is no `division_in_scope()`.

5. **The frontend shows every division.**
   Division dropdowns are populated from unfiltered `GET /divisions` and `GET /dashboard/divisions`
   (`DashboardFilters.tsx`, `OrgStoreCascadingFilter.tsx`, `TargetManagement.tsx`,
   `RoutingManagement.tsx`, `SectionManagement.tsx`, `Employees.tsx`, …). There is no division
   context switcher and no division check in `ProtectedRoute`.

**In other words:** division data is *written* (`user_organization_scopes.division_id`,
`erp_users.default_division_id`) but *read by nothing*. It is decorative today.

```text
Current:   Production permission  ──────────────►  ALL divisions
Required:  Production permission → Division → Allowed / Not Allowed
```

### Additional pre-existing findings relevant to this work

| # | Finding | Impact |
|---|---|---|
| A1 | `PermissionService` admin bypass matches `role name ILIKE '%admin%'` (`permission.service.ts:89`) | Any role whose *name* contains "admin" bypasses **all** permission checks. Do not widen; consider tightening later (behaviour change — out of scope for #15). |
| A2 | `getUserOrganizationScopes()` **auto-heals**: an active user with zero scopes is silently granted `scopeLevel=COMPANY, isFullScope=true` (`erp-user.service.ts:458-493`) | If division filtering is enabled naively, most users resolve to "all divisions" and filtering becomes a no-op — but it also means enabling filtering will **not** break them. Must be understood before rollout. |
| A3 | `is_full_scope` / `scope_level` are written but **never read** by any guard | Ready-made "unrestricted" flag, currently unused. |
| A4 | `UserManagement.tsx` declares `organizationScopes?: any[]` but never renders or sends it | No UI exists to assign divisions to a user — only a single `companyId`. |
| A5 | Frontend 403s are only `console.warn`ed (`api.ts:175`) | A future division rejection would be silent to the user. |
| A6 | Permission list cached 5 min in `localStorage`; no invalidation on 403 | Revoked access stays visible client-side (server still rejects). |
| A7 | `PermissionMatrixService` / matrix UI group by `module` → `resource` → `action` × role | This is exactly the anchor point for "Module → Permission → Division Access". |
| A8 | Pre-existing report `docs/reports/ERP_SECURITY_AUDIT.md` says `OrgScopeGuard` is "rarely applied" — now **stale** (267 usages) | The guard is widely applied; it just doesn't filter. |

---

## 3. Recommended Architecture

Two complementary layers, both **additive**, both with a fail-safe "no configuration = today's behaviour" rule.

```text
USER  ── user_roles ──►  ROLE  ── role_permissions ──►  PERMISSION (module.resource.action)
  │                                                              │
  │                                                              ▼  (NEW, optional)
  │                                        role_permission_division_scopes
  │                                          division_id, department_id
  │                                          (no rows ⇒ unrestricted / legacy behaviour)
  │                                                              │
  ▼                                                              │
user_organization_scopes  ◄────────────── INTERSECT ─────────────┘
  company / division / section / department
  (EXISTING — already written, currently unenforced)
  │
  ▼
effectiveDivisions(user, permission)  ──►  applied in API queries  ──►  only authorized rows
```

**Resolution rule (documented precisely so it cannot be misread):**

```text
effectiveDivisions(user, permission) =
  if admin(role_code ∈ SUPER_ADMIN/ADMIN/SYSTEM_ADMIN or name ~ '%admin%')  →  ALL
  else
    userSet = { d | scope in user_organization_scopes(status=ACTIVE)
                    and scope.company_id = user.default_company_id
                    and (scope.division_id = d or scope.division_id IS NULL) }
              — if any active scope has division_id IS NULL (or is_full_scope) → ALL in company
    roleSet = if no row in role_permission_division_scopes for (user's roles, permission)
                then ALL                                   ◄── BACKWARD COMPATIBILITY
              else union of division_id of those rows
                (a row with division_id IS NULL ⇒ ALL)
    result  = userSet ∩ roleSet
```

- **Layer 1 (`user_organization_scopes`, existing)** answers *"which divisions may this user see?"* → per-user differentiation without role explosion (User: Ahmed ⇒ Control Cable yes / Spoke no).
- **Layer 2 (`role_permission_division_scopes`, new)** answers *"in which divisions does this role's permission apply?"* → the `Module → Permission → Division` matrix UI.
- **Department (future)** is pre-modelled by the nullable `department_id` on Layer 2 and the existing `department_id` on Layer 1 — no rewrite needed later.
- **Location (future)**: there is **no Location master today**; do not invent one now and do not repurpose `branches`/`warehouses`. Add a `locations` master under Company (→ Division → Location) and a nullable `location_id` in a later, non-destructive migration when Visitor Management actually needs it.

### Why a new table instead of adding `division_id` to `role_permissions`

| Option | Verdict |
|---|---|
| **Add nullable `division_id` to `role_permissions`** | ❌ Would have to change `UNIQUE(role_id, permission_id)` → `(role_id, permission_id, division_id)`. In Postgres **NULLs are distinct**, so the existing "one grant per pair" guarantee silently breaks and duplicate global grants become insertable. Also mutates a table that every existing grant depends on. |
| **Add nullable `division_id` to `permissions`** | ❌ Semantically wrong — permissions are a catalogue; scoping belongs to the *grant*, not the code. |
| **New `role_permission_division_scopes` table** | ✅ **Recommended.** Zero rows ⇒ behaviour is bit-for-bit identical to today. No existing constraint, entity, service or query changes shape. Reversible by simply not reading it. |

---

## 4. Database Changes

All changes are **additive**. Nothing is dropped, renamed, or rewritten.

### 4.1 New migration (single file)

`supabase/migrations/2026XXXX_erp_00068_role_permission_division_scopes.sql`

```sql
-- Optional division/department scope for an existing role→permission grant.
-- ABSENCE OF ROWS FOR A (role, permission) = UNRESTRICTED (legacy behaviour).
CREATE TABLE public.role_permission_division_scopes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id         UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id   UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  division_id     UUID REFERENCES public.divisions(id) ON DELETE CASCADE,   -- NULL = all divisions
  department_id   UUID REFERENCES public.departments(id) ON DELETE CASCADE, -- future, NULL = all
  scope_level     VARCHAR(20) NOT NULL DEFAULT 'DIVISION'
                    CHECK (scope_level IN ('DIVISION','DEPARTMENT')),
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  updated_by      UUID
);

-- COALESCE expression index: NULLs are otherwise distinct and would allow duplicates.
CREATE UNIQUE INDEX uq_rpd_scope
  ON public.role_permission_division_scopes (
    role_id, permission_id, scope_level,
    COALESCE(division_id,  '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(department_id,'00000000-0000-0000-0000-000000000000'::uuid)
  );
CREATE INDEX idx_rpd_scope_role        ON public.role_permission_division_scopes(role_id);
CREATE INDEX idx_rpd_scope_permission  ON public.role_permission_division_scopes(permission_id);
CREATE INDEX idx_rpd_scope_division    ON public.role_permission_division_scopes(division_id);

ALTER TABLE public.role_permission_division_scopes ENABLE ROW LEVEL SECURITY;
-- reuse the existing erp_core.is_admin() / erp_core.company_in_scope() helper pattern
```

Follow the existing audit-column convention (`created_at/updated_at/created_by/updated_by/is_active/status`)
and the `update_updated_at_column()` trigger already applied to the initial tables.

### 4.2 RLS helper (same or follow-up migration)

```sql
CREATE OR REPLACE FUNCTION erp_core.division_in_scope(p_division_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT erp_core.is_admin() OR EXISTS (
    SELECT 1 FROM public.user_organization_scopes s
    JOIN public.erp_users eu ON eu.id = s.user_id
    WHERE eu.auth_user_id = auth.uid()
      AND eu.status = 'ACTIVE'
      AND (s.division_id = p_division_id OR s.division_id IS NULL)
  );
$$;
```

Mirrors the existing `erp_core.company_in_scope()` (`erp_00029:62-73`).

### 4.3 Explicitly NOT changed

- `permissions`, `role_permissions`, `user_roles`, `roles` — untouched.
- `user_organization_scopes` — **reused as-is** (already has `division_id`, `department_id`, `scope_level`, `is_full_scope`).
- `erp_users` — untouched (`default_division_id` already exists).
- No seeded role is deleted or renamed. No seeded permission is deleted.
- No backfill required: **zero rows = legacy behaviour**.

### 4.4 TypeORM entities to add

- `backend/src/modules/role/entities/role-permission-division-scope.entity.ts` (+ export in `entities/index.ts`)
- Extend `Role` / `Permission` with an optional `divisionScopes` relation (additive `@OneToMany`).

---

## 5. API Changes

All changes are **additive** (new fields/endpoints). No existing request/response field is removed or renamed.

### 5.1 Core authorization services

| File | Change |
|---|---|
| `backend/src/modules/permission/services/permission.service.ts` | Add `getEffectiveDivisions(userId, permissionCode): Promise<'ALL' \| string[]>` implementing §3's rule. Keep `checkUserPermission(userId, code)` signature untouched; add an **optional** third arg `divisionId?` that returns `false` when the division is outside the effective set. |
| `backend/src/modules/permission/services/permission-matrix.service.ts` | `getMatrix()` — add `divisionIds: string[] \| null` to each cell. `updateMatrix()` — accept optional `divisionIds` per toggle and upsert/delete rows in `role_permission_division_scopes`. Add `getPermissionDivisionScopes(roleId)`. Keep `getUserPermissions()` returning `string[]` (frontend contract unchanged). Add `getUserDivisions(userId)`. |
| `backend/src/modules/user/services/erp-user.service.ts` | Add `getAllowedDivisionIds(userId): Promise<'ALL' \| string[]>` built from `getUserOrganizationScopes()` (already exists, `:452`). Honour `is_full_scope` and `scope_level = COMPANY && division_id IS NULL` as **ALL**. |
| New `backend/src/modules/organization/services/division-access.service.ts` | Single source of truth used by every controller: `allowedDivisionIds(req)`, `assertDivisionAllowed(req, divisionId)`, `filterDivisionsQuery(qb, alias, allowed)`. Cache per request. |

### 5.2 Guards

| File | Change |
|---|---|
| `backend/src/modules/auth/guards/org-scope.guard.ts` | **Extend, do not replace.** After loading scopes, also set `request.allowedDivisionIds` and `request.divisionAccess = 'ALL' \| string[]`. Keep existing rejection rules exactly as they are (adding a stricter rejection here would break current users). |
| `backend/src/modules/auth/guards/permission.guard.ts` | Optionally populate `request.erpUser`/`request.orgScopes` (it currently re-queries the user). No change to the permission decision itself. |
| New `backend/src/modules/auth/guards/division-scope.guard.ts` | `@RequireDivisionScope()` — reads `divisionId` from **query or body**; if present and not allowed → `403 Forbidden`. If absent, the *service* must still filter lists by `request.allowedDivisionIds`. Fail **closed** on scope-resolution errors for non-admins. |

### 5.3 Endpoints needing modification

| Endpoint | Why |
|---|---|
| `GET /production/entries` (+ `…/report`, machine/shift views) | Apply `AND pe.division_id = ANY(:allowed)`; reject an explicitly requested `divisionId` outside the set with 403. |
| `GET /production/*` other lists, `GET /dashboard/*`, `GET /dispatch/*`, `GET /inventory/*`, `GET /store/*`, `GET /machine/*`, `GET /maintenance/*`, `GET /qc/*`, `GET /hr/*` | Same pattern where a `divisionId`/department filter exists today. |
| `GET /divisions` and `GET /dashboard/divisions` | Return only divisions inside the caller's effective set (admins unchanged). This is the single change that fixes **all** frontend dropdowns at once. |
| `GET /auth/me` | **Add** `divisions: [{ id, divisionCode, name }]` and (optional) `divisionScopedPermissions`. `permissions: string[]` stays. |
| `GET /admin/permissions-matrix` | **Add** `divisionIds` per cell. |
| `PUT /admin/permissions-matrix` | **Accept** optional `divisionIds` per toggle (absent ⇒ unchanged ⇒ legacy global). |
| `POST/DELETE /admin/users/:id/org-scopes` | **Already exist** (`user.controller.ts:148-168`) — wire the UI to them; no backend change. |
| New: `GET/PUT /admin/roles/:roleId/permissions/:permissionId/divisions` | Focused CRUD for the Division Access panel. |

### 5.4 Service-layer data filtering (the security-critical part)

```ts
// list
const allowed = await divisionAccess.allowedDivisionIds(req);   // 'ALL' | string[]
if (allowed !== 'ALL') qb.andWhere('pe.divisionId IN (:...allowed)', { allowed });

// read by id
await divisionAccess.assertDivisionAllowed(req, entity.divisionId);

// create / update
await divisionAccess.assertDivisionAllowed(req, dto.divisionId);
```

Guard-only enforcement is **not sufficient** — a read-by-id or a body-supplied `divisionId` bypasses
any query-parameter guard.

---

## 6. Frontend Changes

Smallest possible change set; **no new permission system, no new route guard, no change to
permission codes or `navigationConfig.tsx`.**

| File | Change |
|---|---|
| `frontend/src/hooks/usePermission.ts` | Add `divisions`, `allowedDivisionIds`, `canInDivision(code, divisionId)`, `isDivisionAllowed(id)`. Cache alongside `permissions` in `erp_user`. |
| `frontend/src/store/userStore.ts` | Add `divisions?: { id; divisionCode; name }[]` to `UserData`. |
| `frontend/src/pages/admin/PermissionMatrix.tsx` | Expandable **"Division Access"** panel on a cell: `Module → Permission → ☐ Division` checkboxes (fetched from `GET /divisions`, restricted to admin-visible set). Send `divisionIds` with the toggle. Show a "Global / All divisions" state when `divisionIds` is null. |
| `frontend/src/pages/admin/UserManagement.tsx` | New **Division Access** section per user calling the **existing** `POST/DELETE /admin/users/:id/org-scopes` (the `organizationScopes?: any[]` field already declared at line 50 is finally used). |
| `frontend/src/pages/admin/RoleManagement.tsx` | Optional division picker inside the existing permission-assignment modal (module → permission → division). |
| New `frontend/src/components/shared/DivisionSelect.tsx` | Single dropdown component that only lists allowed divisions; reused by the pages below. |
| `DashboardFilters.tsx`, `OrgStoreCascadingFilter.tsx`, `TargetManagement.tsx`, `RoutingManagement.tsx`, `SectionManagement.tsx`, `Employees.tsx`, `LowStockQueue.tsx`, `CustomerManagement.tsx`, `FinishedGoodsInventory.tsx`, `SalesOrderManagement.tsx` | Swap raw division `Select`/fetch for `DivisionSelect` (UX only — the backend filter is the real control). |
| `frontend/src/services/api.ts` | Surface 403 division errors to the user (today: `console.warn` only). |
| `frontend/src/components/auth/ProtectedRoute.tsx`, `navigationConfig.tsx` | **No change.** Permission codes are unchanged. |

---

## 7. Security — preventing cross-division access

1. **Backend is the authority.** Frontend hiding is cosmetic only.
2. **Enforcement happens in three places**, all server-side:
   - `DivisionScopeGuard` rejects an explicitly requested `divisionId` (query/body) → `403`.
   - Service queries always append `division_id = ANY(:allowed)` unless `allowed === 'ALL'`.
   - Read-by-id / write operations call `assertDivisionAllowed()` on the entity's own `divisionId`.
3. **Worked example** (requirement §12):

   ```text
   User: Control Cable production user (role PRODUCTION, scope division = CCD)
   GET /production/entries?divisionId=<SPD>
     → PermissionGuard: manufacturing.production.entries.view = OK
     → OrgScopeGuard:   has scope = OK
     → DivisionScopeGuard: SPD ∉ {CCD}  → 403 Forbidden
   GET /production/entries            (no divisionId)
     → service appends division_id = ANY('{CCD}')  → only CCD rows returned
   ```
4. **DB-level defence in depth:** `erp_core.division_in_scope()` RLS policies (§4.2), matching the
   existing `company_in_scope()` pattern, so PostgREST cannot be used to sidestep NestJS.
5. **Fail closed:** if scope resolution throws for a non-admin, deny. Admins short-circuit to ALL
   (existing behaviour preserved).
6. **Never load all divisions and filter client-side.** `GET /divisions` itself is filtered (§5.3).
7. **Out of scope but flagged:** the `ILIKE '%admin%'` bypass (A1) and the 5-minute permission cache
   (A6) should be reviewed in a later hardening pass — changing either now would alter existing access.

---

## 8. Risk & Backward Compatibility

| Concern | Assessment |
|---|---|
| Existing users keep working? | **Yes.** Zero rows in the new table ⇒ every permission behaves exactly as today. |
| Existing global permissions disappear? | **No.** `role_permissions` untouched; absence of scope rows is explicitly defined as *unrestricted*. |
| Existing roles deleted? | **No.** No `DELETE`/`UPDATE` on `roles`, `permissions`, `user_roles`, `role_permissions`. |
| Existing endpoints break? | **No.** Only additive response fields; no field removed or renamed. |
| Existing frontend routes break? | **No.** Permission codes and `navigationConfig` unchanged. |
| Destructive migration? | **No.** One `CREATE TABLE` + one `CREATE FUNCTION` + indexes. Reversible by dropping the table. |
| Second auth system created? | **No.** Supabase Auth + `SupabaseJwtGuard` untouched; existing Admin role extended, not replaced. |
| **Primary risk** | Enforcing **existing** `user_organization_scopes.division_id` rows. Any user who already has a `DIVISION`-level scope row will start being filtered for the first time. **Mitigation:** (a) audit current rows before enabling, (b) treat `is_full_scope = true` / `scope_level = COMPANY` + `division_id IS NULL` as **ALL** (covers the auto-heal path A2, i.e. most users), (c) ship behind an env flag e.g. `DIVISION_SCOPE_ENFORCEMENT=off` for one release, (d) make `user_organization_scopes` enforcement a **separate, reviewable step** from the new table. |
| Secondary risk | Frontend tests are flaky when batched under memory pressure (see §9). Not caused by this audit, but will complicate verifying Prompt #16. |
| Overall | **Backward compatible by construction.** The new capability is opt-in and additive. |

---

## 9. Testing

**No source code was changed in this prompt.** The only file added is this report
(`docs/reports/ERP_AUTH_DIVISION_PERMISSION_AUDIT.md`).
Pre-existing local modifications to `backend/src/modules/sales/dto/sales-analytics.dto.ts` and
`scripts/.erp-dev-pids.json` were already present and were **not** touched.

### Backend — ESLint (no `--fix`, so no files were rewritten)

```
npx eslint "src/modules/auth/**/*.ts" "src/modules/permission/**/*.ts" \
           "src/modules/user/**/*.ts" "src/modules/role/**/*.ts"
→ 0 errors, 18 warnings (all pre-existing unused-import/unused-var), exit 0
```

### Backend — Jest (audit-relevant modules)

```
npx jest --runInBand src/modules/permission src/modules/user src/modules/role src/modules/organization
→ Test Suites: 6 passed, 6 total
  Tests:       42 passed, 42 total
```
Covers `permission.service.spec.ts`, `role.service.spec.ts`, `erp-user.service.spec.ts`,
`department.service.spec.ts`, `company.service.spec.ts`, `company.controller.spec.ts`.

### Frontend — permission-related suites (run individually)

```
permission-gating.test.ts      → 15/15 PASS
PermissionMatrix.test.tsx      →  5/5  PASS
RoleManagement.test.tsx        →  6/6  PASS
navigationConfig.test.tsx      → 22/22 PASS (re-run; failed once when batched)
```

### Environment notes

- The full backend suite and batched frontend runs hit **native OOM** — the machine has 16 GB with
  the dev servers running (~1 GB free at test time). This is environmental, not a regression.
- Batched frontend runs also showed **cross-suite flakiness** (a suite that passes in isolation
  fails when batched). Pre-existing; worth knowing before Prompt #16.
- A full-repo `tsc --noEmit` also OOM'd for the same reason and was not completed.

---

## 10. Implementation order for Prompt #16

1. **Migration** — `role_permission_division_scopes` + `erp_core.division_in_scope()` (§4). *Additive, safe to merge immediately.*
2. **Read path only** — `DivisionAccessService` + `request.allowedDivisionIds` in `OrgScopeGuard`, `/auth/me` returns `divisions`. *No behaviour change yet.*
3. **Enforcement behind a flag** — `DivisionScopeGuard` + service filtering on `production`, then `dashboard`, `dispatch`, `inventory`. Audit existing `user_organization_scopes` rows first.
4. **UI** — `DivisionSelect`, `UserManagement` Division Access (existing endpoints), then the `PermissionMatrix` Division Access panel.
5. **Visitor Management** (separate prompt) — seed `visitor.*` permission codes; they inherit division scoping automatically because scoping is generic. Add the `locations` master only if physically required.
