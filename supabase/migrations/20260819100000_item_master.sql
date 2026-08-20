-- Supabase Migration: Item Master
-- Migration: 20260819100000_item_master.sql
-- Description: Creates item master tables (UOMs, UOM Conversions, Item Categories, Items, Item Barcodes, Item Attributes, Item Specifications, Item Documents)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- UOM TYPES (CHECK constraint-based enum)
-- Valid values: COUNT, WEIGHT, LENGTH, AREA, VOLUME, TIME, TEMPERATURE, PRESSURE, SPEED, ELECTRIC_CURRENT, OTHER
-- =====================================================

-- =====================================================
-- UOMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS uoms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    symbol VARCHAR(50),
    uom_type VARCHAR(30) NOT NULL DEFAULT 'OTHER'
        CHECK (uom_type IN ('COUNT', 'WEIGHT', 'LENGTH', 'AREA', 'VOLUME', 'TIME', 'TEMPERATURE', 'PRESSURE', 'SPEED', 'ELECTRIC_CURRENT', 'OTHER')),
    decimal_precision INTEGER DEFAULT 0 CHECK (decimal_precision >= 0 AND decimal_precision <= 10),
    base_uom_id UUID REFERENCES uoms(id),
    conversion_factor DECIMAL(15, 8),
    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED'))
);

-- Indexes for uoms
CREATE INDEX IF NOT EXISTS idx_uoms_code ON uoms(code);
CREATE INDEX IF NOT EXISTS idx_uoms_uom_type ON uoms(uom_type);
CREATE INDEX IF NOT EXISTS idx_uoms_status ON uoms(status);
CREATE INDEX IF NOT EXISTS idx_uoms_base_uom_id ON uoms(base_uom_id);

-- =====================================================
-- UOM CONVERSIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS uom_conversions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    from_uom_id UUID NOT NULL REFERENCES uoms(id),
    to_uom_id UUID NOT NULL REFERENCES uoms(id),
    conversion_factor DECIMAL(15, 8) NOT NULL CHECK (conversion_factor > 0),
    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED')),
    UNIQUE(from_uom_id, to_uom_id)
);

-- Indexes for uom_conversions
CREATE INDEX IF NOT EXISTS idx_uom_conversions_from_uom_id ON uom_conversions(from_uom_id);
CREATE INDEX IF NOT EXISTS idx_uom_conversions_to_uom_id ON uom_conversions(to_uom_id);
CREATE INDEX IF NOT EXISTS idx_uom_conversions_status ON uom_conversions(status);

-- =====================================================
-- ITEM CATEGORIES TABLE (self-referencing hierarchy)
-- =====================================================
CREATE TABLE IF NOT EXISTS item_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    category_code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(100),
    description TEXT,
    parent_category_id UUID REFERENCES item_categories(id),
    level INTEGER DEFAULT 0 CHECK (level >= 0),
    sort_order INTEGER DEFAULT 0,
    icon VARCHAR(255),
    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED')),
    UNIQUE(category_code, company_id)
);

-- Indexes for item_categories
CREATE INDEX IF NOT EXISTS idx_item_categories_company_id ON item_categories(company_id);
CREATE INDEX IF NOT EXISTS idx_item_categories_category_code ON item_categories(category_code);
CREATE INDEX IF NOT EXISTS idx_item_categories_parent_category_id ON item_categories(parent_category_id);
CREATE INDEX IF NOT EXISTS idx_item_categories_status ON item_categories(status);

