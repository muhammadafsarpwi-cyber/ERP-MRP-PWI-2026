-- ERP Raw Material Receiving / Return (Multi-Item Header + Lines)
-- Migration: 20260904000000_erp_00043_raw_material_receiving.sql
-- Introduces a normalized, multi-item receiving / return workflow so a single
-- Gate Pass can carry several raw material lines with independent
-- Gate Pass Weight vs Received Weight tracking:
--   * raw_material_receipts (header)  + raw_material_receipt_lines
--   * raw_material_returns  (header)  + raw_material_return_lines
-- Inventory is ALWAYS driven by received_quantity only (never gate_pass_quantity);
-- the difference (gate_pass - received) is persisted for control/reporting.
-- Distribution/return codes are derived from DB sequences (RMR-*/RMTN-*).
-- Multi-company isolation + RLS. Idempotent. Does NOT touch existing tables.

-- =====================================================
-- 1. SEQUENCES (receipt_code / return_code generators)
-- =====================================================
CREATE SEQUENCE IF NOT EXISTS raw_material_receipt_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS raw_material_return_seq START WITH 1;

-- =====================================================
-- 2. RAW MATERIAL RECEIPTS (header)
-- =====================================================
CREATE TABLE IF NOT EXISTS raw_material_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    receipt_code VARCHAR(50) NOT NULL,
    gate_pass_no VARCHAR(50),
    source_no VARCHAR(50),
    receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
    division_id UUID REFERENCES divisions(id),
    section_id UUID REFERENCES sections(id),
    department_id UUID REFERENCES departments(id),
    warehouse_id UUID REFERENCES warehouses(id),
    production_order_id UUID REFERENCES production_orders(id),
    reference VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED'
        CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED')),
    remarks TEXT,
    UNIQUE(company_id, receipt_code)
);
CREATE INDEX IF NOT EXISTS idx_rmr_company_date ON raw_material_receipts(company_id, receipt_date);
CREATE INDEX IF NOT EXISTS idx_rmr_warehouse ON raw_material_receipts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_rmr_gate_pass ON raw_material_receipts(gate_pass_no);
CREATE INDEX IF NOT EXISTS idx_rmr_status ON raw_material_receipts(status);

-- =====================================================
-- 3. RAW MATERIAL RECEIPT LINES
-- =====================================================
CREATE TABLE IF NOT EXISTS raw_material_receipt_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    receipt_id UUID NOT NULL REFERENCES raw_material_receipts(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL DEFAULT 1,
    item_id UUID REFERENCES items(id),
    uom_id UUID REFERENCES uoms(id),
    gate_pass_quantity DECIMAL(15,4) NOT NULL DEFAULT 0 CHECK (gate_pass_quantity >= 0),
    received_quantity DECIMAL(15,4) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
    difference DECIMAL(15,4) NOT NULL DEFAULT 0,
    remarks TEXT,
    UNIQUE(receipt_id, line_number)
);
CREATE INDEX IF NOT EXISTS idx_rmrl_receipt ON raw_material_receipt_lines(receipt_id);
CREATE INDEX IF NOT EXISTS idx_rmrl_item ON raw_material_receipt_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_rmrl_company ON raw_material_receipt_lines(company_id);

