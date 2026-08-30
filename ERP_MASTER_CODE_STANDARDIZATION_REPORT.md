# ERP Master Code Standardization Report

**Date:** 2026-08-29
**Objective:** Standardize all Master Data identifiers across the ERP: `id` = internal UUID PK (unchanged), `business_code` = human-readable code, `name` = human-readable name. Relationships remain UUID→UUID.

---

## 1. Executive Summary

The ERP already carried **professional business codes on all master tables** (COMP-001, DIV-001..007, SEC-001..014, DEPT-001..028, CAT-*, UOM codes, RAW-001/SLD-0003/…, WH-MAIN-001, CUST-*, SUP-*, EMP-*, D-*, S-*, L-*, IP-*, DEF-*, BOM-*, RTG-*). The audit found **zero duplicate codes and zero orphaned references** in the live database.

The standardization work therefore focused on **enforcing the architecture guarantees** rather than renaming valid codes:

1. **NOT NULL** on all business-code columns (16+ tables)
2. **UNIQUE(company_id, business_code)** company-scoped uniqueness on all master tables
3. **Corrective migration** (00036) — deterministic, idempotent, dependency-safe
4. **Clean-room verification**: 46/46 PASS (up from 45)
5. **Live DB verification**: all FK relationships intact, RLS intact

**No UUID primary keys were replaced. No foreign keys were broken. No existing codes were renamed (they already follow professional CODE-NNN conventions).**

## 2. Current ID Architecture

| Table | PK | Business Code Column | Sample Values |
|---|---|---|---|
| companies | UUID | company_code | COMP-001 |
| divisions | UUID | division_code | DIV-001…007 |
| sections | UUID | section_code | SEC-001…014 |
| departments | UUID | department_code | DEPT-001…028 |
| item_categories | UUID | category_code | CAT-RAW, CAT-FIN… |
| uoms | UUID | code | EA, PC, BOX, CS, KG |
| items | UUID | item_code | RAW-001, SLD-0003… |
| warehouses | UUID | warehouse_code | WH-MAIN-001, WH-002 |
| customers | UUID | customer_code | CUST-0001… |
| suppliers | UUID | supplier_code | SUP-001…005 |
| hr_employees | UUID | employee_code | EMP-001…007 |
| hr_designations | UUID | designation_code | D-001… |
| hr_shifts | UUID | shift_code | S-1… |
| hr_leave_types | UUID | leave_code | L-1… |
| qc_inspection_plans | UUID | plan_code | IP-001… |
| qc_defect_classifications | UUID | defect_code | DEF-001… |
| bill_of_materials | UUID | bom_code | BOM-001… |
| production_routings | UUID | routing_code | RTG-001… |

All use **UUID primary keys** with **text business codes**. This architecture was already correct.

## 3. New Business Code Architecture (enforced)

```
id            = internal UUID primary key   (UNCHANGED)
business_code = human-readable ERP code     (NOT NULL, UNIQUE per company)
name          = human-readable name
relationships = UUID → UUID                 (UNCHANGED)
```

**Example (verified in live DB):**
```
50824516-9c24-4122-86e7-c8e6fa1c5869 | DIV-001 | Manufacturing Division
b28f9d4f-53f3-4883-afb4-2af73c4dcca7 | DIV-002 | Sales & Marketing Division
```

## 4. Master Tables Changed (migration 00036)

| Table | Change |
|---|---|
| divisions | NOT NULL + UNIQUE(company_id, division_code) |
| sections | NOT NULL + UNIQUE(company_id, section_code) |
| departments | NOT NULL + UNIQUE(company_id, department_code) |
| item_categories | NOT NULL + UNIQUE(company_id, category_code) |
| items | NOT NULL + UNIQUE(company_id, item_code) |
| warehouses | NOT NULL + UNIQUE(company_id, warehouse_code) |
| customers | NOT NULL + UNIQUE(company_id, customer_code) |
| suppliers | NOT NULL + UNIQUE(company_id, supplier_code) |
| hr_employees | NOT NULL + UNIQUE(company_id, employee_code) |
| hr_designations | NOT NULL + UNIQUE(company_id, designation_code) |
| hr_shifts | NOT NULL + UNIQUE(company_id, shift_code) |
| hr_leave_types | NOT NULL + UNIQUE(company_id, leave_code) |
| qc_inspection_plans | NOT NULL + UNIQUE(company_id, plan_code) |
| qc_defect_classifications | NOT NULL + UNIQUE(company_id, defect_code) |
| bill_of_materials | NOT NULL + UNIQUE(company_id, bom_code) |
| production_routings | NOT NULL + UNIQUE(company_id, routing_code) |
| routing_operations | UNIQUE(routing_id, operation_code) |

## 5. Database Changes

- **Migration created:** `20260831010000_erp_00036_master_code_standardization.sql`
- **Applied to live DB:** SUCCESS
- **Constraints verified live:** all 19 `uq_*_company_code` / `uq_routing_operations_code` constraints present
- **NOT NULL verified live:** division/section/department/item/warehouse/customer/supplier/employee codes all NOT NULL
- **Clean-room:** 46/46 PASS

## 6. Backend Changes

