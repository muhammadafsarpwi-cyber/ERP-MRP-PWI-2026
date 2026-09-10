-- Migration: Automatic Store Replenishment (TASK 04)
-- Monitors real store-item stock (inventory_balances) against store_items
-- min / reorder / max config and produces an idempotent replenishment queue.
-- Never fabricates inventory: all quantities come from inventory_balances,
-- and no duplicate procurement is created (MR / PR / PO / GRN dedupe).

-- =====================================================
-- 1. STORE REPLENISHMENT QUEUE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS store_replenishments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    store_id UUID NOT NULL REFERENCES stores(id),
    store_item_id UUID REFERENCES store_items(id),
    item_id UUID NOT NULL REFERENCES items(id),
    warehouse_id UUID REFERENCES warehouses(id),
    division_id UUID REFERENCES divisions(id),
    section_id UUID REFERENCES sections(id),
    department_id UUID REFERENCES departments(id),
    uom_id UUID REFERENCES uoms(id),

    on_hand NUMERIC(15,4) NOT NULL DEFAULT 0,
    reserved NUMERIC(15,4) NOT NULL DEFAULT 0,
    available NUMERIC(15,4) NOT NULL DEFAULT 0,
    minimum_stock NUMERIC(15,4) NOT NULL DEFAULT 0,
    reorder_level NUMERIC(15,4) NOT NULL DEFAULT 0,
    maximum_stock NUMERIC(15,4) NOT NULL DEFAULT 0,
    reorder_quantity NUMERIC(15,4),
    required_quantity NUMERIC(15,4) NOT NULL DEFAULT 0,
    already_in_procurement NUMERIC(15,4) NOT NULL DEFAULT 0,
    pending_receipt NUMERIC(15,4) NOT NULL DEFAULT 0,
    remaining_requirement NUMERIC(15,4) NOT NULL DEFAULT 0,

    status VARCHAR(30) NOT NULL DEFAULT 'NORMAL',
    source VARCHAR(20) NOT NULL DEFAULT 'AUTOMATIC',
    auto_create_mr BOOLEAN NOT NULL DEFAULT true,

    material_request_id UUID REFERENCES material_requests(id),
    material_request_number VARCHAR(50),
    pr_id UUID REFERENCES purchase_requisitions(id),
    pr_number VARCHAR(50),
    po_id UUID REFERENCES purchase_orders(id),
    po_number VARCHAR(50),
    expected_delivery_date DATE,
    overdue_since DATE,

    deferred BOOLEAN NOT NULL DEFAULT false,
    deferred_until DATE,
    deferred_reason TEXT,
    cancelled BOOLEAN NOT NULL DEFAULT false,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancelled_by UUID,
    cancel_reason TEXT,

    adjusted_quantity NUMERIC(15,4),
    adjusted_reason TEXT,
    adjusted_by UUID,
    adjusted_at TIMESTAMP WITH TIME ZONE,

    overridden_by UUID,
    overridden_at TIMESTAMP WITH TIME ZONE,
    run_reference VARCHAR(50),
    last_checked_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_store_replenishments_store_item
    ON store_replenishments(company_id, store_id, item_id);
CREATE INDEX IF NOT EXISTS idx_store_replenishments_status
    ON store_replenishments(status);
CREATE INDEX IF NOT EXISTS idx_store_replenishments_store
    ON store_replenishments(store_id);
CREATE INDEX IF NOT EXISTS idx_store_replenishments_item
    ON store_replenishments(item_id);
CREATE INDEX IF NOT EXISTS idx_store_replenishments_available
    ON store_replenishments(available);

-- =====================================================
-- 2. PERMISSIONS - store.replenishment.*
-- =====================================================
INSERT INTO permissions (permission_code, name, module, resource, action, description, status)
VALUES
('store.replenishment.view', 'View Replenishment Queue', 'store', 'replenishment', 'view', 'View the automatic replenishment queue and KPIs', 'ACTIVE'),
('store.replenishment.run', 'Run Replenishment Check', 'store', 'replenishment', 'run', 'Run the automatic replenishment check', 'ACTIVE'),
('store.replenishment.create', 'Create Replenishment Request', 'store', 'replenishment', 'create', 'Create a material request from a replenishment row', 'ACTIVE'),
('store.replenishment.override', 'Override Replenishment', 'store', 'replenishment', 'override', 'Adjust, defer or cancel a replenishment requirement (audited)', 'ACTIVE'),
('store.replenishment.convert', 'Convert Replenishment to PR', 'store', 'replenishment', 'convert', 'Convert a replenishment material request to a purchase requisition', 'ACTIVE')
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN' AND p.module = 'store' AND p.resource = 'replenishment'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN' AND p.module = 'store' AND p.resource = 'replenishment'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'INVENTORY' AND p.module = 'store' AND p.resource = 'replenishment'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'MANAGEMENT' AND p.module = 'store' AND p.permission_code IN ('store.replenishment.view', 'store.replenishment.convert')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'REPORT_VIEWER' AND p.module = 'store' AND p.permission_code IN ('store.replenishment.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;