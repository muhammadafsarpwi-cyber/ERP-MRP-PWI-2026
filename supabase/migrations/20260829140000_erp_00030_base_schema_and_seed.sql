-- ERP Base Schema & Demo User Seed Migration
-- Migration: 20260829140000_erp_00030_base_schema_and_seed.sql
-- Purpose:
--   1. Create erp_sales base tables (referenced by sales module but never created
--      in the migration chain) - idempotent, matches live DB schema
--   2. Seed demo erp_users so demo workflows have actors and created_by is populated

-- =====================================================
-- PART 1: erp_sales base schema (idempotent)
-- =====================================================
CREATE SCHEMA IF NOT EXISTS erp_sales;

-- erp_sales.customers
CREATE TABLE IF NOT EXISTS erp_sales.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID,
    customer_code VARCHAR(50),
    customer_type VARCHAR(20),
    company_name VARCHAR(255),
    contact_person VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(30),
    address VARCHAR(500),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(20),
    tax_id VARCHAR(100),
    credit_limit DECIMAL(15,2),
    payment_terms VARCHAR(100),
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(customer_code)
);

-- erp_sales.quotations
CREATE TABLE IF NOT EXISTS erp_sales.quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID,
    quotation_number VARCHAR(50),
    customer_id UUID,
    quotation_date TIMESTAMP WITH TIME ZONE,
    valid_until TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'DRAFT',
    subtotal DECIMAL(15,2) DEFAULT 0,
    discount_amount DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    notes TEXT,
    UNIQUE(quotation_number)
);

-- erp_sales.quotation_items
CREATE TABLE IF NOT EXISTS erp_sales.quotation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    quotation_id UUID,
    line_number INTEGER,
    item_id UUID,
    description TEXT,
    quantity DECIMAL(15,4) DEFAULT 0,
    uom_id UUID,
    unit_price DECIMAL(15,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    line_total DECIMAL(15,2) DEFAULT 0,
    delivery_date TIMESTAMP WITH TIME ZONE
);

-- erp_sales.sales_orders
CREATE TABLE IF NOT EXISTS erp_sales.sales_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID,
    order_number VARCHAR(50),
    customer_id UUID,
    quotation_id UUID,
    order_date TIMESTAMP WITH TIME ZONE,
    expected_delivery_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'Draft',
    subtotal DECIMAL(15,2) DEFAULT 0,
    discount_amount DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    notes TEXT,
    UNIQUE(order_number)
);

-- erp_sales.sales_order_items
CREATE TABLE IF NOT EXISTS erp_sales.sales_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sales_order_id UUID,
    line_number INTEGER,
    item_id UUID,
    description TEXT,
    quantity DECIMAL(15,4) DEFAULT 0,
    shipped_quantity DECIMAL(15,4) DEFAULT 0,
    uom_id UUID,
    unit_price DECIMAL(15,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    line_total DECIMAL(15,2) DEFAULT 0,
    delivery_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'ACTIVE'
);

-- erp_sales.sales_invoices
CREATE TABLE IF NOT EXISTS erp_sales.sales_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID,
    invoice_no VARCHAR(50),
    sales_order_id UUID,
    invoice_date TIMESTAMP WITH TIME ZONE,
    due_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'Draft',
    subtotal DECIMAL(15,2) DEFAULT 0,
    discount_amount DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    paid_amount DECIMAL(15,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    notes TEXT,
    UNIQUE(invoice_no)
);