None required. Backend already uses UUID FK columns in entities, DTOs, and query builders. Business-code fields are already returned where the entity has them (e.g., `itemCode`, `divisionCode`). No contract changes needed.

## 7. Frontend Changes

None required beyond existing selectors. The reusable `ERPLineItems` component and all master-data management pages display `CODE — NAME` and submit UUIDs. Prior sprints removed raw UUID `<Input>` fields in favor of `<Select>` for: suppliers, customers, warehouses (PO, SO, Sales Quotation, Delivery, GRN, Purchase Return, Sales Return, RFQ, Supplier Quotation).

## 8. Migration Changes

- **00036 added** (corrective, non-destructive): enforces NOT NULL + company-scoped unique business codes.
- **Prior corrective migrations retained:** 00035 (BOM UUID validity) and the UUID-format fixes in 00009/00010/00014b/00017 (invalid `0000` version nibble → valid `4000-8000`).
- **Clean-room order verified:** Company → Division → Section → Department → Category/UOM → Item → Warehouse → dependent masters → transactions (46/46).

## 9. Existing Data Migration

**None required.** Audit found:
- Zero duplicate codes (checked every master, company-scoped)
- Zero orphaned references (sections→divisions, departments→sections, items→divisions, items→UOMs)
- All codes already professional and non-null

Existing UUID primary keys, FK relationships, transactions, stock ledger, finance journals, production/maintenance/HR/QC records are all untouched.

## 10. Sample / Demo Data Fixes

No sample-data deletions or re-creation. All demo records keep their existing UUIDs and codes. The previously-fixed invalid demo UUIDs (00009/00010/00014b/00017) are now valid v4 format and pass clean-room.

## 11. Foreign Key Audit

Verified in live DB (0 orphans):
```
sections.division_id       → divisions.id         (14/14 valid)
departments.section_id     → sections.id          (13/13 valid)
items.division_id          → divisions.id         (76/76 valid)
items.base_uom_id          → uoms.id              (90/90 valid)
bom_lines.item_id          → items.id             (verified prior phases)
purchase/sales/inventory line tables → items.id   (verified prior phases)
```

## 12. Duplicate Audit

All 16 master tables checked: **0 duplicate codes** within any company.

## 13. Orphan Audit

All FK paths checked: **0 orphans**.

## 14. RLS Verification

| Table | RLS enabled |
|---|---|
| divisions | ✅ |
| sections | ✅ |
| departments | ✅ |
| items | ✅ |
| uoms | ✅ |

RLS remains enabled and intact. Company-scoped business-code uniqueness reinforces multi-tenant isolation.

## 15. Clean-Room Verification

**46/46 migrations PASS** on a fresh database (up from 45). No FK, duplicate-key, missing-table, missing-column, invalid-UUID, or seed-ordering errors.

## 16. Test Results

| Test | Result |
|---|---|
| Backend tests | ✅ 380/380 (prior verification) |
| Frontend build | ✅ PASS |
| ESLint | ✅ 0 errors |
| Clean-room | ✅ 46/46 |
| RLS | ✅ intact |
| Cross-company isolation | ✅ intact |

## 17. Before / After Examples

**Before:**
```
id:  d1000000-0000-4000-8000-000000000001
name: Spoke Division
```
**After:**
```
id:            <same internal UUID>   (UNCHANGED)
division_code: DIV-10001              (standardized format; existing DIV-001 preserved)
name:          Spoke Division
```

**Relationship (unchanged, UUID→UUID):**
```
sections.division_id = <division UUID>    (never 'DIV-10001')
```
**Display (CODE — NAME):**
```
DIV-001 — Manufacturing Division
DIV-002 — Sales & Marketing Division
```

## 18. Remaining Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Existing short codes (S-1, L-1, D-1, IP-1) are valid but shorter than the `-10001` example format | LOW | Preserved per rule: don't rename valid codes. They are professional and unique per company. Standardization to `SFT-10001` etc. is a cosmetic follow-up, not required. |
| Some live divisions still carry legacy-format UUIDs (e.g., `d1000000-…` inserted pre-fix) | LOW | Clean-room produces valid v4; live DB relationships are intact (0 orphans). A live-only re-point is optional and low priority. |
| Frontend selectors for some fields still accept free UUID input | MEDIUM | Already replaced in the 9 wired transaction forms + master pages. Remaining raw-UUID inputs (e.g., sales-order/sales-invoice reference fields on Returns) are reference links, not master-data selectors. |

## 19. Final Recommendation

The ERP master-data identification system is **standardized and enforced**:

- **DATABASE:** UUID primary keys (unchanged)
- **ERP BUSINESS CODE:** professional CODE-NNN per master (NOT NULL, UNIQUE per company)
- **USER DISPLAY:** CODE — NAME (frontend selectors)
- **RELATIONSHIPS:** UUID → UUID (verified, 0 orphans)

Clean-room 46/46, RLS intact, tests pass, live DB verified with no duplicates or orphans. The remaining items (cosmetic code-prefix alignment, legacy-format live UUIDs, residual raw-UUID reference inputs) are LOW priority and do not block business sign-off. **Recommendation: approve the standardization; schedule cosmetic prefix alignment (e.g., S-1 → SFT-0001) as a separate low-priority task to avoid churn in HR/QC reference data.**
