-- =============================================================================
-- ERP-00041: BOM + Routing Item Chain Foundation — Manufacturing Chain Sample Data
-- =============================================================================
-- TASK #2: Build the complete manufacturing item chain:
--   Raw Material (1.20mm Wire) → Flattening → Flat Wire (0.40x2.60mm)
--   → Spiral (3.75mm) → PVC Extrusion (4.80mm)
--
-- This migration is 100% idempotent and non-destructive.
--  * Only ADDs one missing value to the existing stock_ledger CHECK constraint.
--  * Inserts 5 new [SAMPLE] items with fixed UUIDs (c1000000-...-000000000005..009).
--  * Creates 3 sample BOMs with lines (BOM-SMP-101/102/103).
--  * Creates 1 sample routing (RTG-SMP-005) with 3 operations.
--  * No new tables, no new modules, no duplicate architecture.
--  * No existing data is modified except the sample rows explicitly created below.
-- =============================================================================

-- ============================================================================
-- PART A: Fix stock_ledger CHECK constraint — add PRODUCTION_CONSUMPTION
-- ============================================================================
-- The production-entry.service consumeRawMaterials() uses PRODUCTION_CONSUMPTION
-- (line 1289), but the constraint (last defined in erp_00013) does not include
-- this value. Without this fix, BOM consumption during production entry posting
-- would fail with a DB CHECK violation, blocking requirement #8.
-- This is an additive, idempotent schema fix — no existing values are removed.

ALTER TABLE public.stock_ledger
  DROP CONSTRAINT IF EXISTS stock_ledger_transaction_type_check;

ALTER TABLE public.stock_ledger
  ADD CONSTRAINT stock_ledger_transaction_type_check
  CHECK (
    transaction_type = ANY (ARRAY[
      'RECEIPT', 'ISSUE', 'TRANSFER_OUT', 'TRANSFER_IN',
      'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'OPENING',
      'RETURN_IN', 'RETURN_OUT', 'SALES_DELIVERY', 'SALES_RETURN',
      'PRODUCTION_RECEIPT', 'PRODUCTION_ISSUE', 'PRODUCTION_SCRAP',
      'PRODUCTION_CONSUMPTION'
    ]::text[])
  );

-- ============================================================================
-- PART B: Sample Items
-- ============================================================================
-- Fixed UUIDs follow the existing c1000000-...-0000000000XX convention.
-- Used: 001..004 (raw mat), 011..022 (semi/finished) → free: 005..010, 023+.
-- 005 = RM-WIRE-120, 006 = FLAT-WIRE-040-260, 007 = SPIRAL-375,
-- 008 = PVC-480, 009 = PVC-RAW

DO $$
DECLARE
  v_company_id  UUID := '7725aa04-a270-4314-9e82-90949cbe7791';
  v_uom_m       UUID;
  v_uom_kg      UUID;
  v_div_ccd     UUID;
  v_sec_spiral  UUID;
  v_sec_pvc     UUID;
  v_dept_flat   UUID;
  v_dept_spiral UUID;
  v_dept_pvc    UUID;
