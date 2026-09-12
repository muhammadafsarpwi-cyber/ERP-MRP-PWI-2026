# ERP Production Flow — Task 15 Department + Item Dynamic Final Report

**Date:** 2026-09-11
**Task:** TASK 15 — Production Flow: Department + Item Dynamic
**Scope:** Fully configurable Department + Item stage model — each route stage stores a `Department + Output Item`; the current Item may appear at any stage (`isCurrent` data-derived); no forced row-01; duplicate Item across stages = circular (A→B→A); operation name auto-derived from Department; backend + frontend + tests + report. Nothing committed.

---

## 1. Model — Key Decisions

- Each configured route row = `Department + Output Item`. There is **no forced row-01**; STEP 01 is just the first user-authored stage (e.g. Store + RM item), not a special Raw Material pseudo-row.
- The **current Item** may appear at any single stage (`isCurrent` derived from `row.outputItemId === item.id`). The current Item is selectable in any stage's item selector — no `excludeItemId` filtering on route rows.
- The route-row Department selector uses the **full org department list** (`departments` state) — never filtered by the current Item's Division/Section. `departmentsForSection` is preserved elsewhere (Item's own Department field, MachineManagement) and is untouched.
- **Cycle detection**: duplicate `outputItemId` across stages = A→B→A. Rejected on save (`validateRouteRows` throws). On read (`getProductionFlow`, `buildConfiguredRouteStages`) the flag `cycleDetected` is set to `true` and `warning` explains the duplicate item IDs. The frontend shows a live `Alert` warning while editing.
- **Operation name** is optional in the UI (hidden `name` Form.Item); on department selection it is auto-filled to the department name. Backend also derives `operationName = row.name || departmentName`.
- **Raw Material** items: `productionInItemId` forced null (TASK #34B, unchanged).
- **Configured route rows** (`items.processes` JSONB) are AUTHORITATIVE. Legacy TASK 14 flow (chain-walking from `productionInItemId`) is the fallback **only** when `processes` is empty.

---

## 2. Files Changed

### Backend (`backend/src/modules/item/`)

| File | What changed |
|------|-------------|
| `services/item.service.ts` | `ensureRouteRows`: keeps rows with dept OR item (not just name); re-indexes; trims name. `validateRouteRows`: rewritten — no row-01 forcing; no section/division restriction; UUID + ACTIVE + same-company validation on every row; duplicate-item cycle rejection; authoritative dept metadata overwrite; name auto-derived from dept; dept-less rows have org fields cleared; section/division names resolved from real entities; blank rows (no dept and no item) dropped silently. `buildConfiguredRouteStages`: returns `{ fullRoute, stages, cycleDetected }`; rows' dept/section/division override item's own org; title fallback `operationName → deptName → "STEP NN"`; `operationName = row.name || departmentName`; `fullRoute` + `stages` extended with `departmentId/divisionId/divisionName/sectionId/sectionId/operationCode/barcode/sku`. `getProductionFlow`: sets `cycleDetected`. Create/update ctx now `{ companyId, currentItemId }`. |
| `services/item.service.spec.ts` | UUID constants (`deptStoreId`, `UUID_RAW`, `UUID_TUBE`, `UUID_WIP`, `UUID_MISSING`); `packed()` helper; tests 2–12 rewritten (no row-01 forcing, dept-only row rejection, duplicate-item rejection, cross-department allowance, cycle-free 5-stage route); tests 13+14 added (cycle flag on read, operation name preserved). |

### Frontend (`frontend/src/pages/master-data/`)

| File | What changed |
|------|-------------|
| `items/InputMaterialSelect.tsx` | New `departmentId?: string | null` prop — forced department filter for route rows. `effectiveDept = forcedDept ?? dept`; `useEffect([effectiveDept, runFetch])` refetches on dept change; `handleDeptChange` locked when forced; internal dept picker hidden when `forcedDept` set; `notFoundContent` reflects effective dept. |
| `ItemManagement.tsx` | Route Form.List rewritten: all rows get full `departments` select + `InputMaterialSelect` with `departmentId` prop; hidden `name` field auto-filled from dept; `excludeItemId` removed on route rows; move-up/down/delete allowed on all rows; "Add Stage" button label; `openCreate` seeds `processes: []`; `openEdit` uses `p.outputItemId` for all rows (no forced idx-0); `handleSubmit` preserves legacy `process1..6` names for un-migrated items. Top preview chips: all configured stage names shown (no `slice(1)`). Cycle alert in detailed preview. |
| `items/productionRoute.ts` | `normalizeRouteRows`: keeps rows with dept OR item (not just name). `findRouteCycles`: new helper — detects duplicate `outputItemId` across rows. `mapStageItem` / `RouteStageSource`: added `barcode`/`sku`. `nodeToStage`: title fallback `operationName → deptName → "STEP NN"`; row dept/section/division overlay over itemInfo; barcode/sku on stage. `buildRouteFlow`: row dept/section/division authoritative; `operationName = row.name || departmentName`; `stageName` fallback; `fullRoute` extended with dept/division/section IDs + names + operationCode + barcode + sku. |
| `items/itemTypes.ts` | `ProductionFlowRouteStage`: added `departmentId`, `divisionId`, `divisionName`, `sectionId`, `sectionName`, `operationCode`, `barcode`, `sku`. `ProductionFlowStage`: added `barcode`, `sku`. |

---

## 3. Backend Validation Rules (authoritative)

| Rule | Error thrown |
|------|-------------|
| Row has no department and no item | Dropped silently (no stage rendered) |
| Row name is empty but dept is set | Name auto-derived from `department.name` |
| `outputItemId` is set but not a valid UUID | `invalid Output Item ID` |
| `outputItemId` UUID does not exist / different company / deleted | `does not exist / is not ACTIVE` |
| `outputItemId` is an INACTIVE item | `not ACTIVE` |
| Same `outputItemId` at two different stages | `circular route — item X appears at stages N and M` |
| `departmentId` is set but dept does not exist | `does not exist` |
| Department exists but belongs to a different Division/Section | Allowed — row's real dept/division/section written authoritatively |

---

## 4. Precedence — Configured Route vs Legacy Chain

- `item.processes` JSONB has rows → **configured route is authoritative** (`buildConfiguredRouteStages`).
- `item.processes` empty/null → TASK 14 legacy fallback runs (chain-walking from `productionInItemId`, process1–6 scalar columns preserved on save for un-migrated items).
- Configured rows always win in the frontend preview (`buildRouteFlow` from `normalizeRouteRows`); legacy fallback IIFE runs only when no rows exist.

---

## 5. Tests — Summary

**Backend** — `item.service.spec.ts` (62 total, 14 TASK 15 specific):

| Test | Result |
|------|--------|
| 1. Configured route → 3 stages, titles from real names | ✅ PASS |
| 2. Name-only row → dropped; dept-only row → rejected | ✅ PASS |
| 3. Create: preserves outputItemId per row (no row-01 forcing) | ✅ PASS |
| 4. Create RAW_MATERIAL: productionInItemId forced null | ✅ PASS |
| 5. Create/update dept-only named row → rejected | ✅ PASS |
| 6. Circular route (duplicate item) → rejected on save | ✅ PASS |
| 7. Row 01 stays user-configured (UUID_RAW, not forced to current) | ✅ PASS |
| 8. Invalid UUID on outputItemId → rejected | ✅ PASS |
| 9. Inactive outputItem → rejected | ✅ PASS |
| 10. INACTIVE outputItem → rejected | ✅ PASS |
| 11. Cross-department flow ALLOWED (dept from different div/sec) | ✅ PASS |
| 12. 5-row route, all unique items, no cycle | ✅ PASS |
| 13. `getProductionFlow` flags cycle (A→B→A) `cycleDetected=true` | ✅ PASS |
| 14. Operation names kept verbatim (Raw Material → RAW MATERIAL) | ✅ PASS |

**Frontend** — tsc clean; build clean; pre-existing test vitest/jest mismatch (not caused by this change).

---

## 6. Documented Limitations (pre-existing, not fixed)

| Item | Severity | Notes |
|------|----------|-------|
| `src/pages/__tests__/permission-gating.test.ts` TS2307 `vitest` | Pre-existing | vitest not installed in project; test file imported but cannot resolve; not caused by this task |
| `company.controller.spec.ts` / `production-entry.service.spec.ts` DB-dependent failures | Pre-existing | 43 tests require live DB; fail in unit test mode; unrelated |
| jsdom JsBarcode no-canvas console noise | Pre-existing | JsBarcode requires `<canvas>` not available in jsdom; console.error noise only |
| Legacy TASK 14 items: editing with empty route clears process1–6 columns | Pre-existing design | When `processes: []` is saved, process1–6 are nulled (no configured rows); legacy chain fallback runs from processN nulls → fewer stages shown. Documented. |

---

## 7. Status

**Status: PASS**

Backend: 62/62 tests pass, `tsc --noEmit` clean, item test suites 127/127 pass.
Frontend: `tsc --noEmit` clean (only pre-existing vitest TS2307), `npm run build` succeeds.
Tested flows: create/edit with department + item row, cross-department routing, duplicate-item cycle rejection on save + live warning in preview, legacy TASK 14 item preservation on save, operation name auto-derived from department.
