-- =============================================================================
-- ERP-00010: Production Routing & Operations + Manufacturing Hierarchy
-- =============================================================================
-- This migration is 100% idempotent. Safe to run multiple times.
-- Uses IF NOT EXISTS and ON CONFLICT for every statement.
-- Never destroys existing data.
-- =============================================================================

DO $$
DECLARE
  v_company_id UUID := '7725aa04-a270-4314-9e82-90949cbe7791';
  v_role_id    UUID := 'c37e82cb-5242-4987-a92a-3edb208da6f4';
BEGIN

  -- =======================================================================
  -- SECTION 1: MANUFACTURING DIVISIONS (SPD, CCD)
  -- =======================================================================

  INSERT INTO divisions (id, company_id, division_code, name, description, status, created_at, updated_at, is_active)
  VALUES
    ('d1000000-0000-0000-0000-000000000001', v_company_id, 'SPD', 'Spoke Division',
     'Spoke Division - Straightener, Swagging, Spoke, Nipple, Plating, Packing', 'ACTIVE', NOW(), NOW(), true),
    ('d1000000-0000-0000-0000-000000000002', v_company_id, 'CCD', 'Control Cable Division',
     'Control Cable Division - Flattening, Spiral, PVC, Packing', 'ACTIVE', NOW(), NOW(), true)
  ON CONFLICT (division_code, company_id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = NOW();

  -- =======================================================================
  -- SECTION 2: MANUFACTURING SECTIONS
  -- =======================================================================

  INSERT INTO sections (id, company_id, section_code, name, description, division_id, status, created_at, updated_at, is_active)
  VALUES
    -- Spoke Division sections
    ('d2000000-0000-0000-0000-000000000001', v_company_id, 'SEC-010', 'Spoke',
     'Spoke section - Straightener, Swagging, Spoke operations',
     'd1000000-0000-0000-0000-000000000001', 'ACTIVE', NOW(), NOW(), true),
    ('d2000000-0000-0000-0000-000000000002', v_company_id, 'SEC-011', 'Nipple',
     'Nipple section - Header, Nipple operations',
     'd1000000-0000-0000-0000-000000000001', 'ACTIVE', NOW(), NOW(), true),
    ('d2000000-0000-0000-0000-000000000003', v_company_id, 'SEC-012', 'Auto Plating',
     'Auto Plating section - Spoke Plating, Nipple Plating operations',
     'd1000000-0000-0000-0000-000000000001', 'ACTIVE', NOW(), NOW(), true),
    ('d2000000-0000-0000-0000-000000000004', v_company_id, 'SEC-013', 'SPD Packing',
     'SPD Packing section - Spoke Packing operations',
     'd1000000-0000-0000-0000-000000000001', 'ACTIVE', NOW(), NOW(), true),
    ('d2000000-0000-0000-0000-000000000005', v_company_id, 'SEC-014', 'Maintenance',
     'Maintenance section - Facility Maintenance operations',
     'd1000000-0000-0000-0000-000000000001', 'ACTIVE', NOW(), NOW(), true),
    -- Control Cable Division sections
    ('d2000000-0000-0000-0000-000000000006', v_company_id, 'SEC-015', 'Spiral',
     'Spiral section - Flattening, Spiral operations',
     'd1000000-0000-0000-0000-000000000002', 'ACTIVE', NOW(), NOW(), true),
    ('d2000000-0000-0000-0000-000000000007', v_company_id, 'SEC-016', 'PVC',
     'PVC section - PVC extrusion operations',
     'd1000000-0000-0000-0000-000000000002', 'ACTIVE', NOW(), NOW(), true),
    ('d2000000-0000-0000-0000-000000000008', v_company_id, 'SEC-017', 'CCD Packing',
     'CCD Packing section - Control Cable Packing operations',
     'd1000000-0000-0000-0000-000000000002', 'ACTIVE', NOW(), NOW(), true)
  ON CONFLICT (section_code, company_id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    division_id = EXCLUDED.division_id,
    updated_at = NOW();

  -- =======================================================================
  -- SECTION 3: MANUFACTURING DEPARTMENTS
  -- =======================================================================

  INSERT INTO departments (id, company_id, department_code, name, description, division_id, section_id, status, created_at, updated_at, is_active)
  VALUES
    -- Spoke Division > Spoke section
    ('d3000000-0000-0000-0000-000000000001', v_company_id, 'SPD-DEPT001', 'Straightener',
     'Wire straightening operations', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'ACTIVE', NOW(), NOW(), true),
    ('d3000000-0000-0000-0000-000000000002', v_company_id, 'SPD-DEPT002', 'Swagging',
     'Swagging operations', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'ACTIVE', NOW(), NOW(), true),
    ('d3000000-0000-0000-0000-000000000003', v_company_id, 'SPD-DEPT003', 'Spoke',
     'Spoke assembly operations', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'ACTIVE', NOW(), NOW(), true),
    -- Spoke Division > Nipple section
    ('d3000000-0000-0000-0000-000000000004', v_company_id, 'SPD-DEPT004', 'Header',
     'Header operations', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002', 'ACTIVE', NOW(), NOW(), true),
    ('d3000000-0000-0000-0000-000000000005', v_company_id, 'SPD-DEPT005', 'Nipple',
     'Nipple assembly operations', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002', 'ACTIVE', NOW(), NOW(), true),
    -- Spoke Division > Auto Plating section
    ('d3000000-0000-0000-0000-000000000006', v_company_id, 'SPD-DEPT006', 'Spoke Plating',
     'Spoke plating operations', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000003', 'ACTIVE', NOW(), NOW(), true),
    ('d3000000-0000-0000-0000-000000000007', v_company_id, 'SPD-DEPT007', 'Nipple Plating',
     'Nipple plating operations', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000003', 'ACTIVE', NOW(), NOW(), true),
    -- Spoke Division > SPD Packing section
    ('d3000000-0000-0000-0000-000000000008', v_company_id, 'SPD-DEPT008', 'Spoke Packing',
     'Spoke packing operations', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000004', 'ACTIVE', NOW(), NOW(), true),
    -- Spoke Division > Maintenance section
    ('d3000000-0000-0000-0000-000000000009', v_company_id, 'SPD-DEPT009', 'Facility Maintenance',
     'Facility maintenance operations', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000005', 'ACTIVE', NOW(), NOW(), true),
    -- Control Cable Division > Spiral section
    ('d3000000-0000-0000-0000-000000000010', v_company_id, 'CCD-DEPT001', 'Flattening',
     'Wire flattening operations', 'd1000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000006', 'ACTIVE', NOW(), NOW(), true),
    ('d3000000-0000-0000-0000-000000000011', v_company_id, 'CCD-DEPT002', 'Spiral',
     'Spiral winding operations', 'd1000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000006', 'ACTIVE', NOW(), NOW(), true),
    -- Control Cable Division > PVC section
    ('d3000000-0000-0000-0000-000000000012', v_company_id, 'CCD-DEPT003', 'PVC',
     'PVC extrusion operations', 'd1000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000007', 'ACTIVE', NOW(), NOW(), true),
    -- Control Cable Division > CCD Packing section
    ('d3000000-0000-0000-0000-000000000013', v_company_id, 'CCD-DEPT004', 'CCD Packing',
     'Control Cable packing operations', 'd1000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000008', 'ACTIVE', NOW(), NOW(), true)
  ON CONFLICT (department_code, company_id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    section_id = EXCLUDED.section_id,
    division_id = EXCLUDED.division_id,
    updated_at = NOW();

END $$;

-- =======================================================================
-- SECTION 4: PRODUCTION ROUTING TABLE
-- =======================================================================

CREATE TABLE IF NOT EXISTS production_routings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  routing_code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  product_id UUID NOT NULL REFERENCES items(id),
  bom_id UUID REFERENCES bill_of_materials(id),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  base_quantity DECIMAL(19,4) NOT NULL DEFAULT 1,
  estimated_total_time DECIMAL(19,4) NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_routing_code_company
  ON production_routings (routing_code, company_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_routing_product
  ON production_routings (product_id);

CREATE INDEX IF NOT EXISTS idx_routing_bom
  ON production_routings (bom_id);

CREATE INDEX IF NOT EXISTS idx_routing_status
  ON production_routings (status);

CREATE INDEX IF NOT EXISTS idx_routing_company
  ON production_routings (company_id);

-- =======================================================================
-- SECTION 5: ROUTING OPERATIONS TABLE
-- =======================================================================

CREATE TABLE IF NOT EXISTS routing_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  routing_id UUID NOT NULL REFERENCES production_routings(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL DEFAULT 10,
  operation_code VARCHAR(50) NOT NULL,
  operation_name VARCHAR(255) NOT NULL,
  description TEXT,
  division_id UUID REFERENCES divisions(id),
  section_id UUID REFERENCES sections(id),
  department_id UUID REFERENCES departments(id),
  setup_time_minutes DECIMAL(19,4) NOT NULL DEFAULT 0,
  run_time_minutes DECIMAL(19,4) NOT NULL DEFAULT 0,
  queue_time_minutes DECIMAL(19,4) NOT NULL DEFAULT 0,
  wait_time_minutes DECIMAL(19,4) NOT NULL DEFAULT 0,
  labor_required BOOLEAN NOT NULL DEFAULT true,
  machine_required BOOLEAN NOT NULL DEFAULT false,
  input_item_id UUID REFERENCES items(id),
  output_item_id UUID REFERENCES items(id),
  input_quantity DECIMAL(19,4) NOT NULL DEFAULT 0,
  output_quantity DECIMAL(19,4) NOT NULL DEFAULT 0,
  uom_id UUID REFERENCES uoms(id),
  scrap_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  setup_scrap_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_op_routing_code
  ON routing_operations (routing_id, operation_code)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_op_routing
  ON routing_operations (routing_id);

CREATE INDEX IF NOT EXISTS idx_op_department
  ON routing_operations (department_id);

CREATE INDEX IF NOT EXISTS idx_op_company
  ON routing_operations (company_id);

-- =======================================================================
-- SECTION 6: PERMISSIONS
-- =======================================================================

INSERT INTO permissions (id, permission_code, name, module, resource, action, description, created_at, updated_at, is_active)
VALUES
  (gen_random_uuid(), 'manufacturing.routing.view', 'View Production Routings', 'manufacturing', 'routing', 'VIEW', 'View production routings', NOW(), NOW(), true),
  (gen_random_uuid(), 'manufacturing.routing.create', 'Create Production Routings', 'manufacturing', 'routing', 'CREATE', 'Create production routings', NOW(), NOW(), true),
  (gen_random_uuid(), 'manufacturing.routing.update', 'Update Production Routings', 'manufacturing', 'routing', 'UPDATE', 'Update production routings', NOW(), NOW(), true),
  (gen_random_uuid(), 'manufacturing.routing.delete', 'Delete Production Routings', 'manufacturing', 'routing', 'DELETE', 'Delete production routings', NOW(), NOW(), true),
  (gen_random_uuid(), 'manufacturing.routing.change_status', 'Change Routing Status', 'manufacturing', 'routing', 'CHANGE_STATUS', 'Change routing status', NOW(), NOW(), true),
  (gen_random_uuid(), 'manufacturing.routing_operation.view', 'View Routing Operations', 'manufacturing', 'routing_operation', 'VIEW', 'View routing operations', NOW(), NOW(), true),
  (gen_random_uuid(), 'manufacturing.routing_operation.create', 'Create Routing Operations', 'manufacturing', 'routing_operation', 'CREATE', 'Create routing operations', NOW(), NOW(), true),
  (gen_random_uuid(), 'manufacturing.routing_operation.update', 'Update Routing Operations', 'manufacturing', 'routing_operation', 'UPDATE', 'Update routing operations', NOW(), NOW(), true),
  (gen_random_uuid(), 'manufacturing.routing_operation.delete', 'Delete Routing Operations', 'manufacturing', 'routing_operation', 'DELETE', 'Delete routing operations', NOW(), NOW(), true)
ON CONFLICT (permission_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Grant all manufacturing permissions to Super Administrator role
DO $$
DECLARE
  v_role_id UUID := 'c37e82cb-5242-4987-a92a-3edb208da6f4';
BEGIN
  INSERT INTO role_permissions (id, role_id, permission_id, created_at, updated_at, is_active)
  SELECT gen_random_uuid(), v_role_id, p.id, NOW(), NOW(), true
  FROM permissions p
  WHERE p.module = 'manufacturing'
    AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
      WHERE rp.role_id = v_role_id
        AND rp.permission_id = p.id
        AND rp.is_active = true
    );
END $$;

-- =======================================================================
-- SECTION 7: DEMO ROUTINGS
-- =======================================================================

DO $$
DECLARE
  v_company_id UUID := '7725aa04-a270-4314-9e82-90949cbe7791';
  v_product_id UUID;
  v_bom_id     UUID;
  v_routing_id UUID;
  v_uom_id     UUID;
  v_wh_id      UUID;
  v_div_spd    UUID;
  v_div_ccd    UUID;
  v_sec_spoke  UUID;
  v_sec_nipple UUID;
  v_sec_plate  UUID;
  v_sec_pack   UUID;
  v_sec_spiral UUID;
  v_sec_pvc    UUID;
  v_dept_straightener UUID;
  v_dept_swagging     UUID;
  v_dept_spoke        UUID;
  v_dept_header       UUID;
  v_dept_nipple       UUID;
  v_dept_spoke_plate  UUID;
  v_dept_nipple_plate UUID;
  v_dept_spoke_pack   UUID;
  v_dept_flattening   UUID;
  v_dept_spiral       UUID;
  v_dept_pvc          UUID;
  v_dept_ccd_pack     UUID;
BEGIN
  -- Resolve IDs from the DB
  SELECT id INTO v_product_id FROM items WHERE item_code = 'SLD-0001' AND is_active = true LIMIT 1;
  SELECT id INTO v_bom_id FROM bill_of_materials WHERE bom_code = 'BOM-002' AND is_active = true LIMIT 1;
  SELECT id INTO v_uom_id FROM uoms WHERE code = 'Pcs' AND is_active = true LIMIT 1;
  IF v_uom_id IS NULL THEN
    SELECT id INTO v_uom_id FROM uoms WHERE is_active = true LIMIT 1;
  END IF;
  SELECT id INTO v_wh_id FROM warehouses WHERE warehouse_code = 'WH-MAIN-001' AND is_active = true LIMIT 1;
  SELECT id INTO v_div_spd FROM divisions WHERE division_code = 'SPD' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_div_ccd FROM divisions WHERE division_code = 'CCD' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_sec_spoke  FROM sections WHERE section_code = 'SEC-010' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_sec_nipple FROM sections WHERE section_code = 'SEC-011' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_sec_plate  FROM sections WHERE section_code = 'SEC-012' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_sec_pack   FROM sections WHERE section_code = 'SEC-013' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_sec_spiral FROM sections WHERE section_code = 'SEC-015' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_sec_pvc    FROM sections WHERE section_code = 'SEC-016' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_dept_straightener FROM departments WHERE department_code = 'SPD-DEPT001' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_dept_swagging     FROM departments WHERE department_code = 'SPD-DEPT002' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_dept_spoke        FROM departments WHERE department_code = 'SPD-DEPT003' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_dept_header       FROM departments WHERE department_code = 'SPD-DEPT004' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_dept_nipple       FROM departments WHERE department_code = 'SPD-DEPT005' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_dept_spoke_plate  FROM departments WHERE department_code = 'SPD-DEPT006' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_dept_nipple_plate FROM departments WHERE department_code = 'SPD-DEPT007' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_dept_spoke_pack   FROM departments WHERE department_code = 'SPD-DEPT008' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_dept_flattening   FROM departments WHERE department_code = 'CCD-DEPT001' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_dept_spiral       FROM departments WHERE department_code = 'CCD-DEPT002' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_dept_pvc          FROM departments WHERE department_code = 'CCD-DEPT003' AND company_id = v_company_id AND is_active = true LIMIT 1;
  SELECT id INTO v_dept_ccd_pack     FROM departments WHERE department_code = 'CCD-DEPT004' AND company_id = v_company_id AND is_active = true LIMIT 1;

  -- Skip demo routing if product/BOM not found
  IF v_product_id IS NULL OR v_bom_id IS NULL THEN
    RAISE NOTICE 'Skipping demo routing: product or BOM not found';
    RETURN;
  END IF;

  -- Demo Routing 1: Industrial Widget Assembly (Spoke Division)
  INSERT INTO production_routings (id, company_id, routing_code, name, description, product_id, bom_id, status, base_quantity, estimated_total_time, is_default, effective_from, created_at, updated_at, is_active)
  VALUES (
    'e1000000-0000-0000-0000-000000000001', v_company_id, 'RTG-001',
    'Industrial Widget - Spoke Assembly',
    'Standard routing for Industrial Widget through Spoke Division', v_product_id, v_bom_id,
    'ACTIVE', 1, 120, true, NOW(), NOW(), NOW(), true
  ) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();

  v_routing_id := 'e1000000-0000-0000-0000-000000000001';

  INSERT INTO routing_operations (id, company_id, routing_id, sequence_no, operation_code, operation_name, division_id, section_id, department_id, setup_time_minutes, run_time_minutes, queue_time_minutes, wait_time_minutes, labor_required, machine_required, status, created_at, updated_at, is_active)
  VALUES
    ('f1000000-0000-0000-0000-000000000001', v_company_id, v_routing_id, 10, 'OP-001', 'Wire Straightening',
     v_div_spd, v_sec_spoke, v_dept_straightener, 15, 5, 5, 0, true, true, 'ACTIVE', NOW(), NOW(), true),
    ('f1000000-0000-0000-0000-000000000002', v_company_id, v_routing_id, 20, 'OP-002', 'Swagging',
     v_div_spd, v_sec_spoke, v_dept_swagging, 10, 10, 5, 0, true, true, 'ACTIVE', NOW(), NOW(), true),
    ('f1000000-0000-0000-0000-000000000003', v_company_id, v_routing_id, 30, 'OP-003', 'Spoke Assembly',
     v_div_spd, v_sec_spoke, v_dept_spoke, 10, 15, 5, 0, true, false, 'ACTIVE', NOW(), NOW(), true),
    ('f1000000-0000-0000-0000-000000000004', v_company_id, v_routing_id, 40, 'OP-004', 'Spoke Plating',
     v_div_spd, v_sec_plate, v_dept_spoke_plate, 20, 25, 10, 5, true, true, 'ACTIVE', NOW(), NOW(), true),
    ('f1000000-0000-0000-0000-000000000005', v_company_id, v_routing_id, 50, 'OP-005', 'Final Inspection & Packing',
     v_div_spd, v_sec_pack, v_dept_spoke_pack, 5, 10, 0, 0, true, false, 'ACTIVE', NOW(), NOW(), true)
  ON CONFLICT (id) DO UPDATE SET operation_name = EXCLUDED.operation_name, updated_at = NOW();

  -- Demo Routing 2: Nipple Assembly (Spoke Division)
  IF v_product_id IS NOT NULL THEN
    INSERT INTO production_routings (id, company_id, routing_code, name, description, product_id, bom_id, status, base_quantity, estimated_total_time, is_default, effective_from, created_at, updated_at, is_active)
    VALUES (
      'e1000000-0000-0000-0000-000000000002', v_company_id, 'RTG-002',
      'Nipple Assembly Routing',
      'Nipple manufacturing through Header and Nipple departments', v_product_id, v_bom_id,
      'DRAFT', 1, 75, false, NOW(), NOW(), NOW(), true
    ) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();

    v_routing_id := 'e1000000-0000-0000-0000-000000000002';

    INSERT INTO routing_operations (id, company_id, routing_id, sequence_no, operation_code, operation_name, division_id, section_id, department_id, setup_time_minutes, run_time_minutes, queue_time_minutes, wait_time_minutes, labor_required, machine_required, status, created_at, updated_at, is_active)
    VALUES
      ('f2000000-0000-0000-0000-000000000001', v_company_id, v_routing_id, 10, 'OP-001', 'Heading',
       v_div_spd, v_sec_nipple, v_dept_header, 10, 15, 5, 0, true, true, 'ACTIVE', NOW(), NOW(), true),
      ('f2000000-0000-0000-0000-000000000002', v_company_id, v_routing_id, 20, 'OP-002', 'Nipple Forming',
       v_div_spd, v_sec_nipple, v_dept_nipple, 5, 15, 5, 0, true, true, 'ACTIVE', NOW(), NOW(), true),
      ('f2000000-0000-0000-0000-000000000003', v_company_id, v_routing_id, 30, 'OP-003', 'Nipple Plating',
       v_div_spd, v_sec_plate, v_dept_nipple_plate, 10, 20, 5, 0, true, true, 'ACTIVE', NOW(), NOW(), true)
    ON CONFLICT (id) DO UPDATE SET operation_name = EXCLUDED.operation_name, updated_at = NOW();
  END IF;

  -- Demo Routing 3: Control Cable Assembly (CCD Division)
  IF v_product_id IS NOT NULL THEN
    INSERT INTO production_routings (id, company_id, routing_code, name, description, product_id, bom_id, status, base_quantity, estimated_total_time, is_default, effective_from, created_at, updated_at, is_active)
    VALUES (
      'e1000000-0000-0000-0000-000000000003', v_company_id, 'RTG-003',
      'Control Cable Assembly',
      'Control Cable manufacturing through Flattening, Spiral, PVC', v_product_id, v_bom_id,
      'ACTIVE', 1, 180, false, NOW(), NOW(), NOW(), true
    ) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();

    v_routing_id := 'e1000000-0000-0000-0000-000000000003';

    INSERT INTO routing_operations (id, company_id, routing_id, sequence_no, operation_code, operation_name, division_id, section_id, department_id, setup_time_minutes, run_time_minutes, queue_time_minutes, wait_time_minutes, labor_required, machine_required, status, created_at, updated_at, is_active)
    VALUES
      ('f3000000-0000-0000-0000-000000000001', v_company_id, v_routing_id, 10, 'OP-001', 'Wire Flattening',
       v_div_ccd, v_sec_spiral, v_dept_flattening, 15, 20, 10, 0, true, true, 'ACTIVE', NOW(), NOW(), true),
      ('f3000000-0000-0000-0000-000000000002', v_company_id, v_routing_id, 20, 'OP-002', 'Spiral Winding',
       v_div_ccd, v_sec_spiral, v_dept_spiral, 10, 30, 10, 5, true, true, 'ACTIVE', NOW(), NOW(), true),
      ('f3000000-0000-0000-0000-000000000003', v_company_id, v_routing_id, 30, 'OP-003', 'PVC Extrusion',
       v_div_ccd, v_sec_pvc, v_dept_pvc, 20, 35, 15, 10, true, true, 'ACTIVE', NOW(), NOW(), true),
      ('f3000000-0000-0000-0000-000000000004', v_company_id, v_routing_id, 40, 'OP-004', 'Cable Packing',
       v_div_ccd, NULL, v_dept_ccd_pack, 5, 15, 0, 0, true, false, 'ACTIVE', NOW(), NOW(), true)
    ON CONFLICT (id) DO UPDATE SET operation_name = EXCLUDED.operation_name, updated_at = NOW();
  END IF;

END $$;
