# TASK 14 — Dynamic Multi-Input/Multi-Output Production Routing & Flow

**Date:** 2026-09-11
**Scope:** Route Types + Production Routing made fully dynamic (user-configurable, no hard-coded department/operation/item names), exact Item-ID consumption/posting, routing-graph production flow, backward-compatible migration, demo data.
**Status:** Implemented & verified. **DO NOT COMMIT** (per instructions).

---

## 1. Objective

Routes and the production flow were previously hard-coded (PVC/CCD/Spoke
operation names, stage labels like `FLATTENING`/`PVC EXTRUSION`, single
input→single output, Item-Master `productionInItemId` as the only material
source). This change makes the entire model dynamic and user-configurable:

- Route Types remain **classification-only** — a Routing references a Route
  Type by ID; no behavior is derived from it.
- A routing operation may have **multiple exact input materials** and
  **multiple exact output products** (each with quantity, UOM, source
  warehouse, primary flag, scrap basis / output type).
- Raw-material consumption for Production Entry uses the **exact configured
  input Item IDs** and the **configured source warehouses**, scoped to the
  operation that produces the entry's item (fallback to legacy BOM /
  Item-Master path when no routing exists).
- The **Production Flow (dashboard chain)** is derived from the routing
  relationship graph (operation inputs/outputs), never hard-coded names.
- Migration is **backward compatible**: legacy 1:1 routes are back-filled into
  the junction tables and legacy single-column fields are kept in sync.

---

## 2. Files Changed (this task)

### Backend — new entities
- `backend/src/modules/production-routing/entities/routing-operation-input.entity.ts`
  — `RoutingOperationInput` + `RoutingInputScrapBasis` (WITH_SCRAP / GOOD_ONLY):
  `itemId, quantity, uomId, sourceWarehouseId, scrapBasis, isPrimary, lineNumber`.
- `backend/src/modules/production-routing/entities/routing-operation-output.entity.ts`
  — `RoutingOperationOutput` + `RoutingOutputType` (MAIN / CO_PRODUCT / BY_PRODUCT):
  `itemId, quantity, uomId, outputType, yieldPercentage, isPrimary, lineNumber`.

### Backend — modified
- `production-routing.entity.ts` — added `routeTypeId` + `routeType` relation.
- `routing-operation.entity.ts` — added `@OneToMany inputs/outputs`
  (cascade insert/update).
- `entities/index.ts` — exports the new entities/enums.
- `production-routing.module.ts` — registered `RoutingOperationInput`,
  `RoutingOperationOutput`, `ItemRouteType`.
- `production-routing.dto.ts` / `dto/index.ts` — `RoutingOperationInputDto`,
  `RoutingOperationOutputDto`, `routeTypeId` on Create/Update routing DTOs,
  `ReorderRoutingOperationDto` (`newSequenceNo`).
- `production-routing.service.ts` — **rewritten**: junction CRUD + validation,
  legacy single-field sync (`syncLegacyIO`), `reorderOperation`,
  `duplicateOperation` (with inputs/outputs), `getRouteFlowGraph`,
  `changeStatus` activation validation (≥1 input + ≥1 output, no circular
  forward references), `getEffectiveRouteForItem` no longer hard-codes PVC.
- `production-routing.controller.ts` — new endpoints
  `POST operations/:operationId/reorder` (perm `manufacturing.routing_operation.reorder`)
  and `POST operations/:operationId/duplicate` (perm `...duplicate`); DTO imports.
- `production/entities/production-entry-item.entity.ts` + `entities/index.ts` —
  added `ProductionEntryItemKind` (OUTPUT/INPUT), `entryKind`, `sourceWarehouseId`.
- `production/services/production-entry.service.ts` — posting now resolves the
  effective routing and consumes the **exact configured input Item IDs** per
  output production item via `consumeRoutingInputs` (scaled by good + scrap,
  per-input source warehouse precedence); records the consumed materials as
  `entry_kind='INPUT'` rows with the exact item/source warehouse. Legacy BOM
  behavior unchanged when no routing exists (INPUT rows are only produced by
  the routing path, so no behavior change for existing flows).
- `dashboard/services/dashboard.service.ts` — removed hard-coded operation and
  stage names (`PVC Extrusion`, `FLATTENING`, `SPIRAL`, `PVC EXTRUSION`,
  `Packing`); the routing query now joins inputs/outputs(+items); chain is
  built from the routing graph (`buildChainFromRouting`) when an ACTIVE routed
  income exists, else the legacy Item-Master walk (`buildLegacyChain`) with
  fully dynamic department-derived stage names.