BEGIN
  SELECT id INTO v_uom_m  FROM uoms WHERE code = 'M'   LIMIT 1;
  SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG'  LIMIT 1;
  SELECT id INTO v_div_ccd    FROM divisions WHERE division_code = 'CCD' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_sec_spiral FROM sections WHERE section_code = 'SEC-015' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_sec_pvc    FROM sections WHERE section_code = 'SEC-016' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_flat   FROM departments WHERE department_code = 'CCD-DEPT001' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_spiral FROM departments WHERE department_code = 'CCD-DEPT002' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_pvc    FROM departments WHERE department_code = 'CCD-DEPT003' AND company_id = v_company_id LIMIT 1;

  INSERT INTO items (id, company_id, item_code, name, item_type, status, is_active,
                     base_uom_id, division_id, section_id, department_id,
                     wire_size_mm, track_inventory, is_purchasable, is_manufacturable,
                     notes, created_at, updated_at)
  VALUES
    -- 005: 1.20mm Wire (raw material)
    ('c1000000-0000-4000-8000-000000000005', v_company_id, 'RM-WIRE-120',
     '1.20mm Wire [SAMPLE]', 'RAW_MATERIAL', 'ACTIVE', true,
     v_uom_m, v_div_ccd, v_sec_spiral, v_dept_flat,
     1.200, true, true, false,
     'TASK #2 SAMPLE DATA - raw wire for flattening', NOW(), NOW()),

    -- 006: 0.40x2.60mm Flat Wire (intermediate — flattened wire, no wireSize)
    ('c1000000-0000-4000-8000-000000000006', v_company_id, 'FLAT-WIRE-040-260',
     '0.40x2.60mm Flat Wire [SAMPLE]', 'SEMI_FINISHED', 'ACTIVE', true,
     v_uom_m, v_div_ccd, v_sec_spiral, v_dept_flat,
     NULL, true, false, true,
     'TASK #2 SAMPLE DATA - flattened wire for spiral winding', NOW(), NOW()),

    -- 007: 3.75mm Spiral (intermediate)
    ('c1000000-0000-4000-8000-000000000007', v_company_id, 'SPIRAL-375',
     '3.75mm Spiral [SAMPLE]', 'SEMI_FINISHED', 'ACTIVE', true,
     v_uom_m, v_div_ccd, v_sec_spiral, v_dept_spiral,
     3.750, true, false, true,
     'TASK #2 SAMPLE DATA - spiral cable for PVC extrusion', NOW(), NOW()),

    -- 008: 4.80mm PVC Extrusion (final product)
    ('c1000000-0000-4000-8000-000000000008', v_company_id, 'PVC-480',
     '4.80mm PVC Extrusion [SAMPLE]', 'FINISHED_GOOD', 'ACTIVE', true,
     v_uom_m, v_div_ccd, v_sec_pvc, v_dept_pvc,
     4.800, true, false, true,
     'TASK #2 SAMPLE DATA - finished PVC extruded cable', NOW(), NOW()),

    -- 009: PVC Raw Material
    ('c1000000-0000-4000-8000-000000000009', v_company_id, 'PVC-RAW',
     'PVC Raw Material [SAMPLE]', 'RAW_MATERIAL', 'ACTIVE', true,
     v_uom_kg, v_div_ccd, v_sec_pvc, v_dept_pvc,
     NULL, true, true, false,
     'TASK #2 SAMPLE DATA - PVC compound for extrusion', NOW(), NOW())

  ON CONFLICT (item_code, company_id) DO UPDATE SET
    name             = EXCLUDED.name,
    item_type        = EXCLUDED.item_type,
    status           = EXCLUDED.status,
    is_active        = EXCLUDED.is_active,
    base_uom_id      = EXCLUDED.base_uom_id,
    division_id      = EXCLUDED.division_id,
    section_id       = EXCLUDED.section_id,
    department_id    = EXCLUDED.department_id,
    wire_size_mm     = EXCLUDED.wire_size_mm,
    track_inventory  = EXCLUDED.track_inventory,
    is_purchasable   = EXCLUDED.is_purchasable,
    is_manufacturable= EXCLUDED.is_manufacturable,
    notes            = EXCLUDED.notes,
    updated_at       = NOW();

  -- Set thickness_mm/width_mm on FLAT-WIRE-040-260 (idempotent — the column
  -- exists from erp_00040, but we set it via UPDATE since the DDL uses
  -- ON CONFLICT with the item row, and we want to set the spec regardless
  -- of whether the row was just inserted or already existed).
  UPDATE items
  SET thickness_mm = 0.400,
      width_mm     = 2.600,
      updated_at   = NOW()
  WHERE id = 'c1000000-0000-4000-8000-000000000006'
    AND name LIKE '%[SAMPLE]%';
