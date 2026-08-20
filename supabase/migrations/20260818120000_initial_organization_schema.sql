-- Supabase Migration: Initial Organization Schema
-- Migration: 20260818120000_initial_organization_schema.sql
-- Description: Creates initial organization tables (Company, Branch, BusinessUnit, Department, Warehouse, WarehouseLocation)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- COMPANIES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    legal_name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    company_code VARCHAR(50) NOT NULL UNIQUE,
    registration_number VARCHAR(100),
    tax_registration_number VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    website VARCHAR(255),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state_province VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    base_currency VARCHAR(3) DEFAULT 'USD',
    fiscal_year_start VARCHAR(5) DEFAULT '01-01',
    timezone VARCHAR(50) DEFAULT 'UTC',
    date_format VARCHAR(20) DEFAULT 'YYYY-MM-DD',
    number_format VARCHAR(20) DEFAULT '#,##0.00',
    logo_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'ACTIVE'
);

-- Indexes for companies
CREATE INDEX IF NOT EXISTS idx_companies_company_code ON companies(company_code);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);

-- =====================================================
-- BRANCHES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    branch_code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    registration_number VARCHAR(100),
    tax_registration_number VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    address VARCHAR(255),
    city VARCHAR(100),
    state_province VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(branch_code, company_id)
);

-- Indexes for branches
CREATE INDEX IF NOT EXISTS idx_branches_company_id ON branches(company_id);
CREATE INDEX IF NOT EXISTS idx_branches_branch_code ON branches(branch_code);
CREATE INDEX IF NOT EXISTS idx_branches_status ON branches(status);

-- =====================================================
-- DIVISIONS TABLE (NEW in ERP-00002-R01)
-- =====================================================
CREATE TABLE IF NOT EXISTS divisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    division_code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(division_code, company_id)
);

-- Indexes for divisions
CREATE INDEX IF NOT EXISTS idx_divisions_company_id ON divisions(company_id);
CREATE INDEX IF NOT EXISTS idx_divisions_division_code ON divisions(division_code);
CREATE INDEX IF NOT EXISTS idx_divisions_status ON divisions(status);

-- =====================================================
-- SECTIONS TABLE (NEW in ERP-00002-R01)
-- =====================================================
CREATE TABLE IF NOT EXISTS sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    division_id UUID NOT NULL REFERENCES divisions(id),
    section_code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(section_code, company_id)
);

-- Indexes for sections
CREATE INDEX IF NOT EXISTS idx_sections_company_id ON sections(company_id);
CREATE INDEX IF NOT EXISTS idx_sections_division_id ON sections(division_id);
CREATE INDEX IF NOT EXISTS idx_sections_section_code ON sections(section_code);
CREATE INDEX IF NOT EXISTS idx_sections_status ON sections(status);

-- =====================================================
-- BUSINESS UNITS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS business_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    branch_id UUID REFERENCES branches(id),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(code, company_id)
);

-- Indexes for business units
CREATE INDEX IF NOT EXISTS idx_business_units_company_id ON business_units(company_id);
CREATE INDEX IF NOT EXISTS idx_business_units_branch_id ON business_units(branch_id);
CREATE INDEX IF NOT EXISTS idx_business_units_code ON business_units(code);
CREATE INDEX IF NOT EXISTS idx_business_units_status ON business_units(status);

-- =====================================================
-- DEPARTMENTS TABLE (UPDATED in ERP-00002-R01)
-- =====================================================
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    branch_id UUID REFERENCES branches(id),
    business_unit_id UUID REFERENCES business_units(id),
    division_id UUID REFERENCES divisions(id),
    section_id UUID REFERENCES sections(id),
    department_code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_department_id UUID REFERENCES departments(id),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(department_code, company_id)
);

