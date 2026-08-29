-- ERP-00009: Bill of Materials (M08) Migration
-- Idempotent: safe to re-run
-- Tables: bill_of_materials, bom_lines
-- Permissions: 10 manufacturing.bom permissions
-- Triggers: update_updated_at on both tables
-- Demo: 3 BOMs, 9 lines, 3 manufacturable items

BEGIN;

-- ============================================================
-- 1. TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS bill_of_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  bom_code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  base_quantity DECIMAL(19,4) NOT NULL DEFAULT 1,
  product_id UUID NOT NULL REFERENCES items(id),
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  estimated_cost DECIMAL(19,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_bom_code_company UNIQUE (bom_code, company_id)
);

CREATE TABLE IF NOT EXISTS bom_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id UUID NOT NULL REFERENCES bill_of_materials(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  item_id UUID NOT NULL REFERENCES items(id),
  quantity DECIMAL(19,4) NOT NULL DEFAULT 1,
  uom_id UUID NOT NULL REFERENCES uoms(id),
  scrap_factor DECIMAL(5,4) NOT NULL DEFAULT 0,
  yield_percentage DECIMAL(5,2) NOT NULL DEFAULT 100,
  alternate_group INTEGER,
  alternate_rank INTEGER,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_bom_line_number UNIQUE (bom_id, line_number)
);

-- ============================================================
-- 2. TRIGGERS (idempotent)
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bill_of_materials_updated_at') THEN
    CREATE TRIGGER trg_bill_of_materials_updated_at
      BEFORE UPDATE ON bill_of_materials
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bom_lines_updated_at') THEN
    CREATE TRIGGER trg_bom_lines_updated_at
      BEFORE UPDATE ON bom_lines
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================
-- 3. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_bom_company ON bill_of_materials(company_id);
CREATE INDEX IF NOT EXISTS idx_bom_product ON bill_of_materials(product_id);
CREATE INDEX IF NOT EXISTS idx_bom_status ON bill_of_materials(status);
CREATE INDEX IF NOT EXISTS idx_bom_code ON bill_of_materials(bom_code);
CREATE INDEX IF NOT EXISTS idx_bom_lines_bom ON bom_lines(bom_id);
CREATE INDEX IF NOT EXISTS idx_bom_lines_item ON bom_lines(item_id);

-- ============================================================
-- 4. PERMISSIONS (10 new, idempotent)
-- ============================================================

INSERT INTO permissions (permission_code, name, module, resource, action, description, status)
VALUES
  ('manufacturing.bom.view', 'View Bill of Materials', 'manufacturing', 'bom', 'VIEW', 'View BOM records and their component lines', 'ACTIVE'),
  ('manufacturing.bom.create', 'Create Bill of Materials', 'manufacturing', 'bom', 'CREATE', 'Create new BOM headers with component lines', 'ACTIVE'),
  ('manufacturing.bom.update', 'Update Bill of Materials', 'manufacturing', 'bom', 'UPDATE', 'Update BOM header and component lines', 'ACTIVE'),
  ('manufacturing.bom.delete', 'Delete Bill of Materials', 'manufacturing', 'bom', 'DELETE', 'Soft-delete BOM records', 'ACTIVE'),
  ('manufacturing.bom.change_status', 'Change BOM Status', 'manufacturing', 'bom', 'CHANGE_STATUS', 'Transition BOM status (DRAFT→ACTIVE→OBSOLETE)', 'ACTIVE'),
  ('manufacturing.bom_line.view', 'View BOM Lines', 'manufacturing', 'bom_line', 'VIEW', 'View individual BOM component lines', 'ACTIVE'),
  ('manufacturing.bom_line.create', 'Create BOM Lines', 'manufacturing', 'bom_line', 'CREATE', 'Add component lines to a BOM', 'ACTIVE'),
  ('manufacturing.bom_line.update', 'Update BOM Lines', 'manufacturing', 'bom_line', 'UPDATE', 'Update existing BOM component lines', 'ACTIVE'),
  ('manufacturing.bom_line.delete', 'Delete BOM Lines', 'manufacturing', 'bom_line', 'DELETE', 'Remove component lines from a BOM', 'ACTIVE'),
  ('manufacturing.bom.estimate_cost', 'Estimate BOM Cost', 'manufacturing', 'bom', 'ESTIMATE_COST', 'Recalculate BOM estimated cost from component costs', 'ACTIVE')
ON CONFLICT (permission_code) DO NOTHING;

-- ============================================================
-- 5. SUPER_ADMIN GRANTS (idempotent)
-- ============================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Super Administrator'
  AND p.permission_code LIKE 'manufacturing.bom%'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ============================================================
-- 6. MARK MANUFACTURABLE ITEMS
-- ============================================================

UPDATE items SET is_manufacturable = TRUE
WHERE item_code IN ('FIN-001', 'SLD-0001', 'SLD-0002')
  AND is_manufacturable = FALSE;

-- ============================================================
-- 7. DEMO BOMS
-- ============================================================

