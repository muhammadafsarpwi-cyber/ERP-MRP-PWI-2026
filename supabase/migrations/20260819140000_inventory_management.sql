-- Supabase Migration: Inventory & Warehouse Management
-- Migration: 20260819140000_inventory_management.sql
-- Description: Creates inventory management tables (Policies, Batches, Balances, Stock Ledger, Adjustments, Transfers, Reservations)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- INVENTORY POLICIES TABLE
-- Item/warehouse inventory configuration
-- =====================================================
CREATE TABLE IF NOT EXISTS inventory_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    item_id UUID NOT NULL REFERENCES items(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    minimum_stock DECIMAL(15, 4) DEFAULT 0,
    maximum_stock DECIMAL(15, 4) DEFAULT 0,
    reorder_level DECIMAL(15, 4) DEFAULT 0,
    reorder_quantity DECIMAL(15, 4) DEFAULT 0,
    safety_stock DECIMAL(15, 4) DEFAULT 0,
    lead_time_days INTEGER DEFAULT 0,
    preferred_location_id UUID REFERENCES warehouse_locations(id),
    tracking_type VARCHAR(10) DEFAULT 'NONE'
        CHECK (tracking_type IN ('NONE', 'BATCH', 'SERIAL')),
    allow_negative_stock BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(item_id, warehouse_id)
);

-- Indexes for inventory_policies
CREATE INDEX IF NOT EXISTS idx_inventory_policies_company_id ON inventory_policies(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_policies_item_id ON inventory_policies(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_policies_warehouse_id ON inventory_policies(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_policies_preferred_location_id ON inventory_policies(preferred_location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_policies_tracking_type ON inventory_policies(tracking_type);
CREATE INDEX IF NOT EXISTS idx_inventory_policies_status ON inventory_policies(status);

-- =====================================================
-- BATCHES TABLE
-- Batch/lot tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    item_id UUID NOT NULL REFERENCES items(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    location_id UUID REFERENCES warehouse_locations(id),
    batch_number VARCHAR(100) NOT NULL,
    manufacturing_date DATE,
    expiry_date DATE,
    supplier_reference VARCHAR(255),
    quantity DECIMAL(15, 4) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'EXPIRED', 'QUARANTINE', 'CONSUMED', 'CLOSED')),
    UNIQUE(batch_number, item_id, company_id)
);

-- Indexes for batches
CREATE INDEX IF NOT EXISTS idx_batches_company_id ON batches(company_id);
CREATE INDEX IF NOT EXISTS idx_batches_item_id ON batches(item_id);
CREATE INDEX IF NOT EXISTS idx_batches_warehouse_id ON batches(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_batches_location_id ON batches(location_id);
CREATE INDEX IF NOT EXISTS idx_batches_batch_number ON batches(batch_number);
CREATE INDEX IF NOT EXISTS idx_batches_manufacturing_date ON batches(manufacturing_date);
CREATE INDEX IF NOT EXISTS idx_batches_expiry_date ON batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);

-- =====================================================
-- INVENTORY BALANCES TABLE
-- Current stock position
-- =====================================================
CREATE TABLE IF NOT EXISTS inventory_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    item_id UUID NOT NULL REFERENCES items(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    location_id UUID REFERENCES warehouse_locations(id),
    batch_id UUID REFERENCES batches(id),
    uom_id UUID NOT NULL REFERENCES uoms(id),
    on_hand DECIMAL(15, 4) DEFAULT 0,
    reserved DECIMAL(15, 4) DEFAULT 0,
    available DECIMAL(15, 4) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ACTIVE'
);

-- Unique index: one balance per item/warehouse/location/batch/uom
-- Uses COALESCE to treat NULL location_id and batch_id as consistent singleton values
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_balances_unique
ON inventory_balances
(
    item_id,
    warehouse_id,
    COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(batch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    uom_id
);

-- Indexes for inventory_balances
CREATE INDEX IF NOT EXISTS idx_inventory_balances_company_id ON inventory_balances(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_item_id ON inventory_balances(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_warehouse_id ON inventory_balances(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_location_id ON inventory_balances(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_batch_id ON inventory_balances(batch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_uom_id ON inventory_balances(uom_id);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_status ON inventory_balances(status);

-- =====================================================
-- STOCK LEDGER TABLE
-- IMMUTABLE transaction log (source of truth)
-- =====================================================
CREATE TABLE IF NOT EXISTS stock_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    company_id UUID NOT NULL REFERENCES companies(id),
    transaction_type VARCHAR(30) NOT NULL
        CHECK (transaction_type IN ('RECEIPT', 'ISSUE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'OPENING', 'RETURN_IN', 'RETURN_OUT')),
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    item_id UUID NOT NULL REFERENCES items(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    location_id UUID REFERENCES warehouse_locations(id),
    quantity DECIMAL(15, 4) NOT NULL,
    uom_id UUID NOT NULL REFERENCES uoms(id),
    direction VARCHAR(10) NOT NULL
        CHECK (direction IN ('IN', 'OUT')),
    reference_type VARCHAR(50),
    reference_id UUID,
    reference_number VARCHAR(100),
    batch_id UUID REFERENCES batches(id),
    serial_number VARCHAR(100),
    notes TEXT
);

-- Indexes for stock_ledger
CREATE INDEX IF NOT EXISTS idx_stock_ledger_company_id ON stock_ledger(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_transaction_type ON stock_ledger(transaction_type);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_transaction_date ON stock_ledger(transaction_date);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_item_id ON stock_ledger(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_warehouse_id ON stock_ledger(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_location_id ON stock_ledger(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_uom_id ON stock_ledger(uom_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_direction ON stock_ledger(direction);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_reference_type ON stock_ledger(reference_type);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_reference_id ON stock_ledger(reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_reference_number ON stock_ledger(reference_number);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_batch_id ON stock_ledger(batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_serial_number ON stock_ledger(serial_number);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_created_by ON stock_ledger(created_by);

-- =====================================================
-- STOCK ADJUSTMENTS TABLE
-- Adjustment header with workflow
-- =====================================================
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    adjustment_code VARCHAR(50) NOT NULL,
    adjustment_type VARCHAR(20) NOT NULL
        CHECK (adjustment_type IN ('INCREASE', 'DECREASE', 'REVALUATION')),
    reason TEXT,
    status VARCHAR(20) DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'CANCELLED')),
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    posted_by UUID,
    posted_at TIMESTAMPTZ,
    UNIQUE(adjustment_code, company_id)
);

-- Indexes for stock_adjustments
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_company_id ON stock_adjustments(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_warehouse_id ON stock_adjustments(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_adjustment_code ON stock_adjustments(adjustment_code);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_adjustment_type ON stock_adjustments(adjustment_type);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_status ON stock_adjustments(status);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_created_by ON stock_adjustments(created_by);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_approved_by ON stock_adjustments(approved_by);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_posted_by ON stock_adjustments(posted_by);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_approved_at ON stock_adjustments(approved_at);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_posted_at ON stock_adjustments(posted_at);

-- =====================================================
-- STOCK ADJUSTMENT LINES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS stock_adjustment_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    adjustment_id UUID NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id),
    location_id UUID REFERENCES warehouse_locations(id),
    batch_id UUID REFERENCES batches(id),
    uom_id UUID NOT NULL REFERENCES uoms(id),
    quantity DECIMAL(15, 4) NOT NULL,
    unit_cost DECIMAL(15, 6),
    notes TEXT
);

-- Indexes for stock_adjustment_lines
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_lines_adjustment_id ON stock_adjustment_lines(adjustment_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_lines_item_id ON stock_adjustment_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_lines_location_id ON stock_adjustment_lines(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_lines_batch_id ON stock_adjustment_lines(batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_lines_uom_id ON stock_adjustment_lines(uom_id);

-- =====================================================
-- STOCK TRANSFERS TABLE
-- Transfer header with workflow
-- =====================================================
CREATE TABLE IF NOT EXISTS stock_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    transfer_code VARCHAR(50) NOT NULL,
    from_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    to_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    from_location_id UUID REFERENCES warehouse_locations(id),
    to_location_id UUID REFERENCES warehouse_locations(id),
    status VARCHAR(20) DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'CANCELLED')),
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    posted_by UUID,
    posted_at TIMESTAMPTZ,
    notes TEXT,
    UNIQUE(transfer_code, company_id)
);

-- Indexes for stock_transfers
CREATE INDEX IF NOT EXISTS idx_stock_transfers_company_id ON stock_transfers(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_transfer_code ON stock_transfers(transfer_code);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_warehouse_id ON stock_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_warehouse_id ON stock_transfers(to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_location_id ON stock_transfers(from_location_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_location_id ON stock_transfers(to_location_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON stock_transfers(status);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_created_by ON stock_transfers(created_by);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_approved_by ON stock_transfers(approved_by);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_posted_by ON stock_transfers(posted_by);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_approved_at ON stock_transfers(approved_at);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_posted_at ON stock_transfers(posted_at);

-- =====================================================
-- STOCK TRANSFER LINES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS stock_transfer_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id),
    from_location_id UUID REFERENCES warehouse_locations(id),
    to_location_id UUID REFERENCES warehouse_locations(id),
    batch_id UUID REFERENCES batches(id),
    uom_id UUID NOT NULL REFERENCES uoms(id),
    quantity DECIMAL(15, 4) NOT NULL,
    notes TEXT
);

-- Indexes for stock_transfer_lines
CREATE INDEX IF NOT EXISTS idx_stock_transfer_lines_transfer_id ON stock_transfer_lines(transfer_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_lines_item_id ON stock_transfer_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_lines_from_location_id ON stock_transfer_lines(from_location_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_lines_to_location_id ON stock_transfer_lines(to_location_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_lines_batch_id ON stock_transfer_lines(batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_lines_uom_id ON stock_transfer_lines(uom_id);

-- =====================================================
-- INVENTORY RESERVATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS inventory_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    item_id UUID NOT NULL REFERENCES items(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    location_id UUID REFERENCES warehouse_locations(id),
    batch_id UUID REFERENCES batches(id),
    uom_id UUID NOT NULL REFERENCES uoms(id),
    quantity DECIMAL(15, 4) NOT NULL,
    reserved_by UUID,
    reservation_type VARCHAR(30) DEFAULT 'MANUAL'
        CHECK (reservation_type IN ('MANUAL', 'ORDER', 'TRANSFER')),
    reference_type VARCHAR(50),
    reference_id UUID,
    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'CONSUMED', 'CANCELLED')),
    expires_at TIMESTAMPTZ
);

-- Indexes for inventory_reservations
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_company_id ON inventory_reservations(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_item_id ON inventory_reservations(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_warehouse_id ON inventory_reservations(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_location_id ON inventory_reservations(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_batch_id ON inventory_reservations(batch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_uom_id ON inventory_reservations(uom_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_reserved_by ON inventory_reservations(reserved_by);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_reservation_type ON inventory_reservations(reservation_type);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_reference_type ON inventory_reservations(reference_type);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_reference_id ON inventory_reservations(reference_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_status ON inventory_reservations(status);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_expires_at ON inventory_reservations(expires_at);

-- =====================================================
-- TRIGGERS: Auto-update updated_at timestamp
-- Safe to re-run: DROP IF EXISTS before each CREATE
-- =====================================================
DROP TRIGGER IF EXISTS update_inventory_policies_updated_at ON inventory_policies;
CREATE TRIGGER update_inventory_policies_updated_at BEFORE UPDATE ON inventory_policies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_batches_updated_at ON batches;
CREATE TRIGGER update_batches_updated_at BEFORE UPDATE ON batches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_inventory_balances_updated_at ON inventory_balances;
CREATE TRIGGER update_inventory_balances_updated_at BEFORE UPDATE ON inventory_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stock_adjustments_updated_at ON stock_adjustments;
CREATE TRIGGER update_stock_adjustments_updated_at BEFORE UPDATE ON stock_adjustments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stock_adjustment_lines_updated_at ON stock_adjustment_lines;
CREATE TRIGGER update_stock_adjustment_lines_updated_at BEFORE UPDATE ON stock_adjustment_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stock_transfers_updated_at ON stock_transfers;
CREATE TRIGGER update_stock_transfers_updated_at BEFORE UPDATE ON stock_transfers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stock_transfer_lines_updated_at ON stock_transfer_lines;
CREATE TRIGGER update_stock_transfer_lines_updated_at BEFORE UPDATE ON stock_transfer_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_inventory_reservations_updated_at ON inventory_reservations;
CREATE TRIGGER update_inventory_reservations_updated_at BEFORE UPDATE ON inventory_reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- NOTE: stock_ledger is intentionally immutable (no updated_at, no update trigger)

-- =====================================================
-- SEED DATA: Permissions - Inventory Module
-- =====================================================
INSERT INTO permissions (permission_code, name, module, resource, action, description, status) VALUES
    ('inventory.view', 'View Inventory', 'inventory', 'inventory', 'VIEW', 'View inventory overview and balances', 'ACTIVE'),
    ('inventory.reports.view', 'View Inventory Reports', 'inventory', 'inventory', 'VIEW_REPORTS', 'View inventory reports and analytics', 'ACTIVE'),
    ('inventory.policy.create', 'Create Inventory Policy', 'inventory', 'policy', 'CREATE', 'Create inventory policies for items', 'ACTIVE'),
    ('inventory.policy.view', 'View Inventory Policy', 'inventory', 'policy', 'VIEW', 'View inventory policies', 'ACTIVE'),
    ('inventory.policy.update', 'Update Inventory Policy', 'inventory', 'policy', 'UPDATE', 'Update inventory policies', 'ACTIVE'),
    ('inventory.adjustment.create', 'Create Stock Adjustment', 'inventory', 'adjustment', 'CREATE', 'Create stock adjustment entries', 'ACTIVE'),
    ('inventory.adjustment.submit', 'Submit Stock Adjustment', 'inventory', 'adjustment', 'SUBMIT', 'Submit stock adjustments for approval', 'ACTIVE'),
    ('inventory.adjustment.approve', 'Approve Stock Adjustment', 'inventory', 'adjustment', 'APPROVE', 'Approve submitted stock adjustments', 'ACTIVE'),
    ('inventory.adjustment.post', 'Post Stock Adjustment', 'inventory', 'adjustment', 'POST', 'Post approved stock adjustments to ledger', 'ACTIVE'),
    ('inventory.transfer.create', 'Create Stock Transfer', 'inventory', 'transfer', 'CREATE', 'Create stock transfer entries', 'ACTIVE'),
    ('inventory.transfer.approve', 'Approve Stock Transfer', 'inventory', 'transfer', 'APPROVE', 'Approve submitted stock transfers', 'ACTIVE'),
    ('inventory.transfer.post', 'Post Stock Transfer', 'inventory', 'transfer', 'POST', 'Post approved stock transfers to ledger', 'ACTIVE'),
    ('inventory.reservation.view', 'View Inventory Reservations', 'inventory', 'reservation', 'VIEW', 'View inventory reservations', 'ACTIVE'),
    ('inventory.reservation.create', 'Create Inventory Reservation', 'inventory', 'reservation', 'CREATE', 'Create inventory reservations', 'ACTIVE'),
    ('inventory.reservation.release', 'Release Inventory Reservation', 'inventory', 'reservation', 'RELEASE', 'Release inventory reservations', 'ACTIVE'),
    ('inventory.opening_stock.create', 'Create Opening Stock', 'inventory', 'opening_stock', 'CREATE', 'Create opening stock entries', 'ACTIVE'),
    ('inventory.batch.view', 'View Batches', 'inventory', 'batch', 'VIEW', 'View batch/lot tracking data', 'ACTIVE'),
    ('inventory.batch.manage', 'Manage Batches', 'inventory', 'batch', 'MANAGE', 'Create, update, and manage batches', 'ACTIVE'),
    ('inventory.serial.view', 'View Serial Numbers', 'inventory', 'serial', 'VIEW', 'View serial number tracking data', 'ACTIVE'),
    ('inventory.serial.manage', 'Manage Serial Numbers', 'inventory', 'serial', 'MANAGE', 'Create, update, and manage serial numbers', 'ACTIVE')
ON CONFLICT (permission_code) DO NOTHING;

-- =====================================================
-- SEED DATA: Assign inventory permissions to INVENTORY role
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'INVENTORY' AND p.module = 'inventory'
ON CONFLICT (role_id, permission_id) DO NOTHING;
