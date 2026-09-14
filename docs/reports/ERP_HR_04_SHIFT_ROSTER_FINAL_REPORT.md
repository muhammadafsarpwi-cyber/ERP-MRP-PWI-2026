# HR-04 — Shift Roster Page (Final Verification)

**Date:** 2026-09-14
**Status:** COMPLETED
**Scope:** Shift Roster page (`/hr/shift-roster`) — full CRUD view for assigning active shifts to employees on a chosen roster date, plus backend enhancements (shift timing data in roster options, audit trail on single-record fetch) and end-to-end verification. Scope discipline followed: no disabled auth/permissions/company isolation, no fabricated metrics (unassigned counts are DERIVED from real employees), no redesign of unrelated HR features.

---

## Summary

- Delivered the **Shift Roster** page (`frontend/src/pages/hr/ShiftRoster.tsx`) with: date picker, division/section/department/shift/assignment filters, employee search, Apply/Reset, 4 KPI cards (Total Employees / Assigned Today / Unassigned / Active Shifts), a status-bar chip row (ALL + per-shift breakdown + UNASSIGNED), an assignments table (Employee, Division, Section, Department, Shift, Shift Start, Shift End, Roster Date, Assignment, Attendance, Actions), Add/Edit modal with org + shift read-only previews, a detail/view modal with audit trail, an unsaved-draft discard confirmation, a checkmark success modal, and pagination.
- Backend enhancements (additive, `backend/src/modules/hr/services/hr.service.ts`): `getShiftRosterOptions` shifts now carry `startTime`, `endTime`, `workingHours`; `getShiftRosterById` returns an `audit` block (`createdAt`/`updatedAt` as `YYYY-MM-DD HH24:MI` UTC, `createdBy`/`updatedBy` display names via `ErpUser` joins); `mapRosterRow(row, includeAudit = false)` gained the flag.
- Wired the route in `App.tsx`; nav entry now uses the dedicated `hr.shift_roster.view` permission (`navigationConfig.tsx` + seeded-permission test list updated).
- Verified: backend 34/34 (roster) and 68/68 (all HR) unit tests, `nest build`, frontend production build, `tsc`, 52 frontend tests (4 HR suites + navigationConfig), a self-contained **live API** script (`28/28`), and a **Playwright browser E2E** (`36/36`) with 8 UI screenshots saved to `docs/evidence/hr04/`.

---

## 1. Backend Changes

| File | Change |
|------|--------|
| `backend/src/modules/hr/services/hr.service.ts` | `getShiftRosterOptions`: shift objects now include `startTime`, `endTime`, `workingHours` (nullable) |
| `backend/src/modules/hr/services/hr.service.ts` | `getShiftRosterById`: selects `created_at`/`updated_at` (formatted UTC), joins `erp_users` for `created_by_name`/`updated_by_name`; passes `includeAudit = true` |
| `backend/src/modules/hr/services/hr.service.ts` | `mapRosterRow(row, includeAudit = false)` — new optional param; `audit` block only when requested |
| `backend/src/modules/hr/services/hr.service.ts` | Both `.map` call sites in `fetchRosterRecords` / `fetchUnassignedEmployees` fixed to `rows.map((row) => mapRosterRow(row))` (no behavior change) |
| `backend/src/modules/hr/services/hr-shift-roster.service.spec.ts` | Options assertion updated: `shifts` = `[{ id, code, name, startTime: null, endTime: null, workingHours: null }]` |

No entity, DTO, controller, or permission changes were required. The unique index `uq_hr_roster_active (company_id, employee_id, roster_date, shift_id) WHERE is_active = true` was confirmed present in the live DB and powers duplicate-assignment rejection.

---

## 2. Live API Verification (`28/28 PASS`)

Single self-contained script (`C:\Users\afsar\AppData\Local\Temp\opencode\hr04_api_verify.cjs`) that boots the freshly built `dist/main.js`, runs every check, and shuts it down:

| Check | Result |
|-------|--------|
| Backend boots and listens on 3001 | PASS |
| Login (`system.admin@erp.com`) returns 201 + token | PASS |
| `GET /hr/shift-roster/options` → 200; `today` = 2026-09-14 | PASS |
| Options shifts carry timing fields (`startTime`/`endTime`/`workingHours`) — e.g. S-1 `08:00:00`–`16:00:00`, 8h | PASS |
| Options `employees` (7), `divisions` (9) | PASS |
| `GET /hr/shift-roster?rosterDate=…` → 200; summary `{totalEmployees:7,assigned:0,unassigned:7,activeShifts:3,…}`; records `[]`; `shiftBreakdown[3]` | PASS |
| Create assignment → 201, returns id (createdAt/updatedAt populated) | PASS |
| List reflects the created row (`0 → 1`, matching id) | PASS |
| Duplicate assignment rejected with `This employee is already assigned…` | PASS |
| `GET /hr/shift-roster/:id` → 200 with `audit` (`createdAt 2026-09-14 05:22`, `createdBy System Admin`) and shift timing | PASS |
| PATCH (remarks) → 200, remarks persisted | PASS |
| DELETE → 200; byId → 404 afterwards; list returns to original row count | PASS |
| `assignment=unassigned` → 7 rows with `id:null` / `shift:null` | PASS |
| Bad date + smuggled `companyId` → 400 (whitelist/validation intact) | PASS |

