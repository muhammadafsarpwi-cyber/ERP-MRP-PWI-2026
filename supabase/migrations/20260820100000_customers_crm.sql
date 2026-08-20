-- Supabase Migration: Customers & CRM Module
-- Migration: 20260820100000_customers_crm.sql
-- Description: Creates customers table with CRM fields, customer contacts, customer addresses, permissions, and demo data

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CUSTOMERS TABLE
-- Master data for customers with CRM fields
-- =====================================================
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    customer_code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(100),
    customer_type VARCHAR(20) DEFAULT 'WHOLESALE'
        CHECK (customer_type IN ('RETAIL', 'WHOLESALE', 'DISTRIBUTOR', 'GOVERNMENT', 'CORPORATE')),
    contact_person VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    fax VARCHAR(50),
    website VARCHAR(255),
    tax_number VARCHAR(100),
    registration_number VARCHAR(100),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    currency_code VARCHAR(3) DEFAULT 'PKR',
    payment_terms VARCHAR(50),
    credit_limit DECIMAL(15, 4) DEFAULT 0,
    credit_days INTEGER DEFAULT 0,
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    customer_tier VARCHAR(20) DEFAULT 'BRONZE'
        CHECK (customer_tier IN ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM')),
    lead_source VARCHAR(50)
        CHECK (lead_source IS NULL OR lead_source IN ('WEBSITE', 'REFERRAL', 'TRADE_SHOW', 'COLD_CALL', 'SOCIAL_MEDIA', 'ADVERTISEMENT', 'OTHER')),
    assigned_to UUID,
    last_contact_date DATE,
    next_follow_up_date DATE,
    total_orders INTEGER DEFAULT 0,
    total_revenue DECIMAL(15, 4) DEFAULT 0,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLACKLISTED', 'LEAD')),
    UNIQUE(customer_code, company_id)
);

-- Indexes for customers
CREATE INDEX IF NOT EXISTS idx_customers_company_id ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_customers_customer_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_customer_type ON customers(customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_customer_tier ON customers(customer_tier);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_assigned_to ON customers(assigned_to);
CREATE INDEX IF NOT EXISTS idx_customers_created_by ON customers(created_by);
CREATE INDEX IF NOT EXISTS idx_customers_next_follow_up_date ON customers(next_follow_up_date);

-- =====================================================
-- CUSTOMER CONTACTS TABLE
-- Multiple contacts per customer
-- =====================================================
CREATE TABLE IF NOT EXISTS customer_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    job_title VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    mobile VARCHAR(50),
    is_primary BOOLEAN DEFAULT false,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE'
);

-- Indexes for customer_contacts
CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer_id ON customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_is_primary ON customer_contacts(is_primary);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_status ON customer_contacts(status);

-- =====================================================
-- CUSTOMER ADDRESSES TABLE
-- Multiple addresses per customer (billing, shipping, etc.)
-- =====================================================
CREATE TABLE IF NOT EXISTS customer_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    address_type VARCHAR(20) DEFAULT 'SHIPPING'
        CHECK (address_type IN ('BILLING', 'SHIPPING', 'BOTH')),
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    is_default BOOLEAN DEFAULT false,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE'
);

-- Indexes for customer_addresses
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_address_type ON customer_addresses(address_type);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_is_default ON customer_addresses(is_default);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_status ON customer_addresses(status);

-- =====================================================
-- TRIGGERS: Auto-update updated_at timestamp
-- =====================================================
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customer_contacts_updated_at ON customer_contacts;
CREATE TRIGGER update_customer_contacts_updated_at BEFORE UPDATE ON customer_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customer_addresses_updated_at ON customer_addresses;
CREATE TRIGGER update_customer_addresses_updated_at BEFORE UPDATE ON customer_addresses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SEED DATA: Permissions - Customer Module
-- =====================================================
INSERT INTO permissions (permission_code, name, module, resource, action, description, status) VALUES
    ('customer.customer.create', 'Create Customer', 'customer', 'customer', 'CREATE', 'Create new customers', 'ACTIVE'),
    ('customer.customer.view', 'View Customers', 'customer', 'customer', 'VIEW', 'View customers list and details', 'ACTIVE'),
    ('customer.customer.update', 'Update Customer', 'customer', 'customer', 'UPDATE', 'Update customer information', 'ACTIVE'),
    ('customer.customer.delete', 'Delete Customer', 'customer', 'customer', 'DELETE', 'Soft delete customers', 'ACTIVE'),
    ('customer.contact.create', 'Create Customer Contact', 'customer', 'contact', 'CREATE', 'Create customer contacts', 'ACTIVE'),
    ('customer.contact.view', 'View Customer Contacts', 'customer', 'contact', 'VIEW', 'View customer contacts', 'ACTIVE'),
    ('customer.contact.update', 'Update Customer Contact', 'customer', 'contact', 'UPDATE', 'Update customer contacts', 'ACTIVE'),
    ('customer.contact.delete', 'Delete Customer Contact', 'customer', 'contact', 'DELETE', 'Delete customer contacts', 'ACTIVE'),
    ('customer.address.create', 'Create Customer Address', 'customer', 'address', 'CREATE', 'Create customer addresses', 'ACTIVE'),
    ('customer.address.view', 'View Customer Addresses', 'customer', 'address', 'VIEW', 'View customer addresses', 'ACTIVE'),
    ('customer.address.update', 'Update Customer Address', 'customer', 'address', 'UPDATE', 'Update customer addresses', 'ACTIVE'),
    ('customer.address.delete', 'Delete Customer Address', 'customer', 'address', 'DELETE', 'Delete customer addresses', 'ACTIVE')
