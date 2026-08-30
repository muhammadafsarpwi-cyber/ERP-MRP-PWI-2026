-- =============================================================================
-- ERP-00017: Item Master Extension - Organization, Routing Summary & UOM Weights
-- =============================================================================
-- PROMPT-09: Existing Item Master, Routing & UOM correction.
--
-- This migration is 100% idempotent and non-destructive.
--  * Only ADDs missing columns / constraints / indexes to the EXISTING items
--    table. The existing Item Master remains the single source of truth.
--  * No table is dropped or recreated. No existing row is modified except the
--    clearly identifiable SAMPLE rows inserted below (fixed UUIDs).
--  * Sample routings are stored in the EXISTING production_routings /
--    routing_operations tables (no duplicate routing system).
-- =============================================================================

-- ============================================================================
-- SECTION 1: NEW COLUMNS ON EXISTING items TABLE (nullable -> existing rows stay valid)
-- ============================================================================

ALTER TABLE items ADD COLUMN IF NOT EXISTS division_id UUID;
ALTER TABLE items ADD COLUMN IF NOT EXISTS section_id UUID;
ALTER TABLE items ADD COLUMN IF NOT EXISTS department_id UUID;

-- Material / process information
ALTER TABLE items ADD COLUMN IF NOT EXISTS wire_size_mm NUMERIC(8,3);
ALTER TABLE items ADD COLUMN IF NOT EXISTS route_type VARCHAR(50);
ALTER TABLE items ADD COLUMN IF NOT EXISTS process_1 VARCHAR(255);
ALTER TABLE items ADD COLUMN IF NOT EXISTS process_2 VARCHAR(255);
ALTER TABLE items ADD COLUMN IF NOT EXISTS process_3 VARCHAR(255);
ALTER TABLE items ADD COLUMN IF NOT EXISTS process_4 VARCHAR(255);
ALTER TABLE items ADD COLUMN IF NOT EXISTS final_product VARCHAR(255);
ALTER TABLE items ADD COLUMN IF NOT EXISTS packing_next_step VARCHAR(255);

-- Item-specific UOM conversion values (Phase 7 / Phase 9 of PROMPT-09)
ALTER TABLE items ADD COLUMN IF NOT EXISTS weight_per_piece NUMERIC(15,6);
ALTER TABLE items ADD COLUMN IF NOT EXISTS pieces_per_kg NUMERIC(15,6);
ALTER TABLE items ADD COLUMN IF NOT EXISTS weight_per_meter NUMERIC(15,6);
ALTER TABLE items ADD COLUMN IF NOT EXISTS length_per_piece NUMERIC(15,6);

