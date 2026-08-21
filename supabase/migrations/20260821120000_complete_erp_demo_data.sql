-- =====================================================================
-- COMPREHENSIVE ERP DEMO DATA SEED MIGRATION
-- Migration: 20260821120000_complete_erp_demo_data.sql
-- Description: Seeds ALL 38 empty tables with realistic Pakistani demo data.
--              Uses DO $$ blocks for dynamic UUID resolution.
--              All inserts use ON CONFLICT for full idempotency.
--              Safe to run multiple times.
-- =====================================================================

-- =====================================================================
-- PART 1: ITEM CATEGORIES (hierarchical)
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_cat_raw UUID;
    v_cat_finished UUID;
    v_cat_consumable UUID;
    v_cat_packaging UUID;
    v_cat_service UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;

    -- Level 0 categories
    INSERT INTO item_categories (company_id, category_code, name, short_name, description, level, sort_order, status)
    VALUES
        (v_company_id, 'CAT-RAW', 'Raw Materials', 'Raw Mat', 'Unprocessed materials for manufacturing', 0, 1, 'ACTIVE'),
        (v_company_id, 'CAT-FIN', 'Finished Goods', 'Fin Goods', 'Completed products ready for sale', 0, 2, 'ACTIVE'),
        (v_company_id, 'CAT-CONS', 'Consumables', 'Consum', 'Consumable supplies and materials', 0, 3, 'ACTIVE'),
        (v_company_id, 'CAT-PKG', 'Packaging Materials', 'Packaging', 'Packaging and labeling materials', 0, 4, 'ACTIVE'),
        (v_company_id, 'CAT-SERV', 'Services', 'Services', 'Service offerings', 0, 5, 'ACTIVE')
    ON CONFLICT (category_code, company_id) DO NOTHING;

    SELECT id INTO v_cat_raw FROM item_categories WHERE category_code = 'CAT-RAW' AND company_id = v_company_id;
    SELECT id INTO v_cat_finished FROM item_categories WHERE category_code = 'CAT-FIN' AND company_id = v_company_id;
    SELECT id INTO v_cat_consumable FROM item_categories WHERE category_code = 'CAT-CONS' AND company_id = v_company_id;
    SELECT id INTO v_cat_packaging FROM item_categories WHERE category_code = 'CAT-PKG' AND company_id = v_company_id;
    SELECT id INTO v_cat_service FROM item_categories WHERE category_code = 'CAT-SERV' AND company_id = v_company_id;

    -- Level 1 subcategories
    INSERT INTO item_categories (company_id, category_code, name, short_name, description, parent_category_id, level, sort_order, status)
    VALUES
        (v_company_id, 'CAT-RAW-MET', 'Metals', 'Metals', 'Steel, aluminum, copper and other metals', v_cat_raw, 1, 1, 'ACTIVE'),
        (v_company_id, 'CAT-RAW-PLST', 'Plastics', 'Plastics', 'Plastic resins and compounds', v_cat_raw, 1, 2, 'ACTIVE'),
        (v_company_id, 'CAT-FIN-MECH', 'Mechanical Parts', 'Mech Parts', 'Finished mechanical components', v_cat_finished, 1, 1, 'ACTIVE'),
        (v_company_id, 'CAT-FIN-ELEC', 'Electrical Parts', 'Elec Parts', 'Finished electrical components', v_cat_finished, 1, 2, 'ACTIVE'),
        (v_company_id, 'CAT-CONS-IND', 'Industrial Supplies', 'Ind Supp', 'Industrial consumable supplies', v_cat_consumable, 1, 1, 'ACTIVE'),
        (v_company_id, 'CAT-PKG-BOX', 'Boxes & Cartons', 'Boxes', 'Corrugated boxes and cartons', v_cat_packaging, 1, 1, 'ACTIVE'),
        (v_company_id, 'CAT-PKG-LBL', 'Labels & Tags', 'Labels', 'Labels, tags, and stickers', v_cat_packaging, 1, 2, 'ACTIVE')
    ON CONFLICT (category_code, company_id) DO NOTHING;
END $$;

-- =====================================================================
-- PART 2: ADDITIONAL ITEMS (7 more beyond the 3 existing)
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_uom_ea UUID;
    v_uom_kg UUID;
    v_uom_box UUID;
    v_uom_l UUID;
    v_cat_metals UUID;
    v_cat_plastics UUID;
    v_cat_mech UUID;
    v_cat_cons UUID;
    v_cat_pkg UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;

    SELECT id INTO v_uom_ea FROM uoms WHERE code = 'EA';
    SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG';
    SELECT id INTO v_uom_box FROM uoms WHERE code = 'BOX';
    SELECT id INTO v_uom_l FROM uoms WHERE code = 'L';

    SELECT id INTO v_cat_metals FROM item_categories WHERE category_code = 'CAT-RAW-MET' AND company_id = v_company_id;
    SELECT id INTO v_cat_plastics FROM item_categories WHERE category_code = 'CAT-RAW-PLST' AND company_id = v_company_id;
    SELECT id INTO v_cat_mech FROM item_categories WHERE category_code = 'CAT-FIN-MECH' AND company_id = v_company_id;
    SELECT id INTO v_cat_cons FROM item_categories WHERE category_code = 'CAT-CONS-IND' AND company_id = v_company_id;
    SELECT id INTO v_cat_pkg FROM item_categories WHERE category_code = 'CAT-PKG-BOX' AND company_id = v_company_id;

    INSERT INTO items (company_id, item_code, sku, name, short_name, description, item_type, category_id, base_uom_id, purchase_uom_id, sales_uom_id, track_inventory, batch_tracked, is_purchasable, is_sellable, is_stock_item, cost_price, selling_price, currency, minimum_stock_level, maximum_stock_level, reorder_level, safety_stock_level, lead_time_days, status)
    VALUES
        (v_company_id, 'RAW-001', 'RAW-001-SKU', 'Steel Sheet 3mm', 'Steel 3mm', 'Cold-rolled steel sheet 3mm thick, 4x8 ft', 'RAW_MATERIAL', v_cat_metals, v_uom_kg, v_uom_kg, v_uom_kg, true, false, true, false, true, 180.00, 0, 'PKR', 5000, 20000, 7000, 3000, 7, 'ACTIVE'),
        (v_company_id, 'RAW-002', 'RAW-002-SKU', 'Aluminum Rod 12mm', 'Al Rod 12mm', 'Aluminum alloy round rod 12mm diameter', 'RAW_MATERIAL', v_cat_metals, v_uom_kg, v_uom_kg, v_uom_kg, true, false, true, false, true, 420.00, 0, 'PKR', 2000, 8000, 3000, 1000, 10, 'ACTIVE'),
        (v_company_id, 'RAW-003', 'RAW-003-SKU', 'ABS Plastic Resin', 'ABS Resin', 'ABS plastic injection molding grade resin', 'RAW_MATERIAL', v_cat_plastics, v_uom_kg, v_uom_kg, v_uom_kg, true, true, true, false, true, 350.00, 0, 'PKR', 1000, 5000, 1500, 500, 14, 'ACTIVE'),
        (v_company_id, 'RAW-004', 'RAW-004-SKU', 'Copper Wire 2.5mm', 'Cu Wire 2.5', 'Electrical grade copper wire 2.5mm2', 'RAW_MATERIAL', v_cat_metals, v_uom_kg, v_uom_kg, v_uom_kg, true, false, true, false, true, 1200.00, 0, 'PKR', 500, 2000, 700, 200, 5, 'ACTIVE'),
        (v_company_id, 'FIN-001', 'FIN-001-SKU', 'Precision Bearing 6205', 'Brg 6205', 'Deep groove ball bearing 6205-2RS', 'FINISHED_GOOD', v_cat_mech, v_uom_ea, v_uom_box, v_uom_ea, true, false, true, true, true, 850.00, 1500.00, 'PKR', 100, 500, 150, 50, 3, 'ACTIVE'),
        (v_company_id, 'CONS-001', 'CONS-001-SKU', 'Hydraulic Oil 46', 'Hyd Oil 46', 'ISO VG 46 hydraulic oil, 20L drum', 'CONSUMABLE', v_cat_cons, v_uom_l, v_uom_box, v_uom_l, true, false, true, true, true, 2200.00, 3500.00, 'PKR', 50, 200, 60, 20, 7, 'ACTIVE'),
        (v_company_id, 'PKG-001', 'PKG-001-SKU', 'Corrugated Box 18x12x12', 'Box 18x12x12', 'Standard corrugated shipping box 18x12x12 inches', 'PACKAGING', v_cat_pkg, v_uom_ea, v_uom_box, v_uom_ea, true, false, true, true, true, 45.00, 85.00, 'PKR', 500, 2000, 600, 200, 5, 'ACTIVE')
    ON CONFLICT (item_code, company_id) DO NOTHING;
END $$;

-- =====================================================================
-- PART 3: ITEM BARCODES
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_uom_ea UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;
    SELECT id INTO v_uom_ea FROM uoms WHERE code = 'EA';

    INSERT INTO item_barcodes (item_id, barcode, barcode_type, uom_id, is_primary, status)
    SELECT i.id, bc.barcode, bc.btype, v_uom_ea, bc.is_primary, 'ACTIVE'
    FROM items i
    CROSS JOIN (VALUES
        ('SLD-0001', '6281100123456', 'EAN13', true),
        ('SLD-0002', '6281100234567', 'EAN13', true),
        ('SLD-0003', '6281100345678', 'EAN13', true),
        ('RAW-001', '6281100456789', 'EAN13', true),
        ('RAW-002', '6281100567890', 'EAN13', true),
        ('RAW-003', '6281100678901', 'EAN13', true),
        ('RAW-004', '6281100789012', 'EAN13', true),
        ('FIN-001', '6281100890123', 'EAN13', true),
        ('CONS-001', '6281100901234', 'EAN13', true),
        ('PKG-001', '6281101012345', 'EAN13', true)
    ) AS bc(item_code, barcode, btype, is_primary)
    LEFT JOIN item_barcodes ib ON ib.barcode = bc.barcode
    WHERE i.item_code = bc.item_code AND i.company_id = v_company_id
      AND ib.id IS NULL;
END $$;

-- =====================================================================
-- PART 4: ITEM ATTRIBUTE DEFINITIONS
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;

    INSERT INTO item_attribute_definitions (company_id, attribute_code, name, description, attribute_type, data_type, is_required, is_searchable, is_filterable, sort_order, status)
    VALUES
        (v_company_id, 'ATTR-COLOR', 'Color', 'Primary color of the item', 'SELECT', 'TEXT', false, true, true, 1, 'ACTIVE'),
        (v_company_id, 'ATTR-WGT-CLASS', 'Weight Class', 'Weight classification category', 'SELECT', 'TEXT', false, false, true, 2, 'ACTIVE'),
        (v_company_id, 'ATTR-MAT-GRADE', 'Material Grade', 'Material grade or specification', 'SELECT', 'TEXT', false, true, true, 3, 'ACTIVE'),
        (v_company_id, 'ATTR-CERT', 'Certification', 'Quality certifications held', 'MULTI_SELECT', 'TEXT', false, true, false, 4, 'ACTIVE'),
        (v_company_id, 'ATTR-ORIGIN', 'Country of Origin', 'Manufacturing origin country', 'TEXT', 'TEXT', false, false, true, 5, 'ACTIVE'),
        (v_company_id, 'ATTR-TEMP-RANGE', 'Operating Temp Range', 'Maximum operating temperature', 'TEXT', 'TEXT', false, false, false, 6, 'ACTIVE')
    ON CONFLICT (attribute_code, company_id) DO NOTHING;
END $$;

-- =====================================================================
-- PART 5: ITEM ATTRIBUTE VALUES
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_attr_color UUID;
    v_attr_wgt UUID;
    v_attr_grade UUID;
    v_attr_cert UUID;
    v_attr_origin UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;

    SELECT id INTO v_attr_color FROM item_attribute_definitions WHERE attribute_code = 'ATTR-COLOR' AND company_id = v_company_id;
    SELECT id INTO v_attr_wgt FROM item_attribute_definitions WHERE attribute_code = 'ATTR-WGT-CLASS' AND company_id = v_company_id;
    SELECT id INTO v_attr_grade FROM item_attribute_definitions WHERE attribute_code = 'ATTR-MAT-GRADE' AND company_id = v_company_id;
    SELECT id INTO v_attr_cert FROM item_attribute_definitions WHERE attribute_code = 'ATTR-CERT' AND company_id = v_company_id;
    SELECT id INTO v_attr_origin FROM item_attribute_definitions WHERE attribute_code = 'ATTR-ORIGIN' AND company_id = v_company_id;

    -- Fix: resolve attribute_definition_id properly
    DELETE FROM item_attribute_values;
    INSERT INTO item_attribute_values (item_id, attribute_definition_id, text_value, status)
    SELECT i.id, ad.id, t.text_value, 'ACTIVE'
    FROM items i
    CROSS JOIN (VALUES
        ('RAW-001', 'ATTR-COLOR', 'Silver-Grey'),
        ('RAW-001', 'ATTR-MAT-GRADE', 'ASTM A36'),
        ('RAW-001', 'ATTR-ORIGIN', 'Pakistan'),
        ('RAW-002', 'ATTR-COLOR', 'Silver'),
        ('RAW-002', 'ATTR-MAT-GRADE', '6061-T6'),
        ('RAW-002', 'ATTR-ORIGIN', 'Pakistan'),
        ('RAW-003', 'ATTR-COLOR', 'Natural'),
        ('RAW-003', 'ATTR-MAT-GRADE', 'PA-757'),
        ('RAW-003', 'ATTR-ORIGIN', 'China'),
        ('RAW-004', 'ATTR-COLOR', 'Copper'),
        ('RAW-004', 'ATTR-MAT-GRADE', 'ETP'),
        ('RAW-004', 'ATTR-CERT', 'ISO 9001'),
        ('RAW-004', 'ATTR-ORIGIN', 'Pakistan'),
        ('FIN-001', 'ATTR-COLOR', 'Silver'),
        ('FIN-001', 'ATTR-CERT', 'ISO 9001, CE'),
        ('FIN-001', 'ATTR-ORIGIN', 'China'),
        ('FIN-001', 'ATTR-TEMP-RANGE', '-40C to +120C'),
        ('CONS-001', 'ATTR-COLOR', 'Amber'),
        ('CONS-001', 'ATTR-ORIGIN', 'Pakistan')
    ) AS t(item_code, attr_code, text_value)
    JOIN item_attribute_definitions ad ON ad.attribute_code = t.attr_code AND ad.company_id = v_company_id
    WHERE i.item_code = t.item_code AND i.company_id = v_company_id
    ON CONFLICT (item_id, attribute_definition_id) DO NOTHING;
