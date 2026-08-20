-- Supabase Migration: Procurement & Purchase Management
-- Migration: 20260819160000_procurement.sql
-- Description: Creates procurement module tables (Suppliers, Purchase Requisitions, RFQs, Quotations, Purchase Orders, Goods Receipts, Returns, Invoice References)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- SUPPLIERS TABLE
-- Master data for vendors/suppliers
-- =====================================================
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    supplier_code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(100),
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
    lead_time_days INTEGER DEFAULT 0,
    rating INTEGER DEFAULT 0,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLACKLISTED')),
    UNIQUE(supplier_code, company_id)
);

-- Indexes for suppliers
CREATE INDEX IF NOT EXISTS idx_suppliers_company_id ON suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_supplier_code ON suppliers(supplier_code);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_created_by ON suppliers(created_by);

-- =====================================================
-- SUPPLIER ITEMS TABLE
-- Items offered by suppliers with pricing
-- =====================================================
CREATE TABLE IF NOT EXISTS supplier_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id),
    supplier_part_number VARCHAR(100),
    unit_price DECIMAL(15, 6) DEFAULT 0,
    currency_code VARCHAR(3) DEFAULT 'PKR',
    lead_time_days INTEGER DEFAULT 0,
    minimum_order_quantity DECIMAL(15, 4) DEFAULT 0,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(supplier_id, item_id)
);

-- Indexes for supplier_items
CREATE INDEX IF NOT EXISTS idx_supplier_items_company_id ON supplier_items(company_id);
CREATE INDEX IF NOT EXISTS idx_supplier_items_supplier_id ON supplier_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_items_item_id ON supplier_items(item_id);
CREATE INDEX IF NOT EXISTS idx_supplier_items_status ON supplier_items(status);

-- =====================================================
-- PURCHASE REQUISITIONS TABLE
-- Internal request to purchase goods
-- =====================================================
CREATE TABLE IF NOT EXISTS purchase_requisitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    requisition_code VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    description TEXT,
    request_type VARCHAR(20) DEFAULT 'STANDARD'
        CHECK (request_type IN ('STANDARD', 'URGENT', 'BLANKET', 'RECURRING')),
    requested_delivery_date DATE,
    department VARCHAR(100),
    project_code VARCHAR(100),
    status VARCHAR(20) DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_CONVERTED', 'FULLY_CONVERTED', 'CANCELLED')),
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    notes TEXT,
    UNIQUE(requisition_code, company_id)
);

-- Indexes for purchase_requisitions
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_company_id ON purchase_requisitions(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_requisition_code ON purchase_requisitions(requisition_code);
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_status ON purchase_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_created_by ON purchase_requisitions(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_approved_by ON purchase_requisitions(approved_by);
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_approved_at ON purchase_requisitions(approved_at);
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_requested_delivery_date ON purchase_requisitions(requested_delivery_date);

-- =====================================================
-- PURCHASE REQUISITION LINES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS purchase_requisition_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    requisition_id UUID NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    item_id UUID NOT NULL REFERENCES items(id),
    uom_id UUID NOT NULL REFERENCES uoms(id),
    quantity DECIMAL(15, 4) NOT NULL,
    estimated_unit_price DECIMAL(15, 6),
    estimated_total_price DECIMAL(15, 6),
    required_date DATE,
    warehouse_id UUID REFERENCES warehouses(id),
    supplier_id UUID REFERENCES suppliers(id),
    justification TEXT,
    converted_quantity DECIMAL(15, 4) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'PARTIALLY_ORDERED', 'FULLY_ORDERED', 'CANCELLED')),
    notes TEXT
);