-- BOM-001: Precision Bearing 6205 (ACTIVE)
INSERT INTO bill_of_materials (id, company_id, bom_code, name, description, status, base_quantity, product_id, effective_from, estimated_cost)
SELECT
  'b1000000-0000-0000-0000-000000000001',
  c.id,
  'BOM-001',
  'Precision Bearing 6205 Assembly',
  'Main production BOM for Precision Bearing 6205. Includes steel, aluminum, and hydraulic oil.',
  'ACTIVE',
  1,
  (SELECT id FROM items WHERE item_code = 'FIN-001'),
  '2026-01-01T00:00:00Z',
  1880.0000
FROM companies c WHERE c.company_code = 'COMP-001'
ON CONFLICT (bom_code, company_id) DO NOTHING;

-- BOM-002: Industrial Widget (ACTIVE)
INSERT INTO bill_of_materials (id, company_id, bom_code, name, description, status, base_quantity, product_id, effective_from, estimated_cost)
SELECT
  'b1000000-0000-0000-0000-000000000002',
  c.id,
  'BOM-002',
  'Industrial Widget Assembly',
  'Standard production BOM for Industrial Widget. Steel body, ABS plastic housing, copper wiring.',
  'ACTIVE',
  1,
  (SELECT id FROM items WHERE item_code = 'SLD-0001'),
  '2026-01-01T00:00:00Z',
  2440.0000
FROM companies c WHERE c.company_code = 'COMP-001'
ON CONFLICT (bom_code, company_id) DO NOTHING;

-- BOM-003: Premium Component Kit (DRAFT)
INSERT INTO bill_of_materials (id, company_id, bom_code, name, description, status, base_quantity, product_id, estimated_cost)
SELECT
  'b1000000-0000-0000-0000-000000000003',
  c.id,
  'BOM-003',
  'Premium Component Kit Assembly',
  'Draft BOM for Premium Component Kit. Includes bearings, fasteners, and packaging.',
  'DRAFT',
  1,
  (SELECT id FROM items WHERE item_code = 'SLD-0002'),
  1745.0000
FROM companies c WHERE c.company_code = 'COMP-001'
ON CONFLICT (bom_code, company_id) DO NOTHING;

-- ============================================================
-- 8. DEMO BOM LINES
-- ============================================================

-- BOM-001 lines (Precision Bearing 6205)
INSERT INTO bom_lines (bom_id, line_number, item_id, quantity, uom_id, scrap_factor, yield_percentage, remarks)
SELECT 'b1000000-0000-0000-0000-000000000001', v.line_number, i.id, v.quantity, u.id, v.scrap_factor, v.yield_percentage, v.remarks
FROM (VALUES
  (1, 'RAW-001', 2, 'KG', 0.05, 95, 'Steel sheet for bearing housing'),
  (2, 'RAW-002', 1, 'KG', 0.03, 97, 'Aluminum rod for bearing race'),
  (3, 'CONS-001', 0.5, 'KG', 0.02, 98, 'Hydraulic oil for lubrication')
) AS v(line_number, item_code, quantity, uom_code, scrap_factor, yield_percentage, remarks)
JOIN items i ON i.item_code = v.item_code
JOIN uoms u ON u.code = v.uom_code
ON CONFLICT (bom_id, line_number) DO NOTHING;

-- BOM-002 lines (Industrial Widget)
INSERT INTO bom_lines (bom_id, line_number, item_id, quantity, uom_id, scrap_factor, yield_percentage, remarks)
SELECT 'b1000000-0000-0000-0000-000000000002', v.line_number, i.id, v.quantity, u.id, v.scrap_factor, v.yield_percentage, v.remarks
FROM (VALUES
  (1, 'RAW-001', 3, 'KG', 0.04, 96, 'Steel sheet for widget body'),
  (2, 'RAW-003', 2, 'KG', 0.03, 97, 'ABS plastic for housing'),
  (3, 'RAW-004', 1, 'KG', 0.01, 99, 'Copper wire for electrical')
) AS v(line_number, item_code, quantity, uom_code, scrap_factor, yield_percentage, remarks)
JOIN items i ON i.item_code = v.item_code
JOIN uoms u ON u.code = v.uom_code
ON CONFLICT (bom_id, line_number) DO NOTHING;

-- BOM-003 lines (Premium Component Kit)
INSERT INTO bom_lines (bom_id, line_number, item_id, quantity, uom_id, scrap_factor, yield_percentage, remarks)
SELECT 'b1000000-0000-0000-0000-000000000003', v.line_number, i.id, v.quantity, u.id, v.scrap_factor, v.yield_percentage, v.remarks
FROM (VALUES
  (1, 'FIN-001', 2, 'EA', 0, 100, 'Bearings for kit assembly'),
  (2, 'SLD-0003', 1, 'EA', 0, 100, 'Fastener pack for assembly'),
  (3, 'PKG-001', 1, 'EA', 0, 100, 'Packaging for finished kit')
) AS v(line_number, item_code, quantity, uom_code, scrap_factor, yield_percentage, remarks)
JOIN items i ON i.item_code = v.item_code
JOIN uoms u ON u.code = v.uom_code
ON CONFLICT (bom_id, line_number) DO NOTHING;

COMMIT;
