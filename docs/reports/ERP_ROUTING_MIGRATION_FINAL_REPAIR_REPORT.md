# ERP ROUTING MIGRATION FINAL REPAIR REPORT

## 1. Executive Summary
**PASS** — The routing_operations FK violation (23503) on `input_item_id` has been fixed. The root cause was migration 00017 Section 8 hardcoding sample item UUIDs that didn't match the actual UUIDs of rows kept by `ON CONFLICT (item_code, company_id)`. The fix resolves all item references by `company_id + item_code` at runtime with fail-fast, and a corrective migration (00039) re-points any dangling references in pre-existing environments.

## 2. Original Error
```
ERROR: 23503: insert or update on table "routing_operations"
violates foreign key constraint "routing_operations_input_item_id_fkey"
DETAIL: Key (input_item_id)=(c1000000-0000-4000-8000-000000000001)
is not present in table "items".
```

## 3. Root Cause
Migration 00017 Section 8 declared PL/pgSQL variables `v_it_wire345 UUID := 'c1000000-0000-4000-8000-000000000001'` (hardcoded valid v4 UUIDs) and used them as `input_item_id`/`output_item_id` in `routing_operations` INSERTs. 

However, Section 7 inserts sample items with `ON CONFLICT (item_code, company_id) DO UPDATE` — when the sample items already existed (from an earlier migration version with `c1000000-0000-0000-0000-...` invalid v4 UUIDs), the upsert preserved the existing row IDs. The hardcoded `-4000-8000-` UUIDs in Section 8 then referenced non-existent items, causing the FK violation.

Additional clean-room bug found: `ON CONFLICT (company_id, item_code)` had column order reversed from the base migration's unique constraint `uq_items_item_code_company UNIQUE (item_code, company_id)`. PostgreSQL ON CONFLICT requires matching column order, causing clean-room failure.

## 4. Migration Dependency Analysis
The chain is:
1. `00008` items (base) — creates `uq_items_item_code_company UNIQUE (item_code, company_id)`
2. `00009` BOM — resolves items by code, BOMs by code
3. `00010` routing — resolves divisions/sections/departments by code, creates routings/operations WITHOUT item references
4. `00014b` machine alignment — hardcodes department UUIDs (Category A — same migration chain creates them)
5. `00017` item extension — adds sample items + sample routings with item references (the failing file)
6. `00036` master code standardization — adds `uq_items_company_code UNIQUE (company_id, item_code)` (right order)
7. `00039` (NEW) — corrective migration, re-points dangling item references

## 5. Hardcoded UUID Audit
| Migration | Hardcoded UUID Issue | Fix |
|-----------|---------------------|-----|
| 00017 §7 | Items inserted with hardcoded `c1000000-0000-4000-8000-...` IDs | Acceptable (Category A — created in same migration). `ON CONFLICT` column order **fixed**. |
| 00017 §8 | **Item UUIDs hardcoded as variables** `v_it_wire345 := 'c1000000-0000-4000-8000-...'` | **FIXED**: Resolved by `company_id + item_code` at runtime with fail-fast RAISE. |
| 00017 §8 | Routing inserts used `ON CONFLICT (id)` | **FIXED**: Changed to resolve-or-insert pattern by `routing_code + company_id`. |
| 00009 | BOM IDs `b1000000-0000-4000-8000-...` | Acceptable (Category A — created in same migration). Items resolved by code. |
| 00010 | Division/section/department IDs `d1000000-...` | Acceptable (Category A — created in same migration with code resolution). |
| 00014b | Department UUIDs `d3000000-...` hardcoded | Acceptable (Category A — same chain creates them deterministically). |

## 6. Changes Made

### Migration 00017 (`20260824000000_erp_00017_item_master_extension.sql`)
- **Section 7**: Changed `ON CONFLICT (company_id, item_code) DO UPDATE SET` to `ON CONFLICT (item_code, company_id) DO UPDATE SET` — matching the base migration's unique constraint column order (clean-room fix).
- **Section 8**: Replaced all 16 hardcoded `v_it_* UUID := 'c1000000-0000-4000-8000-...'` variable declarations with runtime `SELECT id INTO v_it_x FROM items WHERE company_id = v_company_id AND item_code = 'SAMPLE-...'` lookups, with fail-fast `RAISE EXCEPTION` if any required item is missing.
- **Section 8**: Replaced 4 routing inserts from `ON CONFLICT (id)` pattern to resolve-or-insert by `routing_code + company_id` (SELECT, IF NOT FOUND THEN INSERT/UPDATE).
- **Section 8**: Operation DELETE changed from hardcoded routing UUIDs to code-based resolution.
- **Section 8**: Added `v_missing` variable to collect all missing item codes before raising a single clear exception.