END $$;

-- =====================================================================
-- PART 6: ITEM SPECIFICATIONS
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_uom_mm UUID;
    v_uom_kg UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;
    SELECT id INTO v_uom_mm FROM uoms WHERE code = 'MM';
    SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG';

    INSERT INTO item_specifications (item_id, specification_name, specification_value, uom_id, min_value, max_value, target_value, tolerance_plus, tolerance_minus, is_critical, sort_order, status)
    SELECT i.id, s.spec_name, s.spec_value, CASE s.uom_idx WHEN 1 THEN v_uom_mm WHEN 2 THEN v_uom_kg WHEN 4 THEN v_uom_mm ELSE NULL END, s.min_val, s.max_val, s.target_val, s.tol_plus, s.tol_minus, s.critical, s.sort_order, 'ACTIVE'
    FROM items i
    CROSS JOIN (VALUES
        ('RAW-001', 'Thickness', '3.0', 1, 3.0, 3.0, 3.0, 0.1, 0.1, true, 1),
        ('RAW-001', 'Width', '1219', 1, 1219, 1219, 1219, 2, 2, true, 2),
        ('RAW-001', 'Length', '2438', 1, 2438, 2438, 2438, 3, 3, false, 3),
        ('RAW-001', 'Weight per Sheet', '57.3', 2, 55, 60, 57.3, 2, 2, false, 4),
        ('RAW-002', 'Diameter', '12.0', 1, 11.9, 12.1, 12.0, 0.1, 0.1, true, 1),
        ('RAW-002', 'Length', '6000', 1, 5950, 6050, 6000, 50, 50, false, 2),
        ('RAW-003', 'Melt Flow Index', '25', 3, 20, 30, 25, 5, 5, true, 1),
        ('RAW-004', 'Cross Section', '2.5', 4, 2.5, 2.5, 2.5, 0.05, 0.05, true, 1),
        ('FIN-001', 'Inner Diameter', '25', 1, 25, 25, 25, 0, 0, true, 1),
        ('FIN-001', 'Outer Diameter', '52', 1, 52, 52, 52, 0, 0, true, 2),
        ('FIN-001', 'Width', '15', 1, 15, 15, 15, 0, 0, true, 3)
    ) AS s(item_code, spec_name, spec_value, uom_idx, min_val, max_val, target_val, tol_plus, tol_minus, critical, sort_order)
    LEFT JOIN item_specifications ist ON ist.item_id = i.id AND ist.specification_name = s.spec_name
    WHERE i.item_code = s.item_code AND i.company_id = v_company_id
      AND ist.id IS NULL;
END $$;

-- =====================================================================
-- PART 7: ITEM DOCUMENTS
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;

    INSERT INTO item_documents (item_id, document_name, document_type, file_url, file_size, mime_type, description, is_primary, status)
    SELECT i.id, d.doc_name, d.doc_type, d.file_url, d.file_size, d.mime, d.descr, d.is_primary, 'ACTIVE'
    FROM items i
    CROSS JOIN (VALUES
        ('RAW-001', 'Steel Sheet Datasheet', 'SPECIFICATION', '/docs/raw-001-datasheet.pdf', 245000, 'application/pdf', 'Material specification and properties', true),
        ('RAW-001', 'Material Certificate', 'CERTIFICATE', '/docs/raw-001-certificate.pdf', 180000, 'application/pdf', 'Mill test certificate', false),
        ('RAW-002', 'Aluminum Rod Datasheet', 'SPECIFICATION', '/docs/raw-002-datasheet.pdf', 310000, 'application/pdf', 'Technical specifications', true),
        ('RAW-003', 'ABS Resin SDS', 'SAFETY_DATA_SHEET', '/docs/raw-003-sds.pdf', 520000, 'application/pdf', 'Safety data sheet', true),
        ('RAW-004', 'Copper Wire Certificate', 'CERTIFICATE', '/docs/raw-004-certificate.pdf', 150000, 'application/pdf', 'Conductivity test report', true),
        ('FIN-001', 'Bearing 6205 Datasheet', 'SPECIFICATION', '/docs/fin-001-datasheet.pdf', 290000, 'application/pdf', 'Bearing specifications and load ratings', true),
        ('FIN-001', 'Bearing Installation Manual', 'MANUAL', '/docs/fin-001-manual.pdf', 450000, 'application/pdf', 'Installation and maintenance guide', false),
        ('CONS-001', 'Hydraulic Oil SDS', 'SAFETY_DATA_SHEET', '/docs/cons-001-sds.pdf', 380000, 'application/pdf', 'Material safety data sheet', true),
        ('PKG-001', 'Box Specification', 'SPECIFICATION', '/docs/pkg-001-spec.pdf', 120000, 'application/pdf', 'Box dimensions and burst strength', true)
    ) AS d(item_code, doc_name, doc_type, file_url, file_size, mime, descr, is_primary)
    LEFT JOIN item_documents id ON id.item_id = i.id AND id.document_name = d.doc_name
    WHERE i.item_code = d.item_code AND i.company_id = v_company_id
      AND id.id IS NULL;
END $$;

-- =====================================================================
-- PART 8: CUSTOMER CONTACTS (2-3 per customer)
-- =====================================================================
DO $$
BEGIN
    INSERT INTO customer_contacts (customer_id, first_name, last_name, job_title, email, phone, mobile, is_primary, status)
    SELECT c.id, ct.first_name, ct.last_name, ct.job_title, ct.email, ct.phone, ct.mobile, ct.is_primary, 'ACTIVE'
    FROM customers c
    CROSS JOIN (VALUES
        ('CUST-0001', 'Ali', 'Raza', 'Procurement Manager', 'ali.raza@engsol.pk', '+92-21-34567890', '+92-300-1234567', true),
        ('CUST-0001', 'Hassan', 'Malik', 'Accounts Payable', 'hassan.malik@engsol.pk', '+92-21-34567891', '+92-321-9876543', false),
        ('CUST-0002', 'Saira', 'Khan', 'Managing Director', 'saira@nattrading.pk', '+92-42-37654321', '+92-333-4567890', true),
        ('CUST-0002', 'Imran', 'Siddiqui', 'Warehouse Incharge', 'imran@nattrading.pk', '+92-42-37654322', '+92-300-1122334', false),
        ('CUST-0003', 'Bilal', 'Ahmed', 'CTO', 'bilal@techstart.pk', '+92-51-23456789', '+92-345-6789012', true),
        ('CUST-0003', 'Nadia', 'Irfan', 'Office Admin', 'nadia@techstart.pk', '+92-51-23456790', '+92-321-3456789', false),
        ('CUST-0004', 'Usman', 'Malik', 'Chief Buyer', 'usman@metrowholesale.pk', '+92-21-38765432', '+92-300-9876543', true),
        ('CUST-0004', 'Amina', 'Sheikh', 'Finance Director', 'amina@metrowholesale.pk', '+92-21-38765433', '+92-345-1234567', false),
        ('CUST-0004', 'Tariq', 'Rahman', 'Logistics Manager', 'tariq@metrowholesale.pk', '+92-21-38765434', '+92-321-4567890', false),
        ('CUST-0005', 'Fatima', 'Shah', 'Operations Head', 'fatima@greenvalley.pk', '+92-42-36547890', '+92-333-5678901', true),
        ('CUST-0006', 'Omar', 'Farooq', 'Owner', 'omar@bluestar.pk', '+92-21-35678901', '+92-300-6789012', true),
        ('CUST-0007', 'Zahid', 'Hussain', 'Project Director', 'zahid@frontierconst.pk', '+92-91-23456789', '+92-345-7890123', true),
        ('CUST-0007', 'Rashid', 'Khan', 'Procurement Officer', 'rashid@frontierconst.pk', '+92-91-23456790', '+92-321-8901234', false),
        ('CUST-0008', 'Ayesha', 'Noor', 'General Manager', 'ayesha@sindhtextile.pk', '+92-21-39876543', '+92-333-9012345', true),
        ('CUST-0009', 'Hassan', 'Ali', 'Sales Director', 'hassan@pakdairy.pk', '+92-42-38765433', '+92-300-0123456', true),
        ('CUST-0010', 'Ahmad', 'Wali', 'Managing Partner', 'ahmad@kabulexport.af', '+93-700-123456', '+93-700-654321', true)
    ) AS ct(customer_code, first_name, last_name, job_title, email, phone, mobile, is_primary)
    WHERE c.customer_code = ct.customer_code
      AND NOT EXISTS (SELECT 1 FROM customer_contacts cc WHERE cc.customer_id = c.id AND cc.email = ct.email);
END $$;

-- =====================================================================
-- PART 9: CUSTOMER ADDRESSES
-- =====================================================================
DO $$
BEGIN
    INSERT INTO customer_addresses (customer_id, address_type, address_line1, address_line2, city, state, postal_code, country, is_default, status)
    SELECT c.id, ca.address_type, ca.line1, ca.line2, ca.city, ca.state, ca.postal, ca.country, ca.is_default, 'ACTIVE'
    FROM customers c
    CROSS JOIN (VALUES
        ('CUST-0001', 'BILLING', 'Suite 201, Tech Plaza', 'Sharah-e-Faisal', 'Karachi', 'Sindh', '75400', 'Pakistan', true),
        ('CUST-0001', 'SHIPPING', 'Plot 45, Industrial Area', 'SITE', 'Karachi', 'Sindh', '75700', 'Pakistan', false),
        ('CUST-0002', 'BILLING', '123 Mall Road', 'Gulberg III', 'Lahore', 'Punjab', '54660', 'Pakistan', true),
        ('CUST-0003', 'BILLING', 'Office 5, Blue Area', 'F-7 Markaz', 'Islamabad', 'ICT', '44000', 'Pakistan', true),
        ('CUST-0004', 'BOTH', 'Metro Center, Rashid Minhas Rd', 'Gulshan-e-Iqbal', 'Karachi', 'Sindh', '75300', 'Pakistan', true),
        ('CUST-0005', 'BILLING', '67 Industrial Boulevard', 'Mughalpura', 'Lahore', 'Punjab', '54810', 'Pakistan', true),
        ('CUST-0005', 'SHIPPING', 'Warehouse 12, Ring Road', 'Samanabad', 'Lahore', 'Punjab', '54900', 'Pakistan', false),
        ('CUST-0006', 'BOTH', '22 Electronics Market', 'Tariq Road', 'Karachi', 'Sindh', '75350', 'Pakistan', true),
        ('CUST-0007', 'BILLING', 'Frontier House', 'University Road', 'Peshawar', 'KPK', '25000', 'Pakistan', true),
        ('CUST-0007', 'SHIPPING', 'Project Site, Ring Road', 'Hayatabad', 'Peshawar', 'KPK', '25100', 'Pakistan', false),
        ('CUST-0008', 'BILLING', 'Unit 5, Textile Mills Estate', 'SITE Area', 'Karachi', 'Sindh', '75600', 'Pakistan', true),
        ('CUST-0009', 'BOTH', 'Dairy Complex, Multan Road', 'Tonara', 'Lahore', 'Punjab', '54800', 'Pakistan', true),
        ('CUST-0010', 'BOTH', 'Afghan Trade Center', 'Salang Square', 'Kabul', 'Kabul', '1001', 'Afghanistan', true)
    ) AS ca(customer_code, address_type, line1, line2, city, state, postal, country, is_default)
    WHERE c.customer_code = ca.customer_code
      AND NOT EXISTS (SELECT 1 FROM customer_addresses ca2 WHERE ca2.customer_id = c.id AND ca2.address_line1 = ca.line1);
END $$;

