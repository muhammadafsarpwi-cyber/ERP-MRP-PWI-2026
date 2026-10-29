-- ============================================================================
-- Migration: 20261029170000_erp_00074_packing_mode_persistence.sql
-- Description: Enforce Packing Mode persistence on production_entries and create
--              packing_production_entries and packing_production_item_entries views.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'production_entries' AND column_name = 'packing_mode'
  ) THEN
    ALTER TABLE production_entries ADD COLUMN packing_mode VARCHAR(50) NOT NULL DEFAULT 'FULL_SET';
  END IF;
END $$;

-- Backfill packing_mode from existing remarks
UPDATE production_entries
SET packing_mode = CASE
  WHEN remarks ILIKE '%ONLY_OUTER%' OR remarks ILIKE '%Only Outer%' THEN 'OUTER_ONLY'
  WHEN remarks ILIKE '%ONLY_INNER%' OR remarks ILIKE '%Only Inner%' THEN 'INNER_ONLY'
  WHEN remarks ILIKE '%WITHOUT_NIPPLE%' OR remarks ILIKE '%Without Nipple%' THEN 'WITHOUT_NIPPLE'
  ELSE 'FULL_SET'
END
WHERE packing_mode IS NULL OR packing_mode = 'FULL_SET';

-- Authoritative Audited Packing Views
CREATE OR REPLACE VIEW packing_production_entries AS
SELECT * FROM production_entries;

CREATE OR REPLACE VIEW packing_production_item_entries AS
SELECT * FROM production_entry_items;
