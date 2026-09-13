# HR-01 — HR Dashboard Fix 01A (FINAL VERIFICATION)

**Date:** 2026-09-13
**Status:** COMPLETED
**Scope:** HR Dashboard (`/hr/dashboard`) HTTP 500 root-cause fix + full verification. Scope discipline: no dashboard redesign, no disabling of auth/permissions/company isolation, no fabricated/zero-masked metrics, no expansion into unrelated HR features. One small, user-approved pre-existing bug fix is documented separately below.

---

## Summary

- The HR Dashboard API `GET /api/v1/hr/dashboard` returned HTTP 500 because of a TypeORM raw-SQL property-replacement defect: `s.startTime::time` in the trend `late_count` FILTER was not rewritten (immediate `::` cast after the property token), producing `> s.startTime::time`, which Postgres folds to `column s.starttime does not exist`.
- Fix: `s.startTime::time` → `s."start_time"::time` in `backend/src/modules/hr/services/hr-dashboard.service.ts`. This renders verbatim in the raw query and is valid SQL. Verified end-to-end against the real DataSource and the live API.
- A **pre-existing, out-of-scope** 500 on `GET /api/v1/hr/leave-requests` (existing Leaves/Attendance pages) was found during regression and fixed after explicit user approval (see section 9).

---

## 1. Backend Startup

| Check | Result |
|-------|--------|
| Build (`npm run build`, backend) | PASS (exit 0) |
| Start (`node dist/main`) | PASS — `[NestFactory] Starting Nest application...` |
| Startup line | `[NestApplication] Nest application successfully started` (09:04:09, PID 7532) |
| Process (wrapper → node) | PID 7532 listening as node `dist/main` |

The `SUPABASE_JWT_SECRET appears to be a JWT token... Falling back to Supabase API` warning in `repro-be.err.log` is pre-existing, non-fatal, and unrelated to this task.

---

## 2. Listening Port

| Check | Result |
|-------|--------|
| Port 3001 | PASS — `Application is running on: http://localhost:3001` |
| `Get-NetTCPConnection -LocalPort 3001 -State Listen` | PASS — owned by PID 7532 (the started backend wrapper) |
| API docs | `http://localhost:3001/api/docs` reachable |

No duplicate backend instance was started; the previous buggy process (PID 4480) was stopped and replaced once.

---

## 3. HR Dashboard Endpoint

`GET /api/v1/hr/dashboard` (after `POST /api/v1/auth/login` as `system.admin@erp.com` / `Admin#2026!Secure`, Authorization: Bearer token)

| Property | Value (live) |
|----------|--------------|
| HTTP status | **200** |
| `success` | `true` |
| `asOf` / `periodStart` / `periodEnd` | 2026-09-13 / 2026-08-15 / 2026-09-13 |
| kpi | totalEmployees=7, activeEmployees=7, presentToday=0, lateToday=0, absentToday=0, onLeaveToday=0, pendingApprovals=0, outOfZone=0, documentsExpiring=0 |
| notes | lateToday=DERIVED, outOfZone/documentsExpiring=UNSUPPORTED (declared, not fabricated) |
| attendanceTrend | 30 data points, 2026-08-15 → 2026-09-13, includes real present=1 record on 2026-08-30 |
| employeesByDepartment | 1 bucket — `{departmentId:null, name:"Unassigned", count:7}` (real DB state; no zero-masking) |

---

## 4. HTTP 500 Root Cause — `s.startTime::time`

TypeORM rewrites `alias.property` inside raw QueryBuilder strings, but **not** when the property token is immediately followed by a `::` cast. The generated SQL therefore contained the literal `s.startTime::time`; PostgreSQL folds the unquoted identifier to lowercase → `column s.starttime does not exist` → 500.

Verified with a repro script executing both candidate expressions through the real DataSource:
- `s.startTime::time` (v1_current): rendered unreplaced → invalid → error.
- `s."start_time"::time` (v2_quoted_snake): rendered verbatim → valid SQL.
- `dept` group-by and `scoped` where-clause queries confirmed valid.

---

## 5. Root Cause Fixed

| File | Change |
|------|--------|
| `backend/src/modules/hr/services/hr-dashboard.service.ts` | Trend FILTER expression `s.startTime::time` → `s."start_time"::time` |

Compiled output (`dist/modules/hr/services/hr-dashboard.service.js`) confirmed to contain `s."start_time"::time`. Only this one expression changed; no dashboard structure, controller, module wiring, or permissions were altered.

---

## 6. Live API Verification

