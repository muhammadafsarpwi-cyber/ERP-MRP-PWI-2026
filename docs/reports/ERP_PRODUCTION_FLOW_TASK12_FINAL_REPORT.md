# TASK 12 — Final Report: Production Flow Preview (Final Product + Packing/Next Step Mapping)

**Scope:** Fix the six-stage Production Flow Preview on `D:\ERP-MRP-PWI-2026` so stages 05 and 06 render the actual configured **Final Product** and **Packing / Next Step** values instead of "Not configured", mapped at the correct source layer (Item Master → DTO → backend → production-flow API → `ProductionFlowCard` + inline form preview) with dynamic, non-hardcoded labels and regression tests. **No commits.** **Date:** 2026-09-11

---

## 1. Root cause

Stages 05/06 of the six-stage flow were driven **only** by a real chained next-level item (a downstream item consuming the current item, or a chain item classified `SPIRAL`). `ItemService.buildSixStageFlow` never consulted the current Item's **`finalProduct`** / **`packingNextStep`** fields, so for items such as `FLAT-WIRE-001` (Flattening, no mapped downstream/spiral stage) the backend emitted:

```
05 SPIRAL          → configured=false   → UI: "Not configured"
06 SPIRAL_OUTPUT   → configured=false   → UI: "Not configured"
```

even though the Item Master form contained a valid **Final Product** ("3.75 mm 2P") and **Packing / Next Step** ("Spiral Winding"). Additionally, the frontend `StageBlock` output block could only render a stage that carried an `itemCode`; a stage with only an `itemName` (the final-product text is not an item code) rendered blank. A working-tree partial fix already existed for part of this; this task audited it, completed the remaining gaps (incl. removing a hardcoded `'Spiral Winding'` fallback), and added regression coverage.

## 2. Correct source layer — fields already persisted correctly

The **packed values** flow correctly end-to-end and were NOT the defect:

| Layer | Location | Status |
|---|---|---|
| Form fields | `ItemManagement.tsx` lines 2675/2678, watches 163–164, `CLEARABLE_FIELDS` 648–649 | Present |
| DTO | `item.dto.ts` `CreateItemDto` 392–402 (`finalProduct` 396, `packingNextStep` 402) & `UpdateItemDto` 842–852 | Present |
| Persist | `ItemService.update` generic scalar update (no whitelist stripping) | Present |
| Entity/DB | `item.entity.ts` 220–224 (`final_product`, `packing_next_step`) | Present |
| API response | `getProductionFlow` returns them on `current` (lines 947–948) | Present |

The defect was **only in the six-stage preview derivation and its UI rendering**, fixed below.

## 3. Backend fix — `item.service.ts`

### 3.1 `getProductionFlow` — `next.operationName` fallback (lines 975–980)

When no real downstream items exist, the API now exposes the configured Packing/Next Step as the next operation:

```ts
if (nextOperationName == null && item.packingNextStep && String(item.packingNextStep).trim()) {
  nextOperationName = String(item.packingNextStep).trim();
}
```

### 3.2 `buildSixStageFlow` — stages 05/06 use the explicit fields (lines 1228–1342)

- Computes `currentStageItem` (the item the preview centres on) from the chain; reads the current item's `packingNextStep` and `finalProduct` with **trim + whitespace-only = empty** handling (lines 1252–1259).
- **Stage 05** (`SPIRAL`, process block): operation label = explicit `packingNextStep` when populated, otherwise derived from the real next-level item; `configured = !!(packingNextStep || nextStageItem)` (lines 1322–1330).
- **Stage 06** (`SPIRAL_OUTPUT`, output block): item = `{ name: finalProduct }` when populated, otherwise the real next-level item; `configured = !!(finalProduct || nextStageItem)` (lines 1332–1340).
- New title helper `deriveStageLabelFromText` (lines 1351–1359): `Spiral Winding` → `SPIRAL` / `SPIRAL OUTPUT`; `PVC Extrusion` → `PVC EXTRUSION` / `PVC OUTPUT`; `Packing` → `PACKING` / `PACKING OUTPUT`; `Flattening` → `FLATTENING` / `FLATTENING OUTPUT`; `Wire Drawing` → `WIRE DRAWING` / `DRAWING OUTPUT`; anything else → `NEXT PROCESS` / `NEXT OUTPUT`. **No stage hard-codes "SPIRAL" for a non-spiral next step.**
- Stages 01–04 (`RAW_MATERIAL`, `RAW_SPEC`, `FLATTENING`, `FLATTENING_OUTPUT`) are unchanged.