-- =====================================================================
-- PART 10: SUPPLIERS (5 Pakistani suppliers)
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;

    INSERT INTO suppliers (company_id, supplier_code, name, short_name, contact_person, email, phone, website, tax_number, registration_number, address_line1, city, state, country, currency_code, payment_terms, credit_limit, lead_time_days, rating, status)
    VALUES
        (v_company_id, 'SUP-001', 'Pak Steel Industries', 'PakSteel', 'Muhammad Aslam', 'aslam@paksteel.pk', '+92-21-32567890', 'www.paksteel.pk', 'NTN-1234567', 'REG-9876', 'Steel Mill Road, SITE', 'Karachi', 'Sindh', 'Pakistan', 'PKR', 'NET45', 5000000, 14, 4, 'ACTIVE'),
        (v_company_id, 'SUP-002', 'National Copper & Aluminum', 'NatCuAl', 'Faisal Naveed', 'faisal@natcual.pk', '+92-42-35678901', 'www.natcual.pk', 'NTN-2345678', 'REG-8765', '15-KM Ferozepur Road', 'Lahore', 'Punjab', 'Pakistan', 'PKR', 'NET30', 3000000, 10, 4, 'ACTIVE'),
        (v_company_id, 'SUP-003', 'Sindh Petrochemicals', 'SindhPetro', 'Dr. Aftab Akhtar', 'aftab@sindhpetro.pk', '+92-21-34567890', 'www.sindhpetro.pk', 'NTN-3456789', 'REG-7654', 'Hub Industrial Estate', 'Hub Balochistan', 'Balochistan', 'Pakistan', 'PKR', 'NET60', 2000000, 7, 3, 'ACTIVE'),
        (v_company_id, 'SUP-004', 'Precision Bearings Pakistan', 'PrecBrg', 'Kamran Tariq', 'kamran@precbrg.pk', '+92-21-35678901', 'www.precbrg.pk', 'NTN-4567890', 'REG-6543', 'North Nazimabad Industrial', 'Karachi', 'Sindh', 'Pakistan', 'PKR', 'NET30', 1500000, 5, 5, 'ACTIVE'),
        (v_company_id, 'SUP-005', 'Chiniot Packaging Industries', 'ChnPkg', 'Rana Mehmood', 'mehmood@chiniotpkg.pk', '+92-47-32345678', 'www.chiniotpkg.pk', 'NTN-5678901', 'REG-5432', 'Chiniot Bypass Road', 'Chiniot', 'Punjab', 'Pakistan', 'PKR', 'NET15', 800000, 3, 4, 'ACTIVE')
    ON CONFLICT (supplier_code, company_id) DO NOTHING;
END $$;

-- =====================================================================
-- PART 11: SUPPLIER ITEMS
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_sup1 UUID; v_sup2 UUID; v_sup3 UUID; v_sup4 UUID; v_sup5 UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;

    SELECT id INTO v_sup1 FROM suppliers WHERE supplier_code = 'SUP-001' AND company_id = v_company_id;
    SELECT id INTO v_sup2 FROM suppliers WHERE supplier_code = 'SUP-002' AND company_id = v_company_id;
    SELECT id INTO v_sup3 FROM suppliers WHERE supplier_code = 'SUP-003' AND company_id = v_company_id;
    SELECT id INTO v_sup4 FROM suppliers WHERE supplier_code = 'SUP-004' AND company_id = v_company_id;
    SELECT id INTO v_sup5 FROM suppliers WHERE supplier_code = 'SUP-005' AND company_id = v_company_id;

    INSERT INTO supplier_items (company_id, supplier_id, item_id, supplier_part_number, unit_price, currency_code, lead_time_days, minimum_order_quantity, status)
    SELECT v_company_id, sup.id, i.id, si.part_no, si.price, 'PKR', si.lead_time, si.moq, 'ACTIVE'
    FROM items i
    CROSS JOIN (VALUES
        ('RAW-001', 'SUP-001', 'PS-SS3MM', 175.00, 7, 500),
        ('RAW-002', 'SUP-002', 'NC-AR12', 410.00, 10, 200),
        ('RAW-003', 'SUP-003', 'SP-ABS25', 340.00, 14, 100),
        ('RAW-004', 'SUP-002', 'NC-CW25', 1180.00, 5, 100),
        ('FIN-001', 'SUP-004', 'PB-6205', 820.00, 3, 50),
        ('PKG-001', 'SUP-005', 'CP-BOX18', 42.00, 3, 200)
    ) AS si(item_code, sup_code, part_no, price, lead_time, moq)
    JOIN suppliers sup ON sup.supplier_code = si.sup_code AND sup.company_id = v_company_id
    WHERE i.item_code = si.item_code AND i.company_id = v_company_id
      AND NOT EXISTS (SELECT 1 FROM supplier_items sub WHERE sub.supplier_id = sup.id AND sub.item_id = i.id);
END $$;

-- =====================================================================
-- PART 12: PURCHASE REQUISITIONS + LINES
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_admin UUID;
    v_uom_ea UUID;
    v_uom_kg UUID;
    v_uom_l UUID;
    v_item_steel UUID; v_item_al UUID; v_item_abs UUID; v_item_cu UUID;
    v_item_brg UUID; v_item_oil UUID; v_item_box UUID;
    v_sup1 UUID; v_sup2 UUID; v_sup3 UUID; v_sup4 UUID; v_sup5 UUID;
    v_wh1 UUID;
    v_pr1 UUID; v_pr2 UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;

    SELECT id INTO v_admin FROM erp_users LIMIT 1;
    SELECT id INTO v_uom_ea FROM uoms WHERE code = 'EA';
    SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG';
    SELECT id INTO v_uom_l FROM uoms WHERE code = 'L';

    SELECT id INTO v_item_steel FROM items WHERE item_code = 'RAW-001' AND company_id = v_company_id;
    SELECT id INTO v_item_al FROM items WHERE item_code = 'RAW-002' AND company_id = v_company_id;
    SELECT id INTO v_item_abs FROM items WHERE item_code = 'RAW-003' AND company_id = v_company_id;
    SELECT id INTO v_item_cu FROM items WHERE item_code = 'RAW-004' AND company_id = v_company_id;
    SELECT id INTO v_item_brg FROM items WHERE item_code = 'FIN-001' AND company_id = v_company_id;
    SELECT id INTO v_item_oil FROM items WHERE item_code = 'CONS-001' AND company_id = v_company_id;
    SELECT id INTO v_item_box FROM items WHERE item_code = 'PKG-001' AND company_id = v_company_id;

    SELECT id INTO v_sup1 FROM suppliers WHERE supplier_code = 'SUP-001' AND company_id = v_company_id;
    SELECT id INTO v_sup2 FROM suppliers WHERE supplier_code = 'SUP-002' AND company_id = v_company_id;
    SELECT id INTO v_sup3 FROM suppliers WHERE supplier_code = 'SUP-003' AND company_id = v_company_id;
    SELECT id INTO v_sup4 FROM suppliers WHERE supplier_code = 'SUP-004' AND company_id = v_company_id;
    SELECT id INTO v_sup5 FROM suppliers WHERE supplier_code = 'SUP-005' AND company_id = v_company_id;

    SELECT id INTO v_wh1 FROM warehouses WHERE company_id = v_company_id LIMIT 1;

    -- Purchase Requisitions
    INSERT INTO purchase_requisitions (company_id, requisition_code, title, description, request_type, requested_delivery_date, department, status, approved_by, approved_at, notes)
    VALUES
        (v_company_id, 'PR-2026-001', 'Monthly Raw Material Requisition', 'Monthly stock replenishment for raw materials', 'STANDARD', CURRENT_DATE + INTERVAL '14 days', 'Production', 'APPROVED', v_admin, NOW() - INTERVAL '10 days', 'Regular monthly requisition'),
        (v_company_id, 'PR-2026-002', 'Urgent Component Order', 'Urgent bearing replacement needed', 'URGENT', CURRENT_DATE + INTERVAL '3 days', 'Maintenance', 'APPROVED', v_admin, NOW() - INTERVAL '2 days', 'Critical spare parts needed')
    ON CONFLICT (requisition_code, company_id) DO NOTHING;

    SELECT id INTO v_pr1 FROM purchase_requisitions WHERE requisition_code = 'PR-2026-001' AND company_id = v_company_id;
    SELECT id INTO v_pr2 FROM purchase_requisitions WHERE requisition_code = 'PR-2026-002' AND company_id = v_company_id;

    -- PR Lines for PR-1
    INSERT INTO purchase_requisition_lines (requisition_id, line_number, item_id, uom_id, quantity, estimated_unit_price, estimated_total_price, required_date, warehouse_id, supplier_id, status)
    SELECT v_pr1, ln.line_num, i.id, u.id, ln.qty, ln.uprice, ln.tprice, CURRENT_DATE + INTERVAL '14 days', v_wh1, s.id, 'OPEN'
    FROM (VALUES
        (1, 'RAW-001', 'KG', 5000, 175.00, 875000, 'SUP-001'),
        (2, 'RAW-002', 'KG', 2000, 410.00, 820000, 'SUP-002'),
        (3, 'RAW-003', 'KG', 1000, 340.00, 340000, 'SUP-003'),
        (4, 'RAW-004', 'KG', 500, 1180.00, 590000, 'SUP-002')
    ) AS ln(line_num, item_code, uom_code, qty, uprice, tprice, sup_code)
    JOIN items i ON i.item_code = ln.item_code AND i.company_id = v_company_id
    JOIN uoms u ON u.code = ln.uom_code
    JOIN suppliers s ON s.supplier_code = ln.sup_code AND s.company_id = v_company_id
    WHERE NOT EXISTS (SELECT 1 FROM purchase_requisition_lines prl WHERE prl.requisition_id = v_pr1 AND prl.line_number = ln.line_num);

    -- PR Lines for PR-2
    INSERT INTO purchase_requisition_lines (requisition_id, line_number, item_id, uom_id, quantity, estimated_unit_price, estimated_total_price, required_date, warehouse_id, supplier_id, status)
    SELECT v_pr2, ln.line_num, i.id, u.id, ln.qty, ln.uprice, ln.tprice, CURRENT_DATE + INTERVAL '3 days', v_wh1, s.id, 'OPEN'
    FROM (VALUES
        (1, 'FIN-001', 'EA', 50, 820.00, 41000, 'SUP-004'),
        (2, 'CONS-001', 'L', 40, 2200.00, 88000, 'SUP-003')
    ) AS ln(line_num, item_code, uom_code, qty, uprice, tprice, sup_code)
    JOIN items i ON i.item_code = ln.item_code AND i.company_id = v_company_id
    JOIN uoms u ON u.code = ln.uom_code
    JOIN suppliers s ON s.supplier_code = ln.sup_code AND s.company_id = v_company_id
    WHERE NOT EXISTS (SELECT 1 FROM purchase_requisition_lines prl WHERE prl.requisition_id = v_pr2 AND prl.line_number = ln.line_num);
END $$;

-- =====================================================================
-- PART 13: RFQs + LINES
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_admin UUID;
    v_uom_kg UUID; v_uom_ea UUID; v_uom_l UUID;
    v_sup1 UUID; v_sup2 UUID; v_sup3 UUID; v_sup4 UUID;
    v_pr1 UUID;
    v_rfq1 UUID; v_rfq2 UUID;
    v_item_steel UUID; v_item_al UUID; v_item_abs UUID; v_item_cu UUID;
    v_item_brg UUID; v_item_oil UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;
    SELECT id INTO v_admin FROM erp_users LIMIT 1;
    SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG';
    SELECT id INTO v_uom_ea FROM uoms WHERE code = 'EA';
    SELECT id INTO v_uom_l FROM uoms WHERE code = 'L';

    SELECT id INTO v_sup1 FROM suppliers WHERE supplier_code = 'SUP-001' AND company_id = v_company_id;
    SELECT id INTO v_sup2 FROM suppliers WHERE supplier_code = 'SUP-002' AND company_id = v_company_id;
    SELECT id INTO v_sup3 FROM suppliers WHERE supplier_code = 'SUP-003' AND company_id = v_company_id;
    SELECT id INTO v_sup4 FROM suppliers WHERE supplier_code = 'SUP-004' AND company_id = v_company_id;

    SELECT id INTO v_pr1 FROM purchase_requisitions WHERE requisition_code = 'PR-2026-001' AND company_id = v_company_id;

    SELECT id INTO v_item_steel FROM items WHERE item_code = 'RAW-001' AND company_id = v_company_id;
    SELECT id INTO v_item_al FROM items WHERE item_code = 'RAW-002' AND company_id = v_company_id;
    SELECT id INTO v_item_abs FROM items WHERE item_code = 'RAW-003' AND company_id = v_company_id;
    SELECT id INTO v_item_cu FROM items WHERE item_code = 'RAW-004' AND company_id = v_company_id;
    SELECT id INTO v_item_brg FROM items WHERE item_code = 'FIN-001' AND company_id = v_company_id;
    SELECT id INTO v_item_oil FROM items WHERE item_code = 'CONS-001' AND company_id = v_company_id;

    INSERT INTO request_for_quotations (company_id, rfq_code, title, description, supplier_id, requisition_id, issue_date, due_date, status, notes)
    VALUES
        (v_company_id, 'RFQ-2026-001', 'Steel Sheet RFQ - Monthly', 'Request for quotation for monthly steel requirement', v_sup1, v_pr1, CURRENT_DATE - INTERVAL '8 days', CURRENT_DATE + INTERVAL '7 days', 'SENT', 'Standard monthly RFQ'),
        (v_company_id, 'RFQ-2026-002', 'Multi-Material RFQ', 'Request for aluminum and copper pricing', v_sup2, NULL, CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '10 days', 'SENT', 'Quarterly material RFQ'),
        (v_company_id, 'RFQ-2026-003', 'Bearing Supply RFQ', 'Bearing and lubricant procurement', v_sup4, NULL, CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE + INTERVAL '12 days', 'DRAFT', 'Maintenance supplies')
    ON CONFLICT (rfq_code, company_id) DO NOTHING;

    SELECT id INTO v_rfq1 FROM request_for_quotations WHERE rfq_code = 'RFQ-2026-001' AND company_id = v_company_id;
    SELECT id INTO v_rfq2 FROM request_for_quotations WHERE rfq_code = 'RFQ-2026-002' AND company_id = v_company_id;

    INSERT INTO rfq_lines (rfq_id, line_number, item_id, uom_id, quantity, notes)
    SELECT v_rfq1, rl.line_num, i.id, u.id, rl.qty, rl.notes
    FROM (VALUES
        (1, 'RAW-001', 'KG', 5000, 'Monthly requirement'),
        (2, 'RAW-002', 'KG', 2000, 'Secondary material')
    ) AS rl(line_num, item_code, uom_code, qty, notes)
    JOIN items i ON i.item_code = rl.item_code AND i.company_id = v_company_id
    JOIN uoms u ON u.code = rl.uom_code
    WHERE NOT EXISTS (SELECT 1 FROM rfq_lines rlf WHERE rlf.rfq_id = v_rfq1 AND rlf.line_number = rl.line_num);

    INSERT INTO rfq_lines (rfq_id, line_number, item_id, uom_id, quantity, notes)
    SELECT v_rfq2, rl.line_num, i.id, u.id, rl.qty, rl.notes
    FROM (VALUES
        (1, 'RAW-002', 'KG', 2000, 'Aluminum rods'),
        (2, 'RAW-004', 'KG', 500, 'Copper wire')
    ) AS rl(line_num, item_code, uom_code, qty, notes)
    JOIN items i ON i.item_code = rl.item_code AND i.company_id = v_company_id
    JOIN uoms u ON u.code = rl.uom_code
    WHERE NOT EXISTS (SELECT 1 FROM rfq_lines rlf WHERE rlf.rfq_id = v_rfq2 AND rlf.line_number = rl.line_num);
