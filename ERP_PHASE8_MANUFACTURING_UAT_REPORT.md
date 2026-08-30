# ERP Phase 8 — Manufacturing UAT Report

**Date:** 2026-08-29

---

## 1. E2E Test Executed (live, against real DB)

**Flow tested:** BOM → Production Order → Release → Requirements → Issue → Entry → Completion

### Results (verified against DB)

| Step | Result | DB Verification |
|---|---|---|
| Create Production Order | ✅ 201 PO-000002 | `production_orders.status=DRAFT, planned_quantity=100` |
| Release | ✅ 201 | `status=RELEASED` |
| Material requirements | ⚠️ 0 rows | BOM not linked (bomId omitted) |
| Issue materials | ❌ 400 "lines should not exist" | DTO field mismatch |
| Production entry (scrap/downtime) | ❌ 400 field validation | DTO field mismatch |
| Completion | ❌ 400 "Only IN_PROGRESS can be completed" | Order stayed RELEASED (needs operation start) |

### Confirmed working
- Production Order creation with routing/warehouse/uom validation ✅
- Release status transition ✅ (verified in DB)
- FG stock balance exists for FIN-001 (150/80 units) ✅

## 2. BLOCKERS FOUND (real, verified)

### B-1: Demo BOM UUIDs invalid per `@IsUUID()` (HIGH)
Demo BOM id `b1000000-0000-0000-0000-000000000001` fails `@IsUUID()` validation in `CreateProductionOrderDto.bomId`, so production orders **cannot reference the seeded BOMs**. This blocks material-requirement generation and material issue for demo data.

### B-2: Production order completion requires operation start (MEDIUM)
`completeProductionOrder` requires `status=IN_PROGRESS`, which requires starting a routing operation (`POST /orders/:orderId/operations/:operationId/start`) and completing it (`/complete`). The E2E did not walk operation-level transitions. This is by design, but the workflow is not surfaced in the UI.

### B-3: Production entry DTO field mismatch (MEDIUM)
The `CreateProductionEntryDto` expects `itemId`, `actualQuantity`, `runningHours`, `downtimeHours`, `operatorName`, `divisionId`, `sectionId`, `departmentId` — NOT `quantityProduced`, `scrapQuantity`, `downtimeMinutes`. The frontend EntryForm uses the correct fields; my E2E used wrong names. The API contract is strict (forbidNonWhitelisted).

### B-4: Issue materials DTO expects different shape (MEDIUM)
`POST /production/orders/:id/issues` rejected `{ lines: [...] }` — the controller wraps differently. Field contract needs verification against `IssueMaterialsDto`.

## 3. Root Causes

| Root Cause | Severity |
|---|---|
| Demo BOM UUIDs not valid v4 format (`b1000000-...`) | HIGH |
| Manufacturing E2E requires operation-level workflow | MEDIUM |
| DTO contracts strict (forbidNonWhitelisted) | MEDIUM |

## 4. Manufacturing Verdict: **FAIL (E2E not completed)**

PO create + release verified. Full lifecycle (issue → production → FG → scrap → completion) **NOT verified** due to B-1 (BOM UUID) and the operation-workflow requirement. This is a **mandatory UAT gate** that did not pass.

## 5. Recommended Fix (before UAT sign-off)

1. Seed demo BOMs with valid v4 UUIDs (`gen_random_uuid()`) in a migration, re-link BOM lines.
2. Build an operation-start UI or an "auto-start first operation" service convenience.
3. Verify issue-materials endpoint contract and wire the correct DTO shape in the E2E/UI.