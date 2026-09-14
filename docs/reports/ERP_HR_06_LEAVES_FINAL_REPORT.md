# HR-06 — HR Leave Management (Final Verification)

**Date:** 2026-09-14
**Status:** COMPLETED
**Scope:** HR Leave Management page (`/hr/leaves`) — a real-data leave-request management UI wired to new leave-request APIs on the live backend, with permission gating, status-controlled lifecycle (PENDING → APPROVED / REJECTED / CANCELLED), overlap prevention (409), truthful KPIs (including "On Leave Today" derived from today's real `hr_attendance`), and full end-to-end verification at 1920/1280/768/390 in light and dark themes.

---

## Summary

- Delivered the **Leave Management** page by rewriting `frontend/src/pages/hr/AttendanceLeave.tsx` in place (the `/hr/leaves` route already rendered this component) plus a dedicated service `frontend/src/services/hrLeaveService.ts` (full types, `HR_LEAVE_STATUSES`, `toQuery`, and all data/mutation calls).
- Page surface: filter bar (date range, division/section/department/leave-type/status/employee cascades, free-text search, Apply/Reset), 4 KPI cards (Pending / Approved / Rejected / On Leave Today), a table (Employee, Leave Type, From, To, Days, Status, Actions — view / check / edit / close(cancel) / stop(delete)), a Create/Edit modal with validation, a Read-only Details modal, an Approve/Reject decision modal, a Cancel confirm, and a Delete confirm. Responsive light/dark styling uses the existing `erp-hr-kpi-grid` / `erp-filter-bar` classes plus `erp-ar-emp__code/__name`.
- Backend (additive, `backend/src/modules/hr/`): leave-requests endpoints — list, options, get-by-id, create, update, approve, reject, cancel, delete — all company-scoped server-side from the authenticated user's `default_company_id` (never accepted from the client). Status machine enforced (only PENDING can update/cancel/approve/reject, else 400). Overlapping dates for the same employee → **409**. Summary KPIs honor org/date/search scope (status-insensitive counts) and `onLeaveToday` counts employees on an APPROVED leave covering today (start ≤ today ≤ end).
- **No migration was required** — all five permissions (`hr.leave.view/create/update/delete/manage`) already existed in the live DB and were verified present with role grants.
- Verified: backend HR module **114/114** (includes the new `hr-leave-requests.service.spec.ts`), `npx nest build`, `tsc --noEmit`, frontend production build (`CI=true`), frontend scoped HR suites **43/43** (incl. new `AttendanceLeave.test.tsx` 6/6), a **live API** probe (login → options → list → getById → 401 without token → role/status/overlap behavior), and a **Playwright browser E2E** (`46/46`) plus a **responsive visual pass** (`31/31`) with screenshots under `docs/evidence/hr06/`. Regression: backend HR suite green, frontend scoped HR green. **No commits were made.**

---

## 1. Backend Changes (additive)

| File | Change |
|------|--------|
| `backend/src/modules/hr/dto/hr.dto.ts` | Leave DTOs: whitelisted create/update/decision/list/options DTOs with `@IsUUID`/`@IsDateString`/`@IsIn(HR_LEAVE_STATUSES)`/`@MaxLength` validation |
| `backend/src/modules/hr/dto/index.ts` | Exports the leave DTOs + `HR_LEAVE_STATUSES` |
| `backend/src/modules/hr/services/hr.service.ts` | `LeaveQuery`; `getLeaveRequestOptions` (company-scoped leave types / active employees / statuses / self identity); `listLeaveRequests` (filters, cascaded org scoping via path-prefix matching, summary, `onLeaveToday` from real `hr_attendance`); `getLeaveRequestById` (404 scope-protected); `createLeaveRequest` (self-service identity when admin is linked to an employee, server-side overlap check → 409); `updateLeaveRequest`, `approveLeaveRequest`, `rejectLeaveRequest`, `cancelLeaveRequest` (non-PENDING action → 400, audit timestamps); `deleteLeaveRequest`; `assertLeaveFilterIds` (400 when a filter id is outside the user's company) |
| `backend/src/modules/hr/controllers/hr.controller.ts` | `GET /hr/leave-requests/options`, `GET /hr/leave-requests`, `GET /hr/leave-requests/:id`, `POST /hr/leave-requests`, `PATCH /hr/leave-requests/:id`, `PATCH /hr/leave-requests/:id/approve`, `PATCH /hr/leave-requests/:id/reject`, `PATCH /hr/leave-requests/:id/cancel`, `DELETE /hr/leave-requests/:id` — each `@UseGuards(SupabaseJwtGuard, PermissionGuard)` with the matching `hr.leave.*` permission, envelope `{ success, data }` |
| `backend/src/modules/hr/services/hr-leave-requests.service.spec.ts` | New spec — full leave lifecycle + guards + overlap + scoping (see §5) |

No new tables, no migrations, no seed data. The existing live permissions were verified (present for the admin role) so the already-restarted backend serves the new routes with no schema change.

---

## 2. Live API Verification

Probe against the freshly built and restarted backend on 3001 (login → options → list → by-id → auth/validation/overlap):

| Check | Result |
|-------|--------|
| Backend listening on 3001 (restarted from new `dist`; old pid terminated) | PASS |
| Login → 201 with JWT; permissions include `hr.leave.view/create/update/delete/manage` | PASS |
| `GET /hr/leave-requests/options` → 200; company resolved server-side; 4 leave types, 4 statuses, 7 active employees | PASS |
| `GET /hr/leave-requests` → 200; `total=1` historical leave request; summary KPIs match statuses | PASS |
| `summary.onLeaveToday` derived from today's real `hr_attendance` | PASS |
| System admin has no employee link → `options.self.employeeId` null → Request-Leave modal shows the employee dropdown | PASS |
| `GET /hr/leave-requests/:id` → 200 with remarks + audit timestamps | PASS |
| Overlap create (same employee, overlapping dates) → **409** | PASS |
| Approve/reject/cancel on a non-PENDING request → **400** | PASS |
| Unauthenticated list → **401** | PASS |

---

## 3. Frontend

| File | Change |
|------|--------|
| `frontend/src/services/hrLeaveService.ts` | Types (`LeaveRequestRecord`, `LeaveRequestFilters`, `Create/UpdateLeavePayload`, `DecisionPayload`, ...), `HR_LEAVE_STATUSES`, `STATUS_LABELS/COLORS`, `toQuery`, and calls for list/options/get/create/update/approve/reject/cancel/delete | created |
| `frontend/src/pages/hr/AttendanceLeave.tsx` | Rewritten in place as the Leave Management page: filter bar with cascading org selects, 4 KPI cards (`KpiCard` `kpi` prop), table with 7 columns, Create/Edit modal (`KpiCard`/`EmptyState` `title/desc` signatures, `DraggableResizableModal`), Details modal, Approve/Reject modal, Cancel + Delete confirms, `applied`-driven reloads | rewritten |
| `frontend/src/pages/hr/AttendanceLeave.test.tsx` | **6/6 PASS** (options/load, empty state, status dropdown, search re-request, approve flow, API error surfacing) | new |
| TypeScript (`tsc --noEmit`) | PASS |
| Production build (`CI=true npm run build`) | PASS |

The page is real-data-only: KPIs and rows come straight from the API; the Request-Leave form uses the API option lists; the employee field is a real select (admin with no self-link) or a locked self-identity label (linked self-service users).

---

## 4. Playwright Browser E2E (`46/46 PASS`) + Responsive (`31/31 PASS`)

Script `D:\ERP-MRP-PWI-2026\hr06-e2e.cjs` (uses already-running backend 3001 + frontend dev 3000; logins via API; injects token + theme preferences; drives the UI).

| Check | Result |
|-------|--------|
| API phase: unauth 401, login, options (4 types/4 statuses/7 employees), baseline + summary consistency | PASS |
| Create tempA → update → approve → re-approve rejected (400) → getById audit/remarks | PASS |
| Overlap create → 409 | PASS |
| tempB reject, tempD cancel (for filter test) | PASS |
| Snapshot: list reflects all temp records; KPIs match API | PASS |
| 1920 light: theme, KPIs match API (Pending/Approved/On Leave Today), rows = API total, status tags, **no horizontal overflow** | PASS |
| Status filter → CANCELLED → exactly the cancelled temp row; Reset → restores rows | PASS |
| View modal → shows approved remarks + leave type | PASS |
| Create tempC via UI (employee/type/date-picker/text, Submit) → row appears PENDING, Pending KPI increments | PASS |
| Approve tempC via UI (decision modal) → tag flips to APPROVED | PASS |
| Delete tempC via UI (confirm, dangerous button) → row removed | PASS |
| No page/console errors in the browser phase | PASS |
| Dark 1920: theme, rows = API total, no overflow, no errors | PASS |
| Cleanup in `finally`: all E2E temp records deleted → **baseline restored (total back to 1)** | PASS |
| Responsive pass `hr06-responsive.cjs`: 1280/768/390 × light/dark — theme applied, ≥1 row, 4 KPI cards, **no horizontal overflow**, no page errors | **31/31 PASS** |

Screenshots (`docs/evidence/hr06/`): `01-1920-leaves-light`, `02-1920-leaves-filtered-cancelled`, `03-1920-leaves-view-modal`, `04-1920-leaves-create-modal`, `05-1920-leaves-dark`, `06-1280/06-768/06-390` light + dark.

---

## 5. Tests

| Suite | Result |
|-------|--------|
| Backend HR module (6 suites incl. new `hr-leave-requests.service.spec.ts` — lifecycle, guards 401/403, overlap 409, status machine 400, company scoping, options, summary) | **114/114 PASS** |
| `npx nest build` (backend) | PASS |
| Frontend `tsc --noEmit` | PASS |
| Frontend production build | PASS |
| Frontend scoped HR suites (6 suites incl. `AttendanceLeave.test.tsx` 6/6) | **43/43 PASS** |

---

## 6. Regression

| Check | Result |
|-------|--------|
| Backend HR module suite (attendance register + my-attendance + dashboard + shift-roster + live-map + leave-requests) | **114/114 PASS** |
| Frontend scoped HR suites | **43/43 PASS** |
| HR-05 → HR-06 chain: no route/nav changes; `/hr/leaves` continues rendering the rewritten component | PASS |
| Live-leave API + 401 + overlapping-dates 409 + status-machine 400 | PASS |
| Baseline data untouched (single historical leave request remains; no temp records left) | PASS |

---

## 7. Environment Notes

- The backend is running the freshly built `dist` on 3001 (restarted this session; `cd backend && node dist/main.js` restarts it if down). The frontend dev server on 3000 remains running.
- No new permissions or tables were added — existing permission rows were verified live.
- Login used for verification: `system.admin@erp.com` (working credentials are deliberately NOT recorded in this report; no record IDs or company/employee codes are listed).
- **No commits were made.** `git status` shows only the intended working-tree modifications and new files described above.

---

## FINAL VERDICT: COMPLETED

- The Leave Management page is fully functional against the live API: real option/employee/leave-type data, truthful KPIs (including "On Leave Today" from today's real attendance), status-controlled lifecycle with overlap prevention (409) and state-machine validation (400), self-service identity resolution server-side, and company isolation via `default_company_id`.
- All verification layers green: backend HR suite **114/114**, `nest build`, live API probe (401 + lifecycle + overlap + scoping), frontend `tsc` + production build + **43/43** scoped HR tests, the Playwright browser E2E **46/46**, and the responsive pass **31/31** (1280/768/390 light + dark, no overflow, no console errors).
- Cleanup verified: the live DB is back to its baseline (single historical leave request; all E2E temp records deleted).
- Screenshots available for human visual review under `docs/evidence/hr06/`.