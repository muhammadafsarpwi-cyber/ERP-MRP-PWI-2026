-- Migration: Store Procurement Workflow (TASK 03)
-- Extends material request / issue / return to support full procurement workflow:
-- MR -> PR -> Manager Approval -> GM Approval -> Supplier -> ETA -> GRN -> Stock
-- Reuses existing purchase_requisitions, purchase_orders, goods_receipts, inventory engine.

-- =====================================================
-- 1. EXTEND MATERIAL REQUESTS - procurement tracking
-- =====================================================
ALTER TABLE material_requests
    ADD COLUMN IF NOT EXISTS reason TEXT,
    ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'NORMAL',
    ADD COLUMN IF NOT EXISTS gm_approved_by UUID,
    ADD COLUMN IF NOT EXISTS gm_approved_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS procurement_acknowledged_by UUID,
    ADD COLUMN IF NOT EXISTS procurement_acknowledged_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS pr_id UUID,
    ADD COLUMN IF NOT EXISTS pr_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS converted_by UUID,
    ADD COLUMN IF NOT EXISTS po_id UUID,
    ADD COLUMN IF NOT EXISTS po_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id),
    ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
    ADD COLUMN IF NOT EXISTS actual_delivery_date DATE,
    ADD COLUMN IF NOT EXISTS supplier_confirmed_date DATE,
    ADD COLUMN IF NOT EXISTS eta_pending BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_material_requests_pr ON material_requests(pr_id);
CREATE INDEX IF NOT EXISTS idx_material_requests_po ON material_requests(po_id);
CREATE INDEX IF NOT EXISTS idx_material_requests_supplier ON material_requests(supplier_id);

-- =====================================================
-- 2. EXTEND MATERIAL REQUEST LINES - qty status & PR conversion
-- =====================================================
ALTER TABLE material_request_lines
    ADD COLUMN IF NOT EXISTS required_date DATE,
    ADD COLUMN IF NOT EXISTS available_stock DECIMAL(15,4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS minimum_stock DECIMAL(15,4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS maximum_stock DECIMAL(15,4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS current_shortage DECIMAL(15,4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pr_created_qty DECIMAL(15,4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pr_remaining_qty DECIMAL(15,4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pr_status VARCHAR(30) DEFAULT 'NONE';

-- =====================================================
-- 3. MATERIAL RETURNS - add cancel support
-- =====================================================
ALTER TABLE material_returns
    ADD COLUMN IF NOT EXISTS cancelled_by UUID,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

-- =====================================================
-- 4. NEW STORE PERMISSIONS for procurement workflow
-- =====================================================
INSERT INTO permissions (permission_code, name, module, resource, action, description, status) VALUES
('store.request.convert', 'Convert Request to PR', 'store', 'request', 'CONVERT', 'Convert material requests into purchase requisitions', 'ACTIVE'),
('store.request.gm_approve', 'GM Approve Request', 'store', 'request', 'GM_APPROVE', 'GM-level approval for store procurement requests', 'ACTIVE'),
('store.request.acknowledge', 'Procurement Acknowledge', 'store', 'request', 'ACKNOWLEDGE', 'Acknowledge material request in procurement', 'ACTIVE'),
('store.eta.view', 'View ETA Tracking', 'store', 'eta', 'VIEW', 'View expected delivery / ETA tracking', 'ACTIVE'),
('store.eta.update', 'Update ETA', 'store', 'eta', 'UPDATE', 'Update expected delivery dates', 'ACTIVE')
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN' AND p.module = 'store' AND p.permission_code IN ('store.request.convert', 'store.request.gm_approve', 'store.request.acknowledge', 'store.eta.view', 'store.eta.update')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN' AND p.module = 'store' AND p.permission_code IN ('store.request.convert', 'store.request.gm_approve', 'store.request.acknowledge', 'store.eta.view', 'store.eta.update')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'MANAGEMENT' AND p.module = 'store' AND p.permission_code IN ('store.request.gm_approve', 'store.eta.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'INVENTORY' AND p.module = 'store' AND p.permission_code IN ('store.request.convert', 'store.request.acknowledge', 'store.eta.view', 'store.eta.update')
ON CONFLICT (role_id, permission_id) DO NOTHING;