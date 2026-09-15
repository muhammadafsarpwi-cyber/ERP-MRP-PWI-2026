# HR-08 — HR Overtime Approval (Final Verification)

**Date:** 2026-09-15
**Status:** COMPLETED
**Scope:** HR Overtime Approval page (`/hr/overtime-approval`) — a real-data overtime request + approval workflow wired to the new `hr_overtime` API on the live backend, with permission gating (5-permission group `hr.overtime.*`), a status-controlled lifecycle (PENDING → APPROVED / REJECTED), a history ledger that records every transition, and a computed (display-only, never persisted) candidate-overtime value derived from check-out vs scheduled shift end in UTC. Verified end-to-end in a real browser at 1400/768/390 in light theme and 1280 dark.

---

## Summary

- Delivered the **Overtime Approval** page as a new route `/hr/overtime-approval` (`frontend/src/pages/hr/OvertimeApproval.tsx`) plus a dedicated service `frontend/src/services/hrOvertimeService.ts` (full types, status constants, `toQuery`, and all data/mutation calls), registered in the app router and navigation config with the `hr.overtime.view` permission.
- Page surface: filter bar (division/section/department cascades, shift, status, employee, free-text search, Apply/Reset), 5 truthful KPI cards (Pending / Approved / Rejected / Requested Hrs / Approved Hrs derived from the scoped list API), a table (RefNo, Employee, Division, Department, Date, Shift, Scheduled Hours, Working Hours, Candidate OT, Requested OT, Approved OT, Status, Actions — view / edit / approve / reject / delete as permitted), a Create/Edit modal with validation, a Read-only Details modal with a Timeline of the history ledger, and an Approve/Reject decision modal (approve defaults hours to the requested value; reject requires a reason ≥ 3 characters). Self-service-mapped admins submit for themselves; admins without an employee link get a real employee picker.
- Backend (additive, `backend/src/modules/hr/`): overtime endpoints — options, list, get-by-id, history, create, update, approve, reject, delete — all company-scoped server-side from the authenticated user's `default_company_id` (never accepted from the client). Status machine enforced (only PENDING can update/approve/reject/delete, else 400; only the requester can edit while PENDING, else 403; decided requests are immutable). Duplicate guard = one active request per (company, employee, date) via the partial unique index `uq_hr_ot_active` (409). Candidate overtime is **computed** (check-out minus scheduled shift end, UTC-normalized) and returned for display only — `hr_attendance.overtime_minutes` is intentionally never written. History ledger (`hr_overtime_history`) records creation (`null→PENDING`, `changedFields=['created']`) and decisions (`['status']`, plus `['approved_hours']` when the approved value differs).
- Migration applied: `supabase/migrations/20260923000000_erp_00062_hr_overtime.sql` — `hr_overtime` + `hr_overtime_history` (bare ledger, history cascades on overtime delete), 4 indexes (`uq_hr_ot_ref_no`, `uq_hr_ot_active`, `idx_hr_ot_company_status`, `idx_hr_ot_hist_overtime`), 8 RLS policies (4+4), 5 permissions `hr.overtime.view/create/update/delete/approve`, role grants (SUPER_ADMIN all 5, ADMIN 4 [no delete], MANAGEMENT + REPORT_VIEWER view-only). Applied live ×3 (idempotent, all OK). Post-run object + baseline verification **10/10**.
- Verified: backend HR module **172/172** (8 suites; includes new `hr-overtime.service.spec.ts` 30/30), live API checks **19/19**, Playwright browser E2E **54/54** (real Chrome, real table with rows, create/edit/view/approve/reject/duplicate-409/filters/delete, plus responsive 768/390 and dark), frontend `tsc --noEmit` PASS, frontend production build PASS, and focused frontend regression on the modified nav config **22/22**.
- **Known environment limitation (documented, NOT treated as a product regression):** the new `OvertimeApproval.test.tsx` jsdom suite cannot run to completion on this machine — 4/7 tests pass and 3 row-rendering tests time out because antd `Table` with real data rows starves the jsdom main thread ~40–90 s (identical to the pre-existing HR-07/`LiveMap.test.tsx` pattern). Per the verification policy these are reported as **ENVIRONMENT-LIMITED / NOT RUN TO COMPLETION — never PASS**, no product code weakened, no extreme timeouts added. The real-browser E2E (54/54) is the authoritative UI verification and is fully green.
- **No commits were made.** A standard `tsconfig.build.json` (that excludes `**/*spec.ts`, the Nest default it lacked) was added so `nest build` compiles the production code; the unrelated full-build failure documented in HR-07 (stale `item.service.spec.ts`) is thereby no longer able to block builds, and the HR module (specs included) still compiles/type-checks cleanly.

