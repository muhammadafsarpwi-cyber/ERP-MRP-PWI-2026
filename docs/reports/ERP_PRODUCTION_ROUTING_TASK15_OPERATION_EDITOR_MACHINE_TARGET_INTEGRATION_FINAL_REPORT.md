# TASK 15 — Operation Editor UUID Contract Fix + Machine Target Integration + Reusable OperationEditor

**Date:** 2026-09-12
**Scope:** Fix the confirmed production-routing "divisionId must be a UUID" 400 error (synthetic org UUID seed data vs strict class-validator `@IsUUID`); add Machine Target integration into operation editing; extract a reusable `OperationEditor.tsx`; tests, typecheck, production build, runtime smoke.
**Status:** Implemented & verified (**DO NOT COMMIT** per instructions). Includes **Task15-A**: Routing Operation `companyId` Payload Contract fix (CASE B) and **Task15-B**: Save / Processing / Success UX for the Routing, Routing Operation and Route Type forms.

---

## 1. Objective

- Production → Routing → "Add Operation" failed with a backend `400 divisionId must be a UUID` when the user picked the seeded `DIV-CCD` division. Root cause was **definitively confirmed against the live API** (see §3): organisation seed data uses *synthetic* UUIDs with version nibble `0` (PostgreSQL `uuid` type accepts them), while NestJS class-validator's strict `@IsUUID()` (v1/v3/v4/v5) rejects them.
- The routing DTOs must accept synthetic org / item UUIDs using the same **`UUID_LOOSE`** convention the Machine Target module already uses — without disabling validation and without widening fields that must stay strict UUID v4 (machine, UOM, warehouse, product, BOM, route type, company, operation).
- Extract the inline operation editor from `RoutingManagement.tsx` into a reusable `OperationEditor.tsx` powering **both Add and Edit**, keeping the multi-input/output routing graph, Route Types, reorder/duplicate, `sourceWarehouseId`, and legacy single-item sync.
- Integrate a **read-only Machine Target summary** panel into the operation editor (single source of truth = existing `production/machine-targets` module; no new target/rate/capacity system).
- Replace the modal "OK" with a **Save** button and show a centered **`Modal.success()`** confirmation only after the API save succeeds; never swallow backend validation errors.
- Backend: build + restart + full runtime smoke. Frontend: tests + `tsc` + production build. Final report; **no commit**.

---

## 2. Files Changed (this task)

### Backend
- `backend/src/modules/production-routing/dto/production-routing.dto.ts`
  - Added `Matches` import and exported `UUID_LOOSE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/` with a doc comment.
  - Loosened with `@Matches(UUID_LOOSE, { message: 'X must be a UUID' })` on the **organisation chain** (`divisionId`, `sectionId`, `departmentId`) and **item** (`itemId`, legacy `inputItemId`/`outputItemId`) in both `CreateRoutingOperationDto` and `UpdateRoutingOperationDto`.
  - Kept strict `@IsUUID()` on genuine v4 foreign keys: `machineId`, `uomId`, `sourceWarehouseId` (input), `productId`, `bomId`, `routeTypeId`, `operationId`, `companyId`.
- `backend/runtime-smoke-routing.cjs` (extended): new Task-15 section exercising synthetic-UUID org ops + machine-target contract (see §6).

### Frontend
- `frontend/src/pages/production/OperationEditor.tsx` (**new**) — reusable editor component.
- `frontend/src/pages/production/OperationEditor.test.tsx` (**new**) — 5 tests.
- `frontend/src/pages/production/RoutingManagement.tsx` — refactored to use `OperationEditor`; added Machine + Warehouse lookups; added a Machine column to the operations table.

---

## 3. Root Cause (confirmed, not assumed)

Live probes against `http://localhost:3001/api/v1` (dev user) showed the seeded organisation chain uses **synthetic UUIDs**:

- `/divisions` → `DIV-CCD` id = `d1000000-0000-0000-0000-000000000002`
- `/sections` → CCD rows `d2000000-...`
- `/departments` → CCD rows `d3000000-...` (e.g. `d3000000-0000-0000-0000-000000000012`)

