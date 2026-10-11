-- =====================================================
-- Migration: 20261010220000_erp_00072_warehouse_division.sql
-- Description: Add division_id column to warehouses table with foreign key to divisions,
--              create index, and backfill existing warehouses.
-- =====================================================

-- 1. Add division_id column to warehouses
ALTER TABLE warehouses 
ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES divisions(id);

-- 2. Create index on division_id
CREATE INDEX IF NOT EXISTS idx_warehouses_division_id ON warehouses(division_id);

-- 3. Backfill existing warehouses
-- Control Cable Division (DIV-CCD)
UPDATE warehouses
SET division_id = 'd1000000-0000-0000-0000-000000000002'
WHERE division_id IS NULL 
  AND (warehouse_code ILIKE 'CCD%' OR name ILIKE '%CCD%');

-- Spoke Division (DIV-SPD)
UPDATE warehouses
SET division_id = 'd1000000-0000-0000-0000-000000000001'
WHERE division_id IS NULL 
  AND (warehouse_code ILIKE 'SPI%' OR name ILIKE '%SPI%');

-- Default remaining to Main Division E-51 (DIV-PWI) if exists, else first division of that company
UPDATE warehouses w
SET division_id = COALESCE(
  (SELECT id FROM divisions WHERE division_code = 'DIV-PWI' LIMIT 1),
  (SELECT id FROM divisions WHERE company_id = w.company_id LIMIT 1)
)
WHERE w.division_id IS NULL;
