# HR-05 — HR Live Map Page (Final Verification)

**Date:** 2026-09-14
**Status:** COMPLETED
**Scope:** HR Live Map page (`/hr/live-map`) — a real-data-only, provider-neutral workforce map showing truthful employee location status plus presence derived from today's real attendance records, with permission gating, and full end-to-end verification at 1920/1280/768/390 in light and dark themes.

---

## Summary

- Delivered the **Live Map** page (`frontend/src/pages/hr/LiveMap.tsx`) with the full spec surface: filter bar (division/section/department/shift/presence/employee/search), Apply/Reset/Refresh, 4 KPI cards (Live on Map / Present Now / Present Today / No Location), a provider-neutral **Workforce Map** board with a truthful empty state and a 4-status legend (Live/Recent/Stale/No Location), a **Workforce Presence** summary (8 derived chips), an **Employee Locations** table (Employee, Division, Section, Department, Designation, Shift with source, Attendance, Location), pagination, responsive light/dark styling, and a persistent "no live location source configured" notice.
- Backend (additive, `backend/src/modules/hr/`): `getLiveMapOptions` + `getLiveMap` endpoints gated by the new `hr.live_map.view` permission; company always resolved server-side from `erp_users.default_company_id`; pagination `{page, limit, total}`; truthful no-location classification with a documented freshness policy. No new table, no GPS/device schema, no fabricated coordinates, no demo location data.
- Permission migration `20260921000000_erp_00060_hr_live_map.sql` (idempotent permission insert + role grants) **applied directly to the live Supabase DB** (`MIGRATION_OK`, 4 role grants).
- Verified: backend HR module **85/85** (17 new live-map tests), `npx nest build`, `tsc --noEmit`, frontend production build, frontend scoped suites **89/89**, a **live API** probe (login → options → live-map all-NO_LOCATION → 401 without token), and a **Playwright browser E2E** (`71/71`) with screenshots under `docs/evidence/hr05/`. Regression: HR-04 browser E2E **36/36**, HR backend suite green, scoped frontend green. **No commits were made.**

---

## 1. Real-Data (Truthful) Policy

This is the central requirement of HR-05 and the reason there is **no map rendering library in the page**.

- The entire codebase was audited (repo-wide grep): **no map/geo library** is installed (only `recharts` exists), and the backend + HR schema contain **zero GPS / location / device / lat-long columns**. Privacy rule: the ERP must not fabricate coordinates.
- Therefore every employee is truthfully reported with `location.status = 'NO_LOCATION'`, and `live`/`recent`/`stale` are 0. No markers are ever simulated on the map board — it renders a truthful empty state ("No live employee locations available") with the location legend.
- What **is** surfaced from real, company-scoped data: the active employees, their org tree, designation, today's real attendance presence (present-now / present-today / absent / on-leave / half-day / holiday / weekend / no-record, derived from `hr_attendance`), and today's shift (the attendance shift, else the active roster plan via `DISTINCT ON` ASSIGNED-first).
- `LOCATION_FRESHNESS_MINUTES = { LIVE_MAX_MINUTES: 5, RECENT_MAX_MINUTES: 30 }` — a code-level policy constant surfaced to clients (`GET /hr/live-map` → `location.freshnessMinutes`) and shared with the frontend (`hrLiveMapService.ts`). Future real GPS sources map to it via the exported `classifyLocationStatus`.
- The final report explicitly confirms: **NO fake/demo location or attendance data was used or created anywhere** (no new location table, no seeded coordinates, no simulated markers).

---

## 2. Backend Changes

