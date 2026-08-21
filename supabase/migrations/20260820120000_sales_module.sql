-- ERP-00008: Sales Module Enhancement Migration
-- Adds sales_deliveries, sales_returns tables, fixes duplicate triggers, seeds demo data
-- All operations are idempotent

-- =====================================================
-- FIX: Remove duplicate triggers on sales_orders
-- =====================================================
DROP TRIGGER IF EXISTS trg_audit_sales_orders ON erp_sales.sales_orders;
DROP TRIGGER IF EXISTS trg_so_user_context ON erp_sales.sales_orders;

-- =====================================================
-- TABLE: sales_deliveries
-- =====================================================
CREATE TABLE IF NOT EXISTS erp_sales.sales_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    delivery_number VARCHAR(50) NOT NULL,
    sales_order_id UUID REFERENCES erp_sales.sales_orders(id),
    customer_id UUID NOT NULL REFERENCES erp_sales.customers(id),
    delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_date DATE,
    warehouse_id UUID REFERENCES warehouses(id),
    ship_to_address TEXT,
    carrier VARCHAR(100),
    tracking_number VARCHAR(200),
    subtotal NUMERIC(15,4) DEFAULT 0,
    tax_amount NUMERIC(15,4) DEFAULT 0,
    total_amount NUMERIC(15,4) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'DRAFT',
    notes TEXT,
    received_by UUID,
    received_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    UNIQUE(delivery_number)
);

-- =====================================================
-- TABLE: sales_delivery_lines
-- =====================================================
CREATE TABLE IF NOT EXISTS erp_sales.sales_delivery_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES erp_sales.sales_deliveries(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    item_id UUID NOT NULL REFERENCES items(id),
    description TEXT,
    quantity NUMERIC(15,4) NOT NULL,
    uom_id UUID REFERENCES uoms(id),
    warehouse_id UUID REFERENCES warehouses(id),
    batch_id UUID,
    serial_number VARCHAR(100),
    unit_price NUMERIC(15,6) DEFAULT 0,
    tax_amount NUMERIC(15,4) DEFAULT 0,
    line_total NUMERIC(15,4) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- TABLE: sales_returns
-- =====================================================
CREATE TABLE IF NOT EXISTS erp_sales.sales_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    return_number VARCHAR(50) NOT NULL,
    sales_order_id UUID REFERENCES erp_sales.sales_orders(id),
    sales_invoice_id UUID REFERENCES erp_sales.sales_invoices(id),
    customer_id UUID NOT NULL REFERENCES erp_sales.customers(id),
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reason TEXT,
    subtotal NUMERIC(15,4) DEFAULT 0,
    tax_amount NUMERIC(15,4) DEFAULT 0,
    total_amount NUMERIC(15,4) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'DRAFT',
    notes TEXT,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    UNIQUE(return_number)
);

