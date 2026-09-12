# ERP Production Route — Task 15 (Department + Item Mapping) Final Report

**Date:** 2026-09-11
**Task:** TASK 15 — Production Route Builder: Department + Item Mapping
**Scope:** Make the Item Form "Production Route / Process" section the authoritative authoring model — each row stores a PROCESS/DEPARTMENT + OUTPUT ITEM pair; Step 01 is always RAW MATERIAL → the current Item; a live flow preview (top strip + detailed stage card) is generated from the configured route; real Item Master + real Department data only; validation, save/reload, live preview, tests, and a final report. Nothing committed.

---

## 1. Problem Found

Before Task 15 the "Production Route / Process" section was a loose list of operation names with no business meaning:

- Each row stored only `{ sequence, name }` — there was no way to author **which department performs the operation** and **which real Item the operation outputs**.
- Row 01 was not a guaranteed RAW MATERIAL step mapping to the item itself; any process could be seeded first.
- The preview was derived either by walking the `productionInItemId` chain (Task 14, read-only) or from free-text names — neither could express a real configured route with output Items.
- The detailed `ProductionFlowCard` still showed a hardcoded `01 → 06` title tag.

## 2. Root Cause

The Item entity's JSONB `processes` column only carried `sequence + name`, and the authoring UI only captured operation text. There was no data model (and no UI contract) for a PROCESS/DEPARTMENT → OUTPUT ITEM pair, so the flow for edited items could not be constructed from real configured data; it had to be guessed from the item chain or free text.

## 3. Production Route Authoring Model

The Item Form's route section is now the authoritative authoring surface. Each row is a **PROCESS/DEPARTMENT + OUTPUT ITEM** pair persisted into the existing `items.processes` JSONB column — no second routing system, no duplicate API, no new table.

- Row model (per row): `sequence`, `name`, `departmentId`, `departmentName`, `divisionId`, `divisionName`, `sectionId`, `sectionName`, `outputItemId`.
- Step 01 = RAW MATERIAL (locked); it outputs the current Item (server-forced, see §5).
- Steps 02+ require a real Department/Process tag **and** a real Output Item chosen from the Item Master (ACTIVE only, not the item itself).
- The output Item of each later step is stored as a real Item ID, never free text.

## 4. DTO / Entity / Column Changes

- `backend/src/modules/item/dto/item.dto.ts`: new `RouteProcessRow` interface; both `CreateItemDto` and `UpdateItemDto.processes` widened from `{ sequence: number; name: string }[]` to `RouteProcessRow[]`; field descriptions updated.
- `backend/src/modules/item/entities/item.entity.ts`: `processes` JSONB type widened to include the department + output-item keys (JSONB needs no migration — TypeORM serializes the extra keys).
- `backend/src/modules/item/services/item.service.ts`:
  - `extractProcesses` preserves department + output-item fields on mapped rows.
  - `ensureRouteRows` normalizes/filters rows and re-indexes `1..N`.
  - `validateRouteRows` performs server-side validation (see §6) before create/update.
  - `getProductionFlow` gives configured route rows authority over the legacy chain (see §7) and builds stages via `buildConfiguredRouteStages`.
- No schema/migration file changes were required; JSONB accepts the extended object.

## 5. Raw Material & Row-01 Rules

Enforced on both server and client:

- A RAW_MATERIAL item cannot have an input material: `create()` and `update()` force `productionInItemId = null` for `itemType = RAW_MATERIAL` (input field disabled/empty; no upstream lookup).
- `validateRouteRows` forces Step 01:
  - row-01 `departmentId/departmentName/divisionId/divisionName/sectionId/sectionName` cleared,
  - row-01 `outputItemId = currentItemId` (a raw row can never map to an unrelated Item),
  - for raw materials row-01 `name = 'Raw Material'`.
- Frontend: the first Form.List row is non-editable — process name locked to "Raw Material"/stored value, move-up/down/delete disabled, output shown as "this item".

## 6. Validation Rules

`validateRouteRows` (backend, authoritative) plus matching UI rules:

1. Step 01 exists (frontend always seeds it; empty/invalid rows are tolerantly dropped, then re-indexed `1..N`).
2. Step 01 output = current Item (server-forced).
3. Steps 02+ must have an Output Item: non-empty, valid UUID, must exist **and be ACTIVE in the same company**, and must not equal the current Item (self-mapping rejected) — error messages identify the step by sequence and name.
4. Optional `departmentId` when set must be a valid UUID, reference an existing Department, and belong to the Item's Division/Section context when those are set.
5. Repeatable operations are allowed (no deduplication by name); descriptions/dims stay on the Item.
6. Item Master records are never created from route rows — only referenced.