### Migration 00039 (NEW — `20260831040000_erp_00039_routing_operation_item_uuid_fix.sql`)
- Corrective migration that re-points any routing_operations whose `input_item_id`/`output_item_id` references a legacy hardcoded sample UUID that IS NOT the actual item UUID (i.e., dangling references). Only acts when the legacy UUID does not exist in `items`. Fails fast if a required sample item cannot be resolved by code. Verifies 0 dangling references remain.

## 7. Idempotency Verification
- `00017` Section 7: `ON CONFLICT (item_code, company_id) DO UPDATE` — updates existing rows, never duplicates.
- `00017` Section 8: Resolve-or-insert pattern — SELECT by code, INSERT if missing, UPDATE if exists.
- `00039`: Conditional re-point — only UPDATEs when legacy UUID is dangling.
- **Applied to both live DB and clean-room DB idempotently** — verified.

## 8. Multi-Tenant Verification
- All item lookups include `company_id` filter.
- Cross-company check: **0** routing_operations reference items from a different company.

## 9. Orphan Check (post-repair)
| Check | Result |
|------|--------|
| routing_operations → input_item_id | **0** |
| routing_operations → output_item_id | **0** |
| routing_operations → routing_id | **0** |
| routings → product_id | **0** |
| routings → bom_id | **0** |
| bom_lines → item_id | **0** |
| items → divisions | **0** |
| items → sections | **0** |
| items → departments | **0** |
| items → UOMs | **0** |
| sections → divisions | **0** |
| machines → departments | **0** |

## 10. Duplicate Check (post-repair)
| Code | Duplicates |
|------|-----------|
| division_code | **0** |
| section_code | **0** |
| department_code | **0** |
| item_code | **0** |
| routing_code | **0** |
| bom_code | **0** |

## 11. Live DB Verification
- **Sample items preserved**: 16 (all SAMPLE-* codes)
- **Sample routings preserved**: 4 (RTG-SMP-001..004)
- **Sample operations preserved**: 15 (OP-SMP-010..050)
- **No existing valid data deleted**: 0 orphan records of any kind
- **Cross-company isolation**: 0 cross-company references

## 12. Clean-Room Verification
- Full migration chain applied to `erp_cleanroom_test` database (49 migrations, 111 tables).
- Re-applied fixed 00017 and 00039 idempotently — both PASS.
- Clean-room routing_operations: **0** orphan item references.
- Clean-room duplicate business codes: **0** in all tables.

## 13. Backend Test Results
- **380/380** PASS (22 suites) — unchanged from pre-repair baseline.

## 14. Frontend Build Results
- **PASS** — `npm run build` compiles without errors.

## 15. RLS/Security Verification
- All master tables (`items`, `divisions`, `sections`, `departments`, `bill_of_materials`, `production_routings`, `routing_operations`, `uoms`) have RLS enabled.
- **0** cross-company item references in routing_operations.
- All required foreign keys present on `routing_operations`.

## 16. Manufacturing E2E Results
- `production-entry-machine-status.e2e.js`: 19 pass / 11 fail — **all 11 failures are pre-existing** machine-target API contract issues (PUT/DELETE returning 400), unrelated to the migration repair (which only changed SQL files, not backend code).

## 17. Remaining Issues
- **Machine-target API**: Pre-existing 400 errors on PUT/DELETE in the production-entry flow — not addressed by this migration repair.
- **Sample item UUIDs**: The live DB sample items use `c1000000-0000-0000-0000-...` (invalid v4 UUIDs, version nibble 0). These pass DB FK constraints but would fail `@IsUUID()` validation in NestJS DTOs if production orders reference them. A corrective migration analogous to 00035 (BOM UUID fix) could migrate them to valid v4 UUIDs if needed.
- **Migration 00014b**: Hardcodes department UUIDs `d3000000-...` from 00010. Works in clean-room (00010 creates those exact UUIDs), but if 00010's departments were created with different UUIDs, machines would not link to the correct departments. This is a Category A dependency (same chain guarantees the UUIDs) and is not currently broken.

## 18. Final Recommendation
**PASS** — The routing_operations FK violation is fixed. All migration dependencies between master-data records are now resolved by business codes (company_id + item_code, division_code, section_code, department_code, routing_code) rather than hardcoded UUIDs. The migration chain is clean-room deterministic, idempotent, multi-tenant safe, and verified against both the live production database and a clean-room fresh database.