# ERP-00005 IMPLEMENTATION CHECKPOINT

## ERP-00005-R01 — Migration Syntax Fix

**Date**: 2026-08-19
**Issue**: PostgreSQL migration syntax error at line 100
**Root Cause**: `COALESCE()` expressions inside a table-level `UNIQUE` constraint — PostgreSQL does not allow function calls in inline UNIQUE constraints
**Fix**: Removed invalid `UNIQUE(...)` from `CREATE TABLE inventory_balances`, added expression-based `CREATE UNIQUE INDEX idx_inventory_balances_unique` after the table using `COALESCE(location_id, '00000000-...'::uuid)` and `COALESCE(batch_id, '00000000-...'::uuid)`

### Supabase Migration Verification

| Check | Result |
|-------|--------|
| Migration syntax | PASS |
| Tables created (9/9) | PASS |
| Unique index (COALESCE expression) | PASS |
| Foreign keys (6 on inventory_balances) | PASS |
| Indexes (8-15 per table) | PASS |
| Permissions (20 inventory) | PASS |
| Triggers (8 update_updated_at) | PASS |
| Backend build | PASS |
| Frontend build | PASS |

### Status: ERP-00005 CONTINUE

---

## ERP-00005-R02 — Duplicate Trigger Fix

**Date**: 2026-08-19
**Issue**: `CREATE TRIGGER` fails with `42710: trigger already exists` on re-run
**Root Cause**: PostgreSQL has no `CREATE TRIGGER IF NOT EXISTS`. Migration ran once (R01), all 8 triggers already existed in Supabase.
**Fix**: Prepended `DROP TRIGGER IF EXISTS ... ON table_name;` before each `CREATE TRIGGER` for all 8 triggers, making the migration idempotent.

### Supabase Re-run Verification

| Check | Result |
|-------|--------|
| Migration re-run (idempotent) | PASS |
| Tables (9/9) | PASS |
| Triggers (exactly 1 per table, all 8) | PASS |
| Unique index | PASS |
| Permissions (20) | PASS |

### Status: ERP-00005 CONTINUE