---

## 1. Backend Changes (additive)

| File | Change |
|------|--------|
| `supabase/migrations/20260923000000_erp_00062_hr_overtime.sql` | New `hr_overtime` + `hr_overtime_history` tables, 4 indexes (incl. partial-unique `uq_hr_ot_active` on PENDING per company/employee/date), 8 RLS policies, 5 `hr.overtime.*` permissions + role grants, `update_updated_at_column` trigger; idempotent (applied ×3, verified) |
| `backend/src/modules/hr/entities/hr-overtime.entity.ts` | `HrOvertime` entity (refNo, company, employee, attendance link, overtime date, shift link, requested/approved hours, reason, remarks, decision audit, submitted by/at, isActive) + `HrOvertimeHistory` entity (uuid PK, bare ledger row, `changedFields` text[]) |
| `backend/src/modules/hr/entities/index.ts`, `dto/index.ts` | Exports for the new entities + DTOs |
| `backend/src/modules/hr/dto/hr.dto.ts` | `HR_OVERTIME_STATUSES`, `CreateOvertimeDto` (employee/shift/date/hours/reason/remarks), `UpdateOvertimeDto`, `ApproveOvertimeDto` (approvedHours optional), `RejectOvertimeDto` (remarks required), `GetOvertimeDto` (page/limit/status/division/section/department/employee/date range/search) with whitelisted class-validator rules; also imports `MinLength` (missing import surfaced by the HR suite — fixed) |
| `backend/src/modules/hr/services/hr-overtime.service.ts` | options / list + summary / getById + history / create (refNo, active-duplicate 409, future-date 400, inactive-employee 400, blocked-attendance-status 400, shift resolution from attendance) / update (PENDING only, requester only) / delete (soft-delete PENDING, returns `{ id, deleted: true }`) / approve + reject (PENDING only, writes approved hours + decision audit, records ledger transitions) / `candidateOvertimeMinutes` computed in UTC |
| `backend/src/modules/hr/services/hr-overtime.service.spec.ts` | New spec — 30 tests: options, create validation guards, duplicate 409, future date 400, inactive employee 400, status machine (update/approve/reject/delete on decided → 400), requester-only 403, company scoping, candidate-OT UTC computation, history ledger content, soft-delete hiding, list filters + summary |
| `backend/src/modules/hr/controllers/hr.controller.ts` | `GET /hr/overtime/options`, `GET /hr/overtime`, `GET /hr/overtime/:id/history`, `GET /hr/overtime/:id`, `POST /hr/overtime`, `PATCH /hr/overtime/:id`, `PATCH /hr/overtime/:id/approve`, `PATCH /hr/overtime/:id/reject`, `DELETE /hr/overtime/:id` — each `@UseGuards(SupabaseJwtGuard, PermissionGuard)` with the matching `hr.overtime.*` permission, envelope `{ success, data }` |
| `backend/src/modules/hr/hr.module.ts` | Registers the new entities, service, and `TypeOrmModule` features |
| `backend/tsconfig.build.json` | Standard Nest build config (excludes `**/*spec.ts`) that the repo lacked; unblocks `nest build` (previously it compiled specs and tripped on the stale parallel `item.service.spec.ts`) |

Migration applied to the live remote DB; no seed data added. Baseline after all verification: **0 rows** in both `hr_overtime` and `hr_overtime_history`.

---

## 2. Live API Verification (`19/19 PASS`)

Run against the running backend on 3001 + remote DB (temp script, removed after use):

