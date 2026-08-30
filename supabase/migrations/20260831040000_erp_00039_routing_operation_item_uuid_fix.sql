-- ERP Routing Operation Item UUID Corrective Migration
-- Migration: 20260831040000_erp_00039_routing_operation_item_uuid_fix.sql
--
-- Root cause: erp_00017 Section 8 seeded sample routing_operations using
-- hardcoded sample item UUIDs of the form c1000000-0000-4000-8000-... .
-- In environments where the sample items already existed (created by an
-- earlier migration version with c1000000-0000-0000-0000-... UUIDs), the
-- ON CONFLICT (item_code, company_id) upsert preserved the existing item
-- UUIDs, leaving the routing_operations.input_item_id / output_item_id
-- referencing UUIDs that do not exist in items -> 23503 FK violation.
--
-- This corrective migration re-points any routing_operations whose
-- input_item_id / output_item_id references a legacy hardcoded sample UUID
-- that DOES NOT actually exist in items, to the ACTUAL item UUID resolved by
-- (company_id, item_code). In environments where the legacy UUID already IS
-- the real item UUID (clean-room), no change is made. It is idempotent,
-- never deletes data, and fails fast if a required item cannot be resolved.

DO $$
DECLARE
  v_company_id UUID;
  v_code TEXT;
  v_legacy_id UUID;
  v_actual_id UUID;
  v_legacy_exists BOOLEAN;
  v_map RECORD;
BEGIN
  -- Iterate every distinct company that owns sample routing operations
  FOR v_company_id IN
    SELECT DISTINCT company_id FROM routing_operations WHERE operation_code LIKE 'OP-SMP-%'
  LOOP
    -- Map legacy hardcoded sample UUID -> business code for this company
    FOR v_map IN SELECT * FROM (VALUES
      ('c1000000-0000-4000-8000-000000000001'::uuid, 'SAMPLE-WIRE-3.45'),
      ('c1000000-0000-4000-8000-000000000002'::uuid, 'SAMPLE-WIRE-4.50'),
      ('c1000000-0000-4000-8000-000000000003'::uuid, 'SAMPLE-NIPPLE'),
      ('c1000000-0000-4000-8000-000000000004'::uuid, 'SAMPLE-CCD-WIRE'),
      ('c1000000-0000-4000-8000-000000000011'::uuid, 'SAMPLE-STRAIGHTENED-WIRE'),
      ('c1000000-0000-4000-8000-000000000012'::uuid, 'SAMPLE-SWAGED-WIRE'),
      ('c1000000-0000-4000-8000-000000000013'::uuid, 'SAMPLE-SPOKE'),
      ('c1000000-0000-4000-8000-000000000014'::uuid, 'SAMPLE-SPOKE-PLATED'),
      ('c1000000-0000-4000-8000-000000000015'::uuid, 'SAMPLE-SPOKE-PACKED'),
      ('c1000000-0000-4000-8000-000000000016'::uuid, 'SAMPLE-NIPPLE-FORMED'),
      ('c1000000-0000-4000-8000-000000000017'::uuid, 'SAMPLE-NIPPLE-PLATED'),
      ('c1000000-0000-4000-8000-000000000018'::uuid, 'SAMPLE-NIPPLE-PACKED'),
      ('c1000000-0000-4000-8000-000000000019'::uuid, 'SAMPLE-CCD-FLATTENED'),
      ('c1000000-0000-4000-8000-000000000020'::uuid, 'SAMPLE-CCD-SPIRAL'),
      ('c1000000-0000-4000-8000-000000000021'::uuid, 'SAMPLE-CCD-PVC'),
      ('c1000000-0000-4000-8000-000000000022'::uuid, 'SAMPLE-CCD-PACKED')
    ) AS t(legacy_id, item_code)
    LOOP
      -- Resolve the ACTUAL item UUID by business code for this company
      SELECT id INTO v_actual_id FROM items
      WHERE company_id = v_company_id AND item_code = v_map.item_code LIMIT 1;

      IF v_actual_id IS NULL THEN
        RAISE EXCEPTION 'Required item % was not found for company % while repairing routing operations (migration 00039)', v_map.item_code, v_company_id;
      END IF;

      -- Only act if the legacy UUID is NOT the real item (i.e. it is dangling)
      SELECT EXISTS (SELECT 1 FROM items WHERE id = v_map.legacy_id) INTO v_legacy_exists;

      IF NOT v_legacy_exists THEN
        UPDATE routing_operations
        SET input_item_id = v_actual_id, updated_at = NOW()
        WHERE company_id = v_company_id AND input_item_id = v_map.legacy_id;
        UPDATE routing_operations
        SET output_item_id = v_actual_id, updated_at = NOW()
        WHERE company_id = v_company_id AND output_item_id = v_map.legacy_id;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE '[erp_00039] routing_operation item repair complete';
END $$;

-- ============================================================
-- VERIFY: no routing_operation references a non-existent item
-- ============================================================
DO $$
DECLARE
  v_bad INT;
BEGIN
  SELECT COUNT(*) INTO v_bad FROM routing_operations o
  WHERE (o.input_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM items i WHERE i.id = o.input_item_id))
     OR (o.output_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM items i WHERE i.id = o.output_item_id));
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'routing_operations still reference % non-existent item UUIDs', v_bad;
  END IF;
  RAISE NOTICE '[erp_00039] verify: 0 dangling routing_operation item references';
END $$;
