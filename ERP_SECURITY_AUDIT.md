# ERP Security Audit Report

**Scope:** Authentication, authorization, RLS, secrets/config, API hardening, mass assignment, input validation, frontend token handling.
**Verified by:** code reading of auth/permission/guard/controllers; grep across migrations for RLS/GRANT; review of `.env` config; live build/tests.

---

## 1. Authentication

| Component | Status | Notes |
|---|---|---|
| Global JWT guard | ✅ | `SupabaseJwtGuard` registered as `APP_GUARD` (auth.module.ts). |
| Token verification | ✅ | Local HS256 verify via `SUPABASE_JWT_SECRET`; falls back to `GET /auth/v1/user` API when secret missing/invalid. |
| `@Public()` decorator | ✅ | Marks health endpoints public. |
| Rate limiting | ⚠️ MEDIUM | In-memory `Map` (`auth-rate-limit.guard.ts`) — ineffective across multiple instances/restarts. |
| Token refresh (frontend) | ❌ HIGH | `api.ts` stores `refresh_token` but never uses it; 401 → wipe storage + `window.location.href='/login'` (full reload, no silent refresh). |
| Password handling | ✅ | Supabase handles hashing server-side; `bcrypt` dependency present but auth is delegated to Supabase. |

### SEC-1 — Missing RLS (CRITICAL)
No `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`, or `GRANT` statement exists in any of the 35 migrations (grep-verified). In Supabase, public-schema tables default to being accessible by the `anon` and `authenticated` roles through PostgREST. Consequence: `erp_users`, `roles`, `role_permissions`, `permissions`, `user_organization_scopes`, `items`, `stock_ledger`, `machines`, `maintenance_job_cards` are directly readable/writable via the REST API with any valid (or even anonymous) client key. The application-level NestJS guards do **not** protect PostgREST endpoints.
**Fix:** Enable RLS on all tables and add org-scoped policies keyed off `user_organization_scopes`; revoke default anon grants on sensitive tables.

---

## 2. Authorization

| Guard | Purpose | Coverage |
|---|---|---|
| `PermissionGuard` + `@RequirePermission` | Role-permission check | Controller-level; **incomplete coverage** |
| `OrgScopeGuard` + `@RequireOrgScope` | Company/division/section scope | **Rarely applied** |
| Frontend `ProtectedRoute` | Route-level nav permission | Applied on all protected routes |

### SEC-2 — CompanyController single permission gate (HIGH)
`company.controller.ts:11` gates **all** CRUD (create/read/update/delete/activate/deactivate) behind `admin.users.update`. Wrong permission for the domain; conflates authorization levels.
**Fix:** per-action permissions (`organization.company.create/view/update/delete`).

### SEC-3 — getMyPermissions uses auth-user ID instead of ERP-user ID (HIGH)
`permission-matrix.controller.ts:59-66` passes `req.user?.id` (Supabase auth id) into `matrixService.getUserPermissions(...)` which expects the ERP user id → users may receive an empty/wrong permission set (or a lookup miss).
**Fix:** resolve ERP user via `erpUserService.findByAuthUserId` first.

### SEC-4 — Dashboard endpoints without permission (MEDIUM)
`dashboard.controller.ts` `summary` and `activity` have no `@RequirePermission`, so any authenticated user can pull aggregate business data.
**Fix:** add `dashboard.view` (or scoped) permission.

### SEC-5 — Permission action case inconsistency (MEDIUM)
`permissions.action` mixes UPPERCASE (`VIEW`, `DELETE`) and lowercase (`view`, `delete`) across modules. Admin grant filters in migration 2 only strip UPPERCASE `DELETE`, so lowercase `item.delete` / `manufacturing.*.delete` are not stripped from ADMIN.
**Fix:** normalize action case; re-run grants.

### SEC-6 — Frontend on-page actions not permission-gated (HIGH)
Sidebar + route check permissions, but once inside a page every create/edit/delete button is rendered for all users. Enforcement relies on backend only.
**Fix:** `PermissionGate`/`can()` on action buttons.

---

## 3. Input Validation / Injection