**Resulting behaviour (verified by tests):**
| Case | Step 05 (NEXT PROCESS) | Step 06 (NEXT OUTPUT) |
|---|---|---|
| A — both set | op = `Spiral Winding` (Packing/Next Step), configured ✓ | item = `3.75 mm 2P` (Final Product), configured ✓ |
| B — only Final Product | unconfigured ("Not configured") | item = `3.75 mm 2P`, configured ✓ |
| C — only Packing/Next Step | op = next step, configured ✓ | unconfigured ("Not configured") |
| D — both empty | unconfigured | unconfigured |

## 4. Frontend fixes

### 4.1 `itemTypes.ts` — shared mapping helpers (lines 250–269)

Added `deriveNextStageTitle(text, kind)` (mirror of backend `deriveStageLabelFromText`) and `isEmptyValue(v)` (null/undefined/whitespace-only → true) so the inline form preview behaves identically to the API-driven card.

### 4.2 `ItemManagement.tsx` — inline six-stage preview (lines 2879–2955)

- Stage 05 title + operation now derive from the live **Packing / Next Step** value (`nextStepValid`), stage 06 item from the live **Final Product** value (`finalProductValid`), with trim and whitespace-as-empty handling.
- `configuredOverride` added to `mkStage` so stages 05/06 report configured based on the explicit fields (or a real preview), not just `!!item`.
- **Removed the hardcoded `'Spiral Winding'` fallback** (`nextPreview ? 'Spiral Winding' : null`): the next-stage operation is now derived from the preview item's department name (spiral/flat/flatten/pvc/pack/draw mapping) — the same department→operation derivation the backend uses — so the fix never re-introduces an item-specific hardcoded operation.

### 4.3 `ProductionFlowCard.tsx` — output block + legend

- StageBlock output block now renders `itemName` when `itemCode` is null (e.g. `3.75 mm 2P` from the Final Product field) instead of rendering nothing (lines 217–269).
- Legend is now derived from the authoritative `stages` titles returned by the API (lines 435–455) instead of a static `Spiral/Spiral Output` list.

## 5. Regression tests added (18 new)

### 5.1 Backend — `item.service.spec.ts` (+7, "TASK 12 — production flow preview")

1. **CASE-A:** finalProduct + packingNextStep → stage 05 `operationName='Spiral Winding'`, `title='SPIRAL'`, configured; stage 06 `itemName='3.75 mm 2P'`, `itemCode=null`, `title='SPIRAL OUTPUT'`, configured; `current.finalProduct`/`current.packingNextStep` and `next.operationName` surfaced.
2. **CASE-B:** packingNextStep empty → stage 05 stays unconfigured, stage 06 shows the product.
3. **CASE-C:** finalProduct empty → stage 05 shows the next step (`Packing` → `PACKING`), stage 06 stays unconfigured.
4. **CASE-D:** both empty → stages 05/06 unconfigured.
5. **Whitespace-only** `'   '` / `'\t\n'` treated as empty (no fake stages).
6. **Stages 01–04 unchanged:** keys `RAW_MATERIAL, RAW_SPEC, FLATTENING, FLATTENING_OUTPUT, SPIRAL, SPIRAL_OUTPUT`; raw/flatten item codes intact.
7. **No hardcoding:** `PVC Extrusion` + `PVC Tube K-3` produce `PVC EXTRUSION`/`PVC OUTPUT` titles and carry the real values.

### 5.2 Frontend — `ProductionFlowCard.test.tsx` (new, +8)