## 7. Precedence — Configured Route vs Legacy Chain

- If `item.processes` has content → the **configured-route resolver is authoritative** (`buildConfiguredRouteStages`); rows without `outputItemId` render read-only "—" (Never fabricated), never replaced by chain walking.
- Only when `processes` is empty/null does the legacy `buildRouteChain`/`buildDynamicStages` fallback run, preserving the exact Task 14 behavior for legacy items.
- The Task 14 chain walkers are retained **only** as that read-only fallback — they can never override configured rows.
- The modal preview mirrors the same precedence: `normalizeRouteRows(watchedProcesses)` builds stages via `buildRouteFlow` (pure client module) whenever a configured route exists; the legacy dynamic strip is used only when no rows exist.

## 8. Stage Model (One Stage per Configured Row)

- ONE `process` stage per configured route row — step = item number, `title = UPPER(row.name)`, item = resolved Output Item.
- No `NEXT_STEP` / `FINAL_PRODUCT` tail stages are appended when a configured route exists (§ avoids a conflicting second final product); the legacy fallback keeps its tail behavior.
- `configured = Boolean(row.departmentId && resolvedOutputItem)`; unconfigured rows render "—"/Not configured.
- `fullRoute` + `stages` are produced by the same resolver, so the top preview and detailed card agree. `ProductionFlowCard`'s hardcoded `01 → 06` title tag was removed.

## 9. Process / Item Selectors

- **Output Item selector**: real Item Master API search (code / name / SKU / barcode), ACTIVE only, excludes SERVICE / ASSET / OTHER and the current Item (`excludeItemId`); saves the real Item ID. Reuses `InputMaterialSelect` in a new `compact` mode with custom placeholder/aria-label/testid.
- **Process/Department selector**: Department-based, filtered by the Item's Division/Section context (`departmentsForSection`), syncing `departmentId/departmentName/divisionId/divisionName/sectionId/sectionName` into the row's hidden fields.
- Row-01 has no selector (locked Raw Material → current Item).

## 10. Tests

Backend — `backend/src/modules/item/services/item.service.spec.ts` (12 new TASK 15 cases):

1. Configured route → 3 stages (one per row), titles uppercased from real names
2. Configured route wins over the chain (`getProductionFlow` precedence)
3. Legacy rows without `outputItemId` render "—" (not fabricated)
4. `create()` persists validated rows; Step-01 forced to current Item / department cleared
5. RAW_MATERIAL create forces `productionInItemId = null` + Step-01 "Raw Material"
6. Create rejects a row-02+ with no Output Item
7. Update rejects self-mapping (row output === current Item)
8. Update persists validated rows (dept + output Item preserved)
9. Rejects non-UUID Output Item
10. Rejects missing / out-of-company Output Item
11. Rejects inactive Output Item
12. Rejects a process department outside the item's Section; a 5-row route yields 5 stages

**Result: 60/60 passed** across the full `item.service.spec.ts` suite (48 TASK 14 + 12 TASK 15).

Frontend — targeted suites, **56/56 passed** across 5 suites:

- `ProductionFlowCard.test.tsx` **10/10**
- `InputMaterialSelect.test.tsx` **8/8** (default props unchanged — new `compact`/`placeholder`/`ariaLabel`/`testId` defaults keep existing behavior green)
- `ProductionSpecificationsAndRoute.test.tsx` **13/13** (extended `ProcessStep` interface stays backwards compatible)
- `ItemManagement.regression.test.tsx` **15/15**
- `ItemManagement.task13a.test.tsx` **10/10**

Full backend suite: 606 passed / 43 failed — the 43 failures are confined to the pre-existing, unrelated `company.controller.spec.ts` and `production-entry.service.spec.ts` suites (see §15).

## 11. TypeScript

- Backend: `npx tsc --noEmit -p tsconfig.json` — **clean**.
- Frontend: `npx tsc --noEmit` — the only error is the pre-existing, unrelated `src/pages/__tests__/permission-gating.test.ts(1,38): error TS2307: Cannot find module 'vitest'`. No TASK 15 file contributes a TS error.

## 12. Builds

- Backend: `tsc --noEmit` clean (single `tsconfig.json`; the project uses `nest build` at the same config).
- Frontend: `npm run build` — **succeeds**; `main.js` 1.08 MB, CSS `main.cfcccd2c.css`. Only the pre-existing, non-blocking CRA size/lint warnings remain.