-- Indexes for departments
CREATE INDEX IF NOT EXISTS idx_departments_company_id ON departments(company_id);
CREATE INDEX IF NOT EXISTS idx_departments_branch_id ON departments(branch_id);
CREATE INDEX IF NOT EXISTS idx_departments_business_unit_id ON departments(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_departments_division_id ON departments(division_id);
CREATE INDEX IF NOT EXISTS idx_departments_section_id ON departments(section_id);
CREATE INDEX IF NOT EXISTS idx_departments_parent_department_id ON departments(parent_department_id);
CREATE INDEX IF NOT EXISTS idx_departments_department_code ON departments(department_code);
CREATE INDEX IF NOT EXISTS idx_departments_status ON departments(status);

-- =====================================================
-- WAREHOUSES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    branch_id UUID REFERENCES branches(id),
    business_unit_id UUID REFERENCES business_units(id),
    warehouse_code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    warehouse_type VARCHAR(30) DEFAULT 'GENERAL',
    address VARCHAR(255),
    city VARCHAR(100),
    country VARCHAR(100),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(warehouse_code, company_id)
);

-- Indexes for warehouses
CREATE INDEX IF NOT EXISTS idx_warehouses_company_id ON warehouses(company_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_branch_id ON warehouses(branch_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_business_unit_id ON warehouses(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_warehouse_code ON warehouses(warehouse_code);
CREATE INDEX IF NOT EXISTS idx_warehouses_status ON warehouses(status);
CREATE INDEX IF NOT EXISTS idx_warehouses_warehouse_type ON warehouses(warehouse_type);

-- =====================================================
-- WAREHOUSE LOCATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS warehouse_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    location_code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_location_id UUID REFERENCES warehouse_locations(id),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(location_code, warehouse_id)
);

-- Indexes for warehouse locations
CREATE INDEX IF NOT EXISTS idx_warehouse_locations_warehouse_id ON warehouse_locations(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_locations_parent_location_id ON warehouse_locations(parent_location_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_locations_location_code ON warehouse_locations(location_code);
CREATE INDEX IF NOT EXISTS idx_warehouse_locations_status ON warehouse_locations(status);

-- =====================================================
-- SEED DATA: Initial Company
-- =====================================================
INSERT INTO companies (company_code, legal_name, trade_name, base_currency, status)
VALUES ('COMP-001', 'Default Company', 'Default Company', 'USD', 'ACTIVE')
ON CONFLICT (company_code) DO NOTHING;

-- =====================================================
-- SEED DATA: Initial Divisions (5 divisions)
-- =====================================================
-- These are placeholder codes/names that should be configured through the UI
-- The actual company will configure these with their specific division names
INSERT INTO divisions (company_id, division_code, name, description, status)
SELECT c.id, v.division_code, v.name, v.description, v.status
FROM companies c
CROSS JOIN (VALUES
    ('DIV-001', 'Division 1', 'Initial division - please configure through administration', 'ACTIVE'),
    ('DIV-002', 'Division 2', 'Initial division - please configure through administration', 'ACTIVE'),
    ('DIV-003', 'Division 3', 'Initial division - please configure through administration', 'ACTIVE'),
    ('DIV-004', 'Division 4', 'Initial division - please configure through administration', 'ACTIVE'),
    ('DIV-005', 'Division 5', 'Initial division - please configure through administration', 'ACTIVE')
) AS v(division_code, name, description, status)
WHERE c.company_code = 'COMP-001'
ON CONFLICT (division_code, company_id) DO NOTHING;

-- =====================================================
-- FUNCTIONS: Update timestamp trigger
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables
DROP TRIGGER IF EXISTS update_companies_updated_at ON companies;
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_branches_updated_at ON branches;
CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_divisions_updated_at ON divisions;
CREATE TRIGGER update_divisions_updated_at BEFORE UPDATE ON divisions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_sections_updated_at ON sections;
CREATE TRIGGER update_sections_updated_at BEFORE UPDATE ON sections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_business_units_updated_at ON business_units;
CREATE TRIGGER update_business_units_updated_at BEFORE UPDATE ON business_units FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_departments_updated_at ON departments;
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_warehouses_updated_at ON warehouses;
CREATE TRIGGER update_warehouses_updated_at BEFORE UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_warehouse_locations_updated_at ON warehouse_locations;
CREATE TRIGGER update_warehouse_locations_updated_at BEFORE UPDATE ON warehouse_locations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