END $$;

-- =====================================================================
-- PART 14: PUBLIC SCHEMA QUOTATIONS + LINES (Supplier Quotations)
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_admin UUID;
    v_sup1 UUID; v_sup2 UUID;
    v_rfq1 UUID; v_rfq2 UUID;
    v_uom_kg UUID;
    v_item_steel UUID; v_item_al UUID; v_item_cu UUID;
    v_quot1 UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;
    SELECT id INTO v_admin FROM erp_users LIMIT 1;
    SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG';

    SELECT id INTO v_sup1 FROM suppliers WHERE supplier_code = 'SUP-001' AND company_id = v_company_id;
    SELECT id INTO v_sup2 FROM suppliers WHERE supplier_code = 'SUP-002' AND company_id = v_company_id;
    SELECT id INTO v_rfq1 FROM request_for_quotations WHERE rfq_code = 'RFQ-2026-001' AND company_id = v_company_id;
    SELECT id INTO v_rfq2 FROM request_for_quotations WHERE rfq_code = 'RFQ-2026-002' AND company_id = v_company_id;

    SELECT id INTO v_item_steel FROM items WHERE item_code = 'RAW-001' AND company_id = v_company_id;
    SELECT id INTO v_item_al FROM items WHERE item_code = 'RAW-002' AND company_id = v_company_id;
    SELECT id INTO v_item_cu FROM items WHERE item_code = 'RAW-004' AND company_id = v_company_id;

    INSERT INTO public.quotations (company_id, quotation_code, rfq_id, supplier_id, quotation_date, valid_until, payment_terms, delivery_terms, total_amount, discount_percent, tax_percent, status, notes)
    VALUES
        (v_company_id, 'PQ-2026-001', v_rfq1, v_sup1, CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '25 days', 'NET45', 'FOB Karachi', 1750000, 2, 17, 'RECEIVED', 'Steel quotation with volume discount'),
        (v_company_id, 'PQ-2026-002', v_rfq2, v_sup2, CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE + INTERVAL '20 days', 'NET30', 'Ex-works Lahore', 1350000, 0, 17, 'EVALUATED', 'Aluminum and copper combined quote')
    ON CONFLICT (quotation_code, company_id) DO NOTHING;

    SELECT id INTO v_quot1 FROM public.quotations WHERE quotation_code = 'PQ-2026-001' AND company_id = v_company_id;

    INSERT INTO public.quotation_lines (quotation_id, line_number, item_id, uom_id, quantity, unit_price, discount_percent, total_price, lead_time_days, notes)
    SELECT v_quot1, ql.line_num, i.id, u.id, ql.qty, ql.uprice, ql.disc, ql.tprice, ql.lead, ql.notes
    FROM (VALUES
        (1, 'RAW-001', 'KG', 5000, 175, 2, 857500, 7, 'Standard grade'),
        (2, 'RAW-002', 'KG', 2000, 410, 0, 820000, 10, '6061-T6 grade')
    ) AS ql(line_num, item_code, uom_code, qty, uprice, disc, tprice, lead, notes)
    JOIN items i ON i.item_code = ql.item_code AND i.company_id = v_company_id
    JOIN uoms u ON u.code = ql.uom_code
    WHERE NOT EXISTS (SELECT 1 FROM public.quotation_lines qln WHERE qln.quotation_id = v_quot1 AND qln.line_number = ql.line_num);
END $$;

-- =====================================================================
-- PART 15: PURCHASE ORDERS + LINES
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_admin UUID;
    v_uom_kg UUID; v_uom_ea UUID; v_uom_l UUID;
    v_item_steel UUID; v_item_al UUID; v_item_abs UUID; v_item_cu UUID; v_item_brg UUID; v_item_oil UUID; v_item_box UUID;
    v_sup1 UUID; v_sup2 UUID; v_sup3 UUID; v_sup4 UUID; v_sup5 UUID;
    v_wh1 UUID;
    v_pr1 UUID; v_pr2 UUID;
    v_po1 UUID; v_po2 UUID; v_po3 UUID;
    v_po1l1 UUID; v_po1l2 UUID; v_po1l3 UUID;
    v_po2l1 UUID; v_po2l2 UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;
    SELECT id INTO v_admin FROM erp_users LIMIT 1;
    SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG';
    SELECT id INTO v_uom_ea FROM uoms WHERE code = 'EA';
    SELECT id INTO v_uom_l FROM uoms WHERE code = 'L';
    SELECT id INTO v_wh1 FROM warehouses WHERE company_id = v_company_id LIMIT 1;

    SELECT id INTO v_item_steel FROM items WHERE item_code = 'RAW-001' AND company_id = v_company_id;
    SELECT id INTO v_item_al FROM items WHERE item_code = 'RAW-002' AND company_id = v_company_id;
    SELECT id INTO v_item_abs FROM items WHERE item_code = 'RAW-003' AND company_id = v_company_id;
    SELECT id INTO v_item_cu FROM items WHERE item_code = 'RAW-004' AND company_id = v_company_id;
    SELECT id INTO v_item_brg FROM items WHERE item_code = 'FIN-001' AND company_id = v_company_id;
    SELECT id INTO v_item_oil FROM items WHERE item_code = 'CONS-001' AND company_id = v_company_id;
    SELECT id INTO v_item_box FROM items WHERE item_code = 'PKG-001' AND company_id = v_company_id;

    SELECT id INTO v_sup1 FROM suppliers WHERE supplier_code = 'SUP-001' AND company_id = v_company_id;
    SELECT id INTO v_sup2 FROM suppliers WHERE supplier_code = 'SUP-002' AND company_id = v_company_id;
    SELECT id INTO v_sup3 FROM suppliers WHERE supplier_code = 'SUP-003' AND company_id = v_company_id;
    SELECT id INTO v_sup4 FROM suppliers WHERE supplier_code = 'SUP-004' AND company_id = v_company_id;
    SELECT id INTO v_sup5 FROM suppliers WHERE supplier_code = 'SUP-005' AND company_id = v_company_id;

    SELECT id INTO v_pr1 FROM purchase_requisitions WHERE requisition_code = 'PR-2026-001' AND company_id = v_company_id;
    SELECT id INTO v_pr2 FROM purchase_requisitions WHERE requisition_code = 'PR-2026-002' AND company_id = v_company_id;

    -- Purchase Orders
    INSERT INTO purchase_orders (company_id, po_code, supplier_id, requisition_id, order_date, expected_delivery_date, delivery_address, payment_terms, currency_code, subtotal, tax_percent, tax_amount, total_amount, status, approved_by, approved_at, notes)
    VALUES
        (v_company_id, 'PO-2026-001', v_sup1, v_pr1, CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '9 days', 'Plot 45, SITE Industrial Area, Karachi', 'NET45', 'PKR', 1750000, 17, 297500, 2047500, 'APPROVED', v_admin, NOW() - INTERVAL '3 days', 'Monthly steel supply order'),
        (v_company_id, 'PO-2026-002', v_sup2, v_pr1, CURRENT_DATE - INTERVAL '4 days', CURRENT_DATE + INTERVAL '11 days', 'Plot 45, SITE Industrial Area, Karachi', 'NET30', 'PKR', 1410000, 17, 239700, 1649700, 'APPROVED', v_admin, NOW() - INTERVAL '2 days', 'Aluminum and copper order'),
        (v_company_id, 'PO-2026-003', v_sup4, v_pr2, CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE + INTERVAL '5 days', 'Maintenance Workshop, Karachi', 'NET30', 'PKR', 41000, 17, 6970, 47970, 'APPROVED', v_admin, NOW() - INTERVAL '1 days', 'Urgent bearing order')
    ON CONFLICT (po_code, company_id) DO NOTHING;

    SELECT id INTO v_po1 FROM purchase_orders WHERE po_code = 'PO-2026-001' AND company_id = v_company_id;
    SELECT id INTO v_po2 FROM purchase_orders WHERE po_code = 'PO-2026-002' AND company_id = v_company_id;
    SELECT id INTO v_po3 FROM purchase_orders WHERE po_code = 'PO-2026-003' AND company_id = v_company_id;

    -- PO Lines
    INSERT INTO purchase_order_lines (po_id, line_number, item_id, uom_id, quantity, unit_price, discount_percent, total_price, received_quantity, warehouse_id, required_date, notes)
    SELECT v_po1, pl.line_num, i.id, u.id, pl.qty, pl.uprice, pl.disc, pl.tprice, pl.rcvd, v_wh1, CURRENT_DATE + INTERVAL '9 days', pl.notes
    FROM (VALUES
        (1, 'RAW-001', 'KG', 5000, 175, 2, 857500, 0, 'Standard grade sheets'),
        (2, 'RAW-002', 'KG', 2000, 410, 0, 820000, 0, 'Aluminum rods'),
        (3, 'RAW-003', 'KG', 500, 340, 0, 170000, 0, 'ABS resin')
    ) AS pl(line_num, item_code, uom_code, qty, uprice, disc, tprice, rcvd, notes)
    JOIN items i ON i.item_code = pl.item_code AND i.company_id = v_company_id
    JOIN uoms u ON u.code = pl.uom_code
    WHERE NOT EXISTS (SELECT 1 FROM purchase_order_lines pol WHERE pol.po_id = v_po1 AND pol.line_number = pl.line_num);

    SELECT id INTO v_po1l1 FROM purchase_order_lines WHERE po_id = v_po1 AND line_number = 1;
    SELECT id INTO v_po1l2 FROM purchase_order_lines WHERE po_id = v_po1 AND line_number = 2;
    SELECT id INTO v_po1l3 FROM purchase_order_lines WHERE po_id = v_po1 AND line_number = 3;

    INSERT INTO purchase_order_lines (po_id, line_number, item_id, uom_id, quantity, unit_price, discount_percent, total_price, received_quantity, warehouse_id, required_date, notes)
    SELECT v_po2, pl.line_num, i.id, u.id, pl.qty, pl.uprice, 0, pl.tprice, pl.rcvd, v_wh1, CURRENT_DATE + INTERVAL '11 days', pl.notes
    FROM (VALUES
        (1, 'RAW-002', 'KG', 2000, 410, 820000, 2000, 'Aluminum rods'),
        (2, 'RAW-004', 'KG', 500, 1180, 590000, 500, 'Copper wire')
    ) AS pl(line_num, item_code, uom_code, qty, uprice, tprice, rcvd, notes)
    JOIN items i ON i.item_code = pl.item_code AND i.company_id = v_company_id
    JOIN uoms u ON u.code = pl.uom_code
    WHERE NOT EXISTS (SELECT 1 FROM purchase_order_lines pol WHERE pol.po_id = v_po2 AND pol.line_number = pl.line_num);

    SELECT id INTO v_po2l1 FROM purchase_order_lines WHERE po_id = v_po2 AND line_number = 1;
    SELECT id INTO v_po2l2 FROM purchase_order_lines WHERE po_id = v_po2 AND line_number = 2;

    INSERT INTO purchase_order_lines (po_id, line_number, item_id, uom_id, quantity, unit_price, discount_percent, total_price, received_quantity, warehouse_id, required_date, notes)
    SELECT v_po3, pl.line_num, i.id, u.id, pl.qty, pl.uprice, 0, pl.tprice, pl.rcvd, v_wh1, CURRENT_DATE + INTERVAL '5 days', pl.notes
    FROM (VALUES
        (1, 'FIN-001', 'EA', 50, 820, 41000, 0, 'Precision bearings'),
        (2, 'CONS-001', 'L', 20, 2200, 44000, 0, 'Hydraulic oil')
    ) AS pl(line_num, item_code, uom_code, qty, uprice, tprice, rcvd, notes)
    JOIN items i ON i.item_code = pl.item_code AND i.company_id = v_company_id
    JOIN uoms u ON u.code = pl.uom_code
    WHERE NOT EXISTS (SELECT 1 FROM purchase_order_lines pol WHERE pol.po_id = v_po3 AND pol.line_number = pl.line_num);