| Check | Result |
|-------|--------|
| Unauthenticated `GET /hr/overtime` → **401** | PASS |
| Login → 201 with JWT; options → 200 (company resolved server-side, 66 employees, 3 shifts, divisions/sections/departments, self identity) | PASS |
| Baseline list → summary consistent (0 rows, 0 hrs) | PASS |
| Create → 201, refNo `OT-XXXXXXXX`, PENDING, requested hours, company-scoped | PASS |
| Duplicate create (same employee + date while active) → **409** | PASS |
| GetById → 200 with detail incl. shift/employee/audit | PASS |
| History after create → 1 ledger row `null→PENDING`, `changedFields=["created"]` | PASS |
| Approve (with remarks) → APP recorded, approvedHours written | PASS |
| Create second request → **Reject** (with reason) → REJECTED; history now 2 rows, decision row `PENDING→REJECTED`, `changedFields=["status"]` | PASS |
| Update PENDING (requester) → 200 (requestedHours/remarks changed) | PASS |
| Soft delete PENDING → 200 with `{ id, deleted: true }`; GetById afterwards → **404** | PASS |
| Update on an APPROVED (decided) request → **400** (`Only pending overtime requests can be updated`) | PASS |
| List status filter (PENDING) → only pending rows | PASS |
| List date-range filter → scoped rows | PASS |
| Summary approved-hours reflects the approved request (approved=1, totalApprovedHours=3) | PASS |
| Company scope (rows belong to the authenticated default company) | PASS |
| Cleanup restored baseline (deleted flagged rows; DB back to 0/0) | PASS |

**Candidate-OT data note (verified, not a defect):** for the seeded verification employee the API returned `attendance: null`; a direct DB cross-check confirmed that employee genuinely has no attendance rows on the relevant dates (no rows exist in the seeded window), so the computed candidate value correctly displays as redacted/absent. The UTC-based candidate-overtime computation itself is deterministically covered by the unit spec (30/30). `hr_attendance.overtime_minutes` was never written.

---

## 3. Frontend

| File | Change |
|------|--------|
| `frontend/src/services/hrOvertimeService.ts` | Types (`OvertimeRecord`, `OvertimeDetail`, filters, payloads, options), status constants + `STATUS_LABELS/COLORS`, `toQuery`, calls for list/options/getById/history/create/update/approve/reject/delete | created |
| `frontend/src/pages/hr/OvertimeApproval.tsx` | Full page: PageHeader, filter bar, 5 `KpiCard`s, antd `Table` (scroll x), Create/Edit modal with validation (employee picker shown when `!self.employeeId`, resolve-shift-from-attendance option, hours 0.01–24), Details modal with history Timeline + Decided-By/At audit, Approve/Reject decision modal (approve defaults hours to requested; reject requires reason ≥ 3 chars), delete confirmation | created |
| `frontend/src/pages/hr/OvertimeApproval.test.tsx` | Present with hardening but **ENVIRONMENT-LIMITED** in jsdom (4/7 pass, 3 antd-Table-row tests time out; identical to the documented HR-07/`LiveMap` jsdom pattern) — see Summary / §8 | created |
| `frontend/src/App.tsx` | `/hr/overtime-approval` route swapped from `HrComingSoon` to `<OvertimeApproval />` | modified |
| `frontend/src/components/layout/navigationConfig.tsx` (+ test) | `/hr/overtime-approval` permission corrected (`hr.attendance.view` → `hr.overtime.view`) and seeded permission list updated | modified |
| TypeScript (`tsc --noEmit`) | PASS |
| Frontend production build | PASS |

Two genuine UI gaps were found and fixed during live verification (both surfaced by the real-browser E2E):
1. **Create payload could omit `employeeId`** when the logged-in user had a mapped `self.employeeId` (payload would 400). The handler now always resolves the target person (`form value ?? self.employeeId`) and sends it.
2. **Edit mode required an employee** even though the employee picker is intentionally hidden while editing (silently blocked saving). The employee requirement now applies only in create mode.

---

## 4. Playwright Browser E2E (`54/54 PASS`)

Script `D:\ERP-MRP-PWI-2026\hr08-e2e.cjs` (repo-root evidence, matching the `hr06-e2e.cjs`/`hr07-e2e.cjs` convention; uses the already-running backend 3001 + frontend dev 3000; seeds temp rows via API; injects token + theme prefs; drives the real UI; cleans all temp rows in `finally`).

