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
VALUES (
  'b1000000-0000-0000-0000-000000000001',
  '7725aa04-a270-4314-9e82-90949cbe7791',
  'BOM-001',
  'Precision Bearing 6205 Assembly',
  'Main production BOM for Precision Bearing 6205. Includes steel, aluminum, and hydraulic oil.',
  'ACTIVE',
  1,
  'a395c230-5f53-4dd1-9170-0a35d0a569e4',
  '2026-01-01T00:00:00Z',
  1880.0000
)
ON CONFLICT (bom_code, company_id) DO NOTHING;

-- BOM-002: Industrial Widget (ACTIVE)
INSERT INTO bill_of_materials (id, company_id, bom_code, name, description, status, base_quantity, product_id, effective_from, estimated_cost)
VALUES (
  'b1000000-0000-0000-0000-000000000002',
  '7725aa04-a270-4314-9e82-90949cbe7791',
  'BOM-002',
  'Industrial Widget Assembly',
  'Standard production BOM for Industrial Widget. Steel body, ABS plastic housing, copper wiring.',
  'ACTIVE',
  1,
  '079c0ac6-1f62-49f4-8f58-1bdec1c828fe',
  '2026-01-01T00:00:00Z',
  2440.0000
)
ON CONFLICT (bom_code, company_id) DO NOTHING;

-- BOM-003: Premium Component Kit (DRAFT)
INSERT INTO bill_of_materials (id, company_id, bom_code, name, description, status, base_quantity, product_id, estimated_cost)
VALUES (
  'b1000000-0000-0000-0000-000000000003',
  '7725aa04-a270-4314-9e82-90949cbe7791',
  'BOM-003',
  'Premium Component Kit Assembly',
  'Draft BOM for Premium Component Kit. Includes bearings, fasteners, and packaging.',
  'DRAFT',
  1,
  '94212023-e076-4cda-b556-b1bdbb3f784b',
  1745.0000
)
ON CONFLICT (bom_code, company_id) DO NOTHING;

-- ============================================================
-- 8. DEMO BOM LINES
-- ============================================================

-- BOM-001 lines (Precision Bearing 6205)
INSERT INTO bom_lines (bom_id, line_number, item_id, quantity, uom_id, scrap_factor, yield_percentage, remarks)
VALUES
  ('b1000000-0000-0000-0000-000000000001', 1, '83700083-14cc-4745-be42-6e84c7b5ff1c', 2, '52a2a811-b692-497e-9467-10a06b66043b', 0.05, 95, 'Steel sheet for bearing housing'),
  ('b1000000-0000-0000-0000-000000000001', 2, '1c53e9a9-b020-4d3a-bcd4-67ab8b50ef6f', 1, '52a2a811-b692-497e-9467-10a06b66043b', 0.03, 97, 'Aluminum rod for bearing race'),
  ('b1000000-0000-0000-0000-000000000001', 3, 'c32d8fe3-32c6-402e-8012-d5884ed2700d', 0.5, '52a2a811-b692-497e-9467-10a06b66043b', 0.02, 98, 'Hydraulic oil for lubrication')
ON CONFLICT (bom_id, line_number) DO NOTHING;

-- BOM-002 lines (Industrial Widget)
INSERT INTO bom_lines (bom_id, line_number, item_id, quantity, uom_id, scrap_factor, yield_percentage, remarks)
VALUES
  ('b1000000-0000-0000-0000-000000000002', 1, '83700083-14cc-4745-be42-6e84c7b5ff1c', 3, '52a2a811-b692-497e-9467-10a06b66043b', 0.04, 96, 'Steel sheet for widget body'),
  ('b1000000-0000-0000-0000-000000000002', 2, 'ab5aa175-9b79-4aa8-b59e-69f90cb9e3bf', 2, '52a2a811-b692-497e-9467-10a06b66043b', 0.03, 97, 'ABS plastic for housing'),
  ('b1000000-0000-0000-0000-000000000002', 3, '42733eb7-9378-4b00-9c26-d2feb87da03c', 1, '52a2a811-b692-497e-9467-10a06b66043b', 0.01, 99, 'Copper wire for electrical')
ON CONFLICT (bom_id, line_number) DO NOTHING;

-- BOM-003 lines (Premium Component Kit)
INSERT INTO bom_lines (bom_id, line_number, item_id, quantity, uom_id, scrap_factor, yield_percentage, remarks)
VALUES
  ('b1000000-0000-0000-0000-000000000003', 1, 'a395c230-5f53-4dd1-9170-0a35d0a569e4', 2, 'a6d4c30b-f644-4be0-aa1b-19ba55495789', 0, 100, 'Bearings for kit assembly'),
  ('b1000000-0000-0000-0000-000000000003', 2, '74d8a402-2ae7-45b6-bd0b-8254d5b8a94f', 1, 'a6d4c30b-f644-4be0-aa1b-19ba55495789', 0, 100, 'Fastener pack for assembly'),
  ('b1000000-0000-0000-0000-000000000003', 3, '101e6ea5-552c-4029-843b-214d63487507', 1, 'a6d4c30b-f644-4be0-aa1b-19ba55495789', 0, 100, 'Packaging for finished kit')
ON CONFLICT (bom_id, line_number) DO NOTHING;

COMMIT;
