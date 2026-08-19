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

---

## ERP-00005-R05 — Duplicate Serial Number Trigger Fix

**Date**: 2026-08-19
**Issue**: `serial_numbers` migration had `CREATE TRIGGER` without `DROP TRIGGER IF EXISTS` — failed with `42710: trigger "update_serial_numbers_updated_at" for relation "serial_numbers" already exists`
**Root Cause**: Same as R02 — migration lacked idempotent trigger creation
**Fix**: Added `DROP TRIGGER IF EXISTS update_serial_numbers_updated_at ON serial_numbers;` before the `CREATE TRIGGER` in `20260819150000_serial_numbers.sql`

### Supabase Verification

| Check | Result |
|-------|--------|
| Table exists | PASS |
| Trigger count (exactly 1) | PASS |
| Data preserved (1 row) | PASS |
| Foreign keys (5) | PASS |
| Indexes (2) | PASS |

### Status: ERP-00005 CONTINUE

---

## ERP-00005-R06 — E2E Bug Fixes and Full Verification

**Date**: 2026-08-19

### Bugs Fixed

#### 1. InventoryBalance entity `onHand` column mapping (CRITICAL)
- **Issue**: `@Column({ type: 'decimal', ... }) onHand` — missing `name: 'on_hand'`
- **Root Cause**: TypeORM without naming strategy maps camelCase properties to camelCase columns; DB uses snake_case `on_hand`
- **Fix**: Changed to `@Column({ name: 'on_hand', type: 'decimal', ... })`
- **Impact**: Fixed Opening Stock, Adjustments, Reservations — all balance operations were broken

#### 2. `inventory_reservations.status` CHECK constraint missing RELEASED
- **Issue**: DB constraint `CHECK (status IN ('ACTIVE', 'CONSUMED', 'CANCELLED'))` rejected the `RELEASED` value set by the release service
- **Fix**: `ALTER TABLE inventory_reservations DROP CONSTRAINT ... ADD CONSTRAINT ... CHECK (status IN ('ACTIVE', 'CONSUMED', 'RELEASED', 'CANCELLED'))` — applied directly to Supabase + updated migration file
- **Impact**: Reservation release was throwing HTTP 500

#### 3. Inventory permissions not assigned to admin role
- **Issue**: The `d58932c4` admin user had Organization + Item permissions but no `inventory.*` permissions
- **Fix**: Assigned all 20 inventory permissions to the admin role via `role_permissions` INSERT
- **Impact**: All authenticated inventory endpoints were returning 403

### E2E Test Results — ALL 46 PASS

```
TEST 1:  WAREHOUSE MASTER         — 5/5 PASS
TEST 2:  WAREHOUSE LOCATIONS      — 3/3 PASS
TEST 3:  INVENTORY POLICIES       — 3/3 PASS
TEST 4:  OPENING STOCK            — 3/3 PASS
TEST 5:  STOCK LEDGER + REPORTS   — 3/3 PASS
TEST 6-7: STOCK ADJUSTMENTS       — 7/7 PASS (full workflow: create→line→submit→approve→post→ledger→balance)
TEST 8:  STOCK TRANSFERS          — 7/7 PASS (full workflow: create→line→submit→approve→post→ledger→balance×2)
TEST 9:  INVENTORY RESERVATIONS   — 4/4 PASS (create→reserve→release→verify balance)
TEST 10: BATCH/LOT TRACKING       — 3/3 PASS (create→list→supabase)
TEST 11: SERIAL NUMBER TRACKING   — 5/5 PASS (create→duplicate→list→update→supabase)
TEST 12: INVENTORY REPORTS        — 2/2 PASS (stock summary→ledger)
```

### Verification Summary

| Check | Result |
|-------|--------|
| Backend build (clean) | PASS |
| Frontend build | PASS |
| E2E Test (46/46) | PASS |
| Supabase serial_numbers table | PASS |
| Supabase serial_numbers trigger (1) | PASS |
| Supabase reservation RELEASED constraint | PASS |
| Balance on_hand mapping | PASS |
| Opening stock → balance → ledger | PASS |
| Adjustment workflow (6 steps) | PASS |
| Transfer workflow (6 steps) | PASS |
| Reservation create → release | PASS |
| Batch tracking | PASS |
| Serial number tracking | PASS |
| Stock reports | PASS |
| Inventory permissions (20) | PASS |

### Status: ERP-00005 COMPLETE (E2E + Build + Supabase verification all PASS)
