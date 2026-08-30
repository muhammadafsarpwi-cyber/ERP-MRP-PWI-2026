-- ERP BOM UUID Fix Migration
-- Migration: 20260831000000_erp_00035_bom_uuid_fix.sql
-- Root cause: demo BOM IDs used invalid UUIDs (version nibble '0') e.g.
--   b1000000-0000-0000-0000-000000000001
-- which fail @IsUUID() validation in CreateProductionOrderDto, blocking
-- production orders from linking seeded BOMs.
-- Fix: replace with valid v4 UUIDs (version 4, variant 8) and re-point all FKs.
-- Idempotent: only runs where old IDs still exist.

DO $$
DECLARE
  old_ids uuid[] := ARRAY[
    'b1000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000002',
    'b1000000-0000-0000-0000-000000000003'
  ];
  new_ids uuid[] := ARRAY[
    'b1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000003'
  ];
  i int;
  found boolean;
BEGIN
  -- Check if any old ID still exists (idempotency guard)
  found := EXISTS (SELECT 1 FROM bill_of_materials WHERE id = ANY(old_ids));
  IF NOT found THEN
    RAISE NOTICE 'BOM UUIDs already valid; skipping';
    RETURN;
  END IF;

  -- Drop FK constraints that would block parent ID updates
  ALTER TABLE bom_lines DROP CONSTRAINT IF EXISTS bom_lines_bom_id_fkey;
  ALTER TABLE production_routings DROP CONSTRAINT IF EXISTS production_routings_bom_id_fkey;
  ALTER TABLE production_orders DROP CONSTRAINT IF EXISTS production_orders_bom_id_fkey;

  -- Update parent IDs
  FOR i IN 1..3 LOOP
    UPDATE bill_of_materials SET id = new_ids[i] WHERE id = old_ids[i];
  END LOOP;

  -- Re-point child references (old -> new)
  FOR i IN 1..3 LOOP
    UPDATE bom_lines SET bom_id = new_ids[i] WHERE bom_id = old_ids[i];
    UPDATE production_routings SET bom_id = new_ids[i] WHERE bom_id = old_ids[i];
    UPDATE production_orders SET bom_id = new_ids[i] WHERE bom_id = old_ids[i];
  END LOOP;

  -- Re-add FK constraints
  ALTER TABLE bom_lines ADD CONSTRAINT bom_lines_bom_id_fkey
    FOREIGN KEY (bom_id) REFERENCES bill_of_materials(id) ON DELETE CASCADE;
  ALTER TABLE production_routings ADD CONSTRAINT production_routings_bom_id_fkey
    FOREIGN KEY (bom_id) REFERENCES bill_of_materials(id);
  ALTER TABLE production_orders ADD CONSTRAINT production_orders_bom_id_fkey
    FOREIGN KEY (bom_id) REFERENCES bill_of_materials(id);

  RAISE NOTICE 'BOM UUIDs migrated to valid v4';
END $$;