| Check | Result |
|-------|--------|
| API phase: unauth 401, login, options, clean-date selection, seed tempA + tempB (201); baseline total restored at end | PASS |
| 1400 light: theme applied, page title + sidebar active nav, KPI Pending = 2, table rows = 2, tempA row shows refNo `OT-`, Pending tag, employee code, requested hours, **no horizontal overflow** | PASS |
| View modal: opens, shows refNo + reason (candidate-OT display path) | PASS |
| Edit modal: remark edited → saves, closes, API reflects `... edited` | PASS |
| Create via UI: modal field entry → tempC row appears PENDING, toast `Overtime request submitted successfully.`, KPI Pending = 3, row persisted | PASS |
| Duplicate via UI (same employee + date) → toast uses the **409** conflict; modal stays open | PASS |
| Status filter APPROVED → 0 rows (screenshot); Reset → 3 rows | PASS |
| Reject via UI → tempB REJECTED (tag + toast `Overtime rejected.`), KPI Rejected = 1 | PASS |
| Approve via UI → tempC APPROVED (tag + toast `Overtime approved successfully.`), KPI Approved = 1, KPI Pending = 1 | PASS |
| Audit via view on the approved row: decision remarks + Decided At + ledger history | PASS |
| No page/console errors in the browser phase | PASS |
| 768 light / 390 light: rows render, **no horizontal overflow** | PASS |
| 1280 dark: dark theme applied, rows render, **no horizontal overflow**, no console errors | PASS |
| Cleanup in `finally` (hard-delete flagged temp rows; history cascaded; both marker families removed) → **baseline 0/0 restored** | PASS |

Screenshots preserved under `docs/evidence/hr08/` (10 files): `01-1400-light`, `02-view-modal`, `03-edit-modal`, `04-create-modal`, `05-filter-approved-empty`, `06-approve-modal`, `07-view-approved-audit`, `08-768-light`, `09-390-light`, `10-1280-dark`.

---

## 5. Tests

| Suite | Result |
|-------|--------|
| Backend HR module (8 suites incl. new `hr-overtime.service.spec.ts` — 30 tests covering lifecycle, guards 401/403, duplicate 409, validity 400, status machine, scoping, UTC candidate computation, ledger history, soft-delete, filters/summary) | **172/172 PASS** |
| Frontend `tsc --noEmit` | PASS |
| Frontend production build | PASS |
| Playwright browser E2E | **54/54 PASS** |
| Live API checks | **19/19 PASS** |
| Final DB object + baseline verification | **10/10 PASS** |

Note: `OvertimeApproval.test.tsx` is present and partially passing (4/7) but is **ENVIRONMENT-LIMITED** (jsdom antd Table-with-rows starvation on this machine) — 3 row-rendering tests time out and are reported **NOT RUN TO COMPLETION / not PASS** per the verification policy; no product code was weakened and no extreme timeouts were added. The real-browser E2E covers the same surface authoritatively and is fully green.

---

## 6. Regression

| Check | Result |
|-------|--------|
| Backend HR module suite (dashboard, my-attendance, attendance-register, shift-roster, live-map, leave-requests, regularizations, overtime) | **172/172 PASS** |
| Frontend modified nav config suite (`navigationConfig.test.tsx`, incl. seeded `hr.overtime.view`) | **22/22 PASS** |
| Existing HR routes untouched; `/hr/overtime-approval` registered with the corrected permission | PASS |
| DB baseline restored after all verification (0 rows in `hr_overtime` and `hr_overtime_history`, migration objects present) | PASS |

Backend server was rebuilt (`tsconfig.build.json` + `nest build`) and restarted once so the running `dist/main.js` served the new overtime routes; the old process was serving stale dist. The listener (3001) serves the new build, health re-verified via the 401/201 live checks above; no duplicate processes remain.

---

## 7. Cleanup

- Removed this session's temp artifacts from the OS temp dir: `_hr08-apply.cjs`, `_hr08-verify-schema.cjs`, `_hr08-verify-api.cjs`, `_hr08-inspect.cjs`, `_hr08-dbcheck.cjs`, `_hr08-cleanup.cjs`, `_hr08-editdebug.cjs`, `_hr08-final-schema.cjs` (all HR08-LIVE-VERIFY and HR-08 E2E test rows hard-deleted, both marker families).
- Kept as evidence: `hr08-e2e.cjs` (repo root, per `hr07-e2e.cjs` convention) and `docs/evidence/hr08/*.png` (10 screenshots).
- Live DB verified at baseline in the finalization pass (read-only; credentials never printed): `hr_overtime = 0`, `hr_overtime_history = 0`, tables + 4 indexes + 5 permissions + role grants (SUPER_ADMIN 5 / ADMIN 4 / MANAGEMENT 1 / REPORT_VIEWER 1) + 8 RLS policies all present. No temporary test records remain.

---

## 8. Environment Notes / Limitations (honest reporting)

