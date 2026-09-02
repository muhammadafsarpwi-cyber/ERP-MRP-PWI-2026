-- =============================================================================
-- ERP-00040: Item Master Foundation - Flattened Wire Specifications
-- =============================================================================
-- TASK #1: Add first-class flattened-wire specification fields (thickness_mm and
-- width_mm) to the EXISTING items table only.
--
-- This migration is 100% idempotent and non-destructive.
--  * Only ADDs missing columns / constraints / indexes to the EXISTING items
--    table. No new tables, no new module, no duplicate architecture.
--  * No table is dropped or recreated. No existing row is modified except the
--    clearly identifiable [SAMPLE] rows refreshed below (fixed UUIDs).
--  * The existing wire_size_mm column is untouched and remains the item's own
--    specification. thickness_mm / width_mm are ADDITIONAL nullable fields used
--    for flattened / semi-finished wire items (e.g. 0.40 x 2.60 mm Flat Wire).
--  * BOM / Routing / Production Entry / Inventory / WIP / Warehouse / UOM
--    architecture is NOT touched by this migration.
-- =============================================================================

-- ============================================================================
-- SECTION 1: NEW COLUMNS ON EXISTING items TABLE (nullable -> existing rows stay valid)
-- ============================================================================

ALTER TABLE items ADD COLUMN IF NOT EXISTS thickness_mm NUMERIC(8,3);
ALTER TABLE items ADD COLUMN IF NOT EXISTS width_mm NUMERIC(8,3);

-- ============================================================================
-- SECTION 2: CHECK CONSTRAINTS (idempotent, non-negative only)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_items_thickness_mm_positive') THEN
    ALTER TABLE items ADD CONSTRAINT ck_items_thickness_mm_positive
      CHECK (thickness_mm IS NULL OR thickness_mm >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_items_width_mm_positive') THEN
    ALTER TABLE items ADD CONSTRAINT ck_items_width_mm_positive
      CHECK (width_mm IS NULL OR width_mm >= 0);
  END IF;
END $$;

-- ============================================================================
-- SECTION 3: INDEXES for filtering / sorting
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_items_thickness_mm ON items(thickness_mm);
CREATE INDEX IF NOT EXISTS idx_items_width_mm ON items(width_mm);

-- ============================================================================
-- SECTION 4: COLUMN DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN items.thickness_mm IS 'TASK #1: Thickness in mm (the item''s own specification, e.g. flattened wire 0.40 x 2.60 mm)';
COMMENT ON COLUMN items.width_mm IS 'TASK #1: Width in mm (the item''s own specification, e.g. flattened wire 0.40 x 2.60 mm)';

-- ============================================================================
-- SECTION 5: SAMPLE DATA (TASK #1 / ERP-00017 convention)
-- Clearly identified with [SAMPLE] names and SAMPLE- codes so real production
-- data can never be confused with test records. Only refreshes the existing
-- fixed-UUID sample row for the flattened wire item (0.40 x 2.60 mm Flat Wire);
-- never touches real company data.
-- ============================================================================

UPDATE items
SET thickness_mm = 0.400, width_mm = 2.600,
    updated_at   = NOW()
WHERE id = 'c1000000-0000-4000-8000-000000000019'
  AND name LIKE '%[SAMPLE]%';

-- ============================================================================
-- SECTION 6: ROLLBACK (commented, for reversibility where practical)
-- ============================================================================
-- ALTER TABLE items DROP COLUMN IF EXISTS thickness_mm;
-- ALTER TABLE items DROP COLUMN IF EXISTS width_mm;
-- DROP INDEX IF EXISTS idx_items_thickness_mm;
-- DROP INDEX IF EXISTS idx_items_width_mm;
