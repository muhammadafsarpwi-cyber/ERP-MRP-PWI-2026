# ERP Production Flow — Task 14 Fully Dynamic Stages Final Report

**Date:** 2026-09-11
**Task:** TASK 14 — Fully Dynamic Production Flow by Division / Section / Department / Item
**Scope:** Replace the hardcoded six-stage production-flow template with a stage model driven entirely by real Item Master + routing data; verified end-to-end tests, typechecks, and builds.

---

## 1. Problem Found

The production flow preview ("01 → 06") was hardcoded:

- Stage titles were emitted from keyword matching inside helper functions (`classifyRouteItem`, `buildSixStageFlow`, `deriveStageLabelFromText`, keyword fallbacks in `deriveOperationName` / `deriveStageOperationName` / the edit-modal preview builder in `ItemManagement.tsx`).
- The flow always rendered exactly **six stages** (Flattening, Spiral, At Take-off, Taking-off Machine, Moving To Fabrication, Final Products) regardless of the real Item Master chain.
- Step numbers, operation names, and item references were fabricated through canonical name substitution (e.g. any unknown upstream item was glossed as "Flattening") rather than surfaced as real data.
- Division / Section / Department identity was not propagated to the flow beyond hardcoded strings.

## 2. Root Cause

The flow was built from text matching rather than from the authoritative Item Master chain (the real series of `Item` rows linked by `productionInItemId`). Because naming helpers "guessed" a canonical stage out of the item name, real chains of any other length, shape, or department produced a wrong or incomplete flow, and the interactive top preview and the detailed card were constructed by two different code paths that could disagree.

## 3. Dynamic Flow Architecture

A single authoritative resolver now produces the flow (no duplicate routing, no second item mapping, no duplicate API):

- **One resolver, one chain.** `buildRouteChain(currentItem)` walks the real Item Master chain both directions:
  - **Upstream** — follows `productionInItemId` parents back to the raw-material root (no fabricated items).
  - **Downstream** — queries `items` where `production_in_item_id = id` to include consuming items (limited, cycle-guarded).
- The existing endpoint `GET /master-data/items/:id/production-flow` (`cardTopPreview` / `getProductionFlow`) now returns:
  - `fullRoute` — **one real Item per chain position** (the top preview uses exactly this).
  - `stages` — the expanded `RAW → process/output` view built by `buildDynamicStages` over the very same chain.
  - `cycleDetected: boolean` and `warning: string | null`.
- Both the interactive edit-modal preview and the detailed card are derived from the same stage-building rules; the edit-modal preview in `ItemManagement.tsx` rebuilds its stages from the same form data (input item + `modalProcesses` + current item + leaf `nextStep`/`finalProduct`) that the saved item produces.
- No keyword/stage-name mapping remains: stage titles come verbatim from the real department/process/route data.

## 4. Division / Section / Department

Every stage now carries real organization identity:

- Each chain Item is loaded with its `department` relation, and the department's `division` / `section` propagate onto the stage.
- Stage fields added to `ProductionFlowStage`: `itemNumber`, `divisionId`, `divisionName`, `sectionId`, `sectionName`, `departmentId`, `departmentName`.
- `ProductionFlowCard` renders **`Division · Section`** on process stages (safe `—` when missing).
- Operation resolution is data-only, in priority order (no keyword canons):
  1. operations-table record for the department (`resolveOperationForDepartment`),
  2. department name verbatim,
  3. `spokes.processes[last]`,
  4. `spokes.process1`,
  5. `routeTypeRef.name`,
  6. `routeType`.
- The current/next operation names (`deriveOperationName`) use `processes[0] → process1 → department → routeTypeRef.name → routeType`.

## 5. Dynamic Step Numbering

- Step numbers are no longer fixed to "01 → 06".
- Every stage carries `sequence`; the chain root is step 01 and every real chain item after it advances the step count, so a chain of N real items produces **N = 1 + 2 × (N − 1)** stages with steps 01 … N.
- The detailed card header tag is dynamic (`01 → N`), the edit-modal header reads `Production Flow — N Stages`, and the status strip shows the real configured count (`X / N stages configured`).