END $$;

-- =====================================================================
-- PART 16: GOODS RECEIPTS + LINES
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_admin UUID;
    v_uom_kg UUID; v_uom_ea UUID; v_uom_l UUID;
    v_item_steel UUID; v_item_al UUID; v_item_brg UUID; v_item_oil UUID;
    v_sup1 UUID; v_sup2 UUID; v_sup4 UUID;
    v_wh1 UUID;
    v_po1 UUID; v_po2 UUID; v_po3 UUID;
    v_po1l1 UUID; v_po1l2 UUID;
    v_po2l1 UUID;
    v_po3l1 UUID;
    v_gr1 UUID; v_gr2 UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;
    SELECT id INTO v_admin FROM erp_users LIMIT 1;
    SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG';
    SELECT id INTO v_uom_ea FROM uoms WHERE code = 'EA';
    SELECT id INTO v_uom_l FROM uoms WHERE code = 'L';
    SELECT id INTO v_wh1 FROM warehouses WHERE company_id = v_company_id LIMIT 1;

    SELECT id INTO v_item_steel FROM items WHERE item_code = 'RAW-001' AND company_id = v_company_id;
    SELECT id INTO v_item_al FROM items WHERE item_code = 'RAW-002' AND company_id = v_company_id;
    SELECT id INTO v_item_brg FROM items WHERE item_code = 'FIN-001' AND company_id = v_company_id;
    SELECT id INTO v_item_oil FROM items WHERE item_code = 'CONS-001' AND company_id = v_company_id;

    SELECT id INTO v_sup1 FROM suppliers WHERE supplier_code = 'SUP-001' AND company_id = v_company_id;
    SELECT id INTO v_sup2 FROM suppliers WHERE supplier_code = 'SUP-002' AND company_id = v_company_id;
    SELECT id INTO v_sup4 FROM suppliers WHERE supplier_code = 'SUP-004' AND company_id = v_company_id;

    SELECT id INTO v_po1 FROM purchase_orders WHERE po_code = 'PO-2026-001' AND company_id = v_company_id;
    SELECT id INTO v_po2 FROM purchase_orders WHERE po_code = 'PO-2026-002' AND company_id = v_company_id;
    SELECT id INTO v_po3 FROM purchase_orders WHERE po_code = 'PO-2026-003' AND company_id = v_company_id;

    SELECT id INTO v_po1l1 FROM purchase_order_lines WHERE po_id = v_po1 AND line_number = 1;
    SELECT id INTO v_po1l2 FROM purchase_order_lines WHERE po_id = v_po1 AND line_number = 2;
    SELECT id INTO v_po2l1 FROM purchase_order_lines WHERE po_id = v_po2 AND line_number = 1;
    SELECT id INTO v_po3l1 FROM purchase_order_lines WHERE po_id = v_po3 AND line_number = 1;

    -- Goods Receipt 1: Partial receipt of PO-001
    INSERT INTO goods_receipts (company_id, receipt_code, po_id, supplier_id, warehouse_id, receipt_date, delivery_note_number, grn_number, status, posted_by, posted_at, notes)
    VALUES
        (v_company_id, 'GRN-2026-001', v_po1, v_sup1, v_wh1, NOW() - INTERVAL '2 days', 'DN-PS-4521', 'GRN-2026-001', 'POSTED', v_admin, NOW() - INTERVAL '1 day', 'Partial receipt - 3000kg steel received'),
        (v_company_id, 'GRN-2026-002', v_po2, v_sup2, v_wh1, NOW() - INTERVAL '1 day', 'DN-NCA-1187', 'GRN-2026-002', 'ACCEPTED', NULL, NULL, 'Full receipt of aluminum and copper')
    ON CONFLICT (receipt_code, company_id) DO NOTHING;

    SELECT id INTO v_gr1 FROM goods_receipts WHERE receipt_code = 'GRN-2026-001' AND company_id = v_company_id;
    SELECT id INTO v_gr2 FROM goods_receipts WHERE receipt_code = 'GRN-2026-002' AND company_id = v_company_id;

    INSERT INTO goods_receipt_lines (receipt_id, po_line_id, item_id, uom_id, quantity_ordered, quantity_received, quantity_accepted, quantity_rejected, unit_price, notes)
    SELECT v_gr1, v_po1l1, v_item_steel, v_uom_kg, 5000, 3000, 3000, 0, 175, 'Partial delivery - remaining 2000kg pending'
    WHERE NOT EXISTS (SELECT 1 FROM goods_receipt_lines grl WHERE grl.receipt_id = v_gr1 AND grl.po_line_id = v_po1l1);

    INSERT INTO goods_receipt_lines (receipt_id, po_line_id, item_id, uom_id, quantity_ordered, quantity_received, quantity_accepted, quantity_rejected, unit_price, notes)
    SELECT v_gr2, v_po2l1, v_item_al, v_uom_kg, 2000, 2000, 2000, 0, 410, 'Full delivery accepted'
    WHERE NOT EXISTS (SELECT 1 FROM goods_receipt_lines grl WHERE grl.receipt_id = v_gr2 AND grl.po_line_id = v_po2l1);
END $$;

-- =====================================================================
-- PART 17: PURCHASE RETURNS + LINES
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_admin UUID;
    v_uom_kg UUID;
    v_item_al UUID;
    v_sup2 UUID;
    v_wh1 UUID;
    v_po2 UUID;
    v_po2l1 UUID;
    v_ret1 UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;
    SELECT id INTO v_admin FROM erp_users LIMIT 1;
    SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG';
    SELECT id INTO v_item_al FROM items WHERE item_code = 'RAW-002' AND company_id = v_company_id;
    SELECT id INTO v_sup2 FROM suppliers WHERE supplier_code = 'SUP-002' AND company_id = v_company_id;
    SELECT id INTO v_wh1 FROM warehouses WHERE company_id = v_company_id LIMIT 1;
    SELECT id INTO v_po2 FROM purchase_orders WHERE po_code = 'PO-2026-002' AND company_id = v_company_id;
    SELECT id INTO v_po2l1 FROM purchase_order_lines WHERE po_id = v_po2 AND line_number = 1;

    INSERT INTO purchase_returns (company_id, return_code, po_id, supplier_id, warehouse_id, return_date, reason, status, approved_by, approved_at, notes)
    VALUES
        (v_company_id, 'PR-RET-001', v_po2, v_sup2, v_wh1, NOW() - INTERVAL '1 day', '50kg of aluminum rods found to be below specification grade', 'APPROVED', v_admin, NOW(), 'Quality rejection - too soft for machining')
    ON CONFLICT (return_code, company_id) DO NOTHING;

    SELECT id INTO v_ret1 FROM purchase_returns WHERE return_code = 'PR-RET-001' AND company_id = v_company_id;

    INSERT INTO purchase_return_lines (return_id, po_line_id, item_id, uom_id, quantity, unit_price, reason, notes)
    SELECT v_ret1, v_po2l1, v_item_al, v_uom_kg, 50, 410, 'Below grade - Mohs hardness insufficient', 'Tested on Rockwell B scale'
    WHERE NOT EXISTS (SELECT 1 FROM purchase_return_lines prl WHERE prl.return_id = v_ret1);
END $$;

-- =====================================================================
-- PART 18: PURCHASE INVOICES + LINES
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_admin UUID;
    v_uom_kg UUID; v_uom_ea UUID;
    v_item_steel UUID; v_item_al UUID; v_item_brg UUID; v_item_cu UUID; v_item_oil UUID;
    v_sup1 UUID; v_sup2 UUID; v_sup4 UUID;
    v_po1 UUID; v_po2 UUID; v_po3 UUID;
    v_po1l1 UUID; v_po1l2 UUID;
    v_po2l1 UUID; v_po2l2 UUID;
    v_po3l1 UUID;
    v_pi1 UUID; v_pi2 UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;
    SELECT id INTO v_admin FROM erp_users LIMIT 1;
    SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG';
    SELECT id INTO v_uom_ea FROM uoms WHERE code = 'EA';
    SELECT id INTO v_item_steel FROM items WHERE item_code = 'RAW-001' AND company_id = v_company_id;
    SELECT id INTO v_item_al FROM items WHERE item_code = 'RAW-002' AND company_id = v_company_id;
    SELECT id INTO v_item_cu FROM items WHERE item_code = 'RAW-004' AND company_id = v_company_id;
    SELECT id INTO v_item_brg FROM items WHERE item_code = 'FIN-001' AND company_id = v_company_id;
    SELECT id INTO v_item_oil FROM items WHERE item_code = 'CONS-001' AND company_id = v_company_id;

    SELECT id INTO v_sup1 FROM suppliers WHERE supplier_code = 'SUP-001' AND company_id = v_company_id;
    SELECT id INTO v_sup2 FROM suppliers WHERE supplier_code = 'SUP-002' AND company_id = v_company_id;
    SELECT id INTO v_sup4 FROM suppliers WHERE supplier_code = 'SUP-004' AND company_id = v_company_id;

    SELECT id INTO v_po1 FROM purchase_orders WHERE po_code = 'PO-2026-001' AND company_id = v_company_id;
    SELECT id INTO v_po2 FROM purchase_orders WHERE po_code = 'PO-2026-002' AND company_id = v_company_id;
    SELECT id INTO v_po3 FROM purchase_orders WHERE po_code = 'PO-2026-003' AND company_id = v_company_id;

    SELECT id INTO v_po1l1 FROM purchase_order_lines WHERE po_id = v_po1 AND line_number = 1;
    SELECT id INTO v_po1l2 FROM purchase_order_lines WHERE po_id = v_po1 AND line_number = 2;
    SELECT id INTO v_po2l1 FROM purchase_order_lines WHERE po_id = v_po2 AND line_number = 1;
    SELECT id INTO v_po2l2 FROM purchase_order_lines WHERE po_id = v_po2 AND line_number = 2;
    SELECT id INTO v_po3l1 FROM purchase_order_lines WHERE po_id = v_po3 AND line_number = 1;

    INSERT INTO purchase_invoices (company_id, invoice_code, supplier_invoice_number, po_id, supplier_id, invoice_date, due_date, subtotal, tax_percent, tax_amount, total_amount, currency_code, payment_status, matching_status, status, notes)
    VALUES
        (v_company_id, 'PI-2026-001', 'PS-INV-7821', v_po1, v_sup1, CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE + INTERVAL '44 days', 525000, 17, 89250, 614250, 'PKR', 'UNPAID', 'PENDING', 'APPROVED', 'Invoice for partial steel receipt (3000kg)'),
        (v_company_id, 'PI-2026-002', 'NCA-INV-3342', v_po2, v_sup2, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 1410000, 17, 239700, 1649700, 'PKR', 'UNPAID', 'MATCHED', 'APPROVED', 'Full invoice for aluminum and copper'),
        (v_company_id, 'PI-2026-003', 'PB-INV-1156', v_po3, v_sup4, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 41000, 17, 6970, 47970, 'PKR', 'PARTIAL', 'MATCHED', 'POSTED', 'Bearing invoice - partial payment made')
    ON CONFLICT (invoice_code, company_id) DO NOTHING;

    SELECT id INTO v_pi1 FROM purchase_invoices WHERE invoice_code = 'PI-2026-001' AND company_id = v_company_id;
    SELECT id INTO v_pi2 FROM purchase_invoices WHERE invoice_code = 'PI-2026-002' AND company_id = v_company_id;

    INSERT INTO purchase_invoice_lines (invoice_id, po_line_id, item_id, uom_id, quantity, unit_price, total_price, notes)
    SELECT v_pi1, v_po1l1, v_item_steel, v_uom_kg, 3000, 175, 525000, 'Partial receipt - 3000 of 5000kg'
    WHERE NOT EXISTS (SELECT 1 FROM purchase_invoice_lines pil WHERE pil.invoice_id = v_pi1 AND pil.po_line_id = v_po1l1);

    INSERT INTO purchase_invoice_lines (invoice_id, po_line_id, item_id, uom_id, quantity, unit_price, total_price, notes)
    SELECT v_pi2, v_po2l1, v_item_al, v_uom_kg, 2000, 410, 820000, 'Full quantity aluminum'
    WHERE NOT EXISTS (SELECT 1 FROM purchase_invoice_lines pil WHERE pil.invoice_id = v_pi2 AND pil.po_line_id = v_po2l1);