END $$;

-- ============================================================================
-- PART C: Sample BOMs
-- ============================================================================
-- BOM-SMP-101: FLAT-WIRE-040-260 (product) ← RM-WIRE-120 (component)
-- BOM-SMP-102: SPIRAL-375 (product) ← FLAT-WIRE-040-260 (component)
-- BOM-SMP-103: PVC-480 (product) ← SPIRAL-375 + PVC-RAW (components)

DO $$
DECLARE
  v_company_id UUID := '7725aa04-a270-4314-9e82-90949cbe7791';
  v_it_wire120 UUID;
  v_it_flat    UUID;
  v_it_spiral  UUID;
  v_it_pvc480  UUID;
  v_it_pvcraw  UUID;
  v_uom_m      UUID;
  v_uom_kg     UUID;
  v_bom1_id    UUID;
  v_bom2_id    UUID;
  v_bom3_id    UUID;
BEGIN
  SELECT id INTO v_it_wire120 FROM items WHERE company_id = v_company_id AND item_code = 'RM-WIRE-120' AND is_active = true;
  SELECT id INTO v_it_flat    FROM items WHERE company_id = v_company_id AND item_code = 'FLAT-WIRE-040-260' AND is_active = true;
  SELECT id INTO v_it_spiral  FROM items WHERE company_id = v_company_id AND item_code = 'SPIRAL-375' AND is_active = true;
  SELECT id INTO v_it_pvc480  FROM items WHERE company_id = v_company_id AND item_code = 'PVC-480' AND is_active = true;
  SELECT id INTO v_it_pvcraw  FROM items WHERE company_id = v_company_id AND item_code = 'PVC-RAW' AND is_active = true;
  SELECT id INTO v_uom_m  FROM uoms WHERE code = 'M'  LIMIT 1;
  SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG' LIMIT 1;

  -- BOM-SMP-101: Flattening — FLAT-WIRE-040-260 ← RM-WIRE-120
  INSERT INTO bill_of_materials (id, company_id, bom_code, name, description, status, base_quantity, product_id, estimated_cost, effective_from, created_at, updated_at)
  VALUES ('b1000000-0000-4000-8000-000000000101', v_company_id, 'BOM-SMP-101',
          'Flattening BOM [SAMPLE]', '1.20mm Wire → 0.40x2.60mm Flat Wire',
          'ACTIVE', 1, v_it_flat, 0, NOW(), NOW(), NOW())
  ON CONFLICT (bom_code, company_id) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description, status = EXCLUDED.status,
    product_id = EXCLUDED.product_id, updated_at = NOW()
  RETURNING id INTO v_bom1_id;

  INSERT INTO bom_lines (bom_id, line_number, item_id, quantity, uom_id, scrap_factor, yield_percentage, remarks)
  VALUES (v_bom1_id, 1, v_it_wire120, 1, v_uom_m, 0, 100, '1 M of 1.20mm wire per 1 M of flat wire')
  ON CONFLICT (bom_id, line_number) DO NOTHING;

  -- BOM-SMP-102: Spiral — SPIRAL-375 ← FLAT-WIRE-040-260
  INSERT INTO bill_of_materials (id, company_id, bom_code, name, description, status, base_quantity, product_id, estimated_cost, effective_from, created_at, updated_at)
  VALUES ('b1000000-0000-4000-8000-000000000102', v_company_id, 'BOM-SMP-102',
          'Spiral BOM [SAMPLE]', '0.40x2.60mm Flat Wire → 3.75mm Spiral',
          'ACTIVE', 1, v_it_spiral, 0, NOW(), NOW(), NOW())
  ON CONFLICT (bom_code, company_id) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description, status = EXCLUDED.status,
    product_id = EXCLUDED.product_id, updated_at = NOW()
  RETURNING id INTO v_bom2_id;

  INSERT INTO bom_lines (bom_id, line_number, item_id, quantity, uom_id, scrap_factor, yield_percentage, remarks)
  VALUES (v_bom2_id, 1, v_it_flat, 1, v_uom_m, 0, 100, '1 M of flat wire per 1 M of spiral')
  ON CONFLICT (bom_id, line_number) DO NOTHING;

  -- BOM-SMP-103: PVC Extrusion — PVC-480 ← SPIRAL-375 + PVC-RAW
  INSERT INTO bill_of_materials (id, company_id, bom_code, name, description, status, base_quantity, product_id, estimated_cost, effective_from, created_at, updated_at)
  VALUES ('b1000000-0000-4000-8000-000000000103', v_company_id, 'BOM-SMP-103',
          'PVC Extrusion BOM [SAMPLE]', '3.75mm Spiral + PVC Raw Material → 4.80mm PVC Extrusion',
          'ACTIVE', 1, v_it_pvc480, 0, NOW(), NOW(), NOW())
  ON CONFLICT (bom_code, company_id) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description, status = EXCLUDED.status,
    product_id = EXCLUDED.product_id, updated_at = NOW()
  RETURNING id INTO v_bom3_id;

  INSERT INTO bom_lines (bom_id, line_number, item_id, quantity, uom_id, scrap_factor, yield_percentage, remarks)
  VALUES
    (v_bom3_id, 1, v_it_spiral, 1,    v_uom_m,  0, 100, '1 M of spiral per 1 M of PVC extrusion'),
    (v_bom3_id, 2, v_it_pvcraw, 0.050, v_uom_kg, 0, 100, '0.050 KG PVC compound per 1 M of extrusion')
  ON CONFLICT (bom_id, line_number) DO NOTHING;