| File | Change |
|------|--------|
| `backend/src/modules/hr/dto/hr.dto.ts` | Added `LOCATION_FRESHNESS_MINUTES` and `GetLiveMapDto` (whitelisted filters `divisionId`/`sectionId`/`departmentId`/`employeeId`/`shiftId`/`status` via `IsIn(HR_ATTENDANCE_STATUSES)`, `search` `@MaxLength(100)`, `page`, `limit` `@Max(500)`) |
| `backend/src/modules/hr/dto/index.ts` | Exports `GetLiveMapDto` + `LOCATION_FRESHNESS_MINUTES` |
| `backend/src/modules/hr/services/hr.service.ts` | `LiveMapQuery`; `getLiveMapOptions` (company-scoped dropdowns + `attendanceStatuses`); `getLiveMap` (merge + JS-side shift/status filter + pagination + truthful empty base); `assertLiveMapFilterIds` (400 when a filter id does not belong to the user's company); `fetchLiveMapEmployees` / `fetchLiveMapAttendance` (raw-sql builder) / `fetchLiveMapRosterShifts` (`DISTINCT ON` ASSIGNED-first); helpers `mapLiveMapEmployee`, `matchesLiveMapFilters`, `computeLiveMapSummary`, `liveMapLocationInfo`, `emptyLiveMapSummary`; **exported** `classifyLocationStatus` and `LiveMapMergedEmployee` |
| `backend/src/modules/hr/controllers/hr.controller.ts` | `GET /hr/live-map/options` and `GET /hr/live-map` — both `@UseGuards(PermissionGuard)` + `@RequirePermission('hr.live_map.view')`, returning `{ success, data }` with `{ page, limit, total }` pagination |
| `supabase/migrations/20260921000000_erp_00060_hr_live_map.sql` | Idempotent permission seed `hr.live_map.view` (`module=hr, resource=live_map, action=VIEW`) + `role_permissions` grants for SUPER_ADMIN / ADMIN / MANAGEMENT / REPORT_VIEWER (`ON CONFLICT DO NOTHING`) — no DDL/table/seed data |
| `backend/src/modules/hr/services/hr-live-map.service.spec.ts` | New spec — **17/17 PASS** (see §6) |

Key API invariants (verified live): company id is **never** accepted from the client; auth is `SupabaseJwtGuard` + `PermissionGuard` (401 unprovisioned, 403 inactive, 403 denied); envelope `{ success, data }`; errors 400 (invalid filter id), 401, 403.

---

## 3. Live API Verification

Probe `C:\Users\afsar\AppData\Local\Temp\opencode\hr05_endpoint_probe.cjs` (login → options → live-map → auth) against the freshly built and restarted backend on 3001:

| Check | Result |
|-------|--------|
| Backend listening on 3001 (restarted from new `dist`; old pid 9428 terminated) | PASS |
| Login (`system.admin@erp.com`) → 201 with JWT; permissions list includes `hr.live_map.view` | PASS |
| `GET /hr/live-map/options` → 200; company `7725aa04-a270-4314-9e82-90949cbe7791` (COMP-001) | PASS |
| Options: `shifts` 3 (S-1 Morning 08:00–16:00, S-2, S-3), `employees` 7, `attendanceStatuses` 7 | PASS |
| `GET /hr/live-map` → 200; `total=7`, `reason=null`, `provider=null`, `providerConfigured=false` | PASS |
| Location summary truthful: `live=0`, `recent=0`, `stale=0`, `noLocation=7` | PASS |
| Every employee row: `location.status=NO_LOCATION`, `latitude=null`, `longitude=null`, `lastUpdated=null`, `source=null` | PASS |
| Presence from real attendance (probe time: 0 attendance rows today): `presentNow=0`, `noRecord=7` | PASS |
| Invalid token → `401` | PASS |

At browser-E2E time the live DB contained one real attendance row for today: the E2E observed `presentNow=0`, `noRecord=6`, `noLocation=7`, `total=7` — i.e. the presence summary reflects real `hr_attendance` data without any fabrication.

---

## 4. Frontend

| Check | Result |
|-------|--------|
| `frontend/src/services/hrLiveMapService.ts` — types, `fetchLiveMap`/`fetchLiveMapOptions`, `LOCATION_FRESHNESS_MINUTES`, `ATTENDANCE_STATUS_LABELS`, helpers `attPresentNow` / `hasLiveMarkers` | created |
| `frontend/src/pages/hr/LiveMap.tsx` — filter bar, KPIs, provider-neutral map board + legend, presence chips, employee table, truthful notices, no-default-company warning, Refresh | created |
| `App.tsx` — `/hr/live-map` route now renders `<LiveMap />` (was `HrComingSoon`) | wired |
| `navigationConfig.tsx` — Live Map permission `hr.attendance.view` → `hr.live_map.view` | updated |
| `navigationConfig.test.tsx` — `hr.live_map.view` added to the seeded-permission set | updated |
| `hr-dashboard.css` — `.erp-live-map-board`, `.erp-live-map-legend*`, `.erp-live-map-chips/*`, `.erp-live-map-chip*`, `.erp-live-map-notice`, `.erp-live-map-footnote` + 520px media query | added |
| `LiveMap.test.tsx` — **7/7 PASS**; `pages/__tests__/liveMapStatus.test.ts` — **13/13 PASS** | new |
| TypeScript (`tsc --noEmit`) | PASS |
| Production build (`npm run build`) | PASS |

Responsive behavior uses the existing `erp-hr-kpi-grid` / `erp-filter-bar` CSS plus the new live-map classes; the E2E verifies **no horizontal overflow at any width**.

---

## 5. Playwright Browser E2E (`71/71 PASS`)

Script `D:\ERP-MRP-PWI-2026\hr05-e2e.cjs` (uses already-running backend 3001 + frontend dev 3000; logins via API; injects token + theme preferences; drives the UI).

| Check | Result |
|-------|--------|
| Light theme 1920 × 1080 — header, truthful "No live location source configured" notice, map-board empty state, 4-status legend | PASS |
| KPIs match live API (`Live on Map = 0`, `No Location = 7`) for all four widths | PASS |
| Presence chips match live API (`Present now = 0`, `No record = 6`) for all widths | PASS |
| Employee table rows = API total (7) at 1920/1280/768/390; first row shows `EMP-001` + `No Location` | PASS |
| **No horizontal overflow** at 1920/1280/768/390 (`scrollWidth − clientWidth ≤ 1`) | PASS |
| Dark theme 1920 — `data-theme="dark"`, notice visible, 8 presence chips, 7 rows, no overflow | PASS |
| Filters on 390: pre-filter 7 rows → Presence=`Absent` → Apply → truthful empty message "No employees match the selected filters", 0 rows → Reset → 7 rows | PASS |
| Employee search `EMP-001` → exactly 1 row at 1280 | PASS |
| No unexpected page/console errors across all passes | PASS |

Screenshots (`docs/evidence/hr05/`): `01-1920-live-map-light`, `02-1280-live-map-light`, `03-768-live-map-light`, `04-390-live-map-light`, `06-1920-live-map-dark`, `07-390-live-map-filtered`.

---

## 6. Tests

| Suite | Result |
|-------|--------|
| Backend `hr-live-map.service.spec.ts` (classifier unit tests, 401/403 guards, truthful empty base, company scoping, filter validation 400, merge/presence/shift-source, pagination, options mapping) | **17/17 PASS** |
| Backend HR module (5 suites) | **85/85 PASS** |
| `npx nest build` (backend) | PASS |
| Frontend `tsc --noEmit` | PASS |
| Frontend production build | PASS |
| Frontend scoped suites (HR pages + `pages/__tests__` + layout + shared — 9 suites incl. `LiveMap.test.tsx` 7/7, `liveMapStatus.test.ts` 13/13) | **89/89 PASS** |

---

## 7. Regression (HR-01 .. HR-04)

| Check | Result |
|-------|--------|
| Backend HR module suite (includes attendance register 18 + my-attendance + dashboard + shift-roster + live-map) | **85/85 PASS** |
| Backend full-jest with documented pre-existing failures | see note below |
| HR-04 browser E2E (`hr04-e2e.cjs`) rerun against the restarted backend | **36/36 PASS** |
| Frontend scoped suites (HR + navigation + layout/shared) | **89/89 PASS** |
| Frontend production build + `tsc` | PASS |
| Live-map live API + 401 + truthful payloads | PASS |

**Pre-existing backend failures (unrelated to HR-05):** `modules/organization/controllers/company.controller.spec.ts` fails at module compilation with `Nest can't resolve dependencies of the SupabaseJwtGuard (?, Reflector) … SupabaseAuthService … available in the RootTestModule context`; `modules/production/services/production-entry.service.spec.ts` fails all atomicity cases with `TypeError: this.entryRepo.query is not a function`. Both suites fail identically in isolation, and neither imports any HR module (verified by import scan) — they are pre-existing test-harness issues, not regressions. Frontend full-repo jest exceeds 25 min in this environment and is intentionally scoped to the changed surface, consistent with HR-04 verification.

---

## 8. Environment Notes

- The backend was restarted to serve the new build (old pid 9428 killed; new process listens on 3001; `schtasks` task `hr05backend` registered and triggered; final instance launched via `Start-Process node dist/main.js`). If `http://localhost:3001` is not listening during manual browsing, start it with `cd backend && node dist/main.js`. The frontend dev server on 3000 remains running (pid 9044).
- The migration was applied directly to the live Supabase database (runtime connectivity pattern used for HR-04); seeding the permission means the existing admin login already carries `hr.live_map.view` (confirmed in the JWT/user payload).
- Login used for verification: `system.admin@erp.com` (working credentials are deliberately NOT recorded in this report).
- **No commits were made.** `git status` shows only the intended working-tree modifications and new files described above.

---

## FINAL VERDICT: COMPLETED

- Live Map page is fully functional against the live API with real-data-only semantics: truthful `NO_LOCATION` status for every employee (no geo source exists), real attendance-derived presence summary, shift information from today's attendance or the active roster plan, company isolation via `default_company_id` (server-side), and the new `hr.live_map.view` permission enforced on both endpoints and the nav entry.
- No map library, no GPS schema, and no fabricated location/demo data were introduced; the page is provider-neutral by design and documents the freshness thresholds (`LIVE ≤ 5 min`, `RECENT ≤ 30 min`, else `STALE`, no timestamp = `NO_LOCATION`).
- All verification layers green: backend HR suite (85/85), `nest build`, live API (truthful payloads + 401), frontend `tsc` + build + 89/89 scoped tests, and the Playwright browser E2E (**71/71** across 1920/1280/768/390 in light + dark with filters/search, no console errors, no horizontal overflow).
- HR-01..04 regression green (HR-04 browser E2E 36/36 rerun on the restarted backend).
- Screenshots available for human visual review under `docs/evidence/hr05/`.