END $$;

-- =====================================================================
-- PART 19: SALES LINE ITEMS (erp_sales schema)
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_uom_ea UUID; v_uom_box UUID; v_uom_kg UUID;
    v_item1 UUID; v_item2 UUID; v_item3 UUID;
    v_qt1 UUID; v_qt2 UUID; v_qt3 UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;
    SELECT id INTO v_uom_ea FROM uoms WHERE code = 'EA';
    SELECT id INTO v_uom_box FROM uoms WHERE code = 'BOX';
    SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG';

    SELECT id INTO v_item1 FROM items WHERE item_code = 'SLD-0001' AND company_id = v_company_id;
    SELECT id INTO v_item2 FROM items WHERE item_code = 'SLD-0002' AND company_id = v_company_id;
    SELECT id INTO v_item3 FROM items WHERE item_code = 'SLD-0003' AND company_id = v_company_id;
    IF v_item1 IS NULL THEN SELECT id INTO v_item1 FROM items WHERE company_id = v_company_id LIMIT 1; END IF;
    IF v_item2 IS NULL THEN v_item2 := v_item1; END IF;
    IF v_item3 IS NULL THEN v_item3 := v_item1; END IF;

    -- Quotation Items (10 quotations exist, add line items for first 5)
    SELECT id INTO v_qt1 FROM erp_sales.quotations WHERE quotation_number = 'QT-2026-00001' LIMIT 1;
    SELECT id INTO v_qt2 FROM erp_sales.quotations WHERE quotation_number = 'QT-2026-00002' LIMIT 1;
    SELECT id INTO v_qt3 FROM erp_sales.quotations WHERE quotation_number = 'QT-2026-00003' LIMIT 1;

    IF v_qt1 IS NOT NULL THEN
        INSERT INTO erp_sales.quotation_items (quotation_id, line_number, item_id, description, quantity, uom_id, unit_price, tax_amount, line_total)
        SELECT v_qt1, 1, v_item1, 'Industrial Widget - Standard', 50, v_uom_ea, 2500, 21250, 125000
        WHERE NOT EXISTS (SELECT 1 FROM erp_sales.quotation_items WHERE quotation_id = v_qt1 AND line_number = 1);
        INSERT INTO erp_sales.quotation_items (quotation_id, line_number, item_id, description, quantity, uom_id, unit_price, tax_amount, line_total)
        SELECT v_qt1, 2, v_item2, 'Premium Component Kit', 10, v_uom_box, 12500, 21250, 125000
        WHERE NOT EXISTS (SELECT 1 FROM erp_sales.quotation_items WHERE quotation_id = v_qt1 AND line_number = 2);
    END IF;

    IF v_qt2 IS NOT NULL THEN
        INSERT INTO erp_sales.quotation_items (quotation_id, line_number, item_id, description, quantity, uom_id, unit_price, tax_amount, line_total)
        SELECT v_qt2, 1, v_item1, 'Industrial Widget - Bulk', 100, v_uom_ea, 2200, 37400, 220000
        WHERE NOT EXISTS (SELECT 1 FROM erp_sales.quotation_items WHERE quotation_id = v_qt2 AND line_number = 1);
        INSERT INTO erp_sales.quotation_items (quotation_id, line_number, item_id, description, quantity, uom_id, unit_price, tax_amount, line_total)
        SELECT v_qt2, 2, v_item2, 'Premium Component Kit', 15, v_uom_box, 12000, 30600, 180000
        WHERE NOT EXISTS (SELECT 1 FROM erp_sales.quotation_items WHERE quotation_id = v_qt2 AND line_number = 2);
        INSERT INTO erp_sales.quotation_items (quotation_id, line_number, item_id, description, quantity, uom_id, unit_price, tax_amount, line_total)
        SELECT v_qt2, 3, v_item3, 'Specialty Fastener Pack', 100, v_uom_ea, 500, 8500, 50000
        WHERE NOT EXISTS (SELECT 1 FROM erp_sales.quotation_items WHERE quotation_id = v_qt2 AND line_number = 3);
    END IF;

    -- Sales Order Items (10 orders exist, add line items for first 5)
    DECLARE
        v_so1 UUID; v_so2 UUID; v_so3 UUID; v_so4 UUID; v_so5 UUID;
    BEGIN
        SELECT id INTO v_so1 FROM erp_sales.sales_orders WHERE order_number = 'SO-2026-00001' LIMIT 1;
        SELECT id INTO v_so2 FROM erp_sales.sales_orders WHERE order_number = 'SO-2026-00002' LIMIT 1;
        SELECT id INTO v_so3 FROM erp_sales.sales_orders WHERE order_number = 'SO-2026-00003' LIMIT 1;
        SELECT id INTO v_so4 FROM erp_sales.sales_orders WHERE order_number = 'SO-2026-00004' LIMIT 1;
        SELECT id INTO v_so5 FROM erp_sales.sales_orders WHERE order_number = 'SO-2026-00005' LIMIT 1;

        IF v_so1 IS NOT NULL THEN
            INSERT INTO erp_sales.sales_order_items (sales_order_id, line_number, item_id, description, quantity, uom_id, unit_price, tax_amount, line_total, status)
            SELECT v_so1, 1, v_item1, 'Industrial Widget', 50, v_uom_ea, 2500, 21250, 125000, 'Confirmed'
            WHERE NOT EXISTS (SELECT 1 FROM erp_sales.sales_order_items WHERE sales_order_id = v_so1 AND line_number = 1);
            INSERT INTO erp_sales.sales_order_items (sales_order_id, line_number, item_id, description, quantity, uom_id, unit_price, tax_amount, line_total, status)
            SELECT v_so1, 2, v_item2, 'Premium Component Kit', 10, v_uom_box, 12500, 21250, 125000, 'Confirmed'
            WHERE NOT EXISTS (SELECT 1 FROM erp_sales.sales_order_items WHERE sales_order_id = v_so1 AND line_number = 2);
        END IF;

        IF v_so2 IS NOT NULL THEN
            INSERT INTO erp_sales.sales_order_items (sales_order_id, line_number, item_id, description, quantity, uom_id, unit_price, tax_amount, line_total, status)
            SELECT v_so2, 1, v_item1, 'Industrial Widget - Bulk', 100, v_uom_ea, 2200, 37400, 220000, 'Processing'
            WHERE NOT EXISTS (SELECT 1 FROM erp_sales.sales_order_items WHERE sales_order_id = v_so2 AND line_number = 1);
            INSERT INTO erp_sales.sales_order_items (sales_order_id, line_number, item_id, description, quantity, uom_id, unit_price, tax_amount, line_total, status)
            SELECT v_so2, 2, v_item3, 'Specialty Fastener Pack', 100, v_uom_ea, 500, 8500, 50000, 'Processing'
            WHERE NOT EXISTS (SELECT 1 FROM erp_sales.sales_order_items WHERE sales_order_id = v_so2 AND line_number = 2);
        END IF;

        IF v_so3 IS NOT NULL THEN
            INSERT INTO erp_sales.sales_order_items (sales_order_id, line_number, item_id, description, quantity, uom_id, unit_price, tax_amount, line_total, status)
            SELECT v_so3, 1, v_item2, 'Premium Component Kit', 8, v_uom_box, 15000, 20400, 120000, 'Shipped'
            WHERE NOT EXISTS (SELECT 1 FROM erp_sales.sales_order_items WHERE sales_order_id = v_so3 AND line_number = 1);
        END IF;

        -- Sales Delivery Lines (for delivery DN-2026-00001)
        DECLARE
            v_dn1 UUID; v_dn3 UUID;
        BEGIN
            SELECT id INTO v_dn1 FROM erp_sales.sales_deliveries WHERE delivery_number = 'DN-2026-00001' LIMIT 1;
            SELECT id INTO v_dn3 FROM erp_sales.sales_deliveries WHERE delivery_number = 'DN-2026-00003' LIMIT 1;

            IF v_dn1 IS NOT NULL THEN
                INSERT INTO erp_sales.sales_delivery_lines (delivery_id, line_number, item_id, description, quantity, uom_id, warehouse_id, unit_price, tax_amount, line_total, created_at)
                SELECT v_dn1, 1, v_item1, 'Industrial Widget', 50, v_uom_ea, (SELECT id FROM warehouses LIMIT 1), 2500, 21250, 146250, NOW()
                WHERE NOT EXISTS (SELECT 1 FROM erp_sales.sales_delivery_lines WHERE delivery_id = v_dn1 AND line_number = 1);
            END IF;

            IF v_dn3 IS NOT NULL THEN
                INSERT INTO erp_sales.sales_delivery_lines (delivery_id, line_number, item_id, description, quantity, uom_id, warehouse_id, unit_price, tax_amount, line_total, created_at)
                SELECT v_dn3, 1, v_item2, 'Premium Component Kit', 8, v_uom_box, (SELECT id FROM warehouses LIMIT 1), 15000, 20400, 140400, NOW()
                WHERE NOT EXISTS (SELECT 1 FROM erp_sales.sales_delivery_lines WHERE delivery_id = v_dn3 AND line_number = 1);
            END IF;
        END;

        -- Sales Return Lines (for returns SR-2026-00001, SR-2026-00002)
        DECLARE
            v_sr1 UUID; v_sr2 UUID;
        BEGIN
            SELECT id INTO v_sr1 FROM erp_sales.sales_returns WHERE return_number = 'SR-2026-00001' LIMIT 1;
            SELECT id INTO v_sr2 FROM erp_sales.sales_returns WHERE return_number = 'SR-2026-00002' LIMIT 1;

            IF v_sr1 IS NOT NULL THEN
                INSERT INTO erp_sales.sales_return_lines (return_id, line_number, item_id, description, quantity, uom_id, unit_price, tax_amount, line_total, reason, created_at)
                SELECT v_sr1, 1, v_item1, 'Defective Industrial Widget', 2, v_uom_ea, 2500, 900, 5900, 'Defective - not functioning', NOW()
                WHERE NOT EXISTS (SELECT 1 FROM erp_sales.sales_return_lines WHERE return_id = v_sr1 AND line_number = 1);
            END IF;

            IF v_sr2 IS NOT NULL THEN
                INSERT INTO erp_sales.sales_return_lines (return_id, line_number, item_id, description, quantity, uom_id, unit_price, tax_amount, line_total, reason, created_at)
                SELECT v_sr2, 1, v_item1, 'Wrong Widget Shipped', 5, v_uom_ea, 2500, 2125, 14625, 'Wrong item delivered - part number mismatch', NOW()
                WHERE NOT EXISTS (SELECT 1 FROM erp_sales.sales_return_lines WHERE return_id = v_sr2 AND line_number = 1);
            END IF;
        END;
    END;
END $$;