-- =====================================================
-- TABLE: sales_return_lines
-- =====================================================
CREATE TABLE IF NOT EXISTS erp_sales.sales_return_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID NOT NULL REFERENCES erp_sales.sales_returns(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    item_id UUID NOT NULL REFERENCES items(id),
    description TEXT,
    quantity NUMERIC(15,4) NOT NULL,
    uom_id UUID REFERENCES uoms(id),
    unit_price NUMERIC(15,6) DEFAULT 0,
    tax_amount NUMERIC(15,4) DEFAULT 0,
    line_total NUMERIC(15,4) DEFAULT 0,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- INDEXES for new tables
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_sd_company ON erp_sales.sales_deliveries(company_id);
CREATE INDEX IF NOT EXISTS idx_sd_customer ON erp_sales.sales_deliveries(customer_id);
CREATE INDEX IF NOT EXISTS idx_sd_so ON erp_sales.sales_deliveries(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sd_status ON erp_sales.sales_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_sd_date ON erp_sales.sales_deliveries(delivery_date);
CREATE INDEX IF NOT EXISTS idx_sdl_delivery ON erp_sales.sales_delivery_lines(delivery_id);
CREATE INDEX IF NOT EXISTS idx_sdl_item ON erp_sales.sales_delivery_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_sr_company ON erp_sales.sales_returns(company_id);
CREATE INDEX IF NOT EXISTS idx_sr_customer ON erp_sales.sales_returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_sr_status ON erp_sales.sales_returns(status);
CREATE INDEX IF NOT EXISTS idx_srl_return ON erp_sales.sales_return_lines(return_id);

-- =====================================================
-- TRIGGERS for new tables
-- =====================================================
DROP TRIGGER IF EXISTS trg_sd_updated_at ON erp_sales.sales_deliveries;
CREATE TRIGGER trg_sd_updated_at BEFORE UPDATE ON erp_sales.sales_deliveries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_sr_updated_at ON erp_sales.sales_returns;
CREATE TRIGGER trg_sr_updated_at BEFORE UPDATE ON erp_sales.sales_returns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SEED: Sales Permissions
-- =====================================================
INSERT INTO permissions (permission_code, name, module, resource, action, description, status) VALUES
    ('sales.quotations.view', 'View Sales Quotations', 'sales', 'quotations', 'VIEW', 'View sales quotations', 'ACTIVE'),
    ('sales.quotations.create', 'Create Sales Quotations', 'sales', 'quotations', 'CREATE', 'Create sales quotations', 'ACTIVE'),
    ('sales.quotations.update', 'Update Sales Quotations', 'sales', 'quotations', 'UPDATE', 'Update sales quotations', 'ACTIVE'),
    ('sales.quotations.delete', 'Delete Sales Quotations', 'sales', 'quotations', 'DELETE', 'Delete sales quotations', 'ACTIVE'),
    ('sales.orders.view', 'View Sales Orders', 'sales', 'orders', 'VIEW', 'View sales orders', 'ACTIVE'),
    ('sales.orders.create', 'Create Sales Orders', 'sales', 'orders', 'CREATE', 'Create sales orders', 'ACTIVE'),
    ('sales.orders.update', 'Update Sales Orders', 'sales', 'orders', 'UPDATE', 'Update sales orders', 'ACTIVE'),
    ('sales.orders.approve', 'Approve Sales Orders', 'sales', 'orders', 'APPROVE', 'Approve sales orders', 'ACTIVE'),
    ('sales.deliveries.view', 'View Deliveries', 'sales', 'deliveries', 'VIEW', 'View sales deliveries', 'ACTIVE'),
    ('sales.deliveries.create', 'Create Deliveries', 'sales', 'deliveries', 'CREATE', 'Create sales deliveries', 'ACTIVE'),
    ('sales.deliveries.update', 'Update Deliveries', 'sales', 'deliveries', 'UPDATE', 'Update sales deliveries', 'ACTIVE'),
    ('sales.deliveries.confirm', 'Confirm Deliveries', 'sales', 'deliveries', 'CONFIRM', 'Confirm sales deliveries', 'ACTIVE'),
    ('sales.invoices.view', 'View Sales Invoices', 'sales', 'invoices', 'VIEW', 'View sales invoices', 'ACTIVE'),
    ('sales.invoices.create', 'Create Sales Invoices', 'sales', 'invoices', 'CREATE', 'Create sales invoices', 'ACTIVE'),
    ('sales.invoices.update', 'Update Sales Invoices', 'sales', 'invoices', 'UPDATE', 'Update sales invoices', 'ACTIVE'),
    ('sales.invoices.post', 'Post Sales Invoices', 'sales', 'invoices', 'POST', 'Post sales invoices', 'ACTIVE'),
    ('sales.returns.view', 'View Sales Returns', 'sales', 'returns', 'VIEW', 'View sales returns', 'ACTIVE'),
    ('sales.returns.create', 'Create Sales Returns', 'sales', 'returns', 'CREATE', 'Create sales returns', 'ACTIVE'),
    ('sales.returns.approve', 'Approve Sales Returns', 'sales', 'returns', 'APPROVE', 'Approve sales returns', 'ACTIVE')
ON CONFLICT (permission_code) DO NOTHING;

-- Grant to ADMIN role
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN' AND p.module = 'sales'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant to SUPER_ADMIN role
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN' AND p.module = 'sales'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- SEED: Demo Data
-- =====================================================
DO $$
DECLARE
    v_company_id UUID;
    v_admin_user UUID := 'd58932c4-f069-48fb-aa03-7b3f162ede0c';
    v_cust1 UUID; v_cust2 UUID; v_cust3 UUID; v_cust4 UUID; v_cust5 UUID;
    v_cust6 UUID; v_cust7 UUID; v_cust8 UUID; v_cust9 UUID; v_cust10 UUID;
    v_item1 UUID; v_item2 UUID; v_item3 UUID;
    v_uom_ea UUID; v_uom_box UUID;
    v_wh1 UUID; v_wh2 UUID;
    v_so1 UUID; v_so2 UUID; v_so3 UUID; v_so4 UUID; v_so5 UUID;
    v_so6 UUID; v_so7 UUID; v_so8 UUID; v_so9 UUID; v_so10 UUID;
    v_inv1 UUID; v_inv2 UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;

    SELECT id INTO v_uom_ea FROM uoms WHERE code = 'EA' LIMIT 1;
    SELECT id INTO v_uom_box FROM uoms WHERE code = 'BOX' LIMIT 1;
    IF v_uom_ea IS NULL THEN SELECT id INTO v_uom_ea FROM uoms LIMIT 1; END IF;

    SELECT id INTO v_wh1 FROM warehouses WHERE company_id = v_company_id LIMIT 1;
    SELECT id INTO v_wh2 FROM warehouses WHERE company_id = v_company_id OFFSET 1 LIMIT 1;
    IF v_wh1 IS NULL THEN
        INSERT INTO warehouses (company_id, warehouse_code, name, status)
        VALUES (v_company_id, 'WH-MAIN-001', 'Main Warehouse', 'ACTIVE')
        ON CONFLICT (warehouse_code, company_id) DO NOTHING
        RETURNING id INTO v_wh1;
    END IF;
    IF v_wh2 IS NULL THEN v_wh2 := v_wh1; END IF;

    -- Create demo customers in erp_sales schema
    INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
    VALUES (v_company_id, 'SC-0001', 'Engineering Solutions Ltd', 'Ali Raza', 'ali.raza@engsol.pk', '+92-21-34567890', 'Karachi', 'Pakistan', 'PKR', 500000, 30, 'Active')
    ON CONFLICT (customer_code) DO NOTHING;
    SELECT id INTO v_cust1 FROM erp_sales.customers WHERE customer_code = 'SC-0001' AND company_id = v_company_id;

    INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
    VALUES (v_company_id, 'SC-0002', 'National Trading Corporation', 'Saira Khan', 'saira@nattrading.pk', '+92-42-37654321', 'Lahore', 'Pakistan', 'PKR', 750000, 45, 'Active')
    ON CONFLICT (customer_code) DO NOTHING;
    SELECT id INTO v_cust2 FROM erp_sales.customers WHERE customer_code = 'SC-0002' AND company_id = v_company_id;

    INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
    VALUES (v_company_id, 'SC-0003', 'TechStart Pakistan Pvt Ltd', 'Bilal Ahmed', 'bilal@techstart.pk', '+92-51-23456789', 'Islamabad', 'Pakistan', 'PKR', 300000, 30, 'Active')
    ON CONFLICT (customer_code) DO NOTHING;
    SELECT id INTO v_cust3 FROM erp_sales.customers WHERE customer_code = 'SC-0003' AND company_id = v_company_id;

    INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
    VALUES (v_company_id, 'SC-0004', 'Metro Wholesale Market', 'Usman Malik', 'usman@metrowholesale.pk', '+92-21-38765432', 'Karachi', 'Pakistan', 'PKR', 1000000, 60, 'Active')
    ON CONFLICT (customer_code) DO NOTHING;
    SELECT id INTO v_cust4 FROM erp_sales.customers WHERE customer_code = 'SC-0004' AND company_id = v_company_id;

    INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
    VALUES (v_company_id, 'SC-0005', 'Green Valley Industries', 'Fatima Shah', 'fatima@greenvalley.pk', '+92-42-36547890', 'Lahore', 'Pakistan', 'PKR', 450000, 30, 'Active')
    ON CONFLICT (customer_code) DO NOTHING;
    SELECT id INTO v_cust5 FROM erp_sales.customers WHERE customer_code = 'SC-0005' AND company_id = v_company_id;

    INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
    VALUES (v_company_id, 'SC-0006', 'Blue Star Electronics', 'Omar Farooq', 'omar@bluestar.pk', '+92-21-35678901', 'Karachi', 'Pakistan', 'PKR', 100000, 0, 'Active')
    ON CONFLICT (customer_code) DO NOTHING;
    SELECT id INTO v_cust6 FROM erp_sales.customers WHERE customer_code = 'SC-0006' AND company_id = v_company_id;

    INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
    VALUES (v_company_id, 'SC-0007', 'Frontier Construction Co', 'Zahid Hussain', 'zahid@frontierconst.pk', '+92-91-23456789', 'Peshawar', 'Pakistan', 'PKR', 2000000, 90, 'Active')
    ON CONFLICT (customer_code) DO NOTHING;
    SELECT id INTO v_cust7 FROM erp_sales.customers WHERE customer_code = 'SC-0007' AND company_id = v_company_id;

    INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
    VALUES (v_company_id, 'SC-0008', 'Sindh Textile Mills', 'Ayesha Noor', 'ayesha@sindhtextile.pk', '+92-21-39876543', 'Karachi', 'Pakistan', 'PKR', 600000, 45, 'Active')
    ON CONFLICT (customer_code) DO NOTHING;
    SELECT id INTO v_cust8 FROM erp_sales.customers WHERE customer_code = 'SC-0008' AND company_id = v_company_id;

    INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
    VALUES (v_company_id, 'SC-0009', 'Pakistan Dairy Products', 'Hassan Ali', 'hassan@pakdairy.pk', '+92-42-38765433', 'Lahore', 'Pakistan', 'PKR', 350000, 30, 'Active')
    ON CONFLICT (customer_code) DO NOTHING;
    SELECT id INTO v_cust9 FROM erp_sales.customers WHERE customer_code = 'SC-0009' AND company_id = v_company_id;

    INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
    VALUES (v_company_id, 'SC-0010', 'Kabul Export House', 'Ahmad Wali', 'ahmad@kabulexport.af', '+93-700-123456', 'Kabul', 'Afghanistan', 'USD', 50000, 60, 'Active')
    ON CONFLICT (customer_code) DO NOTHING;
    SELECT id INTO v_cust10 FROM erp_sales.customers WHERE customer_code = 'SC-0010' AND company_id = v_company_id;

    -- Use existing items or create minimal ones for demo
    SELECT id INTO v_item1 FROM items WHERE company_id = v_company_id AND is_sellable = true LIMIT 1;
    IF v_item1 IS NULL THEN
        INSERT INTO items (company_id, item_code, name, base_uom_id, selling_price, is_sellable, track_inventory, status)
        VALUES (v_company_id, 'SLD-0001', 'Industrial Widget', v_uom_ea, 2500.0000, true, true, 'ACTIVE')
        ON CONFLICT (item_code, company_id) DO NOTHING;
        SELECT id INTO v_item1 FROM items WHERE item_code = 'SLD-0001' AND company_id = v_company_id;
    END IF;

    SELECT id INTO v_item2 FROM items WHERE company_id = v_company_id AND is_sellable = true OFFSET 1 LIMIT 1;
    IF v_item2 IS NULL OR v_item2 = v_item1 THEN
        INSERT INTO items (company_id, item_code, name, base_uom_id, selling_price, is_sellable, track_inventory, status)
        VALUES (v_company_id, 'SLD-0002', 'Premium Component Kit', v_uom_box, 15000.0000, true, true, 'ACTIVE')
        ON CONFLICT (item_code, company_id) DO NOTHING;
        SELECT id INTO v_item2 FROM items WHERE item_code = 'SLD-0002' AND company_id = v_company_id;
    END IF;

    SELECT id INTO v_item3 FROM items WHERE company_id = v_company_id AND is_sellable = true OFFSET 2 LIMIT 1;
    IF v_item3 IS NULL OR v_item3 IN (v_item1, v_item2) THEN
        INSERT INTO items (company_id, item_code, name, base_uom_id, selling_price, is_sellable, track_inventory, status)
        VALUES (v_company_id, 'SLD-0003', 'Specialty Fastener Pack', v_uom_ea, 450.0000, true, true, 'ACTIVE')
        ON CONFLICT (item_code, company_id) DO NOTHING;
        SELECT id INTO v_item3 FROM items WHERE item_code = 'SLD-0003' AND company_id = v_company_id;
    END IF;

    -- Ensure at least 3 distinct items
    IF v_item2 IS NULL OR v_item2 = v_item1 THEN v_item2 := v_item1; END IF;
    IF v_item3 IS NULL OR v_item3 IN (v_item1, v_item2) THEN v_item3 := v_item1; END IF;

    -- 10 Quotations
    INSERT INTO erp_sales.quotations (company_id, quotation_number, customer_id, quotation_date, valid_until, currency, subtotal, discount_amount, tax_amount, total_amount, status, notes)
    VALUES
        (v_company_id, 'QT-2026-00001', v_cust1, '2026-07-01', '2026-08-01', 'PKR', 250000, 12500, 45000, 282500, 'Accepted', 'Bulk order for engineering parts'),
        (v_company_id, 'QT-2026-00002', v_cust2, '2026-07-05', '2026-08-05', 'PKR', 450000, 22500, 81000, 508500, 'Sent', 'Quarterly supply quotation'),
        (v_company_id, 'QT-2026-00003', v_cust3, '2026-07-10', '2026-08-10', 'PKR', 120000, 0, 21600, 141600, 'Accepted', 'IT equipment supply'),
        (v_company_id, 'QT-2026-00004', v_cust4, '2026-07-12', '2026-08-12', 'PKR', 800000, 80000, 129600, 849600, 'Draft', 'Wholesale bulk quote'),
        (v_company_id, 'QT-2026-00005', v_cust5, '2026-07-15', '2026-08-15', 'PKR', 320000, 16000, 54720, 358720, 'Sent', 'Industrial components'),
        (v_company_id, 'QT-2026-00006', v_cust6, '2026-07-18', '2026-08-18', 'PKR', 75000, 3750, 12825, 84075, 'Rejected', 'Small retail order - declined'),
        (v_company_id, 'QT-2026-00007', v_cust7, '2026-07-20', '2026-08-20', 'PKR', 1500000, 75000, 256500, 1681500, 'Accepted', 'Construction project supply'),
        (v_company_id, 'QT-2026-00008', v_cust8, '2026-07-22', '2026-08-22', 'PKR', 560000, 28000, 96480, 628480, 'Sent', 'Textile mill supply'),
        (v_company_id, 'QT-2026-00009', v_cust9, '2026-07-25', '2026-08-25', 'PKR', 200000, 10000, 34200, 224200, 'Draft', 'Dairy equipment parts'),
        (v_company_id, 'QT-2026-00010', v_cust10, '2026-07-28', '2026-08-28', 'USD', 15000, 750, 0, 14250, 'Accepted', 'Cross-border export order')
    ON CONFLICT (quotation_number) DO NOTHING;

    -- 10 Sales Orders
    INSERT INTO erp_sales.sales_orders (company_id, order_number, customer_id, quotation_id, order_date, delivery_date, currency, subtotal, discount_amount, tax_amount, total_amount, status, notes)
    SELECT v_company_id, so.order_num, so.cust_id, NULL, so.order_date, so.del_date, 'PKR', so.subtotal, so.discount, so.tax, so.total, so.status, so.notes
    FROM (VALUES
        ('SO-2026-00001', v_cust1, '2026-07-03'::date, '2026-07-20'::date, 250000, 12500, 45000, 282500, 'Confirmed', 'Confirmed order from QT-001'),
        ('SO-2026-00002', v_cust2, '2026-07-08'::date, '2026-07-25'::date, 450000, 22500, 81000, 508500, 'Processing', 'Processing quarterly supply'),
        ('SO-2026-00003', v_cust3, '2026-07-12'::date, '2026-07-28'::date, 120000, 0, 21600, 141600, 'Shipped', 'IT equipment dispatched'),
        ('SO-2026-00004', v_cust4, '2026-07-15'::date, '2026-08-01'::date, 800000, 80000, 129600, 849600, 'Draft', 'Pending approval for bulk'),
        ('SO-2026-00005', v_cust5, '2026-07-18'::date, '2026-08-05'::date, 320000, 16000, 54720, 358720, 'Confirmed', 'Industrial components order'),
        ('SO-2026-00006', v_cust7, '2026-07-22'::date, '2026-08-10'::date, 1500000, 75000, 256500, 1681500, 'Delivered', 'Construction project delivered'),
        ('SO-2026-00007', v_cust8, '2026-07-25'::date, '2026-08-12'::date, 560000, 28000, 96480, 628480, 'Confirmed', 'Textile mill order'),
        ('SO-2026-00008', v_cust10, '2026-07-28'::date, '2026-08-15'::date, 15000, 750, 0, 14250, 'Shipped', 'Export order shipped'),
        ('SO-2026-00009', v_cust1, '2026-08-01'::date, '2026-08-20'::date, 180000, 9000, 32400, 203400, 'Processing', 'Repeat order'),
        ('SO-2026-00010', v_cust9, '2026-08-05'::date, '2026-08-25'::date, 200000, 10000, 34200, 224200, 'Draft', 'New dairy equipment order')
    ) AS so(order_num, cust_id, order_date, del_date, subtotal, discount, tax, total, status, notes)
    ON CONFLICT (order_number) DO NOTHING;

    -- Get SO IDs for deliveries/invoices
    SELECT id INTO v_so1 FROM erp_sales.sales_orders WHERE order_number = 'SO-2026-00001' AND company_id = v_company_id;
    SELECT id INTO v_so2 FROM erp_sales.sales_orders WHERE order_number = 'SO-2026-00002' AND company_id = v_company_id;
    SELECT id INTO v_so3 FROM erp_sales.sales_orders WHERE order_number = 'SO-2026-00003' AND company_id = v_company_id;
    SELECT id INTO v_so6 FROM erp_sales.sales_orders WHERE order_number = 'SO-2026-00006' AND company_id = v_company_id;
    SELECT id INTO v_so8 FROM erp_sales.sales_orders WHERE order_number = 'SO-2026-00008' AND company_id = v_company_id;

    -- 10 Deliveries
    INSERT INTO erp_sales.sales_deliveries (company_id, delivery_number, sales_order_id, customer_id, delivery_date, warehouse_id, subtotal, tax_amount, total_amount, status, notes)
    VALUES
        (v_company_id, 'DN-2026-00001', v_so1, v_cust1, '2026-07-18', v_wh1, 250000, 45000, 295000, 'Delivered', 'First delivery completed'),
        (v_company_id, 'DN-2026-00002', v_so2, v_cust2, '2026-07-22', v_wh1, 225000, 40500, 265500, 'Shipped', 'Partial shipment'),
        (v_company_id, 'DN-2026-00003', v_so3, v_cust3, '2026-07-26', v_wh2, 120000, 21600, 141600, 'Delivered', 'IT equipment delivered'),
        (v_company_id, 'DN-2026-00004', v_so6, v_cust7, '2026-08-05', v_wh1, 1500000, 256500, 1756500, 'Delivered', 'Full construction supply'),
        (v_company_id, 'DN-2026-00005', v_so8, v_cust10, '2026-08-10', v_wh2, 15000, 0, 15000, 'Shipped', 'Export shipment in transit'),
        (v_company_id, 'DN-2026-00006', v_so1, v_cust1, '2026-07-25', v_wh1, 0, 0, 0, 'Draft', 'Second delivery pending'),
        (v_company_id, 'DN-2026-00007', v_so2, v_cust2, '2026-07-30', v_wh1, 225000, 40500, 265500, 'Shipped', 'Second partial shipment'),
        (v_company_id, 'DN-2026-00008', v_so6, v_cust7, '2026-08-08', v_wh1, 0, 0, 0, 'Draft', 'Remaining items pending'),
        (v_company_id, 'DN-2026-00009', v_so3, v_cust3, '2026-08-01', v_wh2, 60000, 10800, 70800, 'Confirmed', 'Additional items confirmed'),
        (v_company_id, 'DN-2026-00010', v_so8, v_cust10, '2026-08-12', v_wh2, 15000, 0, 15000, 'Delivered', 'Export delivery confirmed')
    ON CONFLICT (delivery_number) DO NOTHING;

    -- 10 Invoices
    INSERT INTO erp_sales.sales_invoices (company_id, invoice_no, sales_order_id, customer_id, invoice_date, due_date, subtotal, discount_amount, tax_amount, total_amount, paid_amount, status)
    SELECT v_company_id, inv.inv_no, inv.so_id, inv.cust_id, inv.inv_date, inv.due_date, inv.subtotal, inv.discount, inv.tax, inv.total, inv.paid, inv.status
    FROM (VALUES
        ('SI-2026-00001', v_so1, v_cust1, '2026-07-20'::date, '2026-08-19'::date, 250000, 12500, 45000, 282500, 282500, 'Paid'),
        ('SI-2026-00002', v_so2, v_cust2, '2026-07-25'::date, '2026-09-08'::date, 225000, 11250, 40500, 254250, 0, 'Pending'),
        ('SI-2026-00003', v_so3, v_cust3, '2026-07-28'::date, '2026-08-27'::date, 120000, 0, 21600, 141600, 141600, 'Paid'),
        ('SI-2026-00004', v_so6, v_cust7, '2026-08-08'::date, '2026-11-06'::date, 1500000, 75000, 256500, 1681500, 500000, 'Partial'),
        ('SI-2026-00005', v_so8, v_cust10, '2026-08-12'::date, '2026-10-11'::date, 15000, 750, 0, 14250, 0, 'Pending'),
        ('SI-2026-00006', v_so1, v_cust1, '2026-07-28'::date, '2026-08-27'::date, 0, 0, 0, 0, 0, 'Draft'),
        ('SI-2026-00007', v_so2, v_cust2, '2026-08-01'::date, '2026-09-15'::date, 225000, 11250, 40500, 254250, 100000, 'Partial'),
        ('SI-2026-00008', v_so6, v_cust7, '2026-08-12'::date, '2026-11-10'::date, 0, 0, 0, 0, 0, 'Draft'),
        ('SI-2026-00009', v_so3, v_cust3, '2026-08-05'::date, '2026-09-04'::date, 60000, 0, 10800, 70800, 0, 'Pending'),
        ('SI-2026-00010', v_so8, v_cust10, '2026-08-15'::date, '2026-10-14'::date, 15000, 750, 0, 14250, 14250, 'Paid')
    ) AS inv(inv_no, so_id, cust_id, inv_date, due_date, subtotal, discount, tax, total, paid, status)
    ON CONFLICT (invoice_no) DO NOTHING;

    -- Get invoice IDs for returns
    SELECT id INTO v_inv1 FROM erp_sales.sales_invoices WHERE invoice_no = 'SI-2026-00003' AND company_id = v_company_id;
    SELECT id INTO v_inv2 FROM erp_sales.sales_invoices WHERE invoice_no = 'SI-2026-00001' AND company_id = v_company_id;

    -- 10 Returns (mix of statuses)
    INSERT INTO erp_sales.sales_returns (company_id, return_number, sales_order_id, sales_invoice_id, customer_id, return_date, reason, subtotal, tax_amount, total_amount, status, notes)
    VALUES
        (v_company_id, 'SR-2026-00001', v_so3, v_inv1, v_cust3, '2026-08-02', 'Defective item - 2 units', 5000, 900, 5900, 'Received', '2 defective widgets returned'),
        (v_company_id, 'SR-2026-00002', v_so1, v_inv2, v_cust1, '2026-08-05', 'Wrong item shipped', 12500, 2250, 14750, 'Approved', 'Wrong part number delivered'),
        (v_company_id, 'SR-2026-00003', v_so2, NULL, v_cust2, '2026-08-08', 'Excess quantity received', 30000, 5400, 35400, 'Draft', 'Customer received 10 extra units'),
        (v_company_id, 'SR-2026-00004', v_so6, v_inv1, v_cust7, '2026-08-10', 'Damaged in transit', 75000, 12600, 87600, 'Refunded', 'Full refund for damaged goods'),
        (v_company_id, 'SR-2026-00005', v_so8, v_inv2, v_cust10, '2026-08-12', 'Quality issue', 3000, 0, 3000, 'Received', 'Quality inspection failed'),
        (v_company_id, 'SR-2026-00006', v_so3, NULL, v_cust3, '2026-08-15', 'Exchange request', 8000, 1440, 9440, 'Draft', 'Customer wants different model'),
        (v_company_id, 'SR-2026-00007', v_so1, v_inv2, v_cust1, '2026-08-18', 'Overstock return', 20000, 3600, 23600, 'Approved', 'Excess inventory return'),
        (v_company_id, 'SR-2026-00008', v_so2, NULL, v_cust2, '2026-08-20', 'Specification mismatch', 15000, 2700, 17700, 'Cancelled', 'Return cancelled - customer kept items'),
        (v_company_id, 'SR-2026-00009', v_so6, v_inv1, v_cust7, '2026-08-22', 'Partial delivery return', 45000, 7650, 52650, 'Received', 'Partial return from large order'),
        (v_company_id, 'SR-2026-00010', v_so8, v_inv2, v_cust10, '2026-08-25', 'Export compliance issue', 7500, 0, 7500, 'Draft', 'Documentation issue')
    ON CONFLICT (return_number) DO NOTHING;

    RAISE NOTICE 'Sales demo data seeded successfully';
END $$;