-- ============================================================================
-- SECTION 2: FOREIGN KEYS (idempotent)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_items_division') THEN
    ALTER TABLE items ADD CONSTRAINT fk_items_division
      FOREIGN KEY (division_id) REFERENCES divisions(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_items_section') THEN
    ALTER TABLE items ADD CONSTRAINT fk_items_section
      FOREIGN KEY (section_id) REFERENCES sections(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_items_department') THEN
    ALTER TABLE items ADD CONSTRAINT fk_items_department
      FOREIGN KEY (department_id) REFERENCES departments(id);
  END IF;
END $$;

-- ============================================================================
-- SECTION 3: CHECK CONSTRAINTS for conversion values (idempotent)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_items_wire_size_mm_positive') THEN
    ALTER TABLE items ADD CONSTRAINT ck_items_wire_size_mm_positive
      CHECK (wire_size_mm IS NULL OR wire_size_mm > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_items_weight_per_piece_positive') THEN
    ALTER TABLE items ADD CONSTRAINT ck_items_weight_per_piece_positive
      CHECK (weight_per_piece IS NULL OR weight_per_piece > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_items_pieces_per_kg_positive') THEN
    ALTER TABLE items ADD CONSTRAINT ck_items_pieces_per_kg_positive
      CHECK (pieces_per_kg IS NULL OR pieces_per_kg > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_items_weight_per_meter_positive') THEN
    ALTER TABLE items ADD CONSTRAINT ck_items_weight_per_meter_positive
      CHECK (weight_per_meter IS NULL OR weight_per_meter > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_items_length_per_piece_positive') THEN
    ALTER TABLE items ADD CONSTRAINT ck_items_length_per_piece_positive
      CHECK (length_per_piece IS NULL OR length_per_piece > 0);
  END IF;
END $$;

-- ============================================================================
-- SECTION 4: INDEXES for organization / routing filtering
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_items_division_id ON items(division_id);
CREATE INDEX IF NOT EXISTS idx_items_section_id ON items(section_id);
CREATE INDEX IF NOT EXISTS idx_items_department_id ON items(department_id);
CREATE INDEX IF NOT EXISTS idx_items_route_type ON items(route_type);
CREATE INDEX IF NOT EXISTS idx_items_wire_size_mm ON items(wire_size_mm);

-- ============================================================================
-- SECTION 5: COLUMN DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN items.division_id IS 'PROMPT-09: Division (Division -> Section -> Department -> Item hierarchy)';
COMMENT ON COLUMN items.section_id IS 'PROMPT-09: Section within the division';
COMMENT ON COLUMN items.department_id IS 'PROMPT-09: Department within the section';
COMMENT ON COLUMN items.wire_size_mm IS 'PROMPT-09: Raw wire diameter in mm';
COMMENT ON COLUMN items.route_type IS 'PROMPT-09: Routing rule, e.g. DIRECT_SPOKE, STANDARD_SPD, NIPPLE, CCD';
COMMENT ON COLUMN items.process_1 IS 'PROMPT-09: Process step 1 summary';
COMMENT ON COLUMN items.process_2 IS 'PROMPT-09: Process step 2 summary';
COMMENT ON COLUMN items.process_3 IS 'PROMPT-09: Process step 3 summary';
COMMENT ON COLUMN items.process_4 IS 'PROMPT-09: Process step 4 summary';
COMMENT ON COLUMN items.final_product IS 'PROMPT-09: Final produced product name';
COMMENT ON COLUMN items.packing_next_step IS 'PROMPT-09: Packing / next step after final process';
COMMENT ON COLUMN items.weight_per_piece IS 'PROMPT-09: Weight per piece in KG (item-specific)';
COMMENT ON COLUMN items.pieces_per_kg IS 'PROMPT-09: Pieces per KG (manually maintained, never auto-overwritten)';
COMMENT ON COLUMN items.weight_per_meter IS 'PROMPT-09: Weight per meter in kg/m (item-specific)';
COMMENT ON COLUMN items.length_per_piece IS 'PROMPT-09: Length per piece in m (item-specific)';

-- ============================================================================
-- SECTION 6: ENSURE PRODUCTION UOMS EXIST (KG / PCS / METER)
-- Reuses existing uoms table; inserts only if a code is missing.
-- ============================================================================

INSERT INTO uoms (code, name, symbol, uom_type, decimal_precision, status) VALUES
  ('KG',   'Kilogram', 'kg', 'WEIGHT', 3, 'ACTIVE'),
  ('PCS',  'Pieces',   'pcs','COUNT',  0, 'ACTIVE'),
  ('M',    'Meter',    'm',  'LENGTH', 3, 'ACTIVE')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- SECTION 7: SAMPLE ITEMS (PROMPT-09 Phase 10)
-- Clearly identified with [SAMPLE] names and SAMPLE- codes so real production
-- data can never be confused with test records. Fixed UUIDs keep re-runs
-- idempotent (no duplicate sample records).
-- ============================================================================

DO $$
DECLARE
  v_company_id UUID := '7725aa04-a270-4314-9e82-90949cbe7791';
  v_uom_kg     UUID;
  v_uom_pcs    UUID;
  v_uom_m      UUID;
  v_div_spd    UUID;
  v_div_ccd    UUID;
  v_sec_spoke  UUID;
  v_sec_nipple UUID;
  v_sec_spiral UUID;
  v_dept_straight UUID;
  v_dept_swage    UUID;
  v_dept_spoke    UUID;
  v_dept_header   UUID;
  v_dept_nipple   UUID;
  v_dept_flat     UUID;
  v_dept_spiral   UUID;
BEGIN
  SELECT id INTO v_uom_kg  FROM uoms WHERE code = 'KG'  LIMIT 1;
  SELECT id INTO v_uom_pcs FROM uoms WHERE code = 'PCS' LIMIT 1;
  IF v_uom_pcs IS NULL THEN SELECT id INTO v_uom_pcs FROM uoms WHERE code = 'PC' LIMIT 1; END IF;
  SELECT id INTO v_uom_m   FROM uoms WHERE code = 'M'   LIMIT 1;
  SELECT id INTO v_div_spd    FROM divisions WHERE division_code = 'SPD' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_div_ccd    FROM divisions WHERE division_code = 'CCD' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_sec_spoke  FROM sections WHERE section_code = 'SEC-010' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_sec_nipple FROM sections WHERE section_code = 'SEC-011' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_sec_spiral FROM sections WHERE section_code = 'SEC-015' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_straight FROM departments WHERE department_code = 'SPD-DEPT001' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_swage    FROM departments WHERE department_code = 'SPD-DEPT002' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_spoke    FROM departments WHERE department_code = 'SPD-DEPT003' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_header   FROM departments WHERE department_code = 'SPD-DEPT004' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_nipple   FROM departments WHERE department_code = 'SPD-DEPT005' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_flat     FROM departments WHERE department_code = 'CCD-DEPT001' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_spiral   FROM departments WHERE department_code = 'CCD-DEPT002' AND company_id = v_company_id LIMIT 1;

  -- ------------------------------------------------------------------
  -- RAW MATERIAL sample items
  -- ------------------------------------------------------------------
  INSERT INTO items (id, company_id, item_code, name, item_type, status, is_active,
                     base_uom_id, division_id, section_id, department_id,
                     wire_size_mm, route_type, process_1, process_2, process_3, process_4,
                     final_product, packing_next_step,
                     weight_per_piece, pieces_per_kg, weight_per_meter, length_per_piece,
                     notes, track_inventory, is_purchasable, created_at, updated_at)
  VALUES
    -- SAMPLE 01: Wire 3.45 mm -> DIRECT_SPOKE (Straightener/Swagging skipped)
    ('c1000000-0000-4000-8000-000000000001', v_company_id, 'SAMPLE-WIRE-3.45',
     'Wire 3.45 mm [SAMPLE]', 'RAW_MATERIAL', 'ACTIVE', true,
     v_uom_kg, v_div_spd, v_sec_spoke, v_dept_spoke,
     3.450, 'DIRECT_SPOKE', 'Spoke', 'Spoke Plating', NULL, NULL,
     'Spoke', 'Spoke Packing',
     0.049900, 20.05, 0.073400, 0.680000,
     'PROMPT-09 SAMPLE DATA - safe test record', true, true, NOW(), NOW()),

    -- SAMPLE 02: Wire 4.50 mm -> STANDARD_SPD (Straightener -> Swagging -> Spoke ...)
    ('c1000000-0000-4000-8000-000000000002', v_company_id, 'SAMPLE-WIRE-4.50',
     'Wire 4.50 mm [SAMPLE]', 'RAW_MATERIAL', 'ACTIVE', true,
     v_uom_kg, v_div_spd, v_sec_spoke, v_dept_straight,
     4.500, 'STANDARD_SPD', 'Straightener', 'Swagging', 'Spoke', 'Spoke Plating',
     'Spoke', 'Spoke Packing',
     0.093700, 10.67, 0.124900, 0.750000,
     'PROMPT-09 SAMPLE DATA - safe test record', true, true, NOW(), NOW()),

    -- SAMPLE 03: Nipple -> Nipple Plating -> Packing
    ('c1000000-0000-4000-8000-000000000003', v_company_id, 'SAMPLE-NIPPLE',
     'Nipple [SAMPLE]', 'RAW_MATERIAL', 'ACTIVE', true,
     v_uom_pcs, v_div_spd, v_sec_nipple, v_dept_nipple,
     NULL, 'NIPPLE', 'Nipple', 'Nipple Plating', NULL, NULL,
     'Nipple', 'Packing',
     0.002500, 400.00, NULL, NULL,
'PROMPT-09 SAMPLE DATA - safe test record', true, true, NOW(), NOW()),
     ('c1000000-0000-4000-8000-000000000004', v_company_id, 'SAMPLE-CCD-WIRE',
     'CCD Wire [SAMPLE]', 'RAW_MATERIAL', 'ACTIVE', true,
     v_uom_m, v_div_ccd, v_sec_spiral, v_dept_flat,
     2.500, 'CCD', 'Flattening', 'Spiral', 'PVC', NULL,
     'CCD Wire', 'CCD Packing',
     0.120000, 8.333, 0.150000, 0.800000,
     'PROMPT-09 SAMPLE DATA - safe test record', true, true, NOW(), NOW())
ON CONFLICT (company_id, item_code) DO UPDATE SET
    name               = EXCLUDED.name,
    item_type          = EXCLUDED.item_type,
    status             = EXCLUDED.status,
    is_active          = EXCLUDED.is_active,
    base_uom_id        = EXCLUDED.base_uom_id,
    division_id        = EXCLUDED.division_id,
    section_id         = EXCLUDED.section_id,
    department_id      = EXCLUDED.department_id,
    wire_size_mm       = EXCLUDED.wire_size_mm,
    route_type         = EXCLUDED.route_type,
    process_1          = EXCLUDED.process_1,
    process_2          = EXCLUDED.process_2,
    process_3          = EXCLUDED.process_3,
    process_4          = EXCLUDED.process_4,
    final_product      = EXCLUDED.final_product,
    packing_next_step  = EXCLUDED.packing_next_step,
    weight_per_piece   = EXCLUDED.weight_per_piece,
    pieces_per_kg      = EXCLUDED.pieces_per_kg,
    weight_per_meter   = EXCLUDED.weight_per_meter,
    length_per_piece   = EXCLUDED.length_per_piece,
    notes              = EXCLUDED.notes,
    updated_at         = NOW();

  -- ------------------------------------------------------------------
  -- INTERMEDIATE / PACKED sample items (produced internally, consumed by next department)
  -- ------------------------------------------------------------------
  INSERT INTO items (id, company_id, item_code, name, item_type, status, is_active,
                     base_uom_id, division_id, section_id, department_id, notes,
                     weight_per_piece, pieces_per_kg, weight_per_meter, length_per_piece,
                     track_inventory, is_manufacturable, created_at, updated_at)
  VALUES
    ('c1000000-0000-4000-8000-000000000011', v_company_id, 'SAMPLE-STRAIGHTENED-WIRE',
     'Straightened Wire 4.50 mm [SAMPLE]', 'SEMI_FINISHED', 'ACTIVE', true,
     v_uom_kg, v_div_spd, v_sec_spoke, v_dept_straight, 'PROMPT-09 SAMPLE DATA - intermediate item',
     0.093700, 10.67, 0.124900, 0.750000, false, true, NOW(), NOW()),
    ('c1000000-0000-4000-8000-000000000012', v_company_id, 'SAMPLE-SWAGED-WIRE',
     'Swaged Wire 4.50 mm [SAMPLE]', 'SEMI_FINISHED', 'ACTIVE', true,
     v_uom_kg, v_div_spd, v_sec_spoke, v_dept_swage, 'PROMPT-09 SAMPLE DATA - intermediate item',
     0.090000, 11.11, 0.120000, 0.750000, false, true, NOW(), NOW()),
    ('c1000000-0000-4000-8000-000000000013', v_company_id, 'SAMPLE-SPOKE',
     'Spoke [SAMPLE]', 'SEMI_FINISHED', 'ACTIVE', true,
     v_uom_pcs, v_div_spd, v_sec_spoke, v_dept_spoke, 'PROMPT-09 SAMPLE DATA - intermediate item',
     0.088000, 11.36, NULL, NULL, false, true, NOW(), NOW()),
    ('c1000000-0000-4000-8000-000000000014', v_company_id, 'SAMPLE-SPOKE-PLATED',
     'Spoke Plated [SAMPLE]', 'SEMI_FINISHED', 'ACTIVE', true,
     v_uom_pcs, v_div_spd, v_sec_spoke, v_dept_spoke, 'PROMPT-09 SAMPLE DATA - intermediate item',
     0.089000, 11.24, NULL, NULL, false, true, NOW(), NOW()),
    ('c1000000-0000-4000-8000-000000000015', v_company_id, 'SAMPLE-SPOKE-PACKED',
     'Packed Spoke [SAMPLE]', 'FINISHED_GOOD', 'ACTIVE', true,
     v_uom_pcs, v_div_spd, v_sec_spoke, v_dept_spoke, 'PROMPT-09 SAMPLE DATA - packed/dispatchable item',
     0.090000, 11.11, NULL, NULL, true, true, NOW(), NOW()),
    ('c1000000-0000-4000-8000-000000000016', v_company_id, 'SAMPLE-NIPPLE-FORMED',
     'Nipple Formed [SAMPLE]', 'SEMI_FINISHED', 'ACTIVE', true,
     v_uom_pcs, v_div_spd, v_sec_nipple, v_dept_header, 'PROMPT-09 SAMPLE DATA - intermediate item',
     0.002500, 400.00, NULL, NULL, false, true, NOW(), NOW()),
    ('c1000000-0000-4000-8000-000000000017', v_company_id, 'SAMPLE-NIPPLE-PLATED',
     'Nipple Plated [SAMPLE]', 'SEMI_FINISHED', 'ACTIVE', true,
     v_uom_pcs, v_div_spd, v_sec_nipple, v_dept_nipple, 'PROMPT-09 SAMPLE DATA - intermediate item',
     0.002600, 384.62, NULL, NULL, false, true, NOW(), NOW()),
    ('c1000000-0000-4000-8000-000000000018', v_company_id, 'SAMPLE-NIPPLE-PACKED',
     'Packed Nipple [SAMPLE]', 'FINISHED_GOOD', 'ACTIVE', true,
     v_uom_pcs, v_div_spd, v_sec_nipple, v_dept_nipple, 'PROMPT-09 SAMPLE DATA - packed/dispatchable item',
     0.002700, 370.37, NULL, NULL, true, true, NOW(), NOW()),
    ('c1000000-0000-4000-8000-000000000019', v_company_id, 'SAMPLE-CCD-FLATTENED',
     'CCD Flattened Strip [SAMPLE]', 'SEMI_FINISHED', 'ACTIVE', true,
     v_uom_m, v_div_ccd, v_sec_spiral, v_dept_flat, 'PROMPT-09 SAMPLE DATA - intermediate item',
     0.115000, 8.70, 0.144000, 0.800000, false, true, NOW(), NOW()),
    ('c1000000-0000-4000-8000-000000000020', v_company_id, 'SAMPLE-CCD-SPIRAL',
     'CCD Spiral Cable [SAMPLE]', 'SEMI_FINISHED', 'ACTIVE', true,
     v_uom_m, v_div_ccd, v_sec_spiral, v_dept_spiral, 'PROMPT-09 SAMPLE DATA - intermediate item',
     0.130000, 7.69, 0.162000, 0.800000, false, true, NOW(), NOW()),
    ('c1000000-0000-4000-8000-000000000021', v_company_id, 'SAMPLE-CCD-PVC',
     'CCD PVC Insulated Cable [SAMPLE]', 'SEMI_FINISHED', 'ACTIVE', true,
     v_uom_m, v_div_ccd, v_sec_spiral, v_dept_spiral, 'PROMPT-09 SAMPLE DATA - intermediate item',
     0.140000, 7.14, 0.175000, 0.800000, false, true, NOW(), NOW()),
    ('c1000000-0000-4000-8000-000000000022', v_company_id, 'SAMPLE-CCD-PACKED',
     'Packed CCD Cable [SAMPLE]', 'FINISHED_GOOD', 'ACTIVE', true,
     v_uom_pcs, v_div_ccd, v_sec_spiral, v_dept_spiral, 'PROMPT-09 SAMPLE DATA - packed/dispatchable item',
     0.150000, 6.67, NULL, NULL, true, true, NOW(), NOW())
ON CONFLICT (company_id, item_code) DO UPDATE SET
    name             = EXCLUDED.name,
    item_type        = EXCLUDED.item_type,
    status           = EXCLUDED.status,
    is_active        = EXCLUDED.is_active,
    base_uom_id      = EXCLUDED.base_uom_id,
    division_id      = EXCLUDED.division_id,
    section_id       = EXCLUDED.section_id,
    department_id    = EXCLUDED.department_id,
    notes            = EXCLUDED.notes,
    updated_at       = NOW();

  -- Do not overwrite manually maintained master data of NON-sample rows:
  -- this migration only ever touches rows with the fixed sample ids above.
END $$;

-- ============================================================================
-- SECTION 8: SAMPLE ITEM-SPECIFIC ROUTINGS (PROMPT-09 Phase 4 / Phase 5)
-- Stored in the EXISTING production_routings / routing_operations tables.
-- Each sample item gets its own sequence - different items, different routes.
-- ============================================================================

DO $$
DECLARE
  v_company_id UUID := '7725aa04-a270-4314-9e82-90949cbe7791';
  v_it_wire345   UUID := 'c1000000-0000-4000-8000-000000000001';
  v_it_wire450   UUID := 'c1000000-0000-4000-8000-000000000002';
  v_it_nipple    UUID := 'c1000000-0000-4000-8000-000000000003';
  v_it_ccdwire   UUID := 'c1000000-0000-4000-8000-000000000004';
  v_it_straight  UUID := 'c1000000-0000-4000-8000-000000000011';
  v_it_swaged    UUID := 'c1000000-0000-4000-8000-000000000012';
  v_it_spoke     UUID := 'c1000000-0000-4000-8000-000000000013';
  v_it_plated    UUID := 'c1000000-0000-4000-8000-000000000014';
  v_it_packed    UUID := 'c1000000-0000-4000-8000-000000000015';
  v_it_nipformed UUID := 'c1000000-0000-4000-8000-000000000016';
  v_it_nipplated UUID := 'c1000000-0000-4000-8000-000000000017';
  v_it_nippacked UUID := 'c1000000-0000-4000-8000-000000000018';
  v_it_flat      UUID := 'c1000000-0000-4000-8000-000000000019';
  v_it_spiral    UUID := 'c1000000-0000-4000-8000-000000000020';
  v_it_pvc       UUID := 'c1000000-0000-4000-8000-000000000021';
  v_it_ccdpacked UUID := 'c1000000-0000-4000-8000-000000000022';

  v_div_spd UUID; v_div_ccd UUID;
  v_sec_spoke UUID; v_sec_plate UUID; v_sec_pack UUID; v_sec_nipple UUID; v_sec_spiral UUID; v_sec_pvc UUID; v_sec_ccdpack UUID;
  v_dept_straightener UUID; v_dept_swagging UUID; v_dept_spoke UUID;
  v_dept_nipple UUID; v_dept_spokeplate UUID; v_dept_nippleplate UUID; v_dept_spokepack UUID;
  v_dept_flattening UUID; v_dept_spiral UUID; v_dept_pvc UUID; v_dept_ccdpack UUID;
  v_uom_kg UUID; v_uom_pcs UUID; v_uom_m UUID;
  v_routing_id UUID;
BEGIN
  IF v_it_wire345 IS NULL OR v_it_wire450 IS NULL OR v_it_nipple IS NULL OR v_it_ccdwire IS NULL THEN
    RAISE NOTICE 'Skipping sample routings: sample items missing';
    RETURN;
  END IF;

  SELECT id INTO v_div_spd  FROM divisions WHERE division_code = 'SPD' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_div_ccd  FROM divisions WHERE division_code = 'CCD' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_sec_spoke   FROM sections WHERE section_code = 'SEC-010' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_sec_plate   FROM sections WHERE section_code = 'SEC-012' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_sec_pack    FROM sections WHERE section_code = 'SEC-013' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_sec_nipple  FROM sections WHERE section_code = 'SEC-011' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_sec_spiral  FROM sections WHERE section_code = 'SEC-015' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_sec_pvc     FROM sections WHERE section_code = 'SEC-016' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_sec_ccdpack FROM sections WHERE section_code = 'SEC-017' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_straightener FROM departments WHERE department_code = 'SPD-DEPT001' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_swagging     FROM departments WHERE department_code = 'SPD-DEPT002' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_spoke        FROM departments WHERE department_code = 'SPD-DEPT003' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_nipple       FROM departments WHERE department_code = 'SPD-DEPT005' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_spokeplate   FROM departments WHERE department_code = 'SPD-DEPT006' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_nippleplate  FROM departments WHERE department_code = 'SPD-DEPT007' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_spokepack    FROM departments WHERE department_code = 'SPD-DEPT008' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_flattening   FROM departments WHERE department_code = 'CCD-DEPT001' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_spiral       FROM departments WHERE department_code = 'CCD-DEPT002' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_pvc          FROM departments WHERE department_code = 'CCD-DEPT003' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_dept_ccdpack      FROM departments WHERE department_code = 'CCD-DEPT004' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_uom_kg  FROM uoms WHERE code = 'KG'  LIMIT 1;
  SELECT id INTO v_uom_pcs FROM uoms WHERE code = 'PCS' LIMIT 1;
  IF v_uom_pcs IS NULL THEN SELECT id INTO v_uom_pcs FROM uoms WHERE code = 'PC' LIMIT 1; END IF;
  SELECT id INTO v_uom_m   FROM uoms WHERE code = 'M'   LIMIT 1;

  -- Clean previous sample operations only (scoped to our fixed routing ids)
  DELETE FROM routing_operations WHERE routing_id IN (
    'b1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000004');

  -- ------------------------------------------------------------------
  -- SAMPLE ROUTE 1: WIRE-3.45 -> DIRECT_SPOKE (Straightener/Swagging skipped)
  -- RAW MATERIAL -> Spoke -> Spoke Plating -> Spoke Packing
  -- ------------------------------------------------------------------
  INSERT INTO production_routings (id, company_id, routing_code, name, description,
                                   product_id, bom_id, status, base_quantity, estimated_total_time,
                                   is_default, effective_from, created_at, updated_at, is_active)
  VALUES ('b1000000-0000-4000-8000-000000000001', v_company_id, 'RTG-SMP-001',
          'Wire 3.45 mm - Direct Spoke [SAMPLE]',
          'PROMPT-09 sample: RAW MATERIAL -> Spoke -> Spoke Plating -> Spoke Packing (DIRECT_SPOKE)',
          v_it_wire345, NULL, 'ACTIVE', 1, 60, true, NOW(), NOW(), NOW(), true)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description, status = 'ACTIVE',
    is_default = true, updated_at = NOW();

  v_routing_id := 'b1000000-0000-4000-8000-000000000001';
  INSERT INTO routing_operations (id, company_id, routing_id, sequence_no, operation_code, operation_name,
                                  division_id, section_id, department_id,
                                  input_item_id, output_item_id, input_quantity, output_quantity, uom_id,
                                  status, remarks, created_at, updated_at, is_active)
  VALUES
    ('b2000000-0000-4000-8000-000000000001', v_company_id, v_routing_id, 10, 'OP-SMP-010', 'Spoke',
     v_div_spd, v_sec_spoke, v_dept_spoke, v_it_wire345, v_it_spoke, 1, 1, v_uom_pcs, 'ACTIVE',
     'SAMPLE operation', NOW(), NOW(), true),
    ('b2000000-0000-4000-8000-000000000002', v_company_id, v_routing_id, 20, 'OP-SMP-020', 'Spoke Plating',
     v_div_spd, v_sec_plate, v_dept_spokeplate, v_it_spoke, v_it_plated, 1, 1, v_uom_pcs, 'ACTIVE',
     'SAMPLE operation', NOW(), NOW(), true),
    ('b2000000-0000-4000-8000-000000000003', v_company_id, v_routing_id, 30, 'OP-SMP-030', 'Spoke Packing',
     v_div_spd, v_sec_pack, v_dept_spokepack, v_it_plated, v_it_packed, 1, 1, v_uom_pcs, 'ACTIVE',
     'SAMPLE packing / dispatch step', NOW(), NOW(), true);

  -- ------------------------------------------------------------------
  -- SAMPLE ROUTE 2: WIRE-4.50 -> STANDARD_SPD
  -- RAW MATERIAL -> Straightener -> Swagging -> Spoke -> Spoke Plating -> Spoke Packing
  -- ------------------------------------------------------------------
  INSERT INTO production_routings (id, company_id, routing_code, name, description,
                                   product_id, bom_id, status, base_quantity, estimated_total_time,
                                   is_default, effective_from, created_at, updated_at, is_active)
  VALUES ('b1000000-0000-4000-8000-000000000002', v_company_id, 'RTG-SMP-002',
          'Wire 4.50 mm - Standard SPD [SAMPLE]',
          'PROMPT-09 sample: RAW MATERIAL -> Straightener -> Swagging -> Spoke -> Spoke Plating -> Spoke Packing (STANDARD_SPD)',
          v_it_wire450, NULL, 'ACTIVE', 1, 100, true, NOW(), NOW(), NOW(), true)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description, status = 'ACTIVE',
    is_default = true, updated_at = NOW();

  v_routing_id := 'b1000000-0000-4000-8000-000000000002';
  INSERT INTO routing_operations (id, company_id, routing_id, sequence_no, operation_code, operation_name,
                                  division_id, section_id, department_id,
                                  input_item_id, output_item_id, input_quantity, output_quantity, uom_id,
                                  status, remarks, created_at, updated_at, is_active)
  VALUES
    ('b2000000-0000-4000-8000-000000000011', v_company_id, v_routing_id, 10, 'OP-SMP-010', 'Straightener',
     v_div_spd, v_sec_spoke, v_dept_straightener, v_it_wire450, v_it_straight, 1, 1, v_uom_kg, 'ACTIVE',
     'SAMPLE operation', NOW(), NOW(), true),
    ('b2000000-0000-4000-8000-000000000012', v_company_id, v_routing_id, 20, 'OP-SMP-020', 'Swagging',
     v_div_spd, v_sec_spoke, v_dept_swagging, v_it_straight, v_it_swaged, 1, 1, v_uom_kg, 'ACTIVE',
     'SAMPLE operation', NOW(), NOW(), true),
    ('b2000000-0000-4000-8000-000000000013', v_company_id, v_routing_id, 30, 'OP-SMP-030', 'Spoke',
     v_div_spd, v_sec_spoke, v_dept_spoke, v_it_swaged, v_it_spoke, 1, 1, v_uom_pcs, 'ACTIVE',
     'SAMPLE operation', NOW(), NOW(), true),
    ('b2000000-0000-4000-8000-000000000014', v_company_id, v_routing_id, 40, 'OP-SMP-040', 'Spoke Plating',
     v_div_spd, v_sec_plate, v_dept_spokeplate, v_it_spoke, v_it_plated, 1, 1, v_uom_pcs, 'ACTIVE',
     'SAMPLE operation', NOW(), NOW(), true),
    ('b2000000-0000-4000-8000-000000000015', v_company_id, v_routing_id, 50, 'OP-SMP-050', 'Spoke Packing',
     v_div_spd, v_sec_pack, v_dept_spokepack, v_it_plated, v_it_packed, 1, 1, v_uom_pcs, 'ACTIVE',
     'SAMPLE packing / dispatch step', NOW(), NOW(), true);

  -- ------------------------------------------------------------------
  -- SAMPLE ROUTE 3: NIPPLE
  -- RAW MATERIAL -> Nipple -> Nipple Plating -> Packing
  -- ------------------------------------------------------------------
  INSERT INTO production_routings (id, company_id, routing_code, name, description,
                                   product_id, bom_id, status, base_quantity, estimated_total_time,
                                   is_default, effective_from, created_at, updated_at, is_active)
  VALUES ('b1000000-0000-4000-8000-000000000003', v_company_id, 'RTG-SMP-003',
          'Nipple Route [SAMPLE]',
          'PROMPT-09 sample: RAW MATERIAL -> Nipple -> Nipple Plating -> Packing (NIPPLE)',
          v_it_nipple, NULL, 'ACTIVE', 1, 60, true, NOW(), NOW(), NOW(), true)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description, status = 'ACTIVE',
    is_default = true, updated_at = NOW();

  v_routing_id := 'b1000000-0000-4000-8000-000000000003';
  INSERT INTO routing_operations (id, company_id, routing_id, sequence_no, operation_code, operation_name,
                                  division_id, section_id, department_id,
                                  input_item_id, output_item_id, input_quantity, output_quantity, uom_id,
                                  status, remarks, created_at, updated_at, is_active)
  VALUES
    ('b2000000-0000-4000-8000-000000000021', v_company_id, v_routing_id, 10, 'OP-SMP-010', 'Nipple',
     v_div_spd, v_sec_nipple, v_dept_nipple, v_it_nipple, v_it_nipformed, 1, 1, v_uom_pcs, 'ACTIVE',
     'SAMPLE operation', NOW(), NOW(), true),
    ('b2000000-0000-4000-8000-000000000022', v_company_id, v_routing_id, 20, 'OP-SMP-020', 'Nipple Plating',
     v_div_spd, v_sec_plate, v_dept_nippleplate, v_it_nipformed, v_it_nipplated, 1, 1, v_uom_pcs, 'ACTIVE',
     'SAMPLE operation', NOW(), NOW(), true),
    ('b2000000-0000-4000-8000-000000000023', v_company_id, v_routing_id, 30, 'OP-SMP-030', 'Packing',
     v_div_spd, v_sec_pack, v_dept_spokepack, v_it_nipplated, v_it_nippacked, 1, 1, v_uom_pcs, 'ACTIVE',
     'SAMPLE packing / dispatch step', NOW(), NOW(), true);

  -- ------------------------------------------------------------------
  -- SAMPLE ROUTE 4: CCD WIRE
  -- RAW MATERIAL -> Flattening -> Spiral -> PVC -> CCD Packing
  -- ------------------------------------------------------------------
  INSERT INTO production_routings (id, company_id, routing_code, name, description,
                                   product_id, bom_id, status, base_quantity, estimated_total_time,
                                   is_default, effective_from, created_at, updated_at, is_active)
  VALUES ('b1000000-0000-4000-8000-000000000004', v_company_id, 'RTG-SMP-004',
          'CCD Wire Route [SAMPLE]',
          'PROMPT-09 sample: RAW MATERIAL -> Flattening -> Spiral -> PVC -> CCD Packing (CCD)',
          v_it_ccdwire, NULL, 'ACTIVE', 1, 90, true, NOW(), NOW(), NOW(), true)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description, status = 'ACTIVE',
    is_default = true, updated_at = NOW();

  v_routing_id := 'b1000000-0000-4000-8000-000000000004';
  INSERT INTO routing_operations (id, company_id, routing_id, sequence_no, operation_code, operation_name,
                                  division_id, section_id, department_id,
                                  input_item_id, output_item_id, input_quantity, output_quantity, uom_id,
                                  status, remarks, created_at, updated_at, is_active)
  VALUES
    ('b2000000-0000-4000-8000-000000000031', v_company_id, v_routing_id, 10, 'OP-SMP-010', 'Flattening',
     v_div_ccd, v_sec_spiral, v_dept_flattening, v_it_ccdwire, v_it_flat, 1, 1, v_uom_m, 'ACTIVE',
     'SAMPLE operation', NOW(), NOW(), true),
    ('b2000000-0000-4000-8000-000000000032', v_company_id, v_routing_id, 20, 'OP-SMP-020', 'Spiral',
     v_div_ccd, v_sec_spiral, v_dept_spiral, v_it_flat, v_it_spiral, 1, 1, v_uom_m, 'ACTIVE',
     'SAMPLE operation', NOW(), NOW(), true),
    ('b2000000-0000-4000-8000-000000000033', v_company_id, v_routing_id, 30, 'OP-SMP-030', 'PVC',
     v_div_ccd, v_sec_pvc, v_dept_pvc, v_it_spiral, v_it_pvc, 1, 1, v_uom_m, 'ACTIVE',
     'SAMPLE operation', NOW(), NOW(), true),
    ('b2000000-0000-4000-8000-000000000034', v_company_id, v_routing_id, 40, 'OP-SMP-040', 'CCD Packing',
     v_div_ccd, v_sec_ccdpack, v_dept_ccdpack, v_it_pvc, v_it_ccdpacked, 1, 1, v_uom_pcs, 'ACTIVE',
     'SAMPLE packing / dispatch step', NOW(), NOW(), true);

END $$;