- **jsdom table limitation:** On this machine, antd `Table` rendered with real data rows starves the jsdom main thread for ~40–90 s. `OvertimeApproval.test.tsx` therefore reports **4/7 passed, 3 row-rendering tests ENVIRONMENT-LIMITED (time-out) — NOT RUN TO COMPLETION / not PASS**; this matches the pre-existing `LiveMap.test.tsx` and `Regularizations.test.tsx` signatures. Per the verification policy nothing was weakened (no table removal, no inflated timeouts). Real-browser verification (Playwright E2E **54/54**) is the authoritative UI verification and includes the real table with rows.
- **Unrelated parallel work:** `git status` shows modified production-entry and item-master files from active parallel tasks. HR-08 added `backend/tsconfig.build.json` (the standard Nest build config the repo lacked), so the previously-documented full-build blocker (stale `item.service.spec.ts` compiled during `nest build`) no longer affects production builds; the HR module itself type-checks and tests cleanly (172/172).
- The backend (fresh `dist`) continues serving on 3001; the frontend dev server on 3000 remains running. No processes were duplicated.
- Login verified with `system.admin@erp.com`; working credentials, record IDs, and company/employee identifiers are intentionally NOT recorded in this report.
- **No commits were made.**

---

## 9. Final Acceptance (§34)

| # | Acceptance Check | Status |
|----|------------------|--------|
| A1 | Migration `20260923000000_erp_00062_hr_overtime.sql` present in `supabase/migrations/`, applied to the live DB, idempotent (re-applied ×3, all OK) | ACCEPT |
| A2 | DB objects verified live: `hr_overtime` + `hr_overtime_history`, 4 indexes (incl. `uq_hr_ot_active`), 8 RLS policies, 5 `hr.overtime.*` permissions, role grants (SUPER_ADMIN 5, ADMIN 4, MANAGEMENT 1, REPORT_VIEWER 1), baseline 0/0 rows | ACCEPT |
| A3 | Backend overtime endpoints exposed and permission-gated (`hr.overtime.view/create/update/approve/delete`): options, list+summary, getById, history, create, update, approve, reject, delete — all company-scoped server-side | ACCEPT |
| A4 | Lifecycle correctness: duplicate → 409; future date / inactive employee / blocked attendance status → 400; decided requests immutable → 400; requester-only edit → 403; delete soft-deletes PENDING and hides it (404 after); approve/reject write audit + ledger history (`changedFields` accurate) | ACCEPT |
| A5 | Candidate overtime is computed (UTC check-out vs scheduled shift end) and display-only; `hr_attendance.overtime_minutes` never written | ACCEPT |
| A6 | Backend HR module tests **172/172** (incl. new `hr-overtime.service.spec.ts` 30/30) | ACCEPT |
| A7 | Live API verification **19/19** PASS against the running backend on 3001 | ACCEPT |
| A8 | Frontend: `/hr/overtime-approval` route renders the new page (was placeholder); nav permission corrected to `hr.overtime.view` (+ nav test seeded list updated) | ACCEPT |
| A9 | Frontend `tsc --noEmit` PASS and production build PASS | ACCEPT |
| A10 | Playwright browser E2E **54/54** PASS (create/edit/view/approve/reject/duplicate-409/filters/delete, responsive 768/390, dark 1280, no overflow/console errors, cleanup restores baseline) | ACCEPT |
| A11 | Regression: backend HR **172/172**, modified nav test **22/22**; pre-existing jsdom antd Table limitation documented as ENVIRONMENT-LIMITED (never claimed PASS); no unrelated modules modified | ACCEPT |
| A12 | Cleanup verified: DB at baseline (0/0 rows), temp artifacts removed, evidence preserved (`hr08-e2e.cjs`, `docs/evidence/hr08/`) | ACCEPT |
| A13 | No credentials or secrets recorded in this report; no commits made | ACCEPT |

## FINAL VERDICT: COMPLETE — ACCEPTED

- The Overtime Approval workflow is fully functional against the live API: real option/employee/shift data, truthful KPIs, status-controlled lifecycle (PENDING → APPROVED/REJECTED) with duplicate prevention (409 partial-unique index), validity guards (400), decide-once and requester-only protections (400/403), an auditable ledger history, and a computed display-only candidate overtime in UTC.
- All verification layers green where they can run on this environment: backend HR **172/172**, live API **19/19**, Playwright browser E2E **54/54**, frontend `tsc` + production build, final DB object/baseline **10/10**. The new frontend jsdom suite is honestly reported ENVIRONMENT-LIMITED (never PASS) for the same machine-wide antd-Table-in-jsdom reason documented in HR-07.
- Cleanup verified: live DB at baseline, temp artifacts removed, screenshots preserved under `docs/evidence/hr08/` for human review.