-- =====================================================
-- ITEMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    item_code VARCHAR(50) NOT NULL,
    sku VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(100),
    description TEXT,
    item_type VARCHAR(30) NOT NULL DEFAULT 'OTHER'
        CHECK (item_type IN ('RAW_MATERIAL', 'FINISHED_GOOD', 'SEMI_FINISHED', 'CONSUMABLE', 'SERVICE', 'BOM', 'PACKAGING', 'OTHER')),
    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED', 'DRAFT')),
    barcode VARCHAR(255),
    manufacturer_part_number VARCHAR(255),
    brand VARCHAR(255),
    model VARCHAR(255),
    category_id UUID REFERENCES item_categories(id),
    base_uom_id UUID NOT NULL REFERENCES uoms(id),
    purchase_uom_id UUID REFERENCES uoms(id),
    sales_uom_id UUID REFERENCES uoms(id),
    track_inventory BOOLEAN DEFAULT false,
    batch_tracked BOOLEAN DEFAULT false,
    serial_tracked BOOLEAN DEFAULT false,
    expiry_tracked BOOLEAN DEFAULT false,
    is_purchasable BOOLEAN DEFAULT false,
    is_sellable BOOLEAN DEFAULT false,
    is_manufacturable BOOLEAN DEFAULT false,
    is_stock_item BOOLEAN DEFAULT false,
    minimum_stock_level DECIMAL(15, 4),
    maximum_stock_level DECIMAL(15, 4),
    reorder_level DECIMAL(15, 4),
    safety_stock_level DECIMAL(15, 4),
    lead_time_days INTEGER,
    weight DECIMAL(15, 4),
    weight_uom_id UUID REFERENCES uoms(id),
    length DECIMAL(15, 4),
    width DECIMAL(15, 4),
    height DECIMAL(15, 4),
    dimension_uom_id UUID REFERENCES uoms(id),
    volume DECIMAL(15, 4),
    volume_uom_id UUID REFERENCES uoms(id),
    cost_price DECIMAL(15, 4),
    selling_price DECIMAL(15, 4),
    currency VARCHAR(3) DEFAULT 'USD',
    tax_rate DECIMAL(5, 2),
    image_url VARCHAR(500),
    notes TEXT,
    search_keywords TEXT
);