ON CONFLICT (permission_code) DO NOTHING;

-- =====================================================
-- SEED DATA: Assign customer permissions to ADMIN role
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN' AND p.module = 'customer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- SEED DATA: 10 Demo Customers
-- Uses the confirmed company_id from companies table
-- =====================================================
DO $$
DECLARE
    v_company_id UUID;
    v_admin_user UUID := 'd58932c4-f069-48fb-aa03-7b3f162ede0c';
BEGIN
    -- Get the existing company ID
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN
        RAISE NOTICE 'No company found - skipping customer seed data';
        RETURN;
    END IF;

    -- Customer 1: Engineering Solutions
    INSERT INTO customers (company_id, customer_code, name, short_name, customer_type, contact_person, email, phone, city, state, country, currency_code, payment_terms, credit_limit, credit_days, discount_percent, customer_tier, lead_source, status)
    VALUES (v_company_id, 'CUST-0001', 'Engineering Solutions Ltd', 'EngSol', 'CORPORATE', 'Ali Raza', 'ali.raza@engsol.pk', '+92-21-34567890', 'Karachi', 'Sindh', 'Pakistan', 'PKR', 'NET30', 500000.0000, 30, 5.00, 'GOLD', 'REFERRAL', 'ACTIVE')
    ON CONFLICT (customer_code, company_id) DO NOTHING;

    -- Customer 2: National Trading Corp
    INSERT INTO customers (company_id, customer_code, name, short_name, customer_type, contact_person, email, phone, city, state, country, currency_code, payment_terms, credit_limit, credit_days, discount_percent, customer_tier, lead_source, status)
    VALUES (v_company_id, 'CUST-0002', 'National Trading Corporation', 'NatTrd', 'WHOLESALE', 'Saira Khan', 'saira@nattrading.pk', '+92-42-37654321', 'Lahore', 'Punjab', 'Pakistan', 'PKR', 'NET45', 750000.0000, 45, 7.50, 'PLATINUM', 'TRADE_SHOW', 'ACTIVE')
    ON CONFLICT (customer_code, company_id) DO NOTHING;

    -- Customer 3: TechStart Pakistan
    INSERT INTO customers (company_id, customer_code, name, short_name, customer_type, contact_person, email, phone, city, state, country, currency_code, payment_terms, credit_limit, credit_days, discount_percent, customer_tier, lead_source, status)
    VALUES (v_company_id, 'CUST-0003', 'TechStart Pakistan Pvt Ltd', 'TechStart', 'CORPORATE', 'Bilal Ahmed', 'bilal@techstart.pk', '+92-51-23456789', 'Islamabad', 'ICT', 'Pakistan', 'PKR', 'NET30', 300000.0000, 30, 3.00, 'SILVER', 'WEBSITE', 'ACTIVE')
    ON CONFLICT (customer_code, company_id) DO NOTHING;

    -- Customer 4: Metro Wholesale Market
    INSERT INTO customers (company_id, customer_code, name, short_name, customer_type, contact_person, email, phone, city, state, country, currency_code, payment_terms, credit_limit, credit_days, discount_percent, customer_tier, lead_source, status)
    VALUES (v_company_id, 'CUST-0004', 'Metro Wholesale Market', 'MetroWh', 'WHOLESALE', 'Usman Malik', 'usman@metrowholesale.pk', '+92-21-38765432', 'Karachi', 'Sindh', 'Pakistan', 'PKR', 'NET60', 1000000.0000, 60, 10.00, 'PLATINUM', 'COLD_CALL', 'ACTIVE')
    ON CONFLICT (customer_code, company_id) DO NOTHING;

    -- Customer 5: Green Valley Industries
    INSERT INTO customers (company_id, customer_code, name, short_name, customer_type, contact_person, email, phone, city, state, country, currency_code, payment_terms, credit_limit, credit_days, discount_percent, customer_tier, lead_source, status)
    VALUES (v_company_id, 'CUST-0005', 'Green Valley Industries', 'GrnVal', 'CORPORATE', 'Fatima Shah', 'fatima@greenvalley.pk', '+92-42-36547890', 'Lahore', 'Punjab', 'Pakistan', 'PKR', 'NET30', 450000.0000, 30, 4.00, 'GOLD', 'SOCIAL_MEDIA', 'ACTIVE')
    ON CONFLICT (customer_code, company_id) DO NOTHING;

    -- Customer 6: Blue Star Electronics
    INSERT INTO customers (company_id, customer_code, name, short_name, customer_type, contact_person, email, phone, city, state, country, currency_code, payment_terms, credit_limit, credit_days, discount_percent, customer_tier, lead_source, status)
    VALUES (v_company_id, 'CUST-0006', 'Blue Star Electronics', 'BlueStar', 'RETAIL', 'Omar Farooq', 'omar@bluestar.pk', '+92-21-35678901', 'Karachi', 'Sindh', 'Pakistan', 'PKR', 'COD', 100000.0000, 0, 2.00, 'BRONZE', 'ADVERTISEMENT', 'ACTIVE')
    ON CONFLICT (customer_code, company_id) DO NOTHING;

    -- Customer 7: Frontier Construction Co
    INSERT INTO customers (company_id, customer_code, name, short_name, customer_type, contact_person, email, phone, city, state, country, currency_code, payment_terms, credit_limit, credit_days, discount_percent, customer_tier, lead_source, status)
    VALUES (v_company_id, 'CUST-0007', 'Frontier Construction Company', 'FntConst', 'GOVERNMENT', 'Zahid Hussain', 'zahid@frontierconst.pk', '+92-91-23456789', 'Peshawar', 'KPK', 'Pakistan', 'PKR', 'NET90', 2000000.0000, 90, 8.00, 'PLATINUM', 'REFERRAL', 'ACTIVE')
    ON CONFLICT (customer_code, company_id) DO NOTHING;

    -- Customer 8: Sindh Textile Mills
    INSERT INTO customers (company_id, customer_code, name, short_name, customer_type, contact_person, email, phone, city, state, country, currency_code, payment_terms, credit_limit, credit_days, discount_percent, customer_tier, lead_source, status)
    VALUES (v_company_id, 'CUST-0008', 'Sindh Textile Mills', 'SndTxtl', 'WHOLESALE', 'Ayesha Noor', 'ayesha@sindhtextile.pk', '+92-21-39876543', 'Karachi', 'Sindh', 'Pakistan', 'PKR', 'NET45', 600000.0000, 45, 6.00, 'GOLD', 'TRADE_SHOW', 'ACTIVE')
    ON CONFLICT (customer_code, company_id) DO NOTHING;

    -- Customer 9: Pakistan Dairy Products
    INSERT INTO customers (company_id, customer_code, name, short_name, customer_type, contact_person, email, phone, city, state, country, currency_code, payment_terms, credit_limit, credit_days, discount_percent, customer_tier, lead_source, status)
    VALUES (v_company_id, 'CUST-0009', 'Pakistan Dairy Products', 'PakDairy', 'DISTRIBUTOR', 'Hassan Ali', 'hassan@pakdairy.pk', '+92-42-38765433', 'Lahore', 'Punjab', 'Pakistan', 'PKR', 'NET30', 350000.0000, 30, 4.50, 'SILVER', 'COLD_CALL', 'ACTIVE')
    ON CONFLICT (customer_code, company_id) DO NOTHING;

    -- Customer 10: Kabul Export House (cross-border)
    INSERT INTO customers (company_id, customer_code, name, short_name, customer_type, contact_person, email, phone, city, state, country, currency_code, payment_terms, credit_limit, credit_days, discount_percent, customer_tier, lead_source, status)
    VALUES (v_company_id, 'CUST-0010', 'Kabul Export House', 'KabExp', 'DISTRIBUTOR', 'Ahmad Wali', 'ahmad@kabulexport.af', '+93-700-123456', 'Kabul', 'Kabul', 'Afghanistan', 'USD', 'NET60', 50000.0000, 60, 5.00, 'BRONZE', 'OTHER', 'LEAD')
    ON CONFLICT (customer_code, company_id) DO NOTHING;

    RAISE NOTICE 'Inserted 10 demo customers successfully';
END $$;