-- =====================================================
-- 4. RAW MATERIAL RETURNS (header)
-- =====================================================
CREATE TABLE IF NOT EXISTS raw_material_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    return_code VARCHAR(50) NOT NULL,
    source_no VARCHAR(50),
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    division_id UUID REFERENCES divisions(id),
    section_id UUID REFERENCES sections(id),
    department_id UUID REFERENCES departments(id),
    warehouse_id UUID REFERENCES warehouses(id),
    reference_receipt_id UUID REFERENCES raw_material_receipts(id),
    production_order_id UUID REFERENCES production_orders(id),
    reference VARCHAR(100),
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED'
        CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED')),
    remarks TEXT,
    UNIQUE(company_id, return_code)
);
CREATE INDEX IF NOT EXISTS idx_rmtr_company_date ON raw_material_returns(company_id, return_date);
CREATE INDEX IF NOT EXISTS idx_rmtr_warehouse ON raw_material_returns(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_rmtr_receipt ON raw_material_returns(reference_receipt_id);
CREATE INDEX IF NOT EXISTS idx_rmtr_status ON raw_material_returns(status);

-- =====================================================
-- 5. RAW MATERIAL RETURN LINES
-- =====================================================
CREATE TABLE IF NOT EXISTS raw_material_return_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    return_id UUID NOT NULL REFERENCES raw_material_returns(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL DEFAULT 1,
    item_id UUID REFERENCES items(id),
    uom_id UUID REFERENCES uoms(id),
    quantity DECIMAL(15,4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    remarks TEXT,
    UNIQUE(return_id, line_number)
);
CREATE INDEX IF NOT EXISTS idx_rmtrl_return ON raw_material_return_lines(return_id);
CREATE INDEX IF NOT EXISTS idx_rmtrl_item ON raw_material_return_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_rmtrl_company ON raw_material_return_lines(company_id);

-- =====================================================
-- 6. updated_at TRIGGERS
-- =====================================================
DROP TRIGGER IF EXISTS trg_raw_material_receipts_updated_at ON raw_material_receipts;
CREATE TRIGGER trg_raw_material_receipts_updated_at
    BEFORE UPDATE ON raw_material_receipts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_raw_material_receipt_lines_updated_at ON raw_material_receipt_lines;
CREATE TRIGGER trg_raw_material_receipt_lines_updated_at
    BEFORE UPDATE ON raw_material_receipt_lines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_raw_material_returns_updated_at ON raw_material_returns;
CREATE TRIGGER trg_raw_material_returns_updated_at
    BEFORE UPDATE ON raw_material_returns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_raw_material_return_lines_updated_at ON raw_material_return_lines;
CREATE TRIGGER trg_raw_material_return_lines_updated_at
    BEFORE UPDATE ON raw_material_return_lines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. RLS
-- =====================================================
ALTER TABLE raw_material_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_material_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_material_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_material_return_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rmr_select ON raw_material_receipts;
CREATE POLICY rmr_select ON raw_material_receipts FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS rmr_insert ON raw_material_receipts;
CREATE POLICY rmr_insert ON raw_material_receipts FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS rmr_update ON raw_material_receipts;
CREATE POLICY rmr_update ON raw_material_receipts FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS rmr_delete ON raw_material_receipts;
CREATE POLICY rmr_delete ON raw_material_receipts FOR DELETE USING (erp_core.company_in_scope(company_id));

DROP POLICY IF EXISTS rmrl_select ON raw_material_receipt_lines;
CREATE POLICY rmrl_select ON raw_material_receipt_lines FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS rmrl_insert ON raw_material_receipt_lines;
CREATE POLICY rmrl_insert ON raw_material_receipt_lines FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS rmrl_update ON raw_material_receipt_lines;
CREATE POLICY rmrl_update ON raw_material_receipt_lines FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS rmrl_delete ON raw_material_receipt_lines;
CREATE POLICY rmrl_delete ON raw_material_receipt_lines FOR DELETE USING (erp_core.company_in_scope(company_id));

DROP POLICY IF EXISTS rmtr_select ON raw_material_returns;
CREATE POLICY rmtr_select ON raw_material_returns FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS rmtr_insert ON raw_material_returns;
CREATE POLICY rmtr_insert ON raw_material_returns FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS rmtr_update ON raw_material_returns;
CREATE POLICY rmtr_update ON raw_material_returns FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS rmtr_delete ON raw_material_returns;
CREATE POLICY rmtr_delete ON raw_material_returns FOR DELETE USING (erp_core.company_in_scope(company_id));

DROP POLICY IF EXISTS rmtrl_select ON raw_material_return_lines;
CREATE POLICY rmtrl_select ON raw_material_return_lines FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS rmtrl_insert ON raw_material_return_lines;
CREATE POLICY rmtrl_insert ON raw_material_return_lines FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS rmtrl_update ON raw_material_return_lines;
CREATE POLICY rmtrl_update ON raw_material_return_lines FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS rmtrl_delete ON raw_material_return_lines;
CREATE POLICY rmtrl_delete ON raw_material_return_lines FOR DELETE USING (erp_core.company_in_scope(company_id));

-- =====================================================
-- 8. PERMISSIONS + ROLE GRANTS
-- =====================================================
INSERT INTO permissions (permission_code, name, description, module, resource, action, is_active, created_at, updated_at)
VALUES
    ('manufacturing.material_receiving.view',   'View Raw Material Receiving',   'View raw material gate-pass receipts',  'manufacturing', 'material-receiving', 'view',   true, now(), now()),
    ('manufacturing.material_receiving.create', 'Create Raw Material Receiving', 'Create multi-item raw material receipts', 'manufacturing', 'material-receiving', 'create', true, now(), now()),
    ('manufacturing.material_receiving.update', 'Update Raw Material Receiving', 'Update draft raw material receipts',    'manufacturing', 'material-receiving', 'update', true, now(), now()),
    ('manufacturing.material_receiving.delete', 'Delete Raw Material Receiving', 'Delete / reverse raw material receipts', 'manufacturing', 'material-receiving', 'delete', true, now(), now()),
    ('manufacturing.material_receiving.report', 'Raw Material Receiving Report', 'View the raw material receiving report', 'manufacturing', 'material-receiving', 'report', true, now(), now()),
    ('manufacturing.material_return.view',      'View Raw Material Return',      'View raw material returns',             'manufacturing', 'material-return',    'view',   true, now(), now()),
    ('manufacturing.material_return.create',    'Create Raw Material Return',    'Create multi-item raw material returns', 'manufacturing', 'material-return',    'create', true, now(), now()),
    ('manufacturing.material_return.update',    'Update Raw Material Return',    'Update draft raw material returns',     'manufacturing', 'material-return',    'update', true, now(), now()),
    ('manufacturing.material_return.delete',    'Delete Raw Material Return',    'Delete / reverse raw material returns', 'manufacturing', 'material-return',    'delete', true, now(), now())
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status, is_active, created_at, updated_at)
SELECT r.id, p.id, 'ACTIVE', true, now(), now()
FROM roles r
JOIN permissions p ON p.permission_code IN (
    'manufacturing.material_receiving.view',
    'manufacturing.material_receiving.create',
    'manufacturing.material_receiving.update',
    'manufacturing.material_receiving.delete',
    'manufacturing.material_receiving.report',
    'manufacturing.material_return.view',
    'manufacturing.material_return.create',
    'manufacturing.material_return.update',
    'manufacturing.material_return.delete'
)
WHERE r.role_code IN ('SUPER_ADMIN', 'ADMIN')
    AND NOT EXISTS (
        SELECT 1 FROM role_permissions rp
        WHERE rp.role_id = r.id AND rp.permission_id = p.id
    );