## 6. Dynamic Item Numbering

- Each chain position is numbered by `itemNumber === sequence` (1-based), pinned by regression tests.
- The first stage is `RAW MATERIAL` (the chain root, operationName `null`).
- A `process` stage + an `output` stage (title `<OPERATION> OUTPUT`) are emitted for **every** real chain item after the root, referencing the real item (itemCode intact even when the operation is missing).

## 7. Dynamic Input / Output Mapping

- Input side: the root `RAW MATERIAL` stage reflects the real upstream item; no virtual "Flattening input" is invented.
- Output side: each process stage is followed by an `<OPERATION> OUTPUT` stage carrying the real item code + name.
- Leaf tail (only appended when the leaf item has real, non-whitespace values):
  - `nextStep` / `packingNextStep` → a `NEXT_STEP` process stage (title = text uppercased, operationName = text).
  - `finalProduct` → a `FINAL_PRODUCT` output stage (itemName = text, itemCode = null).
- Nothing is fabricated: a missing `nextStep` just ends the chain; a missing operation keeps the real item but marks that process stage `configured = false`.

## 8. More / Fewer Than Six Stages

- The fixed six-stage template and `buildSixStageFlow` are deleted; `STAGE_COLORS` now acts as a fallback palette keyed by `< 1..6 / other>`.
- Verified by tests: a real 3-item chain yields **9** stages (more than six) and a real 2-item chain yields **3** stages (fewer than six) — both render from the same resolver.
- Counts are derived (`1 + 2 × (items − 1)`), never hardcoded.

## 9. Cycle Protection

- `buildRouteChain` returns `{ chain, cycleDetected }`; the response carries `cycleDetected` + `warning: 'Production flow cycle detected.'`.
- Upstream: a back-edge to the root item, a self-reference, or a repeat of an already-collected parent flags a cycle.
- Downstream: a child that revisits an already-visited item (`A → B → A`) stops traversal and flags a cycle; a hard 100-step safety bound also flags oversized chains.
- `ProductionFlowCard` shows a warning banner when `flow.warning` is present.
- Note: a verification-only `seen` set bug introduced while wiring this feature flagged every normal route as a cycle; it was found by the new backend spec and corrected (cycle detection now tracks fully-collected nodes, not in-flight lookups).

## 10. Tests

Backend — `backend/src/modules/item/services/item.service.spec.ts` (rewritten "TASK 14 — fully dynamic production flow stages" describe block, replacing the TASK 12 preview suite):

- Scenario B chain (raw → straightening → swagging): titles, steps, items, operations, and departments from real data — no "Flattening" invented
- `fullRoute` / stage step numbering alignment
- Current item preserved as its own `process` stage + `<OP> OUTPUT` stage
- Different department → different flow (no hardcoded titles)
- More than six stages (real 3-item chain → 9 stages)
- Fewer than six stages (real 2-item chain → 3 stages)
- Missing `nextStep` ends chain; missing operation keeps the real item with `configured = false`
- Cycle detection (`A → B → A` and upstream repeats) flags `cycleDetected`; normal chains do **not** flag it
- No duplicate / fabricated item codes in stages (raw referenced exactly once + once per process/output)
- Explicit `packingNextStep` + `finalProduct` appended only at the leaf
- Division / Section / Department propagate to each stage
- Top preview (`fullRoute`) and detailed flow (`stages`) share one authoritative route

**Result: 48/48 passed** across the full `item.service.spec.ts` suite.

Frontend — `frontend/src/pages/master-data/items/ProductionFlowCard.test.tsx` (rewritten for the dynamic model), **10/10 passed**:

1–4. `stageTitleForOperation` / `isEmptyValue` helpers: verbatim text (no canonical substitution), never substitutes unrelated names, `null`/whitespace handling
5. STEP + ITEM numbers render on a configured stage
6. Real operation name comes from data
7. Em dash (`—`) for a configured stage with no operation
8. Division · Section renders when available
9. Output stage renders real item code + name
10. "Not configured" shows for an unconfigured stage