-- =====================================================================
-- PART 20: INVENTORY POLICIES
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_uom_kg UUID; v_uom_ea UUID; v_uom_box UUID; v_uom_l UUID;
    v_item_steel UUID; v_item_al UUID; v_item_abs UUID; v_item_cu UUID;
    v_item_brg UUID; v_item_oil UUID; v_item_box UUID;
    v_wh1 UUID; v_wh2 UUID;
    v_loc1 UUID; v_loc2 UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;
    SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG';
    SELECT id INTO v_uom_ea FROM uoms WHERE code = 'EA';
    SELECT id INTO v_uom_box FROM uoms WHERE code = 'BOX';
    SELECT id INTO v_uom_l FROM uoms WHERE code = 'L';

    SELECT id INTO v_item_steel FROM items WHERE item_code = 'RAW-001' AND company_id = v_company_id;
    SELECT id INTO v_item_al FROM items WHERE item_code = 'RAW-002' AND company_id = v_company_id;
    SELECT id INTO v_item_abs FROM items WHERE item_code = 'RAW-003' AND company_id = v_company_id;
    SELECT id INTO v_item_cu FROM items WHERE item_code = 'RAW-004' AND company_id = v_company_id;
    SELECT id INTO v_item_brg FROM items WHERE item_code = 'FIN-001' AND company_id = v_company_id;
    SELECT id INTO v_item_oil FROM items WHERE item_code = 'CONS-001' AND company_id = v_company_id;
    SELECT id INTO v_item_box FROM items WHERE item_code = 'PKG-001' AND company_id = v_company_id;

    SELECT id INTO v_wh1 FROM warehouses WHERE company_id = v_company_id LIMIT 1;
    SELECT id INTO v_wh2 FROM warehouses WHERE company_id = v_company_id OFFSET 1 LIMIT 1;
    IF v_wh2 IS NULL THEN v_wh2 := v_wh1; END IF;

    SELECT id INTO v_loc1 FROM warehouse_locations WHERE warehouse_id = v_wh1 LIMIT 1;
    SELECT id INTO v_loc2 FROM warehouse_locations WHERE warehouse_id = v_wh2 LIMIT 1;
    IF v_loc1 IS NULL THEN SELECT id INTO v_loc1 FROM warehouse_locations LIMIT 1; END IF;
    IF v_loc2 IS NULL THEN v_loc2 := v_loc1; END IF;

    INSERT INTO inventory_policies (company_id, item_id, warehouse_id, minimum_stock, maximum_stock, reorder_level, reorder_quantity, safety_stock, lead_time_days, preferred_location_id, tracking_type, allow_negative_stock, status)
    SELECT v_company_id, i.id, w.id, ip.min_stock, ip.max_stock, ip.reorder, ip.reorder_qty, ip.safety, ip.lead_days, wl.id, ip.tracking, false, 'ACTIVE'
    FROM (VALUES
        ('RAW-001', 'WH', 3000, 15000, 5000, 5000, 2000, 7, 'LOC1', 'NONE'),
        ('RAW-002', 'WH', 1000, 6000, 2000, 2000, 800, 10, 'LOC1', 'NONE'),
        ('RAW-003', 'WH', 500, 3000, 1000, 1000, 300, 14, 'LOC1', 'BATCH'),
        ('RAW-004', 'WH', 300, 1500, 500, 500, 150, 5, 'LOC1', 'NONE'),
        ('FIN-001', 'WH', 50, 300, 100, 100, 30, 3, 'LOC1', 'SERIAL'),
        ('CONS-001', 'WH', 20, 100, 40, 40, 15, 7, 'LOC1', 'NONE'),
        ('PKG-001', 'WH', 200, 1500, 400, 400, 150, 5, 'LOC1', 'NONE'),
        ('RAW-001', 'WH2', 1000, 5000, 2000, 2000, 500, 7, 'LOC2', 'NONE'),
        ('RAW-002', 'WH2', 500, 2000, 800, 800, 200, 10, 'LOC2', 'NONE')
    ) AS ip(item_code, wh_idx, min_stock, max_stock, reorder, reorder_qty, safety, lead_days, loc_idx, tracking)
    JOIN items i ON i.item_code = ip.item_code AND i.company_id = v_company_id
    JOIN warehouses w ON w.company_id = v_company_id AND w.warehouse_code = CASE WHEN ip.wh_idx = 'WH' THEN (SELECT warehouse_code FROM warehouses WHERE id = v_wh1) ELSE (SELECT warehouse_code FROM warehouses WHERE id = v_wh2) END
    LEFT JOIN warehouse_locations wl ON wl.warehouse_id = w.id AND wl.location_code = CASE WHEN ip.loc_idx = 'LOC1' THEN (SELECT location_code FROM warehouse_locations WHERE id = v_loc1) ELSE (SELECT location_code FROM warehouse_locations WHERE id = v_loc2) END
    WHERE NOT EXISTS (SELECT 1 FROM inventory_policies ip2 WHERE ip2.item_id = i.id AND ip2.warehouse_id = w.id);
END $$;

-- =====================================================================
-- PART 21: BATCHES
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_uom_kg UUID;
    v_item_abs UUID;
    v_wh1 UUID; v_wh2 UUID;
    v_loc1 UUID; v_loc2 UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;
    SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG';
    SELECT id INTO v_item_abs FROM items WHERE item_code = 'RAW-003' AND company_id = v_company_id;
    SELECT id INTO v_wh1 FROM warehouses WHERE company_id = v_company_id LIMIT 1;
    SELECT id INTO v_wh2 FROM warehouses WHERE company_id = v_company_id OFFSET 1 LIMIT 1;
    IF v_wh2 IS NULL THEN v_wh2 := v_wh1; END IF;
    SELECT id INTO v_loc1 FROM warehouse_locations WHERE warehouse_id = v_wh1 LIMIT 1;
    SELECT id INTO v_loc2 FROM warehouse_locations WHERE warehouse_id = v_wh2 LIMIT 1;
    IF v_loc1 IS NULL THEN SELECT id INTO v_loc1 FROM warehouse_locations LIMIT 1; END IF;
    IF v_loc2 IS NULL THEN v_loc2 := v_loc1; END IF;

    INSERT INTO batches (company_id, item_id, warehouse_id, location_id, batch_number, manufacturing_date, expiry_date, supplier_reference, quantity, status)
    SELECT v_company_id, v_item_abs, CASE WHEN b.wh_idx = 'WH1' THEN v_wh1 ELSE v_wh2 END, CASE WHEN b.loc_idx = 'LOC1' THEN v_loc1 ELSE v_loc2 END, b.batch_no, b.mfg_date, b.exp_date, b.sup_ref, b.qty, 'ACTIVE'
    FROM (VALUES
        ('WH1', 'LOC1', 'ABS-2026-B001', '2026-06-15'::date, '2028-06-15'::date, 'PO-2026-001', 500),
        ('WH1', 'LOC1', 'ABS-2026-B002', '2026-07-20'::date, '2028-07-20'::date, 'PO-2026-001', 500),
        ('WH2', 'LOC2', 'ABS-2026-B003', '2026-07-01'::date, '2028-07-01'::date, 'PO-2026-002', 300)
    ) AS b(wh_idx, loc_idx, batch_no, mfg_date, exp_date, sup_ref, qty)
    LEFT JOIN batches b2 ON b2.batch_number = b.batch_no AND b2.item_id = v_item_abs
    WHERE b2.id IS NULL
    AND (
        (b.wh_idx = 'WH1' AND v_wh1 IS NOT NULL AND (b.loc_idx = 'LOC1' AND v_loc1 IS NOT NULL))
        OR (b.wh_idx = 'WH2' AND v_wh2 IS NOT NULL AND (b.loc_idx = 'LOC2' AND v_loc2 IS NOT NULL))
    );
END $$;

-- =====================================================================
-- PART 22: INVENTORY BALANCES
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_uom_kg UUID; v_uom_ea UUID; v_uom_box UUID; v_uom_l UUID;
    v_item_steel UUID; v_item_al UUID; v_item_abs UUID; v_item_cu UUID;
    v_item_brg UUID; v_item_oil UUID; v_item_box UUID;
    v_item_sld1 UUID; v_item_sld2 UUID; v_item_sld3 UUID;
    v_wh1 UUID; v_wh2 UUID;
    v_loc1 UUID; v_loc2 UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;
    SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG';
    SELECT id INTO v_uom_ea FROM uoms WHERE code = 'EA';
    SELECT id INTO v_uom_box FROM uoms WHERE code = 'BOX';
    SELECT id INTO v_uom_l FROM uoms WHERE code = 'L';

    SELECT id INTO v_item_steel FROM items WHERE item_code = 'RAW-001' AND company_id = v_company_id;
    SELECT id INTO v_item_al FROM items WHERE item_code = 'RAW-002' AND company_id = v_company_id;
    SELECT id INTO v_item_abs FROM items WHERE item_code = 'RAW-003' AND company_id = v_company_id;
    SELECT id INTO v_item_cu FROM items WHERE item_code = 'RAW-004' AND company_id = v_company_id;
    SELECT id INTO v_item_brg FROM items WHERE item_code = 'FIN-001' AND company_id = v_company_id;
    SELECT id INTO v_item_oil FROM items WHERE item_code = 'CONS-001' AND company_id = v_company_id;
    SELECT id INTO v_item_box FROM items WHERE item_code = 'PKG-001' AND company_id = v_company_id;
    SELECT id INTO v_item_sld1 FROM items WHERE item_code = 'SLD-0001' AND company_id = v_company_id;
    SELECT id INTO v_item_sld2 FROM items WHERE item_code = 'SLD-0002' AND company_id = v_company_id;
    SELECT id INTO v_item_sld3 FROM items WHERE item_code = 'SLD-0003' AND company_id = v_company_id;

    SELECT id INTO v_wh1 FROM warehouses WHERE company_id = v_company_id LIMIT 1;
    SELECT id INTO v_wh2 FROM warehouses WHERE company_id = v_company_id OFFSET 1 LIMIT 1;
    IF v_wh2 IS NULL THEN v_wh2 := v_wh1; END IF;
    SELECT id INTO v_loc1 FROM warehouse_locations WHERE warehouse_id = v_wh1 LIMIT 1;
    SELECT id INTO v_loc2 FROM warehouse_locations WHERE warehouse_id = v_wh2 LIMIT 1;
    IF v_loc1 IS NULL THEN SELECT id INTO v_loc1 FROM warehouse_locations LIMIT 1; END IF;
    IF v_loc2 IS NULL THEN v_loc2 := v_loc1; END IF;

    -- Insert balances (on_hand = qty, available = on_hand - reserved)
    INSERT INTO inventory_balances (company_id, item_id, warehouse_id, location_id, batch_id, uom_id, on_hand, reserved, available, status)
    SELECT v_company_id, i.id, w.id, wl.id, b.id, u.id, ib.on_hand, ib.reserved, ib.on_hand - ib.reserved, 'ACTIVE'
    FROM (VALUES
        ('RAW-001', 'WH1', 'LOC1', NULL, 'KG', 3000, 500),
        ('RAW-001', 'WH2', 'LOC2', NULL, 'KG', 1200, 0),
        ('RAW-002', 'WH1', 'LOC1', NULL, 'KG', 2500, 0),
        ('RAW-002', 'WH2', 'LOC2', NULL, 'KG', 800, 0),
        ('RAW-003', 'WH1', 'LOC1', 'BATCH', 'KG', 1000, 0),
        ('RAW-004', 'WH1', 'LOC1', NULL, 'KG', 600, 100),
        ('FIN-001', 'WH1', 'LOC1', NULL, 'EA', 150, 20),
        ('FIN-001', 'WH2', 'LOC2', NULL, 'EA', 80, 0),
        ('CONS-001', 'WH1', 'LOC1', NULL, 'L', 60, 0),
        ('PKG-001', 'WH1', 'LOC1', NULL, 'EA', 800, 0),
        ('SLD-0001', 'WH1', 'LOC1', NULL, 'EA', 200, 15),
        ('SLD-0002', 'WH1', 'LOC1', NULL, 'BOX', 50, 5),
        ('SLD-0003', 'WH1', 'LOC1', NULL, 'EA', 500, 10)
    ) AS ib(item_code, wh_idx, loc_idx, batch_idx, uom_code, on_hand, reserved)
    JOIN items i ON i.item_code = ib.item_code AND i.company_id = v_company_id
    JOIN uoms u ON u.code = ib.uom_code
    JOIN warehouses w ON w.id = CASE WHEN ib.wh_idx = 'WH1' THEN v_wh1 ELSE v_wh2 END
    LEFT JOIN warehouse_locations wl ON wl.id = CASE WHEN ib.loc_idx = 'LOC1' THEN v_loc1 ELSE v_loc2 END
    LEFT JOIN batches b ON b.batch_number = 'ABS-2026-B001' AND b.item_id = i.id AND ib.batch_idx = 'BATCH'
    WHERE NOT EXISTS (SELECT 1 FROM inventory_balances ib2 WHERE ib2.item_id = i.id AND ib2.warehouse_id = w.id AND ib2.uom_id = u.id);
END $$;

