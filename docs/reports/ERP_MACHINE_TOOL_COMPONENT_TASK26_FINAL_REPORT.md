# ERP — Machine Tool Component — TASK26 FINAL REPORT

**This is the canonical, single TASK26 report at the user-confirmed root path (no duplicates).** It documents TASK26 (base lifecycle work, originally completed) plus **TASK26-A** — the Division/Section active-only lookup + Tool Life History route fixes that followed the last TASK26 test run. Auth was never weakened; no auth path was granted.

**Date:** 2026-09-13 · **Status:** COMPLETE (live-verified where auth allowed) · **No commit, no TASK27 start**

## 1. Life-report route root cause

The "Cannot GET /api/v1/machine-tooling/life-report" was **NOT a source-level route mismatch**.

- `backend/src/modules/machine-tooling/controllers/tool-lifecycle.controller.ts` fully registers the route:
  - `@Controller('machine-tooling')`
  - `@Get('life-report')` — method `lifeReport()` with `@RequirePermission('manufacturing.component_change.view')`, `@RequireOrgScope()`
  - `@UseGuards(SupabaseJwtGuard, PermissionGuard)` at class level, `PermissionGuard` re-stated per route
- `query` contract = `LifeReportQueryDto` (`tool-lifecycle.dto.ts`) — `page`, `limit`, optional `machineId / componentId / dispositionType / status / from / to / search` — matches the frontend call exactly (`/machine-tooling/life-report` with `page`, `limit`).
- `machine-tooling.module.ts` registers `ToolLifecycleController` + `ToolLifecycleService`.

→ Root cause: the **running process (PID 7532) was a stale `dist`** built before the lifecycle controller existed. The source was correct; the compiled bundle the process was serving was not.

## 2. Stale dist — the actual fix

- Rebuilt: `backend npm run build` → `nest build` completed (verified no errors).
- Restarted the backend with a fresh process from the new `dist/main` (new PID 18772).
- Confirmed the old process (PID 7532) was terminated and the new build is what is now served.

## 3. /health verification

- `GET http://localhost:3001/api/v1/health` → `200` `{"status":"ok","timestamp":"2026-09-13T08:20:09Z","environment":"development","uptime":64s}` (immediately after restart).
- Second check later in the session → still `200 ok`, uptime ~2678s, fresh build PID 18772.

## 4. Life-report unauthenticated 401 verification

- `GET http://localhost:3001/api/v1/machine-tooling/life-report?page=1&limit=20` **without** a Bearer JWT → **401 Unauthorized**.
- This single result proves:
  1. The route is now **matched** (no more "Cannot GET" — that is 404); a 401 means the request reached the route and was stopped by the JWT/org-scope guards.
  2. The guards are **active and correctly protecting** the endpoint.
- It was **not** weakened; authentication was intentionally left fully in place (explicit instruction: do not bypass/disable auth).

## 5. Whether an authenticated 200 was possible

The environment does not provide a way to mint a valid signed JWT (needs service-account secrets/credentials that are not available here). Per the acceptance gate:

> "Unauthenticated request returned 401, confirming the route is registered and protected; authenticated 200 response was not executed in this environment."

That is the accurate statement. No JWT was invented, no guards were disabled, and no evidence was fabricated.

## 6. Machine Master — active-only Division / Section

- Backend `division.service.findAll` (status filter at lines ~55-56) and `section.service.findAll` (lines ~57-58) already accept `status: 'ACTIVE'` — **reused**, no new API/table/route/param invented.
- `frontend/src/pages/master-data/MachineManagement.tsx`:
  - Lookup fetch now sends `status:'ACTIVE'` for `/divisions`, `/sections`, `/departments` (lines ~655-658) — new selections expose only ACTIVE rows.
  - Edit modal Division select (Form.Item lines ~2126-2135) and Section select (lines ~2136-2146): a **stored inactive value is echoed as a tagged `(Inactive)` non-selectable option** (options include an entry carrying the stored id, labeled `"<name> (Inactive)"`, `disabled: true`) so an already-saved inactive org value stays visible/preserved but is not re-selectable as a *new* choice.

## 7. Machine Targets — active-only Division / Section

- `frontend/src/pages/production/TargetManagement.tsx` already requests `/divisions`, `/sections`, `/departments` with `status:'ACTIVE'` (lookup lines ~433-437). Confirmed — no change required; new selections already ACTIVE-only.

## 8. Item Master org selects + Item form cascading

- `ItemManagement.tsx` Division/Section/Department lookups (`/divisions`,`/sections`,`/departments`) and cascading selects were already `status:'ACTIVE'` (lines ~672-674; form selects ~2126-2148) — verified, no change.

## 9. Stored-inactive echo policy (user-confirmed)

All inactive-origin values that are already stored on an existing record remain **visible and preserved** as tagged non-selectable options in the edit forms (echo pattern); they can never be picked as a new selection:

- `MachineManagement.tsx` Machine Master + edit modal (Division/Section echo above) ✓
- `TargetManagement.tsx` Machine Targets — ACTIVE-only lookups + no stored echo required (references are lookup-only) ✓

No raw UUID is ever displayed to the user; no fake inactive value is invented; inactive option never appears as a normally-selectable option.

## 10. Files changed (frontend-only + backend rebuild only)

**Frontend (TASK26-A active-only + echo):**
- `frontend/src/pages/master-data/MachineManagement.tsx`

**Backend — NO source change:**
- Rebuilt (`dist`) only; controller/DTO/service/module were already correct. No API/table/route added.

No new tables, no new routes, no new DTOs, no DB migrations, no auth weakening.

## 11. Tests

- Frontend `npx tsc --noEmit`: clean for the edited files; the only error is a **pre-existing, unrelated** baseline in `src/pages/__tests__/permission-gating.test.ts:1 → Cannot find module 'vitest'` (unrelated to TASK26-A; present before this change).
- Jest suites: the `expect is not defined` at global `jest-dom` extend is a **pre-existing environment baseline**, not introduced by TASK26-A (verified it fails on the same untouched gate). TASK26-A made no assertions changes to the baseline gate.

## 12. Known baseline/unrelated failures (not caused by TASK26-A)

1. `permission-gating.test.ts` — TS2307 `Cannot find module 'vitest'` (pre-existing).
2. Global `expect is not defined` at jest-dom setup (pre-existing environment issue).

Neither is introduced by, nor resolvable within, TASK26-A.

## 13. Browser verification

Phase 8 Playwright browser-matrix was not executed in this session. The live **backend route verification was performed over HTTP** (see sections 3-5). If a full Playwright matrix is required, it needs the authenticated JWT capability that this environment could not provide — recommend running it in the CI/auth-capable environment that can issue real tokens.

## 14. Explicitly NOT done

- TASK27 not started.
- No commit made.
- No auth weakened/disabled.
- No new API, table, route, migration added for the active filter.
- Authenticated 200 for life-report NOT claimed (no valid JWT available).

— End of TASK26-A section —