| Check | Result |
|-------|--------|
| Dashboard 200 with real data | PASS |
| No token → `401` | PASS |
| Garbage token → `401` | PASS |
| Permission resolution (PermissionGuard exact SQL vs live DB), `hr.dashboard.view`: `system.admin@erp.com` | 1 grant (allowed) |
| Same query for `admin@pakistanwire.com`, `store.manager.qa@erp-local.test`, `system.replenishment@erp.local` | 0 grants (denied paths → 403) |
| Live grants for `hr.dashboard.view` | SUPER_ADMIN, ADMIN, MANAGEMENT, REPORT_VIEWER |
| Company isolation | All dashboard SQL binds use companyId `7725aa04-a270-4314-9e82-90949cbe7791` (system.admin's default company) |

---

## 7. Frontend

| Check | Result |
|-------|--------|
| Frontend build (`npm run build`) | PASS (exit 0; only pre-existing warnings) |
| Navigation config (14 HR items + permissions) | present / PASS |
| `/hr/*` routes + legacy redirects (`/hr/attendance`, `/hr/leave`, `/hr/shifts`, `/hr/holidays`, `/hr/employees`, `/hr/dashboard`) | PASS |
| Breadcrumbs (`Home / HR / HR Dashboard`) | PASS |

---

## 8. Playwright Browser Verification (HR Dashboard)

Headless Chromium 1600×1000 against the local frontend (port 3000) + backend (port 3001).

| Check | Result |
|-------|--------|
| Page loads, no HTTP ≥ 500 | PASS |
| 9 KPI cards with real values (TOTAL EMPLOYEES 7, ACTIVE EMPLOYEES 7, PRESENT TODAY 0, …) | PASS |
| Section titles `Attendance Trend (Last 30 Days)` + `Employees by Department` | PASS |
| Trend chart rendered (Recharts SVG present) with legend (Present/Late/OnLeave/Absent) | PASS |
| Department caption `7 employees across 1 department` + `Unassigned` legend | PASS |
| Metric notes (DERIVED / UNSUPPORTED) shown | PASS |
| Header title `Attendance & workforce overview` | PASS |
| All 14 HR nav labels present | PASS |
| Layout probe: no horizontal overflow (`scrollWidth == clientWidth`), KPI grid 3×3, exactly 1 visible header, 2 chart SVGs | PASS |
| **Console errors** | **NONE** |
| **Page errors** | **NONE** |
| **Failed requests (≥500)** | **NONE** |

(Prior screenshot artifact: `C:/Users/afsar/AppData/Local/Temp/opencode/hr-fix-dashboard-1600.png`; superseded by DOM/layout metrics above.)

---

## 9. PRE-EXISTING OUT-OF-SCOPE BUG FIX — leave-requests 500

During regression, `GET /api/v1/hr/leave-requests` (used by existing `/hr/leaves` and `/hr/attendance-register` pages) returned HTTP 500. This bug is in **unmodified, tracked** files (pre-existing; not introduced by HR-01) and was fixed **after explicit user approval**.

- **Root cause:** incorrect database/entity property used in leave-request ordering — `qb.orderBy('l.created_at', 'DESC')` fed a raw snake_case column into TypeORM's `getManyAndCount()` order-by-combine step, which crashed at `SelectQueryBuilder.js:2141` (`Cannot read properties of undefined (reading 'databaseName')`).
- **Fix:** `l.created_at` → `l.createdAt` in `backend/src/modules/hr/services/hr.service.ts` (`listLeaveRequests`).

No redesign of the Leaves/Attendance module was made.

| Endpoint | Before | After |
|----------|--------|-------|
| `/hr/leave-requests?companyId=…&limit=200` | 500 | **200** |
| `/hr/leave-requests?...&page=1&limit=20` | 500 | **200** |
| `/hr/leave-requests?...&status=PENDING` | 500 | **200** (empty result, total 0 — correct) |
| `/hr/leaves` (browser) | 500 + console error | renders, 0 console/page errors |
| `/hr/attendance-register` (browser) | 500 + console error | renders, 0 console/page errors |
| `/hr/dashboard` (browser) | — | still renders, 0 console/page errors |

---

## 10. Regression

Browser smoke across core modules after the dashboards fix (login as system.admin):

| Route | Result |
|-------|--------|
| `/` → `/dashboard` | 200, renders, no 5xx |
| `/organization/divisions`, `/organization/departments` | 200, renders, no 5xx |
| `/master-data/items` | 200, renders, no 5xx |
| `/inventory/reports` | 200, renders, no 5xx |
| `/production/dashboard`, `/production/orders`, `/production/bom` | 200, renders, no 5xx |
| `/hr/employees` | 200, renders, no 5xx |
| `/hr/leaves`, `/hr/attendance-register` | 200 after section 9 fix, no 5xx |

Post-fix re-probe of the three affected pages: **0 HTTP ≥500, 0 console errors, 0 page errors, no error boundary, no login redirect** on all.

---

## 11. Tests & Builds

| Check | Result |
|-------|--------|
| Backend build (`npm run build`) | PASS |
| Backend HR tests (`hr-dashboard.service.spec.ts`) | **4/4 PASS** |
| Frontend tests (`HrDashboard` + `navigationConfig`) | **28/28 PASS** |
| Frontend build (`npm run build`) | PASS (exit 0) |

---

## FINAL VERDICT: FIXED

- HR Dashboard `GET /api/v1/hr/dashboard` returns **200** with real, declared metrics (incl. DERIVED/UNSUPPORTED notes; no fabricated zeros).
- Auth (401/403) and company isolation remain intact.
- Frontend renders the dashboard cleanly: no console errors, no page errors, no failed requests, no layout overflow.
- Pre-existing `/hr/leave-requests` 500 (out-of-scope, user-approved) fixed and verified.
- Regression across dashboard/organization/master-data/inventory/production/HR routes shows no new failures.
- No commits made.