These have version nibble `0`. PostgreSQL `uuid` accepts them, but class-validator's strict `@IsUUID()` (v1/v3/v4/v5) returns false → `divisionId must be a UUID`. The Machine Target module already solved the identical problem with the `UUID_LOOSE` regex (`machine-target.dto.ts:18-23`), which accepts 8-4-4-4-12 hex with any version/variant nibble.

---

## 4. Backend Change (`production-routing.dto.ts`)

1. `import { ..., Matches } from 'class-validator';`
2. Export `UUID_LOOSE` (pattern identical to machine-target's `UUID_LOOSE`).
3. Swap validation on the org trio + item IDs **only**, using the same message wording as the rest of the DTO file (`'divisionId must be a UUID'`, `'itemId must be a UUID'`, etc.) so all `X must be a UUID` messages stay consistent.

Validation is **not** disabled anywhere and there is no `@IsOptional()` widening: a non-UUID string such as `DIV-CCD` is still rejected with `400` (verified by smoke §6 check `non-UUID org code still rejected 400`).

---

## 5. Frontend Implementation

### `OperationEditor.tsx`
- Props: `{ open, routing, operation|null, lookups, onClose, onSaved }`.
- `lookups` carries items, divisions, sections, departments, uoms, machines, warehouses **from the parent** — no hard-coded options, no duplicated data fetching for lookups.
- Reusable for Add (`operation=null`, defaults `sequenceNo=(ops+1)*10`, `laborRequired=true`, `machineRequired=false`, empty junctions) and Edit (deep-fills the form including junction `sourceWarehouseId`).
- Preserves the full multi-input / multi-output graph (`Form.List` junctions with quantity, UOM, source warehouse, scrap basis / output type, primary), Route Type is untouched (it lives on the routing header), and the legacy single-item sync (`inputItemId/inputQuantity/outputItemId/outputQuantity/uomId`) is recomputed from the primary junction on save.
- **Machine Target integration (read-only):** when `machineRequired` is checked a Machine select appears; picking a machine fetches `GET /production/machine-targets?machineId=<id>&limit=50` and renders a read-only summary `Alert`/`Table` (Shift, Item, UOM, Standard Hrs, Target, Rate/hr, Effective, Status) plus an empty-state note. If the checked box is re-toggled off, `machineId` is cleared and `machineId` is sent as `null`. No create/update/delete of targets — the existing module remains the single source of truth.
- Save semantics: `okText="Save"`, `confirmLoading` while saving; calls `POST /production/routings/:id/operations` (add) or `PUT /production/routings/operations/:id` (edit); success confirmation is a centered **`Modal.success()`** **only after the API resolves**; on failure the backend message is surfaced via `describeRequestError` (never swallowed) and **no** success dialog / no `onSaved` is emitted.

### `RoutingManagement.tsx` (refactor)
- Removed the inline op modal, `opForm`, `opFilteredSections`/`opFilteredDepartmentsList`, and `handleSaveOp`; added a small `opEditor { open, operation }` state and a delegated `handleOpSaved` (closes editor, refreshes the routing detail + list).
- Added `/production/machines` and `/warehouses` lookups to `fetchLookupData` and passes them into `OperationEditor`.
- Operations table gained a **Machine** column (`r.machine?.machineCode`).
- Routing list/create/edit/delete/status/reorder/duplicate handlers are unchanged.

### `OperationEditor.test.tsx`
- Mocks `apiService` (also re-implements the automocked `describeRequestError` so the backend message path is exercised).
- Covers: dialog renders with a **Save** button (and no OK); read-only machine-target fetch + summary render for an attached machine; Add-mode POST payload (legacy sync + `machineId:null` when not required) + `Modal.success` + `onSaved`; Edit-mode PUT; backend validation error surfaced (no fake success, no `onSaved`).

---

## 6. Verification

### Backend build
- `npm run build` (`nest build`) → **PASS**; `dist` confirmed to contain `UUID_LOOSE` and `divisionId must be a UUID`.

### Runtime smoke (`runtime-smoke-routing.cjs` — 34 checks, **0 failed**)
- Pre-existing scenario checks (route types CRUD/status, warehouses, machines, items, routing CRUD, detail + `route_type_id`, 4-op CCD routing, junction arrays, flow graph stages/source/branch/convergence nodes, multi-input/output persistence, `machine_id` persistence, update, reorder, duplicate with junction copy).
- **NEW Task-15 checks:**
  - divisions lookup exposes CCD with synthetic UUID `d1000000-0000-0000-0000-000000000002` → OK
  - operation create **nested** in a routing accepts synthetic org UUIDs → `201`; persists div `d1000000-...` / dept `d3000000-...-000000000012` → OK
  - operation add (standalone `POST /routings/:id/operations`) accepts synthetic org UUIDs → `201` → OK
  - operation update accepts synthetic org UUIDs → `200` → OK
  - non-UUID org code (`DIV-CCD`) still rejected `400` (validation intact) → OK
  - `GET /production/machine-targets?limit=200` → `200`, 117 targets, rows expose `id`/`standardHours`/`targetQuantity` → OK
  - unknown field rejected `400` (whitelist intact) → OK
  - DB cleanup of smoke routing + ops + route type.

### Frontend
- `OperationEditor.test.tsx` → **5/5 PASS**.
- `RoutingManagement.test.tsx` → **PASS** (existing lookup smoke still green with the new machine/warehouse lookups).
- `npx tsc --noEmit` → only remaining error is a **pre-existing** untracked `src/pages/__tests__/permission-gating.test.ts` (imports `vitest`, which is not a dependency; file is untracked and untouched by this task).
- `npm run build` (CRA production build) → **success**, exit 0, "Compiled with warnings" — all warnings are pre-existing unused-variable/a11y warnings in unrelated files (`App.tsx`, `navigationConfig.tsx`, `ProductionBarcodes.tsx`, inventory/store pages, `ItemManagement.tsx`); **none** in `OperationEditor.tsx` or `RoutingManagement.tsx`.

### Not executed
- Interactive browser/UI verification was not possible (no browser tooling available in this environment); the UI is verified via the automated component tests above and the live backend smoke.

---

## 7. Constraints Honoured

- Reused the machine-target `UUID_LOOSE` convention exactly; validation **not** disabled; strict `@IsUUID` retained for genuine v4 refs; no global replace.
- No duplicated Machine Target / Rate / Capacity / Item Speed system — `/production/machine-targets` remains the single source of truth, shown read-only.
- No hard-coded lookups/machines/items/org/shifts/warehouses/targets.
- Multi-input/output graph, Route Types (`routeTypeId`), op reorder/duplicate, `sourceWarehouseId` all preserved.
- Save button replaces OK; success dialog (**centered** `Modal.success`) only after a successful API save; backend validation errors surfaced, never swallowed; no fake success.
- OperationEditor is reusable for Add + Edit via props; parent passes required routing/operation context + lookups + callbacks.
- Unrelated modules untouched; smoke run separates Task-15 checks from the pre-existing suite (26 pre-existing + 8 new).
- **NO COMMIT performed.**

---

## 8. Task15-A: Routing Operation `companyId` Payload Contract Fix

**Reported:** Routing Operation save returned `400 {"message":["property companyId should not exist"],"error":"Bad Request"}`.

### 8.1 Root cause (traced, not assumed)
- The frontend `OperationEditor.tsx` built the operation payload with `{ ...values, ... }`, spreading every form value into the request body. `companyId` is **never a form field**, but the unrestricted spread was a latent contract leak — any entity/UI key that reached `values` would be forwarded to the API.
- The backend operation endpoint (`POST /production/routings/:id/operations` and `PUT /production/routings/operations/:id`) validates the body against `CreateRoutingOperationDto` / `UpdateRoutingOperationDto`, which **intentionally do not declare `companyId`**. The global `ValidationPipe` uses `whitelist: true` + `forbidNonWhitelisted: true` (`main.ts:27-28`), so any stray `companyId` in the body → `property companyId should not exist`.

### 8.2 Why this is CASE B (inherited context), not CASE A (DTO field)
Trace through the backend:
- Controller `ProductionRoutingController` derives `companyId` per request via `getCompanyId(req)` = `req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId`, and passes it into the service (`production-routing.controller.ts:30-36, 145-159`).
- Service `addOperation` → `createOperations(routingId, companyId, [dto], userId)` and `updateOperation(...)` persist the operation **with the server-provided `companyId`** (see `production-routing.service.ts` `createOperations` at ~748-770 creating `{ companyId, routingId, ... }`).
- `companyId` is therefore **inherited from the parent Routing / authenticated org scope**, never a client-supplied value. Adding it to the operation DTO (CASE A) would be wrong — it would let a client assert a company scope and would silently widen the contract.

### 8.3 Fix
- **Backend:** unchanged. Operation DTOs still reject `companyId` (whitelist preserved). No rebuild/restart was required.
- **Frontend (`OperationEditor.tsx`):** `handleSave` now builds the payload from an **explicit `DTO_PAYLOAD_FIELDS` whitelist** (exactly the fields accepted by `CreateRoutingOperationDto` / `UpdateRoutingOperationDto`) instead of spreading `values`. `companyId`, `operationId` (not currently sent), and any internal/UI-only key can no longer reach the request body. `machineId`, legacy `inputItemId`/`inputQuantity`/`outputItemId`/`outputQuantity`/`uomId` sync, and multi-I/O `inputs`/`outputs` are composed explicitly as before.

### 8.4 Verification
- Frontend tests (`OperationEditor.test.tsx`): **7/7 PASS**, including two new contract tests asserting the add-operation POST and update-operation PUT payloads are DTO-exact and never contain `companyId`/`operationId`. `RoutingManagement.test.tsx` still PASS.
- CRA production build: **success** (exit 0).
- Live runtime probe (`backend/_contractop15a-probe.cjs`, backend already running on :3001): **8/8 PASS** —
  1. `POST .../operations` with `companyId` → **400** `companyId should not exist` (whitelist intact; CASE A rejected).
  2. `POST .../operations` without `companyId` → **201**, operation persisted (server derives `companyId`).
  3. `PUT .../operations/:id` with `companyId` → **400**.
  4. `PUT .../operations/:id` without `companyId` → **200**, update applied.
  5. Routing create whose inline op carries `companyId` → **400** (same nested contract enforced).
  6-8. login, refs, setup/cleanup all green.
- Probe cleanup verified: no residual routing/operation rows.
- Browser/UI click-through was not executable (no browser tooling); UI coverage is via the component tests above.
- **NO COMMIT performed.**

---

## 9. Task15-B: Save / Processing / Success UX

**Requirement:** professional **Save** button + **Processing** dialog + **Success** dialog for the Routing form, the Routing Operation editor, and the Route Type form. No `OK`/`Submit`/`Done`/`Confirm` anywhere in the add/edit forms (labels reserved for genuinely different workflow actions, e.g. the Route Type deactivate confirmation uses its own `Yes`).

### 9.1 Reusable component (one dialog, three forms)
- Searched the codebase for an existing success/loading/result modal. The only match was `TargetSaveSuccessModal.tsx` (Machine Targets) — coupled to target data, so it was **not** reused.
- Created **one generic** component instead:
  - `frontend/src/components/shared/SaveResultDialog.tsx` + `SaveResultDialog.css`
  - Props: `open`, `phase: 'loading' | 'success'`, `result: { title, message?, recordType?, recordCode?, recordName? }`, `onClose`.
  - Exported from `components/shared/index.ts` as `SaveResultDialog` + types `SaveResultData` / `SaveResultPhase`.
- **Loading state:** large centered circular spinner (`<Spin>`, `role="status"`), `Saving...` above, `Processing request...` below. Duration is the **real API request** — no fake timers/delays.
- **Success state:** large circular check-mark **pop-in animation** (theme token `--theme-success`), headline `Successful`, then the form-specific title and the **actual backend business code** (e.g. `Routing Code: RTG-CCD-001`, `Operation Code: OP-040`, `Route Code: CCD`) plus the record name — the raw UUID is never shown as primary.
- Theme tokens for light/dark (`--theme-success`, `--theme-success-soft`, `--theme-accent`, `--theme-text`, `--theme-border`, `--theme-surface-alt`); responsive breakpoint <575px; `Cancel` (closable=false) during loading; a single primary `Close` button on success and no OK anywhere.

### 9.2 Form changes
- **Routing (`RoutingManagement.tsx`):** modal footer is now explicit `[Cancel][Save]`; `onOk`/`confirmLoading` removed. `handleSave` validates the form, guards `if (saving) return` against duplicate submission, opens the loading dialog, then `POST /production/routings` or `PUT /production/routings/:id`. Success shows the backend `routingCode` and closes the form, then **refetches the list** (`fetchRoutings()`) and — when editing the currently-viewed routing — **refetches the detail** (`refreshDetail(id)`). Payload is built from an explicit `ROUTING_PAYLOAD_FIELDS` whitelist (never `companyId`, which stays server-derived per Task15-A). Any backend error is normalized via `describeRequestError`, the form stays open with values, and `Save` is restored for retry.
- **Routing Operation (`OperationEditor.tsx`):** explicit `[Cancel][Save]` footer (no `onOk`/`okText`), duplicate-submission guard, loading dialog during the request, success dialog on real backend confirmation. Success derives the code from the real response (add: the persisted op looked up in `res.data.operations` by code/name; update: `res.data.operationCode`), calls `onSaved()` so the parent refreshes detail + list, and keeps the DTO-exact Task15-A payload (no `companyId`). Machine Target read-only panel, multi-input/output junctions, source warehouse, division/section/department, setup/run/queue/wait, scrap, labor, remarks, route type and legacy single-item sync all preserved.
- **Route Type (`RouteTypeManagement.tsx`):** explicit `[Cancel][Save]` footer (no `onOk`/`confirmLoading`), loading/success dialog, real backend `routeCode` shown. **Contract fix found while wiring this:** the create DTO requires `companyId` but `UpdateRouteTypeDto` does **not** declare it — the old handler sent `companyId` on edit too, which the global `forbidNonWhitelisted` pipe would have rejected with `property companyId should not exist`. `companyId` is now sent **create-only**; edit `PATCH` omits it. Local list refetch after save (`fetchData(page)`).

### 9.3 Error behavior (all three forms)
- Backend failures never reach the success state: the loading dialog is closed, `describeRequestError(err)` is shown, the form stays open **with the entered values**, loading spins stop, and `Save` is re-enabled so the user can retry. No success dialog, no `onSaved`. Validation errors (`validateFields` rejection with `errorFields`) keep the dialog closed entirely.

### 9.4 Tests (Task15-B)
- `OperationEditor.test.tsx` (**13/13 PASS**): loading state (`Saving...` + spinner + `Processing request...`) while a real request is pending; duplicate-submission prevention (`POST` called exactly once); success **only** after the API resolves, showing the **actual** backend `OP-*` code; failure never shows success and keeps the form open with values; retry after a failed attempt succeeds; edit shows the backend-updated code, calls `onSaved` (parent refetch), and forwards the multi-I/O junctions; DTO-exact POST/PUT payloads never include `companyId`.
- `RoutingManagement.test.tsx` (**2/2 PASS** + existing lookup smoke): create uses footer `[Cancel][Save]` (no OK), success dialog shows the real `RTG-*` code from the resolved response; failure keeps the form open with values.
- `RouteTypeManagement.test.tsx` (**new, 3/3 PASS**): create posts `companyId` and shows the real `Route Code`; failure+retry; edit `PATCH` **omits** `companyId` and shows updated success.
- Full scoped run: **19/19 PASS** across the three suites.
- **Runtime:** backend unchanged for Task15-B (already verified live in Task15-A via `backend/_contractop15a-probe.cjs` 8/8); response-shape assumptions (`res.data.routingCode`, `res.data.operations`, `res.data.data` for route types) were cross-checked against the backend controllers.

### 9.5 Build & browser
- `npm run build` (CRA production build) → **success**; only pre-existing warnings (bundle-size / unrelated a11y) — the new `SaveResultDialog` compiles clean.
- Browser/UI click-through **not executed because browser tooling is unavailable**; covered by the component tests above.

---

## 10. Task15-C: Cascading Organization Selects + Independent Item Department Filtering + Save/Error UX

### 10.1 Division → Section → Department Cascade

Organization fields in OperationEditor now cascade hierarchically:

- **Division** → filters Sections to those belonging to the selected Division
- **Section** → filters Departments to those belonging to the selected Section
- **Department** → company-wide depts (`sectionId == null && divisionId == null`) always appear; section-scoped depts appear when their section is selected; division-scoped depts appear when their division is selected

When Division changes: Section and Operation Department are reset.
When Section changes: Operation Department is reset.

### 10.2 Independent Item Department Filtering (per row)

Each Input Material row and Output Product row has its own **Item Department** selector, independent of the Operation Department:

- The Item Department dropdown shows all departments from the company's organization scope
- The Item dropdown filters to only items whose `departmentId` matches the selected Item Department
- Changing the Item Department clears only that row's Item selection
- Different rows may use different Item Departments simultaneously
- Filtering uses entity IDs (`departmentId`), never display names

### 10.3 Save Error Handling

**Never shows success on failure:**
- API failure keeps the form/modal open
- Shows the actual normalized error via `describeRequestError`
- Keeps entered values intact
- Save button re-enables for retry
- `SaveResultDialog` uses `destroyOnHidden` to prevent stale success state

**Loading spinner improvements:**
- 48px diameter (up from default small size)
- Uses `var(--theme-accent)` (#4f46e5) as stroke color
- Thicker stroke (`stroke-width: 2.6`)

### 10.4 API Contracts

All data comes from real API endpoints - no hardcoded values:

| Endpoint | Response Shape | Purpose |
|----------|---------------|---------|
| `/divisions` | `{ data: Division[] }` | Division lookup |
| `/sections` | `{ data: Section[] }` | Section lookup (filtered by `divisionId`) |
| `/departments` | `{ data: Department[] }` | Department lookup (filtered by `sectionId`) |
| `/master-data/items` | `{ data: Item[] }` | Item Master (filtered by `departmentId`) |

Item Department filtering uses `item.departmentId === deptId` (UUID comparison, not name matching).

### 10.5 Tests (Task15-C)

All 19 OperationEditor tests pass:

**Organization cascade tests:**
- Division selection filters Sections
- Changing Division resets invalid Section
- Section selection filters Departments
- Changing Section resets invalid Operation Department
- Company-wide depts always visible
- No hardcoded organization data

**Item filtering test:**
- Each input/output row has its own Item Department
- Selecting Item Department filters Item Master records
- Operation Department does NOT control Item Department filtering
- Multiple rows use different Item Departments independently

**Save/error tests:**
- Save shows loading spinner
- API failure never shows success
- API failure keeps modal open
- Entered values remain after failure
- User can retry after failure
- Error dialog persists until dismissed

### 10.6 Build & Verification

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | Pass (1 pre-existing vitest error, unrelated) |
| OperationEditor tests (19) | All pass |
| Production build | Compiled with warnings (pre-existing) |

### 10.7 Browser Verification

Browser/UI click-through verification not executed because browser tooling is unavailable.

### 10.8 Pre-existing Issues

- `permission-gating.test.ts` - missing vitest module (pre-existing, not TASK15-related)
- `RoutingManagement.tsx` - missing `within` import (pre-existing, not TASK15-related)
- Production build warnings (pre-existing, not TASK15-related)