-- Company-scoped unique constraints for items
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_items_item_code_company') THEN
    ALTER TABLE items ADD CONSTRAINT uq_items_item_code_company UNIQUE (item_code, company_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_items_sku_company') THEN
    ALTER TABLE items ADD CONSTRAINT uq_items_sku_company UNIQUE (sku, company_id);
  END IF;
END $$;

-- Indexes for items
CREATE INDEX IF NOT EXISTS idx_items_company_id ON items(company_id);
CREATE INDEX IF NOT EXISTS idx_items_item_code ON items(item_code);
CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
CREATE INDEX IF NOT EXISTS idx_items_item_type ON items(item_type);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_base_uom_id ON items(base_uom_id);
CREATE INDEX IF NOT EXISTS idx_items_purchase_uom_id ON items(purchase_uom_id);
CREATE INDEX IF NOT EXISTS idx_items_sales_uom_id ON items(sales_uom_id);
CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
CREATE INDEX IF NOT EXISTS idx_items_brand ON items(brand);

-- =====================================================
-- ITEM BARCODES TABLE (multiple barcodes per item)
-- =====================================================
CREATE TABLE IF NOT EXISTS item_barcodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    barcode VARCHAR(255) NOT NULL,
    barcode_type VARCHAR(30) DEFAULT 'EAN13'
        CHECK (barcode_type IN ('EAN13', 'EAN8', 'UPCA', 'UPCE', 'CODE128', 'CODE39', 'QR_CODE', 'DATA_MATRIX', 'OTHER')),
    uom_id UUID REFERENCES uoms(id),
    is_primary BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

-- Unique constraint: one barcode globally
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_item_barcodes_barcode') THEN
    ALTER TABLE item_barcodes ADD CONSTRAINT uq_item_barcodes_barcode UNIQUE (barcode);
  END IF;
END $$;

-- Indexes for item_barcodes
CREATE INDEX IF NOT EXISTS idx_item_barcodes_item_id ON item_barcodes(item_id);
CREATE INDEX IF NOT EXISTS idx_item_barcodes_barcode ON item_barcodes(barcode);
CREATE INDEX IF NOT EXISTS idx_item_barcodes_uom_id ON item_barcodes(uom_id);
CREATE INDEX IF NOT EXISTS idx_item_barcodes_status ON item_barcodes(status);

-- =====================================================
-- ITEM ATTRIBUTE DEFINITIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS item_attribute_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    attribute_code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    attribute_type VARCHAR(30) NOT NULL DEFAULT 'TEXT'
        CHECK (attribute_type IN ('TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT', 'MULTI_SELECT')),
    data_type VARCHAR(30) DEFAULT 'TEXT'
        CHECK (data_type IN ('TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'DATETIME')),
    is_required BOOLEAN DEFAULT false,
    is_searchable BOOLEAN DEFAULT false,
    is_filterable BOOLEAN DEFAULT false,
    default_value TEXT,
    validation_regex VARCHAR(500),
    sort_order INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE')),
    UNIQUE(attribute_code, company_id)
);

-- Indexes for item_attribute_definitions
CREATE INDEX IF NOT EXISTS idx_item_attribute_defs_company_id ON item_attribute_definitions(company_id);
CREATE INDEX IF NOT EXISTS idx_item_attribute_defs_attribute_code ON item_attribute_definitions(attribute_code);
CREATE INDEX IF NOT EXISTS idx_item_attribute_defs_attribute_type ON item_attribute_definitions(attribute_type);
CREATE INDEX IF NOT EXISTS idx_item_attribute_defs_status ON item_attribute_definitions(status);

-- =====================================================
-- ITEM ATTRIBUTE VALUES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS item_attribute_values (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    attribute_definition_id UUID NOT NULL REFERENCES item_attribute_definitions(id),
    text_value TEXT,
    number_value DECIMAL(15, 6),
    boolean_value BOOLEAN,
    date_value DATE,
    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE')),
    UNIQUE(item_id, attribute_definition_id)
);

-- Indexes for item_attribute_values
CREATE INDEX IF NOT EXISTS idx_item_attribute_values_item_id ON item_attribute_values(item_id);
CREATE INDEX IF NOT EXISTS idx_item_attribute_values_attribute_definition_id ON item_attribute_values(attribute_definition_id);
CREATE INDEX IF NOT EXISTS idx_item_attribute_values_status ON item_attribute_values(status);

-- =====================================================
-- ITEM SPECIFICATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS item_specifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    specification_name VARCHAR(255) NOT NULL,
    specification_value TEXT NOT NULL,
    uom_id UUID REFERENCES uoms(id),
    min_value DECIMAL(15, 6),
    max_value DECIMAL(15, 6),
    target_value DECIMAL(15, 6),
    tolerance_plus DECIMAL(15, 6),
    tolerance_minus DECIMAL(15, 6),
    is_critical BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

-- Indexes for item_specifications
CREATE INDEX IF NOT EXISTS idx_item_specifications_item_id ON item_specifications(item_id);
CREATE INDEX IF NOT EXISTS idx_item_specifications_uom_id ON item_specifications(uom_id);
CREATE INDEX IF NOT EXISTS idx_item_specifications_status ON item_specifications(status);

-- =====================================================
-- ITEM DOCUMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS item_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    document_name VARCHAR(255) NOT NULL,
    document_type VARCHAR(30) DEFAULT 'OTHER'
        CHECK (document_type IN ('SPECIFICATION', 'CERTIFICATE', 'DRAWING', 'MANUAL', 'SAFETY_DATA_SHEET', 'COA', 'PHOTO', 'OTHER')),
    file_url VARCHAR(500) NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(100),
    description TEXT,
    is_primary BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

-- Indexes for item_documents
CREATE INDEX IF NOT EXISTS idx_item_documents_item_id ON item_documents(item_id);
CREATE INDEX IF NOT EXISTS idx_item_documents_document_type ON item_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_item_documents_status ON item_documents(status);

-- =====================================================
-- SEED DATA: Permissions - Items Module
-- =====================================================
INSERT INTO permissions (permission_code, name, module, resource, action, status) VALUES
    ('item.view', 'View Items', 'item', 'item', 'view', 'ACTIVE'),
    ('item.create', 'Create Items', 'item', 'item', 'create', 'ACTIVE'),
    ('item.update', 'Update Items', 'item', 'item', 'update', 'ACTIVE'),
    ('item.activate', 'Activate Items', 'item', 'item', 'activate', 'ACTIVE'),
    ('item.deactivate', 'Deactivate Items', 'item', 'item', 'deactivate', 'ACTIVE'),
    ('item.discontinue', 'Discontinue Items', 'item', 'item', 'discontinue', 'ACTIVE'),
    ('item_category.view', 'View Item Categories', 'item', 'item_category', 'view', 'ACTIVE'),
    ('item_category.create', 'Create Item Categories', 'item', 'item_category', 'create', 'ACTIVE'),
    ('item_category.update', 'Update Item Categories', 'item', 'item_category', 'update', 'ACTIVE'),
    ('item_category.activate', 'Activate Item Categories', 'item', 'item_category', 'activate', 'ACTIVE'),
    ('item_category.deactivate', 'Deactivate Item Categories', 'item', 'item_category', 'deactivate', 'ACTIVE'),
    ('uom.view', 'View Units of Measure', 'item', 'uom', 'view', 'ACTIVE'),
    ('uom.create', 'Create Units of Measure', 'item', 'uom', 'create', 'ACTIVE'),
    ('uom.update', 'Update Units of Measure', 'item', 'uom', 'update', 'ACTIVE'),
    ('uom.activate', 'Activate Units of Measure', 'item', 'uom', 'activate', 'ACTIVE'),
    ('uom.deactivate', 'Deactivate Units of Measure', 'item', 'uom', 'deactivate', 'ACTIVE'),
    ('uom_conversion.view', 'View UOM Conversions', 'item', 'uom_conversion', 'view', 'ACTIVE'),
    ('uom_conversion.create', 'Create UOM Conversions', 'item', 'uom_conversion', 'create', 'ACTIVE'),
    ('uom_conversion.update', 'Update UOM Conversions', 'item', 'uom_conversion', 'update', 'ACTIVE'),
    ('uom_conversion.activate', 'Activate UOM Conversions', 'item', 'uom_conversion', 'activate', 'ACTIVE'),
    ('uom_conversion.deactivate', 'Deactivate UOM Conversions', 'item', 'uom_conversion', 'deactivate', 'ACTIVE'),
    ('item_barcode.view', 'View Item Barcodes', 'item', 'item_barcode', 'view', 'ACTIVE'),
    ('item_barcode.create', 'Create Item Barcodes', 'item', 'item_barcode', 'create', 'ACTIVE'),
    ('item_barcode.update', 'Update Item Barcodes', 'item', 'item_barcode', 'update', 'ACTIVE'),
    ('item_barcode.deactivate', 'Deactivate Item Barcodes', 'item', 'item_barcode', 'deactivate', 'ACTIVE'),
    ('item_attribute.view', 'View Item Attributes', 'item', 'item_attribute', 'view', 'ACTIVE'),
    ('item_attribute.create', 'Create Item Attributes', 'item', 'item_attribute', 'create', 'ACTIVE'),
    ('item_attribute.update', 'Update Item Attributes', 'item', 'item_attribute', 'update', 'ACTIVE'),
    ('item_specification.view', 'View Item Specifications', 'item', 'item_specification', 'view', 'ACTIVE'),
    ('item_specification.create', 'Create Item Specifications', 'item', 'item_specification', 'create', 'ACTIVE'),
    ('item_specification.update', 'Update Item Specifications', 'item', 'item_specification', 'update', 'ACTIVE'),
    ('item_document.view', 'View Item Documents', 'item', 'item_document', 'view', 'ACTIVE'),
    ('item_document.create', 'Create Item Documents', 'item', 'item_document', 'create', 'ACTIVE'),
    ('item_document.deactivate', 'Deactivate Item Documents', 'item', 'item_document', 'deactivate', 'ACTIVE')
ON CONFLICT (permission_code) DO NOTHING;

-- =====================================================
-- SEED DATA: Default UOMs
-- =====================================================
INSERT INTO uoms (code, name, symbol, uom_type, decimal_precision, status) VALUES
    ('EA', 'Each', 'ea', 'COUNT', 0, 'ACTIVE'),
    ('PC', 'Piece', 'pc', 'COUNT', 0, 'ACTIVE'),
    ('BOX', 'Box', 'box', 'COUNT', 0, 'ACTIVE'),
    ('CS', 'Case', 'cs', 'COUNT', 0, 'ACTIVE'),
    ('KG', 'Kilogram', 'kg', 'WEIGHT', 3, 'ACTIVE'),
    ('G', 'Gram', 'g', 'WEIGHT', 3, 'ACTIVE'),
    ('LB', 'Pound', 'lb', 'WEIGHT', 3, 'ACTIVE'),
    ('OZ', 'Ounce', 'oz', 'WEIGHT', 3, 'ACTIVE'),
    ('MT', 'Metric Ton', 'mt', 'WEIGHT', 3, 'ACTIVE'),
    ('M', 'Meter', 'm', 'LENGTH', 3, 'ACTIVE'),
    ('CM', 'Centimeter', 'cm', 'LENGTH', 3, 'ACTIVE'),
    ('MM', 'Millimeter', 'mm', 'LENGTH', 3, 'ACTIVE'),
    ('FT', 'Foot', 'ft', 'LENGTH', 3, 'ACTIVE'),
    ('IN', 'Inch', 'in', 'LENGTH', 3, 'ACTIVE'),
    ('SQM', 'Square Meter', 'm²', 'AREA', 3, 'ACTIVE'),
    ('SQFT', 'Square Foot', 'ft²', 'AREA', 3, 'ACTIVE'),
    ('L', 'Liter', 'L', 'VOLUME', 3, 'ACTIVE'),
    ('ML', 'Milliliter', 'mL', 'VOLUME', 3, 'ACTIVE'),
    ('GAL', 'Gallon', 'gal', 'VOLUME', 3, 'ACTIVE'),
    ('HR', 'Hour', 'hr', 'TIME', 2, 'ACTIVE'),
    ('MIN', 'Minute', 'min', 'TIME', 2, 'ACTIVE'),
    ('DAY', 'Day', 'day', 'TIME', 2, 'ACTIVE')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- SEED DATA: Default UOM Conversions
-- =====================================================
INSERT INTO uom_conversions (from_uom_id, to_uom_id, conversion_factor, status) VALUES
    -- Weight conversions
    ((SELECT id FROM uoms WHERE code = 'KG'), (SELECT id FROM uoms WHERE code = 'G'), 1000, 'ACTIVE'),
    ((SELECT id FROM uoms WHERE code = 'MT'), (SELECT id FROM uoms WHERE code = 'KG'), 1000, 'ACTIVE'),
    ((SELECT id FROM uoms WHERE code = 'LB'), (SELECT id FROM uoms WHERE code = 'OZ'), 16, 'ACTIVE'),
    ((SELECT id FROM uoms WHERE code = 'KG'), (SELECT id FROM uoms WHERE code = 'LB'), 2.20462, 'ACTIVE'),
    -- Length conversions
    ((SELECT id FROM uoms WHERE code = 'M'), (SELECT id FROM uoms WHERE code = 'CM'), 100, 'ACTIVE'),
    ((SELECT id FROM uoms WHERE code = 'M'), (SELECT id FROM uoms WHERE code = 'MM'), 1000, 'ACTIVE'),
    ((SELECT id FROM uoms WHERE code = 'FT'), (SELECT id FROM uoms WHERE code = 'IN'), 12, 'ACTIVE'),
    ((SELECT id FROM uoms WHERE code = 'M'), (SELECT id FROM uoms WHERE code = 'FT'), 3.28084, 'ACTIVE'),
    -- Volume conversions
    ((SELECT id FROM uoms WHERE code = 'L'), (SELECT id FROM uoms WHERE code = 'ML'), 1000, 'ACTIVE'),
    ((SELECT id FROM uoms WHERE code = 'GAL'), (SELECT id FROM uoms WHERE code = 'L'), 3.78541, 'ACTIVE'),
    -- Time conversions
    ((SELECT id FROM uoms WHERE code = 'HR'), (SELECT id FROM uoms WHERE code = 'MIN'), 60, 'ACTIVE'),
    ((SELECT id FROM uoms WHERE code = 'DAY'), (SELECT id FROM uoms WHERE code = 'HR'), 24, 'ACTIVE')
ON CONFLICT (from_uom_id, to_uom_id) DO NOTHING;

-- =====================================================
-- TRIGGERS: Auto-update updated_at timestamp
-- =====================================================
DROP TRIGGER IF EXISTS update_uoms_updated_at ON uoms;
CREATE TRIGGER update_uoms_updated_at BEFORE UPDATE ON uoms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_uom_conversions_updated_at ON uom_conversions;
CREATE TRIGGER update_uom_conversions_updated_at BEFORE UPDATE ON uom_conversions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_item_categories_updated_at ON item_categories;
CREATE TRIGGER update_item_categories_updated_at BEFORE UPDATE ON item_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_items_updated_at ON items;
CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_item_barcodes_updated_at ON item_barcodes;
CREATE TRIGGER update_item_barcodes_updated_at BEFORE UPDATE ON item_barcodes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_item_attribute_definitions_updated_at ON item_attribute_definitions;
CREATE TRIGGER update_item_attribute_definitions_updated_at BEFORE UPDATE ON item_attribute_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_item_attribute_values_updated_at ON item_attribute_values;
CREATE TRIGGER update_item_attribute_values_updated_at BEFORE UPDATE ON item_attribute_values FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_item_specifications_updated_at ON item_specifications;
CREATE TRIGGER update_item_specifications_updated_at BEFORE UPDATE ON item_specifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_item_documents_updated_at ON item_documents;
CREATE TRIGGER update_item_documents_updated_at BEFORE UPDATE ON item_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
