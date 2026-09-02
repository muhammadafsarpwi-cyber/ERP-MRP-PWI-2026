-- =============================================================================
-- ERP-00042: Task #4 — WIP warehouse for the demo manufacturing chain
-- =============================================================================
-- Adds ONE clearly marked demo WIP warehouse (WORK_IN_PROGRESS) for the demo
-- company so intermediate production outputs (FLAT-WIRE-040-260, SPIRAL-375)
-- are independently visible in inventory_balances via the existing warehouse
-- architecture. This is additive sample data only — NO new tables, NO new
-- balance mechanism, NO schema change.
-- Idempotent: re-running never duplicates the warehouse.

INSERT INTO warehouses (company_id, warehouse_code, name, warehouse_type, status, is_active, created_at, updated_at)
SELECT '7725aa04-a270-4314-9e82-90949cbe7791', 'WIP-CCD', 'WIP Control Cable [SAMPLE]', 'WORK_IN_PROGRESS', 'ACTIVE', true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM warehouses
  WHERE warehouse_code = 'WIP-CCD' AND company_id = '7725aa04-a270-4314-9e82-90949cbe7791'
);