-- Indexes for purchase_requisition_lines
CREATE INDEX IF NOT EXISTS idx_purchase_requisition_lines_requisition_id ON purchase_requisition_lines(requisition_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requisition_lines_item_id ON purchase_requisition_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requisition_lines_uom_id ON purchase_requisition_lines(uom_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requisition_lines_warehouse_id ON purchase_requisition_lines(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requisition_lines_supplier_id ON purchase_requisition_lines(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requisition_lines_status ON purchase_requisition_lines(status);

-- =====================================================
-- REQUEST FOR QUOTATIONS (RFQ) TABLE
-- RFQ sent to suppliers
-- =====================================================
CREATE TABLE IF NOT EXISTS request_for_quotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    rfq_code VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    description TEXT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    requisition_id UUID REFERENCES purchase_requisitions(id),
    issue_date DATE DEFAULT CURRENT_DATE,
    due_date DATE,
    status VARCHAR(20) DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'SENT', 'PARTIAL_RESPONSE', 'RESPONSE_RECEIVED', 'EVALUATED', 'CANCELLED')),
    evaluated_by UUID,
    evaluated_at TIMESTAMPTZ,
    notes TEXT,
    UNIQUE(rfq_code, company_id)
);

-- Indexes for request_for_quotations
CREATE INDEX IF NOT EXISTS idx_request_for_quotations_company_id ON request_for_quotations(company_id);
CREATE INDEX IF NOT EXISTS idx_request_for_quotations_rfq_code ON request_for_quotations(rfq_code);
CREATE INDEX IF NOT EXISTS idx_request_for_quotations_supplier_id ON request_for_quotations(supplier_id);
CREATE INDEX IF NOT EXISTS idx_request_for_quotations_requisition_id ON request_for_quotations(requisition_id);
CREATE INDEX IF NOT EXISTS idx_request_for_quotations_status ON request_for_quotations(status);
CREATE INDEX IF NOT EXISTS idx_request_for_quotations_created_by ON request_for_quotations(created_by);
CREATE INDEX IF NOT EXISTS idx_request_for_quotations_issue_date ON request_for_quotations(issue_date);
CREATE INDEX IF NOT EXISTS idx_request_for_quotations_due_date ON request_for_quotations(due_date);

-- =====================================================
-- RFQ LINES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS rfq_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    rfq_id UUID NOT NULL REFERENCES request_for_quotations(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    item_id UUID NOT NULL REFERENCES items(id),
    uom_id UUID NOT NULL REFERENCES uoms(id),
    quantity DECIMAL(15, 4) NOT NULL,
    notes TEXT
);

-- Indexes for rfq_lines
CREATE INDEX IF NOT EXISTS idx_rfq_lines_rfq_id ON rfq_lines(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_lines_item_id ON rfq_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_rfq_lines_uom_id ON rfq_lines(uom_id);

-- =====================================================
-- QUOTATIONS TABLE
-- Supplier quotation responses to RFQs
-- =====================================================
CREATE TABLE IF NOT EXISTS quotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    quotation_code VARCHAR(50) NOT NULL,
    rfq_id UUID NOT NULL REFERENCES request_for_quotations(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    quotation_date DATE DEFAULT CURRENT_DATE,
    valid_until DATE,
    payment_terms VARCHAR(100),
    delivery_terms VARCHAR(100),
    total_amount DECIMAL(15, 6) DEFAULT 0,
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    tax_percent DECIMAL(5, 2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'RECEIVED'
        CHECK (status IN ('DRAFT', 'RECEIVED', 'EVALUATED', 'SELECTED', 'REJECTED', 'EXPIRED')),
    evaluated_by UUID,
    evaluated_at TIMESTAMPTZ,
    evaluation_notes TEXT,
    notes TEXT,
    UNIQUE(quotation_code, company_id)
);

-- Indexes for quotations
CREATE INDEX IF NOT EXISTS idx_quotations_company_id ON quotations(company_id);
CREATE INDEX IF NOT EXISTS idx_quotations_quotation_code ON quotations(quotation_code);
CREATE INDEX IF NOT EXISTS idx_quotations_rfq_id ON quotations(rfq_id);
CREATE INDEX IF NOT EXISTS idx_quotations_supplier_id ON quotations(supplier_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_created_by ON quotations(created_by);
CREATE INDEX IF NOT EXISTS idx_quotations_quotation_date ON quotations(quotation_date);
CREATE INDEX IF NOT EXISTS idx_quotations_valid_until ON quotations(valid_until);

-- =====================================================
-- QUOTATION LINES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS quotation_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    item_id UUID NOT NULL REFERENCES items(id),
    uom_id UUID NOT NULL REFERENCES uoms(id),
    quantity DECIMAL(15, 4) NOT NULL,
    unit_price DECIMAL(15, 6) NOT NULL,
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    total_price DECIMAL(15, 6),
    lead_time_days INTEGER DEFAULT 0,
    notes TEXT
);

-- Indexes for quotation_lines
CREATE INDEX IF NOT EXISTS idx_quotation_lines_quotation_id ON quotation_lines(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_lines_item_id ON quotation_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_quotation_lines_uom_id ON quotation_lines(uom_id);

-- =====================================================
-- PURCHASE ORDERS TABLE
-- Confirmed orders to suppliers
-- =====================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    po_code VARCHAR(50) NOT NULL,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    quotation_id UUID REFERENCES quotations(id),
    requisition_id UUID REFERENCES purchase_requisitions(id),
    order_date DATE DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    delivery_address TEXT,
    payment_terms VARCHAR(100),
    currency_code VARCHAR(3) DEFAULT 'PKR',
    subtotal DECIMAL(15, 6) DEFAULT 0,
    tax_percent DECIMAL(5, 2) DEFAULT 0,
    tax_amount DECIMAL(15, 6) DEFAULT 0,
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    discount_amount DECIMAL(15, 6) DEFAULT 0,
    shipping_cost DECIMAL(15, 6) DEFAULT 0,
    total_amount DECIMAL(15, 6) DEFAULT 0,
    received_amount DECIMAL(15, 6) DEFAULT 0,
    invoiced_amount DECIMAL(15, 6) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'PARTIALLY_INVOICED', 'FULLY_INVOICED', 'CLOSED', 'CANCELLED')),
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    received_by UUID,
    received_at TIMESTAMPTZ,
    cancelled_by UUID,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    notes TEXT,
    UNIQUE(po_code, company_id)
);

-- Indexes for purchase_orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_company_id ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_code ON purchase_orders(po_code);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_quotation_id ON purchase_orders(quotation_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_requisition_id ON purchase_orders(requisition_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_date ON purchase_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_expected_delivery_date ON purchase_orders(expected_delivery_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_by ON purchase_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_approved_by ON purchase_orders(approved_by);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_received_by ON purchase_orders(received_by);

-- =====================================================
-- PURCHASE ORDER LINES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    item_id UUID NOT NULL REFERENCES items(id),
    uom_id UUID NOT NULL REFERENCES uoms(id),
    quantity DECIMAL(15, 4) NOT NULL,
    unit_price DECIMAL(15, 6) NOT NULL,
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    total_price DECIMAL(15, 6),
    received_quantity DECIMAL(15, 4) DEFAULT 0,
    invoiced_quantity DECIMAL(15, 4) DEFAULT 0,
    warehouse_id UUID REFERENCES warehouses(id),
    required_date DATE,
    notes TEXT
);

-- Indexes for purchase_order_lines
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po_id ON purchase_order_lines(po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_item_id ON purchase_order_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_uom_id ON purchase_order_lines(uom_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_warehouse_id ON purchase_order_lines(warehouse_id);

-- =====================================================
-- GOODS RECEIPTS TABLE
-- Physical receipt of goods against PO
-- =====================================================
CREATE TABLE IF NOT EXISTS goods_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    receipt_code VARCHAR(50) NOT NULL,
    po_id UUID NOT NULL REFERENCES purchase_orders(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    receipt_date TIMESTAMPTZ DEFAULT NOW(),
    delivery_note_number VARCHAR(100),
    grn_number VARCHAR(100),
    status VARCHAR(20) DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'RECEIVED', 'INSPECTION', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'POSTED')),
    inspected_by UUID,
    inspected_at TIMESTAMPTZ,
    posted_by UUID,
    posted_at TIMESTAMPTZ,
    notes TEXT,
    UNIQUE(receipt_code, company_id)
);

-- Indexes for goods_receipts
CREATE INDEX IF NOT EXISTS idx_goods_receipts_company_id ON goods_receipts(company_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_receipt_code ON goods_receipts(receipt_code);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_po_id ON goods_receipts(po_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_supplier_id ON goods_receipts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_warehouse_id ON goods_receipts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_status ON goods_receipts(status);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_created_by ON goods_receipts(created_by);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_receipt_date ON goods_receipts(receipt_date);

-- =====================================================
-- GOODS RECEIPT LINES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS goods_receipt_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    receipt_id UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
    po_line_id UUID NOT NULL REFERENCES purchase_order_lines(id),
    item_id UUID NOT NULL REFERENCES items(id),
    uom_id UUID NOT NULL REFERENCES uoms(id),
    quantity_ordered DECIMAL(15, 4) NOT NULL,
    quantity_received DECIMAL(15, 4) NOT NULL,
    quantity_accepted DECIMAL(15, 4) DEFAULT 0,
    quantity_rejected DECIMAL(15, 4) DEFAULT 0,
    unit_price DECIMAL(15, 6) NOT NULL,
    location_id UUID REFERENCES warehouse_locations(id),
    batch_id UUID REFERENCES batches(id),
    condition_notes TEXT,
    notes TEXT
);

-- Indexes for goods_receipt_lines
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_receipt_id ON goods_receipt_lines(receipt_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_po_line_id ON goods_receipt_lines(po_line_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_item_id ON goods_receipt_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_uom_id ON goods_receipt_lines(uom_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_location_id ON goods_receipt_lines(location_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_batch_id ON goods_receipt_lines(batch_id);

-- =====================================================
-- PURCHASE RETURNS TABLE
-- Return goods to supplier
-- =====================================================
CREATE TABLE IF NOT EXISTS purchase_returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    return_code VARCHAR(50) NOT NULL,
    po_id UUID NOT NULL REFERENCES purchase_orders(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    return_date TIMESTAMPTZ DEFAULT NOW(),
    reason TEXT,
    status VARCHAR(20) DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'APPROVED', 'SHIPPED', 'RECEIVED_BY_SUPPLIER', 'COMPLETED', 'CANCELLED')),
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    posted_by UUID,
    posted_at TIMESTAMPTZ,
    notes TEXT,
    UNIQUE(return_code, company_id)
);

-- Indexes for purchase_returns
CREATE INDEX IF NOT EXISTS idx_purchase_returns_company_id ON purchase_returns(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_return_code ON purchase_returns(return_code);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_po_id ON purchase_returns(po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier_id ON purchase_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_warehouse_id ON purchase_returns(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_status ON purchase_returns(status);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_created_by ON purchase_returns(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_return_date ON purchase_returns(return_date);

-- =====================================================
-- PURCHASE RETURN LINES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS purchase_return_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    return_id UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
    po_line_id UUID REFERENCES purchase_order_lines(id),
    item_id UUID NOT NULL REFERENCES items(id),
    uom_id UUID NOT NULL REFERENCES uoms(id),
    quantity DECIMAL(15, 4) NOT NULL,
    unit_price DECIMAL(15, 6) NOT NULL,
    reason TEXT,
    notes TEXT
);

-- Indexes for purchase_return_lines
CREATE INDEX IF NOT EXISTS idx_purchase_return_lines_return_id ON purchase_return_lines(return_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_lines_po_line_id ON purchase_return_lines(po_line_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_lines_item_id ON purchase_return_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_lines_uom_id ON purchase_return_lines(uom_id);

-- =====================================================
-- PURCHASE INVOICES TABLE
-- Supplier invoice references for 3-way matching
-- =====================================================
CREATE TABLE IF NOT EXISTS purchase_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    invoice_code VARCHAR(50) NOT NULL,
    supplier_invoice_number VARCHAR(100) NOT NULL,
    po_id UUID NOT NULL REFERENCES purchase_orders(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    invoice_date DATE DEFAULT CURRENT_DATE,
    due_date DATE,
    subtotal DECIMAL(15, 6) DEFAULT 0,
    tax_percent DECIMAL(5, 2) DEFAULT 0,
    tax_amount DECIMAL(15, 6) DEFAULT 0,
    discount_amount DECIMAL(15, 6) DEFAULT 0,
    total_amount DECIMAL(15, 6) DEFAULT 0,
    paid_amount DECIMAL(15, 6) DEFAULT 0,
    currency_code VARCHAR(3) DEFAULT 'PKR',
    payment_status VARCHAR(20) DEFAULT 'UNPAID'
        CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID', 'OVERPAID')),
    matching_status VARCHAR(20) DEFAULT 'PENDING'
        CHECK (matching_status IN ('PENDING', 'MATCHED', 'VARIANCE', 'EXCEPTION')),
    variance_amount DECIMAL(15, 6) DEFAULT 0,
    variance_notes TEXT,
    status VARCHAR(20) DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'CANCELLED')),
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    posted_by UUID,
    posted_at TIMESTAMPTZ,
    notes TEXT,
    UNIQUE(invoice_code, company_id)
);

-- Indexes for purchase_invoices
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_company_id ON purchase_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_invoice_code ON purchase_invoices(invoice_code);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier_invoice_number ON purchase_invoices(supplier_invoice_number);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_po_id ON purchase_invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier_id ON purchase_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_status ON purchase_invoices(status);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_payment_status ON purchase_invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_matching_status ON purchase_invoices(matching_status);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_created_by ON purchase_invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_invoice_date ON purchase_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_due_date ON purchase_invoices(due_date);

-- =====================================================
-- PURCHASE INVOICE LINES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS purchase_invoice_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
    po_line_id UUID REFERENCES purchase_order_lines(id),
    item_id UUID NOT NULL REFERENCES items(id),
    uom_id UUID NOT NULL REFERENCES uoms(id),
    quantity DECIMAL(15, 4) NOT NULL,
    unit_price DECIMAL(15, 6) NOT NULL,
    total_price DECIMAL(15, 6),
    notes TEXT
);

-- Indexes for purchase_invoice_lines
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_invoice_id ON purchase_invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_po_line_id ON purchase_invoice_lines(po_line_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_item_id ON purchase_invoice_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_uom_id ON purchase_invoice_lines(uom_id);

-- =====================================================
-- TRIGGERS: Auto-update updated_at timestamp
-- Safe to re-run: DROP IF EXISTS before each CREATE
-- =====================================================
DROP TRIGGER IF EXISTS update_suppliers_updated_at ON suppliers;
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_supplier_items_updated_at ON supplier_items;
CREATE TRIGGER update_supplier_items_updated_at BEFORE UPDATE ON supplier_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_purchase_requisitions_updated_at ON purchase_requisitions;
CREATE TRIGGER update_purchase_requisitions_updated_at BEFORE UPDATE ON purchase_requisitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_purchase_requisition_lines_updated_at ON purchase_requisition_lines;
CREATE TRIGGER update_purchase_requisition_lines_updated_at BEFORE UPDATE ON purchase_requisition_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_request_for_quotations_updated_at ON request_for_quotations;
CREATE TRIGGER update_request_for_quotations_updated_at BEFORE UPDATE ON request_for_quotations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rfq_lines_updated_at ON rfq_lines;
CREATE TRIGGER update_rfq_lines_updated_at BEFORE UPDATE ON rfq_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_quotations_updated_at ON quotations;
CREATE TRIGGER update_quotations_updated_at BEFORE UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_quotation_lines_updated_at ON quotation_lines;
CREATE TRIGGER update_quotation_lines_updated_at BEFORE UPDATE ON quotation_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_purchase_orders_updated_at ON purchase_orders;
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_purchase_order_lines_updated_at ON purchase_order_lines;
CREATE TRIGGER update_purchase_order_lines_updated_at BEFORE UPDATE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_goods_receipts_updated_at ON goods_receipts;
CREATE TRIGGER update_goods_receipts_updated_at BEFORE UPDATE ON goods_receipts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_goods_receipt_lines_updated_at ON goods_receipt_lines;
CREATE TRIGGER update_goods_receipt_lines_updated_at BEFORE UPDATE ON goods_receipt_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_purchase_returns_updated_at ON purchase_returns;
CREATE TRIGGER update_purchase_returns_updated_at BEFORE UPDATE ON purchase_returns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_purchase_return_lines_updated_at ON purchase_return_lines;
CREATE TRIGGER update_purchase_return_lines_updated_at BEFORE UPDATE ON purchase_return_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_purchase_invoices_updated_at ON purchase_invoices;
CREATE TRIGGER update_purchase_invoices_updated_at BEFORE UPDATE ON purchase_invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_purchase_invoice_lines_updated_at ON purchase_invoice_lines;
CREATE TRIGGER update_purchase_invoice_lines_updated_at BEFORE UPDATE ON purchase_invoice_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SEED DATA: Permissions - Procurement Module
-- =====================================================
INSERT INTO permissions (permission_code, name, module, resource, action, description, status) VALUES
    ('procurement.supplier.create', 'Create Supplier', 'procurement', 'supplier', 'CREATE', 'Create new suppliers', 'ACTIVE'),
    ('procurement.supplier.view', 'View Suppliers', 'procurement', 'supplier', 'VIEW', 'View suppliers list and details', 'ACTIVE'),
    ('procurement.supplier.update', 'Update Supplier', 'procurement', 'supplier', 'UPDATE', 'Update supplier information', 'ACTIVE'),
    ('procurement.supplier.delete', 'Delete Supplier', 'procurement', 'supplier', 'DELETE', 'Soft delete suppliers', 'ACTIVE'),
    ('procurement.supplier_item.create', 'Create Supplier Item', 'procurement', 'supplier_item', 'CREATE', 'Create supplier item pricing', 'ACTIVE'),
    ('procurement.supplier_item.view', 'View Supplier Items', 'procurement', 'supplier_item', 'VIEW', 'View supplier item catalog', 'ACTIVE'),
    ('procurement.supplier_item.update', 'Update Supplier Item', 'procurement', 'supplier_item', 'UPDATE', 'Update supplier item pricing', 'ACTIVE'),
    ('procurement.requisition.create', 'Create Purchase Requisition', 'procurement', 'requisition', 'CREATE', 'Create purchase requisitions', 'ACTIVE'),
    ('procurement.requisition.view', 'View Purchase Requisitions', 'procurement', 'requisition', 'VIEW', 'View purchase requisitions', 'ACTIVE'),
    ('procurement.requisition.submit', 'Submit Purchase Requisition', 'procurement', 'requisition', 'SUBMIT', 'Submit requisitions for approval', 'ACTIVE'),
    ('procurement.requisition.approve', 'Approve Purchase Requisition', 'procurement', 'requisition', 'APPROVE', 'Approve purchase requisitions', 'ACTIVE'),
    ('procurement.rfq.create', 'Create RFQ', 'procurement', 'rfq', 'CREATE', 'Create request for quotations', 'ACTIVE'),
    ('procurement.rfq.view', 'View RFQs', 'procurement', 'rfq', 'VIEW', 'View request for quotations', 'ACTIVE'),
    ('procurement.rfq.send', 'Send RFQ', 'procurement', 'rfq', 'SEND', 'Send RFQs to suppliers', 'ACTIVE'),
    ('procurement.rfq.evaluate', 'Evaluate RFQ', 'procurement', 'rfq', 'EVALUATE', 'Evaluate RFQ responses', 'ACTIVE'),
    ('procurement.quotation.create', 'Create Quotation', 'procurement', 'quotation', 'CREATE', 'Create supplier quotations', 'ACTIVE'),
    ('procurement.quotation.view', 'View Quotations', 'procurement', 'quotation', 'VIEW', 'View supplier quotations', 'ACTIVE'),
    ('procurement.quotation.evaluate', 'Evaluate Quotation', 'procurement', 'quotation', 'EVALUATE', 'Evaluate and compare quotations', 'ACTIVE'),
    ('procurement.quotation.select', 'Select Quotation', 'procurement', 'quotation', 'SELECT', 'Select winning quotation', 'ACTIVE'),
    ('procurement.order.create', 'Create Purchase Order', 'procurement', 'order', 'CREATE', 'Create purchase orders', 'ACTIVE'),
    ('procurement.order.view', 'View Purchase Orders', 'procurement', 'order', 'VIEW', 'View purchase orders', 'ACTIVE'),
    ('procurement.order.submit', 'Submit Purchase Order', 'procurement', 'order', 'SUBMIT', 'Submit PO for approval', 'ACTIVE'),
    ('procurement.order.approve', 'Approve Purchase Order', 'procurement', 'order', 'APPROVE', 'Approve purchase orders', 'ACTIVE'),
    ('procurement.order.cancel', 'Cancel Purchase Order', 'procurement', 'order', 'CANCEL', 'Cancel purchase orders', 'ACTIVE'),
    ('procurement.receipt.create', 'Create Goods Receipt', 'procurement', 'receipt', 'CREATE', 'Create goods receipts', 'ACTIVE'),
    ('procurement.receipt.view', 'View Goods Receipts', 'procurement', 'receipt', 'VIEW', 'View goods receipts', 'ACTIVE'),
    ('procurement.receipt.inspect', 'Inspect Goods Receipt', 'procurement', 'receipt', 'INSPECT', 'Inspect received goods', 'ACTIVE'),
    ('procurement.receipt.post', 'Post Goods Receipt', 'procurement', 'receipt', 'POST', 'Post goods receipts to inventory', 'ACTIVE'),
    ('procurement.return.create', 'Create Purchase Return', 'procurement', 'return', 'CREATE', 'Create purchase returns', 'ACTIVE'),
    ('procurement.return.view', 'View Purchase Returns', 'procurement', 'return', 'VIEW', 'View purchase returns', 'ACTIVE'),
    ('procurement.return.approve', 'Approve Purchase Return', 'procurement', 'return', 'APPROVE', 'Approve purchase returns', 'ACTIVE'),
    ('procurement.return.post', 'Post Purchase Return', 'procurement', 'return', 'POST', 'Post purchase returns to inventory', 'ACTIVE'),
    ('procurement.invoice.create', 'Create Purchase Invoice', 'procurement', 'invoice', 'CREATE', 'Create purchase invoices', 'ACTIVE'),
    ('procurement.invoice.view', 'View Purchase Invoices', 'procurement', 'invoice', 'VIEW', 'View purchase invoices', 'ACTIVE'),
    ('procurement.invoice.approve', 'Approve Purchase Invoice', 'procurement', 'invoice', 'APPROVE', 'Approve purchase invoices', 'ACTIVE'),
    ('procurement.invoice.post', 'Post Purchase Invoice', 'procurement', 'invoice', 'POST', 'Post purchase invoices to GL', 'ACTIVE')
ON CONFLICT (permission_code) DO NOTHING;

-- =====================================================
-- SEED DATA: Assign procurement permissions to ADMIN role
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN' AND p.module = 'procurement'
ON CONFLICT (role_id, permission_id) DO NOTHING;