END $$;

-- Mark manufactured items as manufacturable (idempotent)
UPDATE items SET is_manufacturable = TRUE
WHERE item_code IN ('FLAT-WIRE-040-260', 'SPIRAL-375', 'PVC-480')
  AND is_manufacturable = FALSE;

-- ============================================================================
-- PART D: Sample Routing
-- ============================================================================
-- RTG-SMP-005: New routing for the RM-WIRE-120 chain.
-- RTG-SMP-004 already exists (CCD Wire Route for SAMPLE-CCD-WIRE),
-- so RTG-SMP-005 is used to avoid duplicate/conflicting records.
--
-- Operation 10: Flattening — RM-WIRE-120 → FLAT-WIRE-040-260
-- Operation 20: Spiral     — FLAT-WIRE-040-260 → SPIRAL-375
-- Operation 30: PVC Extrusion — SPIRAL-375 → PVC-480
-- Additional PVC-RAW component is captured via BOM-SMP-103 (existing BOM structure).

DO $$
DECLARE
  v_company_id   UUID := '7725aa04-a270-4314-9e82-90949cbe7791';
  v_it_wire120   UUID;
  v_it_flat      UUID;
  v_it_spiral    UUID;
  v_it_pvc480    UUID;
  v_div_ccd      UUID;
  v_sec_spiral   UUID;
  v_sec_pvc      UUID;
  v_dept_flat    UUID;
  v_dept_spiral  UUID;
  v_dept_pvc     UUID;
  v_uom_m        UUID;
  v_routing_id   UUID;