## 13. Browser Verification

**Browser verification: NOT EXECUTED** — no browser-driving tooling was available in the execution environment for Task 15. UI behavior was verified through jsdom rendering tests (§10) and the production build (§12); an interactive browser pass is recommended before release sign-off.

## 14. Files Changed

| File | Change |
|---|---|
| `backend/src/modules/item/dto/item.dto.ts` | `RouteProcessRow` interface; `Create/UpdateItemDto.processes` widened to `RouteProcessRow[]` |
| `backend/src/modules/item/entities/item.entity.ts` | `processes` JSONB type widened (department + output Item keys) |
| `backend/src/modules/item/services/item.service.ts` | `extractProcesses` preserves relationship fields; `ensureRouteRows`; `validateRouteRows` (Step-01 forcing, UUID/existence/ACTIVE/self-mapping/dept-context rules); `create`/`update` raw-material input forcing; `getProductionFlow` precedence; `buildConfiguredRouteStages` (one stage per configured row) |
| `backend/src/modules/item/services/item.service.spec.ts` | 12 TASK 15 cases (60/60 suite) |
| `frontend/src/pages/master-data/items/itemTypes.ts` | `ProcessStep` extended (dept/div/section + `outputItemId`); `ProductionFlowRouteStage.itemId/itemCode/itemName/itemType` nullable |
| `frontend/src/pages/master-data/items/InputMaterialSelect.tsx` | `compact`, `placeholder`, `ariaLabel`, `testId` props (defaults unchanged) |
| `frontend/src/pages/master-data/items/productionRoute.ts` | NEW pure module: `normalizeRouteRows`, `mapStageItem`, `nodeToStage`, `buildRouteFlow`, `UUID_RE`, `cleanString` (mirrors backend stage model) |
| `frontend/src/pages/master-data/items/ProductionFlowCard.tsx` | Hardcoded `01 → 06` title tag removed |
| `frontend/src/pages/master-data/ItemManagement.tsx` | Route row redesign (row-01 locked Raw Material; rows 02+ department select + compact Item selector); `openCreate`/`openEdit` route seeding; `handleSubmit` serialization via `normalizeRouteRows`; `routeItemDetails` state + resolution; preview rewritten to `buildRouteFlow` when a configured route exists (legacy dynamic strip retained as fallback) |

## 15. Remaining Issues

- Browser-level visual/interaction verification still pending (see §13).
- Pre-existing, not caused by Task 15: `frontend/src/pages/__tests__/permission-gating.test.ts(1,38)` `vitest` TS2307; backend `company.controller.spec.ts` + `production-entry.service.spec.ts` (43 tests, DB-dependent, unaffected by item flow).
- jsdom cannot measure SVG text, so `JsBarcode` falls back to the guarded text render inside tests (real-browser path unchanged; the component catches the error).
- New-create preview: before the item exists, row-01's output Item has no ID yet so the live stage resolves as "—" until the Item is saved (server forces `outputItemId = currentItemId` on create).

## 16. Final Status

**PASS WITH DOCUMENTED LIMITATIONS**

- Backend item.service tests: ✅ 60/60
- Frontend targeted suites: ✅ 56/56
- Backend TypeScript: ✅ clean
- Frontend TypeScript: ✅ no new errors (one pre-existing, unrelated `vitest` error)
- Backend build: ✅
- Frontend build: ✅
- Browser verification: ⚠️ NOT EXECUTED — documented in §13
- No commit performed.

## 17. Verification Summary

| Gate | Result | Evidence |
|---|---|---|
| Backend DTO/entity type widening | ✅ | `tsc --noEmit` clean |
| Backend validation (Step-01, self-loop, UUID, ACTIVE, dept context) | ✅ | `validateRouteRows` + 12 specs |
| Precedence configured-route > legacy chain | ✅ | `getProductionFlow` spec cases |
| Stage model (one per row, no tail on configured) | ✅ | `buildConfiguredRouteStages` + specs |
| Frontend route authoring UX (row-01 locked, dept + Item selectors) | ✅ | jsdom suites (ItemManagement 25/25) |
| Frontend preview parity | ✅ | `buildRouteFlow` mirrors backend; shared pure module covered by suites |
| Selector defaults compatibility | ✅ | `InputMaterialSelect` 8/8 unchanged |
| ProductionFlowCard hardcoded tag removal | ✅ | build + card suite 10/10 |
| Browser verification | ⚠️ NOT EXECUTED | §13 |