-- =====================================================================
-- PART 23: STOCK LEDGER (opening balance transactions)
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_admin UUID;
    v_uom_kg UUID; v_uom_ea UUID; v_uom_box UUID; v_uom_l UUID;
    v_item_steel UUID; v_item_al UUID; v_item_abs UUID; v_item_cu UUID;
    v_item_brg UUID; v_item_oil UUID; v_item_box UUID;
    v_item_sld1 UUID; v_item_sld2 UUID; v_item_sld3 UUID;
    v_wh1 UUID; v_wh2 UUID;
    v_loc1 UUID; v_loc2 UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;
    SELECT id INTO v_admin FROM erp_users LIMIT 1;
    SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG';
    SELECT id INTO v_uom_ea FROM uoms WHERE code = 'EA';
    SELECT id INTO v_uom_box FROM uoms WHERE code = 'BOX';
    SELECT id INTO v_uom_l FROM uoms WHERE code = 'L';

    SELECT id INTO v_item_steel FROM items WHERE item_code = 'RAW-001' AND company_id = v_company_id;
    SELECT id INTO v_item_al FROM items WHERE item_code = 'RAW-002' AND company_id = v_company_id;
    SELECT id INTO v_item_abs FROM items WHERE item_code = 'RAW-003' AND company_id = v_company_id;
    SELECT id INTO v_item_cu FROM items WHERE item_code = 'RAW-004' AND company_id = v_company_id;
    SELECT id INTO v_item_brg FROM items WHERE item_code = 'FIN-001' AND company_id = v_company_id;
    SELECT id INTO v_item_oil FROM items WHERE item_code = 'CONS-001' AND company_id = v_company_id;
    SELECT id INTO v_item_box FROM items WHERE item_code = 'PKG-001' AND company_id = v_company_id;
    SELECT id INTO v_item_sld1 FROM items WHERE item_code = 'SLD-0001' AND company_id = v_company_id;
    SELECT id INTO v_item_sld2 FROM items WHERE item_code = 'SLD-0002' AND company_id = v_company_id;
    SELECT id INTO v_item_sld3 FROM items WHERE item_code = 'SLD-0003' AND company_id = v_company_id;

    SELECT id INTO v_wh1 FROM warehouses WHERE company_id = v_company_id LIMIT 1;
    SELECT id INTO v_wh2 FROM warehouses WHERE company_id = v_company_id OFFSET 1 LIMIT 1;
    IF v_wh2 IS NULL THEN v_wh2 := v_wh1; END IF;
    SELECT id INTO v_loc1 FROM warehouse_locations WHERE warehouse_id = v_wh1 LIMIT 1;
    SELECT id INTO v_loc2 FROM warehouse_locations WHERE warehouse_id = v_wh2 LIMIT 1;
    IF v_loc1 IS NULL THEN SELECT id INTO v_loc1 FROM warehouse_locations LIMIT 1; END IF;
    IF v_loc2 IS NULL THEN v_loc2 := v_loc1; END IF;

    -- Opening balance ledger entries (source of truth for initial stock)
    INSERT INTO stock_ledger (created_by, company_id, transaction_type, transaction_date, item_id, warehouse_id, location_id, quantity, uom_id, direction, reference_type, reference_number, notes)
    SELECT v_admin, v_company_id, 'OPENING', '2026-01-01'::timestamptz, i.id, w.id, wl.id, sl.qty, u.id, 'IN', 'OPENING', 'OPENING-2026', sl.notes
    FROM (VALUES
        ('RAW-001', 'WH1', 'LOC1', 3000, 'KG', 'Opening stock - steel sheets'),
        ('RAW-002', 'WH1', 'LOC1', 2500, 'KG', 'Opening stock - aluminum rods'),
        ('RAW-003', 'WH1', 'LOC1', 1000, 'KG', 'Opening stock - ABS resin'),
        ('RAW-004', 'WH1', 'LOC1', 600, 'KG', 'Opening stock - copper wire'),
        ('FIN-001', 'WH1', 'LOC1', 150, 'EA', 'Opening stock - bearings'),
        ('CONS-001', 'WH1', 'LOC1', 60, 'L', 'Opening stock - hydraulic oil'),
        ('PKG-001', 'WH1', 'LOC1', 800, 'EA', 'Opening stock - boxes'),
        ('SLD-0001', 'WH1', 'LOC1', 200, 'EA', 'Opening stock - widgets'),
        ('SLD-0002', 'WH1', 'LOC1', 50, 'BOX', 'Opening stock - component kits'),
        ('SLD-0003', 'WH1', 'LOC1', 500, 'EA', 'Opening stock - fasteners')
    ) AS sl(item_code, wh_idx, loc_idx, qty, uom_code, notes)
    JOIN items i ON i.item_code = sl.item_code AND i.company_id = v_company_id
    JOIN uoms u ON u.code = sl.uom_code
    JOIN warehouses w ON w.id = CASE WHEN sl.wh_idx = 'WH1' THEN v_wh1 ELSE v_wh2 END
    LEFT JOIN warehouse_locations wl ON wl.id = CASE WHEN sl.loc_idx = 'LOC1' THEN v_loc1 ELSE v_loc2 END
    WHERE NOT EXISTS (SELECT 1 FROM stock_ledger sl2 WHERE sl2.item_id = i.id AND sl2.warehouse_id = w.id AND sl2.transaction_type = 'OPENING');
END $$;

-- =====================================================================
-- PART 24: STOCK ADJUSTMENTS + LINES
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_admin UUID;
    v_uom_kg UUID; v_uom_ea UUID;
    v_item_steel UUID; v_item_brg UUID;
    v_wh1 UUID; v_loc1 UUID;
    v_sa1 UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;
    SELECT id INTO v_admin FROM erp_users LIMIT 1;
    SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG';
    SELECT id INTO v_uom_ea FROM uoms WHERE code = 'EA';
    SELECT id INTO v_item_steel FROM items WHERE item_code = 'RAW-001' AND company_id = v_company_id;
    SELECT id INTO v_item_brg FROM items WHERE item_code = 'FIN-001' AND company_id = v_company_id;
    SELECT id INTO v_wh1 FROM warehouses WHERE company_id = v_company_id LIMIT 1;
    SELECT id INTO v_loc1 FROM warehouse_locations WHERE warehouse_id = v_wh1 LIMIT 1;
    IF v_loc1 IS NULL THEN SELECT id INTO v_loc1 FROM warehouse_locations LIMIT 1; END IF;

    INSERT INTO stock_adjustments (company_id, warehouse_id, adjustment_code, adjustment_type, reason, status, approved_by, approved_at, posted_by, posted_at, created_by)
    VALUES
        (v_company_id, v_wh1, 'SA-2026-001', 'INCREASE', 'Physical count found 50kg extra steel not recorded', 'POSTED', v_admin, NOW() - INTERVAL '5 days', v_admin, NOW() - INTERVAL '4 days', v_admin),
        (v_company_id, v_wh1, 'SA-2026-002', 'DECREASE', 'Damaged bearing found during inspection', 'APPROVED', v_admin, NOW() - INTERVAL '1 day', NULL, NULL, v_admin)
    ON CONFLICT (adjustment_code, company_id) DO NOTHING;

    SELECT id INTO v_sa1 FROM stock_adjustments WHERE adjustment_code = 'SA-2026-001' AND company_id = v_company_id;

    INSERT INTO stock_adjustment_lines (adjustment_id, item_id, location_id, uom_id, quantity, unit_cost, notes)
    SELECT v_sa1, v_item_steel, v_loc1, v_uom_kg, 50, 175.00, 'Count variance - additional 50kg found'
    WHERE NOT EXISTS (SELECT 1 FROM stock_adjustment_lines WHERE adjustment_id = v_sa1 AND item_id = v_item_steel);
END $$;

-- =====================================================================
-- PART 25: STOCK TRANSFERS + LINES
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_admin UUID;
    v_uom_kg UUID; v_uom_ea UUID;
    v_item_steel UUID; v_item_brg UUID;
    v_wh1 UUID; v_wh2 UUID;
    v_loc1 UUID; v_loc2 UUID;
    v_st1 UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;
    SELECT id INTO v_admin FROM erp_users LIMIT 1;
    SELECT id INTO v_uom_kg FROM uoms WHERE code = 'KG';
    SELECT id INTO v_uom_ea FROM uoms WHERE code = 'EA';
    SELECT id INTO v_item_steel FROM items WHERE item_code = 'RAW-001' AND company_id = v_company_id;
    SELECT id INTO v_item_brg FROM items WHERE item_code = 'FIN-001' AND company_id = v_company_id;
    SELECT id INTO v_wh1 FROM warehouses WHERE company_id = v_company_id LIMIT 1;
    SELECT id INTO v_wh2 FROM warehouses WHERE company_id = v_company_id OFFSET 1 LIMIT 1;
    IF v_wh2 IS NULL THEN v_wh2 := v_wh1; END IF;
    SELECT id INTO v_loc1 FROM warehouse_locations WHERE warehouse_id = v_wh1 LIMIT 1;
    SELECT id INTO v_loc2 FROM warehouse_locations WHERE warehouse_id = v_wh2 LIMIT 1;
    IF v_loc1 IS NULL THEN SELECT id INTO v_loc1 FROM warehouse_locations LIMIT 1; END IF;
    IF v_loc2 IS NULL THEN v_loc2 := v_loc1; END IF;

    INSERT INTO stock_transfers (company_id, transfer_code, from_warehouse_id, to_warehouse_id, from_location_id, to_location_id, status, approved_by, approved_at, posted_by, posted_at, notes, created_by)
    VALUES
        (v_company_id, 'ST-2026-001', v_wh1, v_wh2, v_loc1, v_loc2, 'POSTED', v_admin, NOW() - INTERVAL '3 days', v_admin, NOW() - INTERVAL '2 days', 'Transfer steel stock to secondary warehouse', v_admin)
    ON CONFLICT (transfer_code, company_id) DO NOTHING;

    SELECT id INTO v_st1 FROM stock_transfers WHERE transfer_code = 'ST-2026-001' AND company_id = v_company_id;

    INSERT INTO stock_transfer_lines (transfer_id, item_id, from_location_id, to_location_id, uom_id, quantity, notes)
    SELECT v_st1, v_item_steel, v_loc1, v_loc2, v_uom_kg, 500, 'Transfer 500kg steel to secondary warehouse'
    WHERE NOT EXISTS (SELECT 1 FROM stock_transfer_lines WHERE transfer_id = v_st1 AND item_id = v_item_steel);
END $$;

-- =====================================================================
-- PART 26: INVENTORY RESERVATIONS
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_admin UUID;
    v_uom_ea UUID;
    v_item_sld1 UUID; v_item_brg UUID;
    v_wh1 UUID; v_loc1 UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;
    SELECT id INTO v_admin FROM erp_users LIMIT 1;
    SELECT id INTO v_uom_ea FROM uoms WHERE code = 'EA';
    SELECT id INTO v_item_sld1 FROM items WHERE item_code = 'SLD-0001' AND company_id = v_company_id;
    SELECT id INTO v_item_brg FROM items WHERE item_code = 'FIN-001' AND company_id = v_company_id;
    SELECT id INTO v_wh1 FROM warehouses WHERE company_id = v_company_id LIMIT 1;
    SELECT id INTO v_loc1 FROM warehouse_locations WHERE warehouse_id = v_wh1 LIMIT 1;
    IF v_loc1 IS NULL THEN SELECT id INTO v_loc1 FROM warehouse_locations LIMIT 1; END IF;

    INSERT INTO inventory_reservations (company_id, item_id, warehouse_id, location_id, uom_id, quantity, reserved_by, reservation_type, reference_type, reference_id, status, expires_at)
    SELECT v_company_id, i.id, v_wh1, v_loc1, v_uom_ea, ir.qty, v_admin, ir.res_type, ir.ref_type, NULL, 'ACTIVE', NOW() + INTERVAL '14 days'
    FROM (VALUES
        ('SLD-0001', 15, 'ORDER', 'sales_order'),
        ('FIN-001', 20, 'ORDER', 'sales_order')
    ) AS ir(item_code, qty, res_type, ref_type)
    JOIN items i ON i.item_code = ir.item_code AND i.company_id = v_company_id
    WHERE NOT EXISTS (SELECT 1 FROM inventory_reservations ir2 WHERE ir2.item_id = i.id AND ir2.warehouse_id = v_wh1 AND ir2.status = 'ACTIVE');
END $$;

-- =====================================================================
-- PART 27: SERIAL NUMBERS (for FIN-001 bearing, serial tracked)
-- =====================================================================
DO $$
DECLARE
    v_company_id UUID;
    v_admin UUID;
    v_uom_ea UUID;
    v_item_brg UUID;
    v_wh1 UUID; v_loc1 UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;
    SELECT id INTO v_admin FROM erp_users LIMIT 1;
    SELECT id INTO v_uom_ea FROM uoms WHERE code = 'EA';
    SELECT id INTO v_item_brg FROM items WHERE item_code = 'FIN-001' AND company_id = v_company_id;
    SELECT id INTO v_wh1 FROM warehouses WHERE company_id = v_company_id LIMIT 1;
    SELECT id INTO v_loc1 FROM warehouse_locations WHERE warehouse_id = v_wh1 LIMIT 1;
    IF v_loc1 IS NULL THEN SELECT id INTO v_loc1 FROM warehouse_locations LIMIT 1; END IF;

    INSERT INTO serial_numbers (company_id, item_id, warehouse_id, location_id, serial_number, status, notes)
    SELECT v_company_id, v_item_brg, v_wh1, v_loc1, sn.serial_no, sn.status, sn.notes
    FROM (VALUES
        ('BRG-6205-00001', 'IN_STOCK', 'Precision bearing - new stock'),
        ('BRG-6205-00002', 'IN_STOCK', 'Precision bearing - new stock'),
        ('BRG-6205-00003', 'IN_STOCK', 'Precision bearing - new stock'),
        ('BRG-6205-00004', 'IN_STOCK', 'Precision bearing - new stock'),
        ('BRG-6205-00005', 'RESERVED', 'Reserved for SO-2026-00001'),
        ('BRG-6205-00006', 'RESERVED', 'Reserved for SO-2026-00001'),
        ('BRG-6205-00007', 'SOLD', 'Delivered with DN-2026-00001'),
        ('BRG-6205-00008', 'SOLD', 'Delivered with DN-2026-00001'),
        ('BRG-6205-00009', 'IN_STOCK', 'Precision bearing - new stock'),
        ('BRG-6205-00010', 'IN_STOCK', 'Precision bearing - new stock')
    ) AS sn(serial_no, status, notes)
    WHERE NOT EXISTS (SELECT 1 FROM serial_numbers sn2 WHERE sn2.serial_number = sn.serial_no AND sn2.item_id = v_item_brg);
END $$;

-- =====================================================================
-- SEED COMPLETE: Verification counts
-- =====================================================================
DO $$
DECLARE
    v_total INTEGER;
BEGIN
    SELECT count(*) INTO v_total FROM (
        SELECT count(*) FROM items WHERE company_id = (SELECT id FROM companies LIMIT 1)
        UNION ALL SELECT count(*) FROM item_categories WHERE company_id = (SELECT id FROM companies LIMIT 1)
        UNION ALL SELECT count(*) FROM suppliers WHERE company_id = (SELECT id FROM companies LIMIT 1)
        UNION ALL SELECT count(*) FROM purchase_orders WHERE company_id = (SELECT id FROM companies LIMIT 1)
        UNION ALL SELECT count(*) FROM stock_ledger WHERE company_id = (SELECT id FROM companies LIMIT 1)
    ) sub;
    RAISE NOTICE 'Total seeded records across key tables: %', v_total;
    RAISE NOTICE 'Seed migration 20260821120000_complete_erp_demo_data.sql completed successfully';
END $$;