BEGIN
  SELECT id INTO v_it_wire120   FROM items WHERE company_id = v_company_id AND item_code = 'RM-WIRE-120' AND is_active = true;
  SELECT id INTO v_it_flat      FROM items WHERE company_id = v_company_id AND item_code = 'FLAT-WIRE-040-260' AND is_active = true;
  SELECT id INTO v_it_spiral    FROM items WHERE company_id = v_company_id AND item_code = 'SPIRAL-375' AND is_active = true;
  SELECT id INTO v_it_pvc480    FROM items WHERE company_id = v_company_id AND item_code = 'PVC-480' AND is_active = true;
  SELECT id INTO v_div_ccd      FROM divisions WHERE division_code = 'CCD' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_sec_spiral   FROM sections WHERE section_code = 'SEC-015' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_sec_pvc      FROM sections WHERE section_code = 'SEC-016' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_flat    FROM departments WHERE department_code = 'CCD-DEPT001' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_spiral  FROM departments WHERE department_code = 'CCD-DEPT002' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_pvc     FROM departments WHERE department_code = 'CCD-DEPT003' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_uom_m        FROM uoms WHERE code = 'M' LIMIT 1;

  -- Clean previous sample operations for this routing (if re-running)
  FOR v_routing_id IN
    SELECT id FROM production_routings
    WHERE routing_code = 'RTG-SMP-005' AND company_id = v_company_id
  LOOP
    DELETE FROM routing_operations WHERE routing_id = v_routing_id;
  END LOOP;

  -- Insert or update routing header
  SELECT id INTO v_routing_id FROM production_routings WHERE routing_code = 'RTG-SMP-005' AND company_id = v_company_id;
  IF NOT FOUND THEN
    INSERT INTO production_routings (id, company_id, routing_code, name, description,
                                     product_id, bom_id, status, base_quantity, estimated_total_time,
                                     is_default, effective_from, created_at, updated_at, is_active)
    VALUES ('b1000000-0000-4000-8000-000000000005', v_company_id, 'RTG-SMP-005',
            'Control Cable Chain [SAMPLE]',
            'TASK #2 sample: 1.20mm Wire → Flattening → Flat Wire → Spiral → PVC Extrusion',
            v_it_wire120, NULL, 'ACTIVE', 1, 90, true, NOW(), NOW(), NOW(), true)
    RETURNING id INTO v_routing_id;
  ELSE
    UPDATE production_routings SET name = 'Control Cable Chain [SAMPLE]',
           description = 'TASK #2 sample: 1.20mm Wire → Flattening → Flat Wire → Spiral → PVC Extrusion',
           status = 'ACTIVE', is_default = true, updated_at = NOW()
    WHERE id = v_routing_id;
  END IF;

  -- Insert operations
  INSERT INTO routing_operations (id, company_id, routing_id, sequence_no, operation_code, operation_name,
                                  division_id, section_id, department_id,
                                  input_item_id, output_item_id, input_quantity, output_quantity, uom_id,
                                  setup_time_minutes, run_time_minutes,
                                  status, remarks, created_at, updated_at, is_active)
  VALUES
    ('b2000000-0000-4000-8000-000000000041', v_company_id, v_routing_id, 10, 'OP-SMP-010', 'Flattening',
     v_div_ccd, v_sec_spiral, v_dept_flat,
     v_it_wire120, v_it_flat, 1, 1, v_uom_m,
     15, 20, 'ACTIVE', 'SAMPLE operation: 1.20mm wire flattened to 0.40x2.60mm', NOW(), NOW(), true),

    ('b2000000-0000-4000-8000-000000000042', v_company_id, v_routing_id, 20, 'OP-SMP-020', 'Spiral',
     v_div_ccd, v_sec_spiral, v_dept_spiral,
     v_it_flat, v_it_spiral, 1, 1, v_uom_m,
     10, 30, 'ACTIVE', 'SAMPLE operation: flat wire wound into 3.75mm spiral', NOW(), NOW(), true),

    ('b2000000-0000-4000-8000-000000000043', v_company_id, v_routing_id, 30, 'OP-SMP-030', 'PVC Extrusion',
     v_div_ccd, v_sec_pvc, v_dept_pvc,
     v_it_spiral, v_it_pvc480, 1, 1, v_uom_m,
     20, 35, 'ACTIVE', 'SAMPLE operation: spiral + PVC compound extruded to 4.80mm PVC cable', NOW(), NOW(), true);
END $$;