Regression: `ItemManagement` suites **25/25 passed** (incl. the live preview built from the new dynamic builder and imported `stageTitleForOperation`). jsdom logs expected `JsBarcode` canvas-not-implemented noise; it is caught by the component's existing try/catch and does not fail tests.

## 11. TypeScript

- Backend: `npx tsc --noEmit -p tsconfig.json` — **clean**.
- Frontend: `npx tsc --noEmit` — **clean except the single pre-existing, unrelated error** `src/pages/__tests__/permission-gating.test.ts(1,38): error TS2307: Cannot find module 'vitest'`. No TASK 14 files contribute TS errors.

## 12. Builds

- Backend: `npm run build` (`nest build`) — **succeeds**.
- Frontend: `npx cross-env CI=false react-scripts build` — **succeeds**; `main.5a32232e.js` 1.07 MB (+8 B), CSS `main.cfcccd2c.css` 15.95 kB. Only pre-existing, non-blocking lint warnings remain.

## 13. Browser Verification

**Browser verification: NOT EXECUTED** — no browser-driving tooling was available in the execution environment for Task 14. UI behavior was verified through jsdom rendering tests (§10) and the production build (§12); an interactive browser pass is recommended before release sign-off.

## 14. Files Changed

| File | Change |
|---|---|
| `backend/src/modules/item/services/item.service.ts` | `buildRouteChain` returns `{ chain, cycleDetected }` with real upstream/downstream walking + cycle guard; `buildDynamicStages` (RAW root + process/output per item + leaf NEXT_STEP/FINAL_PRODUCT tail); `deriveOperationName` / `deriveStageOperationName` data-only; keyword fallbacks and `classifyRouteItem` / `buildSixStageFlow` / `deriveStageLabelFromText` removed; response/stage types extended (`cycleDetected`, `warning`, `itemNumber`, division/section fields) |
| `backend/src/modules/item/services/item.service.spec.ts` | TASK 12 preview spec replaced with TASK 14 fully-dynamic describe block (~12 new cases) + `mockChain` helper |
| `frontend/src/pages/master-data/items/itemTypes.ts` | `ProductionFlowStage` / `ProductionFlowResponse` extended; `deriveNextStageTitle` removed, replaced by `stageTitleForOperation` |
| `frontend/src/pages/master-data/items/ProductionFlowCard.tsx` | Dynamic stage rendering (STEP+ITEM badges, Division · Section, `—` fallback, cycle warning banner, dynamic `01 → N` tag and `X / N stages configured`); configured/unconfigured blocks updated |
| `frontend/src/pages/master-data/items/ProductionFlowCard.test.tsx` | Rewritten for the dynamic model (10 tests) |
| `frontend/src/pages/master-data/ItemManagement.tsx` | Edit-modal live preview rebuilt with the dynamic builder (same stage-building rules as backend); keyword mapping removed from `operationName` / input-op fallbacks; `Production Flow — N Stages` header; `Operation: —` fallback |

## 15. Remaining Issues

- Browser-level visual/interaction verification still pending (see §13).
- Pre-existing (not caused by Task 14): `permission-gating.test.ts` `vitest` TS error; backend suites `company.controller.spec.ts` and `production-entry.service.spec.ts` (43 tests, unrelated to item flow).
- jsdom cannot measure SVG text, so `JsBarcode` falls back to the component's guarded text render in tests (real-browser barcode path unchanged).

## 16. Final Status

**PASS WITH DOCUMENTED LIMITATIONS**

- Backend item.service tests: ✅ 48/48
- Frontend ProductionFlowCard tests: ✅ 10/10
- Frontend ItemManagement regression: ✅ 25/25
- Backend TypeScript: ✅ clean
- Frontend TypeScript: ✅ no new errors (one pre-existing, unrelated `vitest` error)
- Backend build: ✅
- Frontend build: ✅
- Browser verification: ⚠️ NOT EXECUTED — documented in §13
- No commit performed.