---

## 3. Frontend

| Check | Result |
|-------|--------|
| `frontend/src/services/hrShiftRosterService.ts` (types + options/roster/byId/create/patch/delete) | created |
| `frontend/src/pages/hr/ShiftRoster.tsx` | created (full page per spec) |
| `App.tsx` route `/hr/shift-roster` → `<ShiftRoster />` | wired |
| `navigationConfig.tsx` Shift Roster permission `hr.shift_roster.view` | updated |
| `hr-dashboard.css` — `.erp-roster-statusbar`, `.erp-roster-chip*`, `.erp-roster-add-btn` | added |
| `navigationConfig.test.tsx` seeded-permission set | `hr.shift_roster.view` added |
| TypeScript (`tsc --noEmit -p tsconfig.json`) | PASS, no output |
| Production build (`npm run build`) | PASS — build folder ready |

---

## 4. Frontend Tests

| Suite | Result |
|-------|--------|
| `ShiftRoster.test.tsx` | **10/10 PASS** |
| `MyAttendance.test.tsx` + `AttendanceRegister.test.tsx` + `HrDashboard.test.tsx` | **20/20 PASS** |
| `navigationConfig.test.tsx` | **22/22 PASS** |
| **Total (5 suites)** | **52/52 PASS** |

---

## 5. Playwright Browser E2E (`36/36 PASS`)

Script `D:\ERP-MRP-PWI-2026\hr04-e2e.cjs` (spawns backend child, logins via API, injects token, drives the UI at `127.0.0.1:3000`). Clean starting state enforced (live roster had 0 rows; any leftover E2E records removed up front and verified at the end).

| Check | Result |
|-------|--------|
| Page header `Shift Roster`, KPIs `7 / 0 / 7 / 3` empty state | PASS |
| Status bar chips = 5 (ALL + 3 shifts + UNASSIGNED); UNASSIGNED chip = 7 | PASS |
| Empty table state text (`No shift assignments recorded for this date`) | PASS |
| Unassigned view via chip → 7 rows, each with an `Assign employee` action | PASS |
| Assign via header button → modal; roster date prefilled `2026-09-14`; shift timing preview (`08:00`) visible | PASS |
| Create → success modal `Shift Assigned Successfully`; KPIs → `1 / 6` | PASS |
| Table shows EMP-001 row; ALL chip = 1; S-1 chip filter → exactly 1 row | PASS |
| View detail → audit (`Created by System Admin`, dates) + `Shift hours 08:00:00 – 16:00:00` | PASS |
| Edit → save → `Assignment Updated Successfully`; remarks persisted; `updatedAt` differs from `createdAt` | PASS |
| Duplicate create → rejected with `already assigned` message | PASS |
| Unsaved-draft guard → `Discard this draft?` confirm offered; Discard works | PASS |
| Delete → confirm `Remove this roster assignment?` → row removed, KPIs back to `0 / 7` | PASS |
| No lingering E2E records server-side | PASS |
| No unexpected page/console errors (only the expected 400 from the duplicate test) | PASS |

Screenshots (`docs/evidence/hr04/`): `01-roster-empty`, `02-unassigned-filter`, `03-add-modal-filled`, `04-success-modal`, `05-view-detail`, `06-update-success`, `07-duplicate-error`, `08-restored-empty`.

---

## 6. Regression

| Check | Result |
|-------|--------|
| Backend build (`npx nest build`) | PASS |
| Backend roster spec | **34/34 PASS** |
| Backend HR suite (4 suites) | **68/68 PASS** |
| Frontend build + `tsc` | PASS |
| HR frontend suites + `navigationConfig` (5 suites) | **52/52 PASS** |
| Layout/shared component suites (2 suites) | **28/28 PASS** |
| Live API verification | **28/28 PASS** |
| Browser E2E | **36/36 PASS** |
| No leftover roster data | confirmed (records returned to 0) |

Note: the repository-wide frontend jest run exceeds 25 minutes and was intentionally not waited to completion; all suites touching the changed surface (HR, navigation, layout/shared) are green.

---

## 7. Environment Notes

- The backend runs `node dist/main.js`. It was restarted to serve the enhanced build; the sandbox terminates background processes spawned from the tool session at command boundaries, so if `http://localhost:3001` is not listening during manual browsing, start it with `cd backend && node dist/main.js` (or `npm run start:dev`). The frontend dev server on port 3000 remains running.
- No commits were made.

---

## FINAL VERDICT: COMPLETED

- Shift Roster page fully functional against the live API: filter, assign (single & per-employee), edit, view with audit trail, duplicate protection, delete with confirmation, unsaved-draft guard, and truthful empty state (no fabricated metrics).
- KPI/status-bar numbers derive from real employee/shift data; company isolation and permission gating unchanged.
- All verification layers green: unit specs, build/typecheck, live API (28/28), browser E2E (36/36), regression green.
- Screenshots available for human visual review under `docs/evidence/hr04/`.