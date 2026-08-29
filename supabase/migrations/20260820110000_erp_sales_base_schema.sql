-- ERP Sales Base Schema (created before the sales module migration)
-- Migration: 20260820110000_erp_sales_base_schema.sql
-- Creates the erp_sales schema and base tables that the sales module
-- migration (20260820120000) depends on. Idempotent.

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
    credit_days INTEGER DEFAULT 0,
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
    delivery_date TIMESTAMP WITH TIME ZONE,
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
    customer_id UUID,
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sales_quotation_company ON erp_sales.quotations(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_quotation_customer ON erp_sales.quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_company ON erp_sales.sales_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_customer ON erp_sales.sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_company ON erp_sales.sales_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_order ON erp_sales.sales_invoices(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_soi_order ON erp_sales.sales_order_items(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_qi_quotation ON erp_sales.quotation_items(quotation_id);