-- Foreign keys for erp_sales (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_sales_quotation_customer') THEN
    ALTER TABLE erp_sales.quotations ADD CONSTRAINT fk_sales_quotation_customer FOREIGN KEY (customer_id) REFERENCES erp_sales.customers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_sales_quotation_items_quotation') THEN
    ALTER TABLE erp_sales.quotation_items ADD CONSTRAINT fk_sales_quotation_items_quotation FOREIGN KEY (quotation_id) REFERENCES erp_sales.quotations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_sales_order_customer') THEN
    ALTER TABLE erp_sales.sales_orders ADD CONSTRAINT fk_sales_order_customer FOREIGN KEY (customer_id) REFERENCES erp_sales.customers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_sales_order_items_order') THEN
    ALTER TABLE erp_sales.sales_order_items ADD CONSTRAINT fk_sales_order_items_order FOREIGN KEY (sales_order_id) REFERENCES erp_sales.sales_orders(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_sales_invoice_order') THEN
    ALTER TABLE erp_sales.sales_invoices ADD CONSTRAINT fk_sales_invoice_order FOREIGN KEY (sales_order_id) REFERENCES erp_sales.sales_orders(id);
  END IF;
END $$;

-- Indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_sales_quotation_company ON erp_sales.quotations(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_quotation_customer ON erp_sales.quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_company ON erp_sales.sales_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_customer ON erp_sales.sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_company ON erp_sales.sales_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_order ON erp_sales.sales_invoices(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_soi_order ON erp_sales.sales_order_items(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_qi_quotation ON erp_sales.quotation_items(quotation_id);

-- =====================================================
-- PART 2: Demo erp_users (safe demo identities, no real credentials)
-- =====================================================
-- These users map to auth.users created out-of-band in Supabase.
-- The demo identity user_id values are stable so workflow seeds can reference them.

INSERT INTO public.erp_users (id, auth_user_id, email, username, display_name, default_company_id, status, is_active)
VALUES
  ('52e0c38e-2b29-47ca-9fa5-30dcbadea734', '5783fb36-a11c-4707-aa9e-01a93ffa4abc', 'dev@erp-local.test', 'Admin', 'ERP Admin', '7725aa04-a270-4314-9e82-90949cbe7791', 'ACTIVE', true),
  ('cc1a56cf-07af-487a-8a67-e6859292894b', '5205a16e-1f34-442b-ac33-d85e740081bc', 'admin@erp.com', 'super_admim', 'Super Admin', '7725aa04-a270-4314-9e82-90949cbe7791', 'ACTIVE', true),
  ('0804af57-1f03-4d11-ad84-dc34f8829db1', 'ddde0718-1ce6-4394-a075-a599e77de28e', 'system.admin@erp.com', 'system.admin', 'System Admin', '7725aa04-a270-4314-9e82-90949cbe7791', 'ACTIVE', true),
  ('b197d6d1-4911-429c-b0b8-3cc440e433ce', '36e816a9-b7a9-4e9d-9fb9-0c20270aec89', 'muhammadafsarpwi@gmail.com', 'muhammadafsarpwi', 'Muhammad Afsar', '7725aa04-a270-4314-9e82-90949cbe7791', 'ACTIVE', true)
ON CONFLICT (id) DO NOTHING;

-- Assign demo users to SUPER_ADMIN + Production roles (idempotent)
INSERT INTO public.user_roles (user_id, role_id, status, is_active)
SELECT eu.id, r.id, 'ACTIVE', true
FROM public.erp_users eu CROSS JOIN public.roles r
WHERE eu.id IN ('52e0c38e-2b29-47ca-9fa5-30dcbadea734','cc1a56cf-07af-487a-8a67-e6859292894b','0804af57-1f03-4d11-ad84-dc34f8829db1','b197d6d1-4911-429c-b0b8-3cc440e433ce')
  AND r.role_code = 'SUPER_ADMIN'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Assign company scope to demo users (idempotent via NOT EXISTS)
INSERT INTO public.user_organization_scopes (user_id, company_id, scope_level, is_full_scope, status, is_active)
SELECT eu.id, '7725aa04-a270-4314-9e82-90949cbe7791', 'COMPANY', true, 'ACTIVE', true
FROM public.erp_users eu
WHERE eu.id IN ('52e0c38e-2b29-47ca-9fa5-30dcbadea734','cc1a56cf-07af-487a-8a67-e6859292894b','0804af57-1f03-4d11-ad84-dc34f8829db1','b197d6d1-4911-429c-b0b8-3cc440e433ce')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_organization_scopes s
    WHERE s.user_id = eu.id AND s.company_id = '7725aa04-a270-4314-9e82-90949cbe7791'
      AND s.division_id IS NULL AND s.section_id IS NULL AND s.department_id IS NULL
  );