- `dashboard/services/dashboard.service.spec.ts` — PVC expectations updated to
  dynamic values (`'PVC'` instead of `'PVC Extrusion'` / `'PVC EXTRUSION'`).

### Backend — migrations
- `1794000000000-RoutingMultiInputOutputRouteTypeLink.ts` — creates both
  junction tables + indexes; adds `route_type_id` to `production_routings`;
  adds `entry_kind` + `source_warehouse_id` to `production_entry_items`;
  back-fills junctions from legacy `input_item_id`/`output_item_id` (primary);
  back-fills `route_type_id` from `items.route_type`; seeds the two new
  permissions + grants for SUPER_ADMIN / PRODUCTION; full `down`.
- `1795000000000-SeedRoutingIOTopology.ts` — demo data on the CCD
  control-cable line demonstrating a divergent/multi-output operation
  (by-product `DEMO-BP-001` at Wire Flattening), convergent/multi-input
  operations (Spiral Winding, PVC Extrusion), a purchased raw material input
  (`DEMO-RM-PVC-001` PVC Compound), and routing→Route Type link
  (`CABLE_MFG`). Idempotent; full `down`.

### Frontend
- `pages/production/RoutingManagement.tsx` — multi-line **Input Materials /
  Output Products** editor (Form.List), reorder (up/down) + duplicate +
  delete actions, Route Type select + column + detail row, legacy single-field
  sync on save.
- `pages/master-data/RouteTypeManagement.tsx` — removed hard-coded example
  strings (`CONTROL_CABLE` etc.).

---

## 3. Behavior

- **Route Type** — created/edited independently; Routing links to it by ID
  (classification only, no behavioral coupling).
- **Multi-input / multi-output** — each operation stores any number of exact
  Item IDs. Legacy single columns are auto-synced to/from the primary junction
  rows, so old consumers (dashboard ops list, legacy API fields, Item-Master
  flow) keep working.
- **Activation safeguard** — a routing can only become ACTIVE when every
  operation has ≥1 input and ≥1 output, all referenced items/UOMs/warehouses/
  machines exist in-company, and the operation graph has no forward references
  (circular flow).
- **Production Entry posting** — for each production item (entry item + child
  lines), the operation that produces that item supplies the exact consumed
  material list; stock is validated for ALL inputs before any deduction
  (never partial), quantity = configured per-unit × (good + scrap), and each
  input's configured source warehouse takes precedence over the company
  default source store. Exact consumed items are recorded as INPUT-kind lines.
- **Production Flow (dashboard)** — chain built from routing operation
  inputs/outputs; stage names come from the operation name or its department
  (uppercased); items that are only inputs (never produced in the route) are
  marked `RAW MATERIAL / STORE`.

---

## 4. Verification performed

| Check | Result |
|---|---|
| Backend `tsc --noEmit` (whole project) | PASS (no errors) |
| `dashboard.service.spec.ts` (getItemRoute TASK45-1..5) | 5/5 PASS |
| `production-order.service.spec.ts` | 19/19 PASS |
| `item-route-type.service.spec.ts` + production-order combined run | 19/19 PASS |
| `production-entry.service.spec.ts` | 39 pass / 35 fail — failures are pre-existing DB-mock failures (`this.entryRepo.query is not a function`); no new failures introduced |
| Frontend `tsc --noEmit` | PASS except pre-existing `vitest` module error in `src/pages/__tests__/permission-gating.test.ts` |
| Frontend `RoutingManagement.test.tsx` | PASS |
| Frontend `npm run build` (CRA) | PASS |

Note: the routing-exact-consumption posting path and the new junction CRUD are
verified by compile + existing suites only; live-DB or e2e runs were NOT
performed in this session (no database/service available).

---

## 5. Pre-existing failures (not caused by this task)

- Backend `production-entry.service.spec.ts`: ~35 tests fail with
  `TypeError: this.entryRepo.query is not a function` (spec mock gap for the
  pre-existing `generateEntryNumber` path).
- Frontend `src/pages/__tests__/permission-gating.test.ts`: TS2307 (vitest not
  installed in CRA).
- jsdom `JsBarcode» noise during frontend tests.

---

## 6. Remaining limitations / notes

- `buildRouteFlowGraph`/chain currently linearizes the graph; true parallel
  branches are represented as ordered stages with the branch/co-product items
  carried as nodes (branch/convergence metadata is returned by
  `getRouteFlowGraph` for future UI rendering).
- INPUT-kind entry rows are posting-time artifacts; a subsequent PATCH on the
  production entry replaces only OUTPUT lines and will not recreate INPUT
  rows (documented behavior — a posted entry is not re-posted).