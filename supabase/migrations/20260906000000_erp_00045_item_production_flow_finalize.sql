-- =============================================================================
-- ERP-00045 (TASK #34B): Finalize Master Item IN/OUT Production Flow
-- =============================================================================
-- The current Item IS the output of its own production stage. The user selects
-- ONLY the INPUT material (production_in_item_id); production_out_item_id is a
-- backward-compat column that is server-owned and ALWAYS auto-synchronized to
-- the current Item ID when an input is mapped (NULL for root raw materials).
--
-- This migration is 100% idempotent and non-destructive:
--  * No schema change — production_in_item_id / production_out_item_id are reused
--    from ERP-00044. No new columns, no new tables, no duplicate architecture.
--  * Only the clearly identifiable [SAMPLE] rows (fixed UUIDs from ERP-00041) and
--    their [SAMPLE] BOM / routing remark text are touched. No production data is
--    modified.
--
-- Manufacturing chain (the demo/sample chain required by the brief):
--   1.20 mm-B4 Wire  → Flattening → Flat Wire T 0.40 × W 2.60 mm → Spiral
--                     → 3.75 mm → PVC Extrusion → 4.75 mm
-- =============================================================================

DO $$
DECLARE
  v_company_id UUID := '7725aa04-a270-4314-9e82-90949cbe7791';
BEGIN

  -- ==========================================================================
  -- SECTION 1: Rename the [SAMPLE] chain items to the final production-flow names
  --            and update their wire/thickness/width specifications.
  -- ==========================================================================
  UPDATE items
  SET name           = '1.20 mm-B4 Wire [SAMPLE]',
      wire_size_mm   = 1.200,
      notes          = 'TASK #34B SAMPLE DATA - input raw wire: the current Item IS the output stage (raw material root, no input)',
      updated_at     = NOW()
  WHERE id = 'c1000000-0000-4000-8000-000000000005';

  UPDATE items
  SET name           = 'Flat Wire T 0.40 × W 2.60 mm [SAMPLE]',
      thickness_mm   = 0.400,
      width_mm       = 2.600,
      notes          = 'TASK #34B SAMPLE DATA - flattened wire: INPUT = 1.20 mm-B4, OUTPUT = self (current item)',
      updated_at     = NOW()
  WHERE id = 'c1000000-0000-4000-8000-000000000006';

  UPDATE items
  SET name           = '3.75 mm [SAMPLE]',
      wire_size_mm   = 3.750,
      notes          = 'TASK #34B SAMPLE DATA - spiral: INPUT = Flat Wire, OUTPUT = self (current item)',
      updated_at     = NOW()
  WHERE id = 'c1000000-0000-4000-8000-000000000007';

  UPDATE items
  SET name           = '4.75 mm [SAMPLE]',
      wire_size_mm   = 4.750,
      notes          = 'TASK #34B SAMPLE DATA - finished PVC cable: INPUT = 3.75 mm, OUTPUT = self (current item)',
      updated_at     = NOW()
  WHERE id = 'c1000000-0000-4000-8000-000000000008';

  -- ==========================================================================
  -- SECTION 2: APPLY THE FINAL IN/OUT MODEL (only for the [SAMPLE] rows).
  --   Previous-stage semantics (ERP-00044) pointed a stage's OUT at the NEXT
  --   item in the chain. Under the finalized model the current Item IS the OUT of
  --   its own stage, so a stage's OUT is its own id whenever an input is mapped.
  -- ==========================================================================
  -- 005 (root raw material): no input, no output.
  UPDATE items
  SET production_in_item_id  = NULL,
      production_out_item_id = NULL,
      updated_at             = NOW()
  WHERE id = 'c1000000-0000-4000-8000-000000000005';

  -- 006 (Flat Wire): consumes 005, produces itself.
  UPDATE items
  SET production_in_item_id  = 'c1000000-0000-4000-8000-000000000005',
      production_out_item_id = 'c1000000-0000-4000-8000-000000000006',
      updated_at             = NOW()
  WHERE id = 'c1000000-0000-4000-8000-000000000006';

  -- 007 (3.75 mm spiral): consumes 006, produces itself.
  UPDATE items
  SET production_in_item_id  = 'c1000000-0000-4000-8000-000000000006',
      production_out_item_id = 'c1000000-0000-4000-8000-000000000007',
      updated_at             = NOW()
  WHERE id = 'c1000000-0000-4000-8000-000000000007';

  -- 008 (4.75 mm PVC): consumes 007, produces itself.
  UPDATE items
  SET production_in_item_id  = 'c1000000-0000-4000-8000-000000000007',
      production_out_item_id = 'c1000000-0000-4000-8000-000000000008',
      updated_at             = NOW()
  WHERE id = 'c1000000-0000-4000-8000-000000000008';

  -- 009 (PVC raw compound): root raw material — no input, no output.
  UPDATE items
  SET production_in_item_id  = NULL,
      production_out_item_id = NULL,
      updated_at             = NOW()
  WHERE id = 'c1000000-0000-4000-8000-000000000009';

  -- ==========================================================================
  -- SECTION 3: Coherent [SAMPLE] BOM / routing descriptive text (non-functional,
  --            updated only so demo data matches the finalized chain names).
  -- ==========================================================================
  UPDATE bill_of_materials
  SET description = '1.20 mm-B4 Wire → Flat Wire T 0.40 × W 2.60 mm',
      updated_at  = NOW()
  WHERE bom_code = 'BOM-SMP-101' AND company_id = v_company_id;

  UPDATE bill_of_materials
  SET description = 'Flat Wire T 0.90 × W 3.20 mm → 3.75 mm',
      updated_at  = NOW()
  WHERE bom_code = 'BOM-SMP-102' AND company_id = v_company_id;

  UPDATE bill_of_materials
  SET description = '3.75 mm + PVC Raw Material → 4.75 mm',
      updated_at  = NOW()
  WHERE bom_code = 'BOM-SMP-103' AND company_id = v_company_id;

  UPDATE production_routings
  SET description = 'TASK #2/#34B sample: 1.20 mm-B4 Wire → Flattening → Flat Wire T 0.40 × W 2.60 mm → Spiral → 3.75 mm → PVC Extrusion → 4.75 mm',
      updated_at  = NOW()
  WHERE routing_code = 'RTG-SMP-005' AND company_id = v_company_id;

  UPDATE routing_operations
  SET remarks = 'SAMPLE operation: 1.20 mm-B4 wire flattened to Flat Wire T 0.40 × W 2.60 mm',
      updated_at = NOW()
  WHERE operation_code = 'OP-SMP-010' AND company_id = v_company_id;

  UPDATE routing_operations
  SET remarks = 'SAMPLE operation: flat wire wound into 3.75 mm spiral',
      updated_at = NOW()
  WHERE operation_code = 'OP-SMP-020' AND company_id = v_company_id;

  UPDATE routing_operations
  SET remarks = 'SAMPLE operation: spiral + PVC compound extruded to 4.75 mm PVC cable',
      updated_at = NOW()
  WHERE operation_code = 'OP-SMP-030' AND company_id = v_company_id;

END $$;