| # | Severity | Location | Issue | Fix |
|---|---|---|---|---|
| SEC-7 | HIGH | `purchase-order.service.ts:132`, `sales-order.service.ts:21,31-50` | Mass assignment: `create({ poId, ...dto })`, `dto: any` spreads arbitrary entity fields. | Typed DTOs; whitelist fields. |
| SEC-8 | MEDIUM | customer/sales update endpoints | `Partial<CreateXDto>` + `Object.assign` arbitrary-field update. | Dedicated update DTOs. |
| SEC-9 | MEDIUM | Several DTOs | Status fields `@IsString()` instead of `@IsEnum`; many string fields lack `@MaxLength`; `AddWorkLogDto.technicianUserId` is `@IsString` not `@IsUUID`. | Add strict decorators. |
| SEC-10 | LOW | `permission.service.ts:82-94` | Raw table names in `innerJoin` — bypasses TypeORM abstraction (no injection, but brittle). | Use entity relations. |
| SEC-11 | INFO | Global pipe | `ValidationPipe(whitelist, forbidNonWhitelisted, transform)` — good; but services taking `any` DTOs bypass the pipe's field stripping. | Enforce DTO types end-to-end. |

---

## 4. Secrets / Environment

| # | Severity | Finding |
|---|---|---|
| SEC-12 | HIGH | `backend/.env` contains live Supabase creds: `DB_PASSWORD`, `JWT_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `REDIS_PASSWORD`. `.env` is gitignored (all three levels), so not committed — but the file is checked into the working tree and service-role key is high-privilege. |
| SEC-13 | HIGH | `DB_SSL_REJECT_UNAUTHORIZED=false` — TLS certificate validation disabled for the Supabase pooler connection (MITM risk on data at rest in transit). |
| SEC-14 | MEDIUM | `docker-compose.yml` uses `JWT_SECRET: dev-secret-key-change-in-production` and `POSTGRES_PASSWORD: postgres` — fine for dev, must not reach prod. |
| SEC-15 | LOW | `supabase-auth.service.ts` falls back to `http://localhost:54321` + `dummy-key` when unconfigured → silent dead client. Fail fast instead. |

---

## 5. API Hardening / Misc

| # | Severity | Finding |
|---|---|---|
| SEC-16 | MEDIUM | `/api/v1/status` (app.controller.ts) requires auth but is **not** `@Public`; leaks Supabase config status to any authenticated user. Add `@Public()` or trim the payload. |
| SEC-17 | LOW | Swagger disabled in prod unless `ENABLE_SWAGGER=true` — good; keep it that way. |
| SEC-18 | INFO | CORS allow-list is restrictive (single origin in prod, LAN regex in dev) — good. |
| SEC-19 | INFO | `DB_LOGGING=true` in dev; disable in prod to avoid leaking query data in logs. |
| SEC-20 | LOW | No helmet/security headers middleware configured on the Nest app (e.g. `helmet`, CORS already handled). |

---

## 6. Security Score by Area

| Area | Score /100 | Rationale |
|---|---|---|
| RLS / DB-level security | 10 | Completely absent |
| AuthN | 70 | Solid JWT flow; missing refresh, in-memory rate limit |
| AuthZ | 40 | Guards exist but coverage incomplete + wrong permission gates |
| Input validation | 55 | Good global pipe, but mass assignment + weak DTOs |
| Secrets management | 50 | Gitignored but plaintext on disk; SSL verify disabled |
| Frontend token handling | 35 | No refresh; hard logout; token in localStorage (XSS-exposed) |
| **Overall security** | **~40** | |

---

## 7. Top Security Fixes (priority order)

1. Enable RLS + org-scoped policies (SEC-1).
2. Fix CompanyController permission + getMyPermissions ID bug (SEC-2/3).
3. Implement token refresh; stop full-page-reload logout (auth section).
4. Kill mass assignment (SEC-7/8).
5. Re-enable TLS verify / move secrets to secret manager (SEC-12/13).
6. Add missing permission decorators (SEC-4) and frontend gates (SEC-6).
7. Normalize permission action casing (SEC-5).
