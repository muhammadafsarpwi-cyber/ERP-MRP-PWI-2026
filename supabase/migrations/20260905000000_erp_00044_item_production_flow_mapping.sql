-- =============================================================================
-- ERP-00044 (TASK #33): Master Item Production IN/OUT Flow Mapping
-- =============================================================================
-- TASK #33: Establish the authoritative Production IN → OUT chain at the Item
-- Master level so Production Entry, Raw Material Requirement, Inventory and
-- Output all use the same Item relationships.
--
-- This migration is 100% idempotent and non-destructive.
--  * Only ADDs missing columns / constraints / indexes to the EXISTING items
--    table. No new tables, no new module, no duplicate architecture.
--  * No table is dropped or recreated. No existing row object values are altered
--    except the clearly identifiable [SAMPLE] rows refreshed below (fixed UUIDs).
--  * The existing routing chain (routing_operations.input_item_id / output_item_id),
--    BOM lines, inventory and Production Entry architecture remain untouched.
-- =============================================================================

-- ============================================================================
-- SECTION 1: NEW COLUMNS ON EXISTING items TABLE (nullable -> existing rows stay valid)
-- ============================================================================
-- production_in_item_id:  the raw material / previous-stage item this item is
--                         produced FROM. NULL for raw materials and for items
--                         with no inbound production stage.
-- production_out_item_id: the item this production stage produces. Usually the
--                         item itself (self) or the next stage in the chain.
--                         NULL for raw materials and final destinations.
-- NOTE: "OUT = itself is acceptable" per TASK #33: a production item may set
-- production_out_item_id to its own id. Only self-references on the IN side are
-- rejected by backend validation (validateProductionFlowMapping).
-- ============================================================================

ALTER TABLE items ADD COLUMN IF NOT EXISTS production_in_item_id UUID;
ALTER TABLE items ADD COLUMN IF NOT EXISTS production_out_item_id UUID;

-- ============================================================================
-- SECTION 2: FOREIGN KEYS (self-referential, idempotent)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_items_production_in_item') THEN
    ALTER TABLE items ADD CONSTRAINT fk_items_production_in_item
      FOREIGN KEY (production_in_item_id) REFERENCES items(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_items_production_out_item') THEN
    ALTER TABLE items ADD CONSTRAINT fk_items_production_out_item
      FOREIGN KEY (production_out_item_id) REFERENCES items(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- SECTION 3: INDEXES for filtering / sorting
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_items_production_in_item ON items(production_in_item_id);
CREATE INDEX IF NOT EXISTS idx_items_production_out_item ON items(production_out_item_id);

-- ============================================================================
-- SECTION 4: COLUMN DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN items.production_in_item_id IS 'TASK #33: Raw material / previous-stage item consumed to produce this item (self-reference rejected by backend)';
COMMENT ON COLUMN items.production_out_item_id IS 'TASK #33: Item produced by this stage (may equal the item itself)';

-- ============================================================================
-- SECTION 5: SAMPLE DATA (TASK #1 / ERP-00017 convention)
-- Clearly identified with [SAMPLE] names and SAMPLE- codes so real production
-- data can never be confused with test records.
--
-- Manufacturing chain (sample UUIDs from erp_00041):
--   005 RM-WIRE-120 (1.20mm Wire)   -> OUT = 006
--   006 FLAT-WIRE-040-260 (Flat)    -> IN = 005, OUT = 007
--   007 SPIRAL-375 (Spiral)         -> IN = 006, OUT = 008
--   008 PVC-480 (Finished)          -> IN = 007, OUT = 008 (self — acceptable)
--   009 PVC-RAW                     -> IN = NULL, OUT = NULL (raw material)
-- ============================================================================

DO $$
BEGIN
  UPDATE items
  SET production_in_item_id = NULL,
      production_out_item_id = 'c1000000-0000-4000-8000-000000000006',
      updated_at = NOW()
  WHERE id = 'c1000000-0000-4000-8000-000000000005'
    AND name LIKE '%[SAMPLE]%';

  UPDATE items
  SET production_in_item_id = 'c1000000-0000-4000-8000-000000000005',
      production_out_item_id = 'c1000000-0000-4000-8000-000000000007',
      updated_at = NOW()
  WHERE id = 'c1000000-0000-4000-8000-000000000006'
    AND name LIKE '%[SAMPLE]%';

  UPDATE items
  SET production_in_item_id = 'c1000000-0000-4000-8000-000000000006',
      production_out_item_id = 'c1000000-0000-4000-8000-000000000008',
      updated_at = NOW()
  WHERE id = 'c1000000-0000-4000-8000-000000000007'
    AND name LIKE '%[SAMPLE]%';

  UPDATE items
  SET production_in_item_id = 'c1000000-0000-4000-8000-000000000007',
      production_out_item_id = 'c1000000-0000-4000-8000-000000000008',
      updated_at = NOW()
  WHERE id = 'c1000000-0000-4000-8000-000000000008'
    AND name LIKE '%[SAMPLE]%';

  UPDATE items
  SET production_in_item_id = NULL,
      production_out_item_id = NULL,
      updated_at = NOW()
  WHERE id = 'c1000000-0000-4000-8000-000000000009'
    AND name LIKE '%[SAMPLE]%';
END $$;

-- ============================================================================
-- SECTION 6: ROLLBACK (commented, for reversibility where practical)
-- ============================================================================
-- ALTER TABLE items DROP COLUMN IF EXISTS production_in_item_id;
-- ALTER TABLE items DROP COLUMN IF EXISTS production_out_item_id;
-- DROP INDEX IF EXISTS idx_items_production_in_item;
-- DROP INDEX IF EXISTS idx_items_production_out_item;