`deriveNextStageTitle` mapping (spiral canonical + other families + generic fallback), `isEmptyValue` (null/undefined/whitespace), and `StageBlock` rendering: configured stage 05 shows the operation; configured stage 06 shows the final product with no `itemCode`; empty 05/06 show "Not configured".

## 6. Verification executed (factual)

| Check | Command | Result |
|---|---|---|
| Backend item module tests | `npx jest src/modules/item --silent` | **6 suites / 107 tests passed** |
| Backend build | `npx nest build` | **Clean** |
| Frontend unit tests (this task) | `react-scripts test --testPathPattern=ProductionFlowCard.test.tsx` | **8/8 passed** |
| Frontend regression (specs+route) | `react-scripts test --testPathPattern=ProductionSpecificationsAndRoute.test.tsx` | **13/13 passed** |
| Frontend regression (input select) | `react-scripts test --testPathPattern=InputMaterialSelect.test.tsx` | **8/8 passed** |
| Frontend production build | `npm run build` | **Compiled with warnings** (pre-existing ESLint unused-var/exhaustive-deps in store/*, unrelated) |
| Frontend `tsc --noEmit` | — | 1 error, **pre-existing**: `src/pages/__tests__/permission-gating.test.ts` imports `vitest`, which is not a dependency (unrelated to this task; file unmodified) |

**Pre-existing failures NOT caused by this task (verified by stash/restore):** `company.controller.spec.ts` and `production-entry.service.spec.ts` (mock/transaction timing) fail identically with this task's changes absent; neither imports `item.service.*`.

## 7. Explicit requirements honoured

- ✅ **No commits** made; working tree contains only intended file changes.
- ✅ **No redesign / duplicate endpoint / duplicate field** — same six stages, same DTOs, same `/master-data/items/:id/production-flow` endpoint.
- ✅ **No hardcoded product/operation/item names** — labels derive from department/operation text; whitespace-only treated as empty; `"3.75 mm 2P"` is never truncated to `"3.75"`.
- ✅ **Four existing stages (01–04) preserved** byte-for-byte in backend and inline preview.
- ✅ **Case A/B/C/D** rendered per spec (05 = next step, 06 = final product, unconfigured when empty).
- ✅ **Stage keys/titles** stable: keys `SPIRAL`/`SPIRAL_OUTPUT`; titles dynamic (`NEXT PROCESS`/`NEXT OUTPUT` family fallback).
- ⚠️ **Browser verification was NOT performed** — verification above is unit/build level only; no UI screenshot/live-run evidence is claimed.

## 8. Files changed (uncommitted)

| File | Change |
|---|---|
| `backend/src/modules/item/services/item.service.ts` | `next.operationName` fallback; `buildSixStageFlow` stages 05/06 from explicit fields; `deriveStageLabelFromText` |
| `backend/src/modules/item/services/item.service.spec.ts` | +7 TASK 12 tests |
| `backend/p35-be-out.txt`, `frontend/devserver-out.txt`, `scripts/.erp-dev-pids.json` | Dev-run logs / PID state (from earlier runs) |
| `frontend/src/pages/master-data/ItemManagement.tsx` | Inline preview uses `finalProduct`/`packingNextStep`; removed hardcoded `'Spiral Winding'` fallback |
| `frontend/src/pages/master-data/items/ProductionFlowCard.tsx` | Output-block `itemName` fallback; dynamic legend |
| `frontend/src/pages/master-data/items/itemTypes.ts` | `deriveNextStageTitle`, `isEmptyValue` |
| `frontend/src/pages/master-data/items/ProductionFlowCard.test.tsx` | **new** — 8 frontend regression tests |

## 9. Verdict

**PASS** — the Production Flow Preview now maps the Item's **Packing / Next Step** to step 05 and **Final Product** to step 06 exactly when configured, preserves steps 01–04, stays fully data-driven (no hardcoding), and is covered by 18 new regression tests. The only outstanding noise is the pre-existing, unrelated `vitest`-typing error in `permission-gating.test.ts` and the pre-existing suite failures in the production/company controller specs. **No browser-based verification was performed.**