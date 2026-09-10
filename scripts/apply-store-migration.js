const { Client } = require('pg');

async function runMigration() {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    ssl: { rejectUnauthorized: false }
  });

  const migration = `
-- Migration: Store Department Module
-- Creates stores, store_items, material_requests, material_issues, material_returns

-- =====================================================
-- 1. STORES
-- =====================================================
CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    division_id UUID REFERENCES divisions(id),
    section_id UUID REFERENCES sections(id),
    department_id UUID REFERENCES departments(id),
    warehouse_id UUID REFERENCES warehouses(id),
    store_code VARCHAR(50) NOT NULL,
    store_name VARCHAR(200) NOT NULL,
    store_type VARCHAR(50) DEFAULT 'GENERAL',
    address TEXT,
    contact_person VARCHAR(200),
    contact_number VARCHAR(50),
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    UNIQUE(company_id, store_code)
);

CREATE INDEX IF NOT EXISTS idx_stores_company ON stores(company_id);
CREATE INDEX IF NOT EXISTS idx_stores_division ON stores(division_id);
CREATE INDEX IF NOT EXISTS idx_stores_warehouse ON stores(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stores_status ON stores(status);

-- =====================================================
-- 2. STORE ITEMS
-- =====================================================
CREATE TABLE IF NOT EXISTS store_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id),
    bin VARCHAR(50),
    rack VARCHAR(50),
    shelf VARCHAR(50),
    location_detail VARCHAR(200),
    minimum_stock DECIMAL(15,4) DEFAULT 0,
    reorder_level DECIMAL(15,4) DEFAULT 0,
    maximum_stock DECIMAL(15,4) DEFAULT 0,
    preferred_issue_method VARCHAR(50) DEFAULT 'MANUAL',
    batch_tracked BOOLEAN DEFAULT false,
    serial_tracked BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    UNIQUE(store_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_store_items_store ON store_items(store_id);
CREATE INDEX IF NOT EXISTS idx_store_items_item ON store_items(item_id);

-- =====================================================
-- 3. MATERIAL REQUESTS
-- =====================================================
CREATE TABLE IF NOT EXISTS material_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    division_id UUID REFERENCES divisions(id),
    section_id UUID REFERENCES sections(id),
    department_id UUID REFERENCES departments(id),
    request_number VARCHAR(50) NOT NULL,
    request_date DATE NOT NULL DEFAULT CURRENT_DATE,
    required_date DATE,
    store_id UUID NOT NULL REFERENCES stores(id),
    requesting_employee_id UUID REFERENCES hr_employees(id),
    production_order_id UUID,
    job_card_id UUID,
    purpose TEXT,
    reference_document VARCHAR(200),
    remarks TEXT,
    status VARCHAR(30) DEFAULT 'DRAFT',
    submitted_by UUID,
    submitted_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    rejected_by UUID,
    rejected_at TIMESTAMP WITH TIME ZONE,
    cancelled_by UUID,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    UNIQUE(company_id, request_number)
);

CREATE INDEX IF NOT EXISTS idx_material_requests_company ON material_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_material_requests_store ON material_requests(store_id);
CREATE INDEX IF NOT EXISTS idx_material_requests_status ON material_requests(status);
CREATE INDEX IF NOT EXISTS idx_material_requests_department ON material_requests(department_id);

CREATE TABLE IF NOT EXISTS material_request_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    item_id UUID NOT NULL REFERENCES items(id),
    requested_quantity DECIMAL(15,4) NOT NULL,
    issued_quantity DECIMAL(15,4) DEFAULT 0,
    uom_id UUID NOT NULL REFERENCES uoms(id),
    batch_id UUID,
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(request_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_material_request_lines_request ON material_request_lines(request_id);
CREATE INDEX IF NOT EXISTS idx_material_request_lines_item ON material_request_lines(item_id);

-- =====================================================
-- 4. MATERIAL ISSUES
-- =====================================================
CREATE TABLE IF NOT EXISTS material_issues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    division_id UUID REFERENCES divisions(id),
    section_id UUID REFERENCES sections(id),
    department_id UUID REFERENCES departments(id),
    issue_number VARCHAR(50) NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    store_id UUID NOT NULL REFERENCES stores(id),
    request_id UUID REFERENCES material_requests(id),
    issued_to_department_id UUID REFERENCES departments(id),
    issued_to_employee_id UUID REFERENCES hr_employees(id),
    issued_by UUID,
    purpose TEXT,
    reference_document VARCHAR(200),
    remarks TEXT,
    status VARCHAR(30) DEFAULT 'DRAFT',
    posted_by UUID,
    posted_at TIMESTAMP WITH TIME ZONE,
    cancelled_by UUID,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    UNIQUE(company_id, issue_number)
);

CREATE INDEX IF NOT EXISTS idx_material_issues_company ON material_issues(company_id);
CREATE INDEX IF NOT EXISTS idx_material_issues_store ON material_issues(store_id);
CREATE INDEX IF NOT EXISTS idx_material_issues_status ON material_issues(status);
CREATE INDEX IF NOT EXISTS idx_material_issues_request ON material_issues(request_id);

CREATE TABLE IF NOT EXISTS material_issue_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    issue_id UUID NOT NULL REFERENCES material_issues(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    item_id UUID NOT NULL REFERENCES items(id),
    quantity DECIMAL(15,4) NOT NULL,
    uom_id UUID NOT NULL REFERENCES uoms(id),
    batch_id UUID,
    serial_number VARCHAR(100),
    bin VARCHAR(50),
    rack VARCHAR(50),
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(issue_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_material_issue_lines_issue ON material_issue_lines(issue_id);
CREATE INDEX IF NOT EXISTS idx_material_issue_lines_item ON material_issue_lines(item_id);

-- =====================================================
-- 5. MATERIAL RETURNS
-- =====================================================
CREATE TABLE IF NOT EXISTS material_returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    division_id UUID REFERENCES divisions(id),
    section_id UUID REFERENCES sections(id),
    department_id UUID REFERENCES departments(id),
    return_number VARCHAR(50) NOT NULL,
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    store_id UUID NOT NULL REFERENCES stores(id),
    issue_id UUID REFERENCES material_issues(id),
    from_department_id UUID REFERENCES departments(id),
    returned_by_employee_id UUID REFERENCES hr_employees(id),
    condition_code VARCHAR(50) DEFAULT 'GOOD',
    reason TEXT,
    remarks TEXT,
    status VARCHAR(30) DEFAULT 'DRAFT',
    posted_by UUID,
    posted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    UNIQUE(company_id, return_number)
);

CREATE INDEX IF NOT EXISTS idx_material_returns_company ON material_returns(company_id);
CREATE INDEX IF NOT EXISTS idx_material_returns_store ON material_returns(store_id);
CREATE INDEX IF NOT EXISTS idx_material_returns_status ON material_returns(status);

CREATE TABLE IF NOT EXISTS material_return_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_id UUID NOT NULL REFERENCES material_returns(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    item_id UUID NOT NULL REFERENCES items(id),
    quantity DECIMAL(15,4) NOT NULL,
    uom_id UUID NOT NULL REFERENCES uoms(id),
    batch_id UUID,
    serial_number VARCHAR(100),
    condition_code VARCHAR(50) DEFAULT 'GOOD',
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(return_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_material_return_lines_return ON material_return_lines(return_id);

-- =====================================================
-- 6. STORE PERMISSIONS
-- =====================================================
INSERT INTO permissions (permission_code, name, module, resource, action, description, status) VALUES
-- Store Master
('store.view', 'View Stores', 'store', 'store', 'VIEW', 'View store master records', 'ACTIVE'),
('store.create', 'Create Store', 'store', 'store', 'CREATE', 'Create new stores', 'ACTIVE'),
('store.update', 'Update Store', 'store', 'store', 'UPDATE', 'Update store records', 'ACTIVE'),
('store.delete', 'Delete Store', 'store', 'store', 'DELETE', 'Delete store records', 'ACTIVE'),
-- Store Items
('store.item.view', 'View Store Items', 'store', 'item', 'VIEW', 'View store item relationships', 'ACTIVE'),
('store.item.create', 'Create Store Item', 'store', 'item', 'CREATE', 'Add items to stores', 'ACTIVE'),
('store.item.update', 'Update Store Item', 'store', 'item', 'UPDATE', 'Update store item settings', 'ACTIVE'),
-- Material Requests
('store.request.view', 'View Material Requests', 'store', 'request', 'VIEW', 'View material requests', 'ACTIVE'),
('store.request.create', 'Create Material Request', 'store', 'request', 'CREATE', 'Create material requests', 'ACTIVE'),
('store.request.submit', 'Submit Material Request', 'store', 'request', 'SUBMIT', 'Submit material requests for approval', 'ACTIVE'),
('store.request.approve', 'Approve Material Request', 'store', 'request', 'APPROVE', 'Approve material requests', 'ACTIVE'),
('store.request.reject', 'Reject Material Request', 'store', 'request', 'REJECT', 'Reject material requests', 'ACTIVE'),
-- Material Issues
('store.issue.view', 'View Material Issues', 'store', 'issue', 'VIEW', 'View material issues', 'ACTIVE'),
('store.issue.create', 'Create Material Issue', 'store', 'issue', 'CREATE', 'Create material issues', 'ACTIVE'),
('store.issue.post', 'Post Material Issue', 'store', 'issue', 'POST', 'Post material issues to inventory', 'ACTIVE'),
('store.issue.cancel', 'Cancel Material Issue', 'store', 'issue', 'CANCEL', 'Cancel material issues', 'ACTIVE'),
-- Material Receipts
('store.receive.view', 'View Store Receipts', 'store', 'receive', 'VIEW', 'View store material receipts', 'ACTIVE'),
('store.receive.create', 'Create Store Receipt', 'store', 'receive', 'CREATE', 'Create store material receipts', 'ACTIVE'),
('store.receive.post', 'Post Store Receipt', 'store', 'receive', 'POST', 'Post store receipts to inventory', 'ACTIVE'),
-- Material Returns
('store.return.view', 'View Material Returns', 'store', 'return', 'VIEW', 'View material returns', 'ACTIVE'),
('store.return.create', 'Create Material Return', 'store', 'return', 'CREATE', 'Create material returns', 'ACTIVE'),
('store.return.post', 'Post Material Return', 'store', 'return', 'POST', 'Post material returns to inventory', 'ACTIVE'),
-- Reports
('store.report.view', 'View Store Reports', 'store', 'report', 'VIEW', 'View store reports and analytics', 'ACTIVE'),
('store.ledger.view', 'View Store Ledger', 'store', 'ledger', 'VIEW', 'View store-filtered stock ledger', 'ACTIVE')
ON CONFLICT (permission_code) DO NOTHING;

-- =====================================================
-- 7. GRANT STORE PERMISSIONS TO ROLES
-- =====================================================

-- SUPER_ADMIN gets everything
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN' AND p.module = 'store'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ADMIN gets all except DELETE
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN' AND p.module = 'store' AND p.action NOT IN ('DELETE')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- MANAGEMENT gets VIEW + REPORT permissions
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'MANAGEMENT' AND p.module = 'store' AND p.action IN ('VIEW', 'VIEW_REPORTS')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- INVENTORY role gets full store access
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'INVENTORY' AND p.module = 'store'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- PRODUCTION role gets request + view permissions
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'PRODUCTION' AND p.module = 'store' AND p.resource IN ('request', 'report', 'ledger') AND p.action IN ('VIEW', 'CREATE', 'SUBMIT')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- 8. SAMPLE DATA - Stores
-- =====================================================
DO $$
DECLARE
    v_company_id UUID;
    v_division_id UUID;
    v_section_id UUID;
    v_department_id UUID;
    v_warehouse_id UUID;
    v_store_id UUID;
    v_item_id UUID;
    v_uom_id UUID;
    v_store2_id UUID;
BEGIN
    -- Get existing IDs
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    SELECT id INTO v_division_id FROM divisions LIMIT 1;
    SELECT id INTO v_section_id FROM sections LIMIT 1;
    SELECT id INTO v_department_id FROM departments LIMIT 1;
    SELECT id INTO v_warehouse_id FROM warehouses LIMIT 1;
    SELECT id INTO v_item_id FROM items WHERE item_type = 'RAW_MATERIAL' LIMIT 1;
    SELECT id INTO v_uom_id FROM uoms WHERE code = 'KG' LIMIT 1;

    IF v_company_id IS NULL THEN
        RAISE NOTICE 'No company found, skipping sample data';
        RETURN;
    END IF;

    -- Create Store 1: Raw Material Store
    INSERT INTO stores (id, company_id, division_id, section_id, department_id, warehouse_id, store_code, store_name, store_type, description, is_default, status)
    VALUES (uuid_generate_v4(), v_company_id, v_division_id, v_section_id, v_department_id, v_warehouse_id, 'CCD-RM-STORE', 'CCD Raw Material Store', 'RAW_MATERIAL', 'Raw Material Store for Cable Division', true, 'ACTIVE')
    ON CONFLICT (company_id, store_code) DO NOTHING
    RETURNING id INTO v_store_id;

    -- Create Store 2: Finished Goods Store
    IF v_store_id IS NULL THEN
        SELECT id INTO v_store_id FROM stores WHERE store_code = 'CCD-RM-STORE' LIMIT 1;
    END IF;

    INSERT INTO stores (id, company_id, division_id, section_id, department_id, warehouse_id, store_code, store_name, store_type, description, is_default, status)
    VALUES (uuid_generate_v4(), v_company_id, v_division_id, v_section_id, v_department_id, v_warehouse_id, 'CCD-FG-STORE', 'CCD Finished Goods Store', 'FINISHED_GOODS', 'Finished Goods Store for Cable Division', false, 'ACTIVE')
    ON CONFLICT (company_id, store_code) DO NOTHING
    RETURNING id INTO v_store2_id;

    IF v_store2_id IS NULL THEN
        SELECT id INTO v_store2_id FROM stores WHERE store_code = 'CCD-FG-STORE' LIMIT 1;
    END IF;

    -- Create Store Items (if items exist)
    IF v_item_id IS NOT NULL AND v_store_id IS NOT NULL THEN
        INSERT INTO store_items (store_id, item_id, bin, rack, shelf, minimum_stock, reorder_level, maximum_stock, status)
        VALUES (v_store_id, v_item_id, 'A-01', 'Rack-A', 'Shelf-1', 500, 750, 3000, 'ACTIVE')
        ON CONFLICT (store_id, item_id) DO NOTHING;
    END IF;

    RAISE NOTICE 'Sample store data created successfully';
END $$;
  `;

  try {
    console.log('Connecting to database...');
    await client.connect();
    
    console.log('Running Store Department migration (00052)...');
    await client.query(migration);
    
    console.log('Migration 00052 completed successfully!');
    
    // Verify permissions
    const permCount = await client.query("SELECT COUNT(*) as count FROM permissions WHERE module = 'store'");
    console.log(`Store permissions created: ${permCount.rows[0].count}`);
    
    const storeCount = await client.query("SELECT COUNT(*) as count FROM stores");
    console.log(`Stores created: ${storeCount.rows[0].count}`);
    
    const totalPerms = await client.query("SELECT COUNT(*) as count FROM permissions WHERE status = 'ACTIVE'");
    console.log(`Total active permissions: ${totalPerms.rows[0].count}`);
    
  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    await client.end();
    console.log('Database connection closed.');
  }
}

runMigration();
