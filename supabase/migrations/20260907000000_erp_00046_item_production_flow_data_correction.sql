-- =============================================================================
-- ERP-00046 (TASK #34B follow-up): Generalized Production-Flow Data Correction
-- =============================================================================
-- The finalized model: EVERY Item Master record IS the OUTPUT product of its own
-- production stage. `production_out_item_id` is a backward-compat column that must
-- equal the item's own id whenever a VALID `production_in_item_id` exists, and
-- NULL for root raw materials (which produce nothing).
--
-- ERP-00044 originally wrote next-stage OUT semantics (a stage's OUT pointed at
-- the NEXT item in the chain) and only touched [SAMPLE] rows. This migration:
--   * heals EVERY item (not just [SAMPLE]) whose OUT does not match the model,
--   * PRESERVES every valid input mapping (never overwrites production_in_item_id),
--   * does NOT touch items with invalid mappings (it only REPORTS them),
--   * is 100% idempotent and non-destructive.
--
-- REPORTED invalid mappings (RAISE NOTICE, never auto-fixed):
--   1. self-in          — production_in_item_id = id (backend API rejects this too)
--   2. missing target   — production_in_item_id points at a non-existent item
--   3. inactive target  — the input item is not ACTIVE (backend API rejects this)
--   4. circular chain   — walking the backward input chain revisits the item
-- =============================================================================

DO $$
DECLARE
  r          RECORD;
  v_affected INTEGER := 0;
  v_cleared  INTEGER := 0;
BEGIN

  -- ─────────────────────────────────────────────────────────────────────────
  -- 1) FLAG invalid mappings (self-in / missing / inactive / circular).
  -- ─────────────────────────────────────────────────────────────────────────
  CREATE TEMP TABLE flow_flag(item_id UUID PRIMARY KEY, reason TEXT) ON COMMIT DROP;

  -- 1a) Self-referencing input (production_in_item_id = id).
  INSERT INTO flow_flag(item_id, reason)
  SELECT id, 'self-in (production_in_item_id = id)'
  FROM items
  WHERE production_in_item_id = id
  ON CONFLICT (item_id) DO NOTHING;

  -- 1b) Input points at a missing item (defensive — the FK normally prevents this).
  INSERT INTO flow_flag(item_id, reason)
  SELECT id, 'missing production_in_item_id target'
  FROM items
  WHERE production_in_item_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM items x WHERE x.id = items.production_in_item_id)
  ON CONFLICT (item_id) DO NOTHING;

  -- 1c) Input item is not ACTIVE (backend rejects inactive inputs on write).
  INSERT INTO flow_flag(item_id, reason)
  SELECT i.id, 'inactive production_in_item_id target (not ACTIVE)'
  FROM items i
  JOIN items x ON x.id = i.production_in_item_id
  WHERE i.production_in_item_id IS NOT NULL
    AND x.status <> 'ACTIVE'
  ON CONFLICT (item_id) DO NOTHING;

  -- 1d) Circular chains. Each node has at most one input, so walking an item's
  --     backward input chain is a linear probe. An item is circular when its own
  --     walk reaches itself (A ← B ← A). Depth-bounded at 250 hops.
  -- NOTE (TASK #34C): PostgreSQL REJECTS data-type declarations in a CTE column
  -- alias list ("syntax error at or near UUID", 42601). Types were removed; the
  -- inferred types are identical (start_id uuid, node uuid, depth int, cyclic bool).
  WITH RECURSIVE walk(start_id, node, depth, cyclic) AS (
    SELECT id, production_in_item_id, 1, false
    FROM items
    WHERE production_in_item_id IS NOT NULL AND production_in_item_id <> id
    UNION ALL
    SELECT w.start_id, n.production_in_item_id, w.depth + 1,
           (n.production_in_item_id = w.start_id)
    FROM walk w
    JOIN items n ON n.id = w.node
    WHERE n.production_in_item_id IS NOT NULL
      AND n.production_in_item_id <> n.id
      AND w.depth < 250
  )
  INSERT INTO flow_flag(item_id, reason)
  SELECT DISTINCT start_id, 'circular production chain (item ultimately depends on itself)'
  FROM walk
  WHERE cyclic
  ON CONFLICT (item_id) DO NOTHING;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 2) CORRECT OUT for every VALID mapping (the IN mapping is PRESERVED).
  --    Valid = input set, not self, EXISTS, ACTIVE, and the item is not flagged.
  -- ─────────────────────────────────────────────────────────────────────────
  UPDATE items
  SET production_out_item_id = id, updated_at = NOW()
  WHERE production_in_item_id IS NOT NULL
    AND production_in_item_id <> id
    AND EXISTS (SELECT 1 FROM items x
                WHERE x.id = items.production_in_item_id AND x.status = 'ACTIVE')
    AND NOT EXISTS (SELECT 1 FROM flow_flag f WHERE f.item_id = items.id);
  GET DIAGNOSTICS v_affected = ROW_COUNT;

  -- Root raw materials (no input) produce nothing — clear any stale next-stage OUT
  -- left behind by the ERP-00044 semantics. The IN column is untouched.
  UPDATE items
  SET production_out_item_id = NULL, updated_at = NOW()
  WHERE production_in_item_id IS NULL
    AND production_out_item_id IS NOT NULL;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 3) REPORT the invalid mappings (and the overall result).
  -- ─────────────────────────────────────────────────────────────────────────
  RAISE NOTICE 'ERP-00046: corrected production_out_item_id (self) on % items; cleared stale OUT on % root raw materials.', v_affected, v_cleared;

  FOR r IN
    SELECT i.id, i.item_code, i.name, i.production_in_item_id, f.reason
    FROM flow_flag f
    JOIN items i ON i.id = f.item_id
    ORDER BY f.reason, i.item_code
  LOOP
    RAISE NOTICE 'ERP-00046 INVALID: item % (% - %) | production_in_item_id = % | %',
      r.id, r.item_code, r.name, r.production_in_item_id, r.reason;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM flow_flag) THEN
    RAISE NOTICE 'ERP-00046: no invalid production-flow mappings found.';
  END IF;

END $$;