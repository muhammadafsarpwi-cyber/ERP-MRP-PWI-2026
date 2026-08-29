-- ERP RLS & Constraint Remediation Migration
-- Migration: 20260829120000_erp_00028_rls_constraints.sql
-- Fixes: RLS policies, missing FKs, CHECK constraints, SPARE_PART, indexes
-- Safe for both fresh DB and existing DB (idempotent)

-- =====================================================
-- PART 1: SPARE_PART: Add to item_type CHECK
-- =====================================================
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS ck_items_item_type;
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_item_type_check;
ALTER TABLE public.items ADD CONSTRAINT ck_items_item_type CHECK (
    item_type IN ('RAW_MATERIAL', 'FINISHED_GOOD', 'SEMI_FINISHED', 'CONSUMABLE', 'SERVICE', 'BOM', 'PACKAGING', 'OTHER', 'SPARE_PART')
);

-- production_routings.bom_id: allow NULL (00017 sample data uses NULL)
ALTER TABLE public.production_routings ALTER COLUMN bom_id DROP NOT NULL;

-- =====================================================
-- PART 2: Helper functions for RLS (idempotent)
-- Uses existing erp_core schema or creates if missing
-- =====================================================
CREATE SCHEMA IF NOT EXISTS erp_core;

CREATE OR REPLACE FUNCTION erp_core.current_erp_user_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT id FROM public.erp_users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION erp_core.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.erp_users eu ON eu.id = ur.user_id
    WHERE eu.auth_user_id = auth.uid()
      AND r.role_code = 'SUPER_ADMIN'
      AND ur.status = 'ACTIVE'
      AND r.status = 'ACTIVE'
      AND eu.status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION erp_core.has_role(p_role_code TEXT)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.erp_users eu ON eu.id = ur.user_id
    WHERE eu.auth_user_id = auth.uid()
      AND r.role_code = p_role_code
      AND ur.status = 'ACTIVE'
      AND r.status = 'ACTIVE'
      AND eu.status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION erp_core.has_any_role(p_role_codes TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.erp_users eu ON eu.id = ur.user_id
    WHERE eu.auth_user_id = auth.uid()
      AND r.role_code = ANY(p_role_codes)
      AND ur.status = 'ACTIVE'
      AND r.status = 'ACTIVE'
      AND eu.status = 'ACTIVE'
  );
$$;

-- Grant execute to authenticated
GRANT USAGE ON SCHEMA erp_core TO authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA erp_core TO authenticated, anon;

-- =====================================================
-- PART 3: Enable RLS on missing tables
-- =====================================================
ALTER TABLE IF EXISTS erp_sales.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS erp_sales.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS erp_sales.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS erp_sales.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS erp_sales.sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS erp_sales.sales_invoices ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PART 4: RLS POLICIES
-- Each policy allows admin full access, then scopes for regular users
-- =====================================================

-- ----- 4a. SECURITY/IAM TABLES (admin only, with self-read for erp_users) -----

-- companies: admin only (no company_id — it defines the company)
DROP POLICY IF EXISTS companies_admin_all ON public.companies;
CREATE POLICY companies_admin_all ON public.companies
  FOR ALL USING (erp_core.is_admin());

-- erp_users: admin full + self-read
DROP POLICY IF EXISTS erp_users_admin_all ON public.erp_users;
CREATE POLICY erp_users_admin_all ON public.erp_users
  FOR ALL USING (erp_core.is_admin());
DROP POLICY IF EXISTS erp_users_self_select ON public.erp_users;
CREATE POLICY erp_users_self_select ON public.erp_users
  FOR SELECT USING (auth_user_id = auth.uid());

-- roles: admin only
DROP POLICY IF EXISTS roles_admin_all ON public.roles;
CREATE POLICY roles_admin_all ON public.roles FOR ALL USING (erp_core.is_admin());

-- permissions: admin only
DROP POLICY IF EXISTS permissions_admin_all ON public.permissions;
CREATE POLICY permissions_admin_all ON public.permissions FOR ALL USING (erp_core.is_admin());

-- role_permissions: admin only
DROP POLICY IF EXISTS role_permissions_admin_all ON public.role_permissions;
CREATE POLICY role_permissions_admin_all ON public.role_permissions FOR ALL USING (erp_core.is_admin());

-- user_roles: admin only
DROP POLICY IF EXISTS user_roles_admin_all ON public.user_roles;
CREATE POLICY user_roles_admin_all ON public.user_roles FOR ALL USING (erp_core.is_admin());

-- user_organization_scopes: admin only
DROP POLICY IF EXISTS user_org_scopes_admin_all ON public.user_organization_scopes;
CREATE POLICY user_org_scopes_admin_all ON public.user_organization_scopes FOR ALL USING (erp_core.is_admin());

-- activity_logs: admin only
DROP POLICY IF EXISTS activity_logs_admin_all ON public.activity_logs;
CREATE POLICY activity_logs_admin_all ON public.activity_logs FOR ALL USING (erp_core.is_admin());

-- department_division_scopes: admin only
DROP POLICY IF EXISTS dept_div_scopes_admin_all ON public.department_division_scopes;
CREATE POLICY dept_div_scopes_admin_all ON public.department_division_scopes FOR ALL USING (erp_core.is_admin());

-- ----- 4b. ORGANIZATION TABLES (company-scoped + admin) -----
-- Each table has company_id

CREATE OR REPLACE FUNCTION erp_core.company_in_scope(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT erp_core.is_admin() OR EXISTS (
    SELECT 1 FROM public.user_organization_scopes s
    JOIN public.erp_users eu ON eu.id = s.user_id
    WHERE eu.auth_user_id = auth.uid()
      AND s.company_id = p_company_id
      AND eu.status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION erp_core.item_child_in_scope(p_item_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT erp_core.is_admin() OR erp_core.company_in_scope((SELECT company_id FROM public.items WHERE id = p_item_id));
$$;

DO $$ DECLARE
  t TEXT;
  org_tables TEXT[] := ARRAY['branches','divisions','sections','departments','business_units','warehouses'];
BEGIN
  FOREACH t IN ARRAY org_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %s_company_select ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_select ON public.%s FOR SELECT USING (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_insert ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_insert ON public.%s FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_update ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_update ON public.%s FOR UPDATE USING (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_delete ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_delete ON public.%s FOR DELETE USING (erp_core.company_in_scope(company_id))', t, t);
  END LOOP;
END $$;

-- warehouse_locations doesn't have company_id directly — scope via parent warehouse
DROP POLICY IF EXISTS warehouse_locations_company_select ON public.warehouse_locations;
CREATE POLICY warehouse_locations_company_select ON public.warehouse_locations
  FOR SELECT USING (erp_core.company_in_scope((SELECT company_id FROM public.warehouses WHERE id = warehouse_locations.warehouse_id)));
DROP POLICY IF EXISTS warehouse_locations_company_insert ON public.warehouse_locations;
CREATE POLICY warehouse_locations_company_insert ON public.warehouse_locations
  FOR INSERT WITH CHECK (erp_core.company_in_scope((SELECT company_id FROM public.warehouses WHERE id = warehouse_locations.warehouse_id)));
DROP POLICY IF EXISTS warehouse_locations_company_update ON public.warehouse_locations;
CREATE POLICY warehouse_locations_company_update ON public.warehouse_locations
  FOR UPDATE USING (erp_core.company_in_scope((SELECT company_id FROM public.warehouses WHERE id = warehouse_locations.warehouse_id)));
DROP POLICY IF EXISTS warehouse_locations_company_delete ON public.warehouse_locations;
CREATE POLICY warehouse_locations_company_delete ON public.warehouse_locations
  FOR DELETE USING (erp_core.company_in_scope((SELECT company_id FROM public.warehouses WHERE id = warehouse_locations.warehouse_id)));

-- ----- 4c. MASTER DATA TABLES (company-scoped + admin) -----

DO $$ DECLARE
  t TEXT;
  mst_tables TEXT[] := ARRAY['items','item_categories','uoms','item_attribute_definitions'];
BEGIN
  FOREACH t IN ARRAY mst_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %s_company_select ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_select ON public.%s FOR SELECT USING (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_insert ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_insert ON public.%s FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_update ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_update ON public.%s FOR UPDATE USING (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_delete ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_delete ON public.%s FOR DELETE USING (erp_core.company_in_scope(company_id))', t, t);
  END LOOP;
END $$;

-- uom_conversions: no company_id — scope via from_uom/to_uom's company
CREATE OR REPLACE FUNCTION erp_core.uom_conversion_in_scope(p_from_uom_id UUID, p_to_uom_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT erp_core.is_admin() OR EXISTS (
    SELECT 1 FROM public.uoms u WHERE u.id IN (p_from_uom_id, p_to_uom_id)
      AND erp_core.company_in_scope(u.company_id)
  );
$$;

DROP POLICY IF EXISTS uom_conversions_select ON public.uom_conversions;
CREATE POLICY uom_conversions_select ON public.uom_conversions
  FOR SELECT USING (erp_core.uom_conversion_in_scope(from_uom_id, to_uom_id));
DROP POLICY IF EXISTS uom_conversions_insert ON public.uom_conversions;
CREATE POLICY uom_conversions_insert ON public.uom_conversions
  FOR INSERT WITH CHECK (erp_core.uom_conversion_in_scope(from_uom_id, to_uom_id));
DROP POLICY IF EXISTS uom_conversions_update ON public.uom_conversions;
CREATE POLICY uom_conversions_update ON public.uom_conversions
  FOR UPDATE USING (erp_core.uom_conversion_in_scope(from_uom_id, to_uom_id));
DROP POLICY IF EXISTS uom_conversions_delete ON public.uom_conversions;
CREATE POLICY uom_conversions_delete ON public.uom_conversions
  FOR DELETE USING (erp_core.uom_conversion_in_scope(from_uom_id, to_uom_id));

-- Item child tables: scope via parent item's company
CREATE OR REPLACE FUNCTION erp_core.item_child_in_scope(p_item_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT erp_core.is_admin() OR erp_core.company_in_scope((SELECT company_id FROM public.items WHERE id = p_item_id));
$$;

DO $$ DECLARE
  t TEXT;
  item_child_tables TEXT[] := ARRAY['item_attribute_values','item_barcodes','item_specifications','item_documents'];
BEGIN
  FOREACH t IN ARRAY item_child_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %s_item_select ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_item_select ON public.%s FOR SELECT USING (erp_core.item_child_in_scope(item_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_item_insert ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_item_insert ON public.%s FOR INSERT WITH CHECK (erp_core.item_child_in_scope(item_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_item_update ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_item_update ON public.%s FOR UPDATE USING (erp_core.item_child_in_scope(item_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_item_delete ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_item_delete ON public.%s FOR DELETE USING (erp_core.item_child_in_scope(item_id))', t, t);
  END LOOP;
END $$;

-- ----- 4d. INVENTORY TABLES (company-scoped) -----

DO $$ DECLARE
  t TEXT;
  inv_tables TEXT[] := ARRAY['inventory_balances','stock_ledger','batches','serial_numbers','inventory_policies','inventory_reservations','stock_adjustments','stock_transfers'];
BEGIN
  FOREACH t IN ARRAY inv_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %s_company_select ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_select ON public.%s FOR SELECT USING (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_insert ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_insert ON public.%s FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_update ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_update ON public.%s FOR UPDATE USING (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_delete ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_delete ON public.%s FOR DELETE USING (erp_core.company_in_scope(company_id))', t, t);
  END LOOP;
END $$;

-- Line tables: scope via parent (stock_adjustment_lines, stock_transfer_lines)
DROP POLICY IF EXISTS stock_adjustment_lines_parent_select ON public.stock_adjustment_lines;
CREATE POLICY stock_adjustment_lines_parent_select ON public.stock_adjustment_lines
  FOR SELECT USING (erp_core.company_in_scope((SELECT company_id FROM public.stock_adjustments WHERE id = stock_adjustment_lines.adjustment_id)));
DROP POLICY IF EXISTS stock_adjustment_lines_parent_insert ON public.stock_adjustment_lines;
CREATE POLICY stock_adjustment_lines_parent_insert ON public.stock_adjustment_lines
  FOR INSERT WITH CHECK (erp_core.company_in_scope((SELECT company_id FROM public.stock_adjustments WHERE id = stock_adjustment_lines.adjustment_id)));
DROP POLICY IF EXISTS stock_adjustment_lines_parent_update ON public.stock_adjustment_lines;
CREATE POLICY stock_adjustment_lines_parent_update ON public.stock_adjustment_lines
  FOR UPDATE USING (erp_core.company_in_scope((SELECT company_id FROM public.stock_adjustments WHERE id = stock_adjustment_lines.adjustment_id)));
DROP POLICY IF EXISTS stock_adjustment_lines_parent_delete ON public.stock_adjustment_lines;
CREATE POLICY stock_adjustment_lines_parent_delete ON public.stock_adjustment_lines
  FOR DELETE USING (erp_core.company_in_scope((SELECT company_id FROM public.stock_adjustments WHERE id = stock_adjustment_lines.adjustment_id)));

DROP POLICY IF EXISTS stock_transfer_lines_parent_select ON public.stock_transfer_lines;
CREATE POLICY stock_transfer_lines_parent_select ON public.stock_transfer_lines
  FOR SELECT USING (erp_core.company_in_scope((SELECT company_id FROM public.stock_transfers WHERE id = stock_transfer_lines.transfer_id)));
DROP POLICY IF EXISTS stock_transfer_lines_parent_insert ON public.stock_transfer_lines;
CREATE POLICY stock_transfer_lines_parent_insert ON public.stock_transfer_lines
  FOR INSERT WITH CHECK (erp_core.company_in_scope((SELECT company_id FROM public.stock_transfers WHERE id = stock_transfer_lines.transfer_id)));
DROP POLICY IF EXISTS stock_transfer_lines_parent_update ON public.stock_transfer_lines;
CREATE POLICY stock_transfer_lines_parent_update ON public.stock_transfer_lines
  FOR UPDATE USING (erp_core.company_in_scope((SELECT company_id FROM public.stock_transfers WHERE id = stock_transfer_lines.transfer_id)));
DROP POLICY IF EXISTS stock_transfer_lines_parent_delete ON public.stock_transfer_lines;
CREATE POLICY stock_transfer_lines_parent_delete ON public.stock_transfer_lines
  FOR DELETE USING (erp_core.company_in_scope((SELECT company_id FROM public.stock_transfers WHERE id = stock_transfer_lines.transfer_id)));

-- ----- 4e. PROCUREMENT TABLES (company-scoped) -----

DO $$ DECLARE
  t TEXT;
  proc_tables TEXT[] := ARRAY['suppliers','supplier_items','purchase_requisitions','request_for_quotations','quotations','purchase_orders','goods_receipts','purchase_returns','purchase_invoices'];
BEGIN
  FOREACH t IN ARRAY proc_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %s_company_select ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_select ON public.%s FOR SELECT USING (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_insert ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_insert ON public.%s FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_update ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_update ON public.%s FOR UPDATE USING (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_delete ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_delete ON public.%s FOR DELETE USING (erp_core.company_in_scope(company_id))', t, t);
  END LOOP;
END $$;

-- Procurement line tables: scope via parent company
CREATE OR REPLACE FUNCTION erp_core.procurement_line_in_scope(p_parent_table TEXT, p_parent_id UUID)
RETURNS BOOLEAN
LANGUAGE PLPGSQL STABLE
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  CASE p_parent_table
    WHEN 'purchase_requisitions' THEN SELECT company_id INTO v_company_id FROM public.purchase_requisitions WHERE id = p_parent_id;
    WHEN 'request_for_quotations' THEN SELECT company_id INTO v_company_id FROM public.request_for_quotations WHERE id = p_parent_id;
    WHEN 'quotations' THEN SELECT company_id INTO v_company_id FROM public.quotations WHERE id = p_parent_id;
    WHEN 'purchase_orders' THEN SELECT company_id INTO v_company_id FROM public.purchase_orders WHERE id = p_parent_id;
    WHEN 'goods_receipts' THEN SELECT company_id INTO v_company_id FROM public.goods_receipts WHERE id = p_parent_id;
    WHEN 'purchase_returns' THEN SELECT company_id INTO v_company_id FROM public.purchase_returns WHERE id = p_parent_id;
    WHEN 'purchase_invoices' THEN SELECT company_id INTO v_company_id FROM public.purchase_invoices WHERE id = p_parent_id;
    ELSE RETURN false;
  END CASE;
  RETURN erp_core.is_admin() OR erp_core.company_in_scope(v_company_id);
END; $$;

DO $$ DECLARE
  pairs TEXT[][] := ARRAY[
    ['purchase_requisition_lines','requisition_id','purchase_requisitions'],
    ['rfq_lines','rfq_id','request_for_quotations'],
    ['quotation_lines','quotation_id','quotations'],
    ['purchase_order_lines','po_id','purchase_orders'],
    ['goods_receipt_lines','receipt_id','goods_receipts'],
    ['purchase_return_lines','return_id','purchase_returns'],
    ['purchase_invoice_lines','invoice_id','purchase_invoices']
  ];
  i INT;
BEGIN
  FOR i IN 1..array_length(pairs, 1) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %s_parent_select ON public.%s', pairs[i][1], pairs[i][1]);
    EXECUTE format('CREATE POLICY %s_parent_select ON public.%s FOR SELECT USING (erp_core.procurement_line_in_scope(%L, %s))', pairs[i][1], pairs[i][1], pairs[i][3], pairs[i][2]);
    EXECUTE format('DROP POLICY IF EXISTS %s_parent_insert ON public.%s', pairs[i][1], pairs[i][1]);
    EXECUTE format('CREATE POLICY %s_parent_insert ON public.%s FOR INSERT WITH CHECK (erp_core.procurement_line_in_scope(%L, %s))', pairs[i][1], pairs[i][1], pairs[i][3], pairs[i][2]);
    EXECUTE format('DROP POLICY IF EXISTS %s_parent_update ON public.%s', pairs[i][1], pairs[i][1]);
    EXECUTE format('CREATE POLICY %s_parent_update ON public.%s FOR UPDATE USING (erp_core.procurement_line_in_scope(%L, %s))', pairs[i][1], pairs[i][1], pairs[i][3], pairs[i][2]);
    EXECUTE format('DROP POLICY IF EXISTS %s_parent_delete ON public.%s', pairs[i][1], pairs[i][1]);
    EXECUTE format('CREATE POLICY %s_parent_delete ON public.%s FOR DELETE USING (erp_core.procurement_line_in_scope(%L, %s))', pairs[i][1], pairs[i][1], pairs[i][3], pairs[i][2]);
  END LOOP;
END $$;

-- ----- 4f. CRM / CUSTOMER TABLES (company-scoped) -----

DROP POLICY IF EXISTS customers_company_select ON public.customers;
CREATE POLICY customers_company_select ON public.customers FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS customers_company_insert ON public.customers;
CREATE POLICY customers_company_insert ON public.customers FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS customers_company_update ON public.customers;
CREATE POLICY customers_company_update ON public.customers FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS customers_company_delete ON public.customers;
CREATE POLICY customers_company_delete ON public.customers FOR DELETE USING (erp_core.company_in_scope(company_id));

-- customer_contacts: scope via parent customer's company
DROP POLICY IF EXISTS customer_contacts_parent_select ON public.customer_contacts;
CREATE POLICY customer_contacts_parent_select ON public.customer_contacts
  FOR SELECT USING (erp_core.company_in_scope((SELECT company_id FROM public.customers WHERE id = customer_contacts.customer_id)));
DROP POLICY IF EXISTS customer_contacts_parent_insert ON public.customer_contacts;
CREATE POLICY customer_contacts_parent_insert ON public.customer_contacts
  FOR INSERT WITH CHECK (erp_core.company_in_scope((SELECT company_id FROM public.customers WHERE id = customer_contacts.customer_id)));
DROP POLICY IF EXISTS customer_contacts_parent_update ON public.customer_contacts;
CREATE POLICY customer_contacts_parent_update ON public.customer_contacts
  FOR UPDATE USING (erp_core.company_in_scope((SELECT company_id FROM public.customers WHERE id = customer_contacts.customer_id)));
DROP POLICY IF EXISTS customer_contacts_parent_delete ON public.customer_contacts;
CREATE POLICY customer_contacts_parent_delete ON public.customer_contacts
  FOR DELETE USING (erp_core.company_in_scope((SELECT company_id FROM public.customers WHERE id = customer_contacts.customer_id)));

-- customer_addresses: same pattern
DROP POLICY IF EXISTS customer_addresses_parent_select ON public.customer_addresses;
CREATE POLICY customer_addresses_parent_select ON public.customer_addresses
  FOR SELECT USING (erp_core.company_in_scope((SELECT company_id FROM public.customers WHERE id = customer_addresses.customer_id)));
DROP POLICY IF EXISTS customer_addresses_parent_insert ON public.customer_addresses;
CREATE POLICY customer_addresses_parent_insert ON public.customer_addresses
  FOR INSERT WITH CHECK (erp_core.company_in_scope((SELECT company_id FROM public.customers WHERE id = customer_addresses.customer_id)));
DROP POLICY IF EXISTS customer_addresses_parent_update ON public.customer_addresses;
CREATE POLICY customer_addresses_parent_update ON public.customer_addresses
  FOR UPDATE USING (erp_core.company_in_scope((SELECT company_id FROM public.customers WHERE id = customer_addresses.customer_id)));
DROP POLICY IF EXISTS customer_addresses_parent_delete ON public.customer_addresses;
CREATE POLICY customer_addresses_parent_delete ON public.customer_addresses
  FOR DELETE USING (erp_core.company_in_scope((SELECT company_id FROM public.customers WHERE id = customer_addresses.customer_id)));

-- ----- 4g. MANUFACTURING TABLES (company-scoped) -----

DO $$ DECLARE
  t TEXT;
  mfg_tables TEXT[] := ARRAY['bill_of_materials','production_routings','production_orders','production_entries','production_order_operations','production_order_operation_logs','machines','machine_targets','shifts','downtime_reasons','routing_operations'];
BEGIN
  FOREACH t IN ARRAY mfg_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %s_company_select ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_select ON public.%s FOR SELECT USING (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_insert ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_insert ON public.%s FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_update ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_update ON public.%s FOR UPDATE USING (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_delete ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_delete ON public.%s FOR DELETE USING (erp_core.company_in_scope(company_id))', t, t);
  END LOOP;
END $$;

-- bom_lines: scope via parent BOM's company
DROP POLICY IF EXISTS bom_lines_parent_select ON public.bom_lines;
CREATE POLICY bom_lines_parent_select ON public.bom_lines
  FOR SELECT USING (erp_core.company_in_scope((SELECT company_id FROM public.bill_of_materials WHERE id = bom_lines.bom_id)));
DROP POLICY IF EXISTS bom_lines_parent_insert ON public.bom_lines;
CREATE POLICY bom_lines_parent_insert ON public.bom_lines
  FOR INSERT WITH CHECK (erp_core.company_in_scope((SELECT company_id FROM public.bill_of_materials WHERE id = bom_lines.bom_id)));
DROP POLICY IF EXISTS bom_lines_parent_update ON public.bom_lines;
CREATE POLICY bom_lines_parent_update ON public.bom_lines
  FOR UPDATE USING (erp_core.company_in_scope((SELECT company_id FROM public.bill_of_materials WHERE id = bom_lines.bom_id)));
DROP POLICY IF EXISTS bom_lines_parent_delete ON public.bom_lines;
CREATE POLICY bom_lines_parent_delete ON public.bom_lines
  FOR DELETE USING (erp_core.company_in_scope((SELECT company_id FROM public.bill_of_materials WHERE id = bom_lines.bom_id)));

-- ----- 4h. MAINTENANCE TABLES (company-scoped) -----

DO $$ DECLARE
  t TEXT;
  maint_tables TEXT[] := ARRAY['maintenance_job_cards','maintenance_teams','maintenance_technicians','maintenance_pm_plans','maintenance_complaint_categories','maintenance_failure_categories','maintenance_root_cause_categories'];
BEGIN
  FOREACH t IN ARRAY maint_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='company_id') THEN
      EXECUTE format('DROP POLICY IF EXISTS %s_company_select ON public.%s', t, t);
      EXECUTE format('CREATE POLICY %s_company_select ON public.%s FOR SELECT USING (erp_core.company_in_scope(company_id))', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %s_company_insert ON public.%s', t, t);
      EXECUTE format('CREATE POLICY %s_company_insert ON public.%s FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id))', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %s_company_update ON public.%s', t, t);
      EXECUTE format('CREATE POLICY %s_company_update ON public.%s FOR UPDATE USING (erp_core.company_in_scope(company_id))', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %s_company_delete ON public.%s', t, t);
      EXECUTE format('CREATE POLICY %s_company_delete ON public.%s FOR DELETE USING (erp_core.company_in_scope(company_id))', t, t);
    END IF;
  END LOOP;
END $$;

-- Maintenance child tables: scope via parent job card's company
CREATE OR REPLACE FUNCTION erp_core.job_card_company_id(p_job_card_id UUID)
RETURNS UUID
LANGUAGE SQL STABLE
AS $$ SELECT company_id FROM public.maintenance_job_cards WHERE id = p_job_card_id; $$;

DO $$ DECLARE
  t TEXT;
  jc_child_tables TEXT[] := ARRAY['maintenance_job_card_attachments','maintenance_job_card_parts','maintenance_job_card_status_history','maintenance_job_card_technicians','maintenance_job_card_work_logs'];
BEGIN
  FOREACH t IN ARRAY jc_child_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %s_jc_select ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_jc_select ON public.%s FOR SELECT USING (erp_core.company_in_scope(erp_core.job_card_company_id(job_card_id)))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_jc_insert ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_jc_insert ON public.%s FOR INSERT WITH CHECK (erp_core.company_in_scope(erp_core.job_card_company_id(job_card_id)))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_jc_update ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_jc_update ON public.%s FOR UPDATE USING (erp_core.company_in_scope(erp_core.job_card_company_id(job_card_id)))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_jc_delete ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %s_jc_delete ON public.%s FOR DELETE USING (erp_core.company_in_scope(erp_core.job_card_company_id(job_card_id)))', t, t);
  END LOOP;
END $$;

-- maintenance_pm_schedules: scope via parent pm_plan's company
DROP POLICY IF EXISTS maintenance_pm_schedules_parent_select ON public.maintenance_pm_schedules;
CREATE POLICY maintenance_pm_schedules_parent_select ON public.maintenance_pm_schedules
  FOR SELECT USING (erp_core.company_in_scope((SELECT company_id FROM public.maintenance_pm_plans WHERE id = maintenance_pm_schedules.pm_plan_id)));
DROP POLICY IF EXISTS maintenance_pm_schedules_parent_insert ON public.maintenance_pm_schedules;
CREATE POLICY maintenance_pm_schedules_parent_insert ON public.maintenance_pm_schedules
  FOR INSERT WITH CHECK (erp_core.company_in_scope((SELECT company_id FROM public.maintenance_pm_plans WHERE id = maintenance_pm_schedules.pm_plan_id)));
DROP POLICY IF EXISTS maintenance_pm_schedules_parent_update ON public.maintenance_pm_schedules;
CREATE POLICY maintenance_pm_schedules_parent_update ON public.maintenance_pm_schedules
  FOR UPDATE USING (erp_core.company_in_scope((SELECT company_id FROM public.maintenance_pm_plans WHERE id = maintenance_pm_schedules.pm_plan_id)));
DROP POLICY IF EXISTS maintenance_pm_schedules_parent_delete ON public.maintenance_pm_schedules;
CREATE POLICY maintenance_pm_schedules_parent_delete ON public.maintenance_pm_schedules
  FOR DELETE USING (erp_core.company_in_scope((SELECT company_id FROM public.maintenance_pm_plans WHERE id = maintenance_pm_schedules.pm_plan_id)));

-- maintenance_team_members: scope via parent team's company
DROP POLICY IF EXISTS maintenance_team_members_parent_select ON public.maintenance_team_members;
CREATE POLICY maintenance_team_members_parent_select ON public.maintenance_team_members
  FOR SELECT USING (erp_core.company_in_scope((SELECT company_id FROM public.maintenance_teams WHERE id = maintenance_team_members.team_id)));
DROP POLICY IF EXISTS maintenance_team_members_parent_insert ON public.maintenance_team_members;
CREATE POLICY maintenance_team_members_parent_insert ON public.maintenance_team_members
  FOR INSERT WITH CHECK (erp_core.company_in_scope((SELECT company_id FROM public.maintenance_teams WHERE id = maintenance_team_members.team_id)));
DROP POLICY IF EXISTS maintenance_team_members_parent_update ON public.maintenance_team_members;
CREATE POLICY maintenance_team_members_parent_update ON public.maintenance_team_members
  FOR UPDATE USING (erp_core.company_in_scope((SELECT company_id FROM public.maintenance_teams WHERE id = maintenance_team_members.team_id)));
DROP POLICY IF EXISTS maintenance_team_members_parent_delete ON public.maintenance_team_members;
CREATE POLICY maintenance_team_members_parent_delete ON public.maintenance_team_members
  FOR DELETE USING (erp_core.company_in_scope((SELECT company_id FROM public.maintenance_teams WHERE id = maintenance_team_members.team_id)));

-- ----- 4i. SALES (erp_sales schema) -----

DO $$ DECLARE
  t TEXT;
  sales_tables TEXT[] := ARRAY['customers','quotations','sales_orders','sales_invoices','sales_deliveries','sales_returns'];
BEGIN
  FOREACH t IN ARRAY sales_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %s_company_select ON erp_sales.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_select ON erp_sales.%s FOR SELECT USING (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_insert ON erp_sales.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_insert ON erp_sales.%s FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_update ON erp_sales.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_update ON erp_sales.%s FOR UPDATE USING (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_company_delete ON erp_sales.%s', t, t);
    EXECUTE format('CREATE POLICY %s_company_delete ON erp_sales.%s FOR DELETE USING (erp_core.company_in_scope(company_id))', t, t);
  END LOOP;
END $$;

-- Sales line items: scope via parent
DROP POLICY IF EXISTS quotation_items_parent_select ON erp_sales.quotation_items;
CREATE POLICY quotation_items_parent_select ON erp_sales.quotation_items
  FOR SELECT USING (erp_core.company_in_scope((SELECT company_id FROM erp_sales.quotations WHERE id = quotation_items.quotation_id)));
DROP POLICY IF EXISTS quotation_items_parent_insert ON erp_sales.quotation_items;
CREATE POLICY quotation_items_parent_insert ON erp_sales.quotation_items
  FOR INSERT WITH CHECK (erp_core.company_in_scope((SELECT company_id FROM erp_sales.quotations WHERE id = quotation_items.quotation_id)));
DROP POLICY IF EXISTS quotation_items_parent_update ON erp_sales.quotation_items;
CREATE POLICY quotation_items_parent_update ON erp_sales.quotation_items
  FOR UPDATE USING (erp_core.company_in_scope((SELECT company_id FROM erp_sales.quotations WHERE id = quotation_items.quotation_id)));
DROP POLICY IF EXISTS quotation_items_parent_delete ON erp_sales.quotation_items;
CREATE POLICY quotation_items_parent_delete ON erp_sales.quotation_items
  FOR DELETE USING (erp_core.company_in_scope((SELECT company_id FROM erp_sales.quotations WHERE id = quotation_items.quotation_id)));

DROP POLICY IF EXISTS sales_order_items_parent_select ON erp_sales.sales_order_items;
CREATE POLICY sales_order_items_parent_select ON erp_sales.sales_order_items
  FOR SELECT USING (erp_core.company_in_scope((SELECT company_id FROM erp_sales.sales_orders WHERE id = sales_order_items.sales_order_id)));
DROP POLICY IF EXISTS sales_order_items_parent_insert ON erp_sales.sales_order_items;
CREATE POLICY sales_order_items_parent_insert ON erp_sales.sales_order_items
  FOR INSERT WITH CHECK (erp_core.company_in_scope((SELECT company_id FROM erp_sales.sales_orders WHERE id = sales_order_items.sales_order_id)));
DROP POLICY IF EXISTS sales_order_items_parent_update ON erp_sales.sales_order_items;
CREATE POLICY sales_order_items_parent_update ON erp_sales.sales_order_items
  FOR UPDATE USING (erp_core.company_in_scope((SELECT company_id FROM erp_sales.sales_orders WHERE id = sales_order_items.sales_order_id)));
DROP POLICY IF EXISTS sales_order_items_parent_delete ON erp_sales.sales_order_items;
CREATE POLICY sales_order_items_parent_delete ON erp_sales.sales_order_items
  FOR DELETE USING (erp_core.company_in_scope((SELECT company_id FROM erp_sales.sales_orders WHERE id = sales_order_items.sales_order_id)));

-- sales_delivery_lines: scope via parent
DROP POLICY IF EXISTS sales_delivery_lines_parent_select ON erp_sales.sales_delivery_lines;
CREATE POLICY sales_delivery_lines_parent_select ON erp_sales.sales_delivery_lines
  FOR SELECT USING (erp_core.company_in_scope((SELECT company_id FROM erp_sales.sales_deliveries WHERE id = sales_delivery_lines.delivery_id)));
DROP POLICY IF EXISTS sales_delivery_lines_parent_insert ON erp_sales.sales_delivery_lines;
CREATE POLICY sales_delivery_lines_parent_insert ON erp_sales.sales_delivery_lines
  FOR INSERT WITH CHECK (erp_core.company_in_scope((SELECT company_id FROM erp_sales.sales_deliveries WHERE id = sales_delivery_lines.delivery_id)));
DROP POLICY IF EXISTS sales_delivery_lines_parent_update ON erp_sales.sales_delivery_lines;
CREATE POLICY sales_delivery_lines_parent_update ON erp_sales.sales_delivery_lines
  FOR UPDATE USING (erp_core.company_in_scope((SELECT company_id FROM erp_sales.sales_deliveries WHERE id = sales_delivery_lines.delivery_id)));
DROP POLICY IF EXISTS sales_delivery_lines_parent_delete ON erp_sales.sales_delivery_lines;
CREATE POLICY sales_delivery_lines_parent_delete ON erp_sales.sales_delivery_lines
  FOR DELETE USING (erp_core.company_in_scope((SELECT company_id FROM erp_sales.sales_deliveries WHERE id = sales_delivery_lines.delivery_id)));

-- sales_return_lines: scope via parent
DROP POLICY IF EXISTS sales_return_lines_parent_select ON erp_sales.sales_return_lines;
CREATE POLICY sales_return_lines_parent_select ON erp_sales.sales_return_lines
  FOR SELECT USING (erp_core.company_in_scope((SELECT company_id FROM erp_sales.sales_returns WHERE id = sales_return_lines.return_id)));
DROP POLICY IF EXISTS sales_return_lines_parent_insert ON erp_sales.sales_return_lines;
CREATE POLICY sales_return_lines_parent_insert ON erp_sales.sales_return_lines
  FOR INSERT WITH CHECK (erp_core.company_in_scope((SELECT company_id FROM erp_sales.sales_returns WHERE id = sales_return_lines.return_id)));
DROP POLICY IF EXISTS sales_return_lines_parent_update ON erp_sales.sales_return_lines;
CREATE POLICY sales_return_lines_parent_update ON erp_sales.sales_return_lines
  FOR UPDATE USING (erp_core.company_in_scope((SELECT company_id FROM erp_sales.sales_returns WHERE id = sales_return_lines.return_id)));
DROP POLICY IF EXISTS sales_return_lines_parent_delete ON erp_sales.sales_return_lines;
CREATE POLICY sales_return_lines_parent_delete ON erp_sales.sales_return_lines
  FOR DELETE USING (erp_core.company_in_scope((SELECT company_id FROM erp_sales.sales_returns WHERE id = sales_return_lines.return_id)));

-- ----- 4j. NOTIFICATIONS (user-scoped) -----

DROP POLICY IF EXISTS notifications_user_select ON public.notifications;
CREATE POLICY notifications_user_select ON public.notifications
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS notifications_user_insert ON public.notifications;
CREATE POLICY notifications_user_insert ON public.notifications
  FOR INSERT WITH CHECK (true);  -- anyone can create notifications
DROP POLICY IF EXISTS notifications_user_update ON public.notifications;
CREATE POLICY notifications_user_update ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS notifications_user_delete ON public.notifications;
CREATE POLICY notifications_user_delete ON public.notifications
  FOR DELETE USING (user_id = auth.uid());

-- =====================================================
-- PART 5: MISSING FOREIGN KEYS
-- =====================================================

-- uoms.company_id -> companies(id)
ALTER TABLE public.uoms DROP CONSTRAINT IF EXISTS fk_uoms_company;
ALTER TABLE public.uoms ADD CONSTRAINT fk_uoms_company FOREIGN KEY (company_id) REFERENCES public.companies(id);

-- production_entries.inventory_reference_id -> stock_ledger(id)
-- Only add if column exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='production_entries' AND column_name='inventory_reference_id') THEN
    ALTER TABLE public.production_entries DROP CONSTRAINT IF EXISTS fk_prod_entries_inv_ref;
    ALTER TABLE public.production_entries ADD CONSTRAINT fk_prod_entries_inv_ref FOREIGN KEY (inventory_reference_id) REFERENCES public.stock_ledger(id);
  END IF;
END $$;

-- erp_sales.sales_delivery_lines.batch_id -> batches(id)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='erp_sales' AND table_name='sales_delivery_lines' AND column_name='batch_id') THEN
    ALTER TABLE erp_sales.sales_delivery_lines DROP CONSTRAINT IF EXISTS fk_sdl_batch;
    ALTER TABLE erp_sales.sales_delivery_lines ADD CONSTRAINT fk_sdl_batch FOREIGN KEY (batch_id) REFERENCES public.batches(id);
  END IF;
END $$;

-- =====================================================
-- PART 6: MISSING CHECK CONSTRAINTS
-- =====================================================

-- uom_conversions: no self-reference
ALTER TABLE public.uom_conversions DROP CONSTRAINT IF EXISTS ck_uom_conv_no_self;
ALTER TABLE public.uom_conversions ADD CONSTRAINT ck_uom_conv_no_self CHECK (from_uom_id <> to_uom_id);

-- items: min_stock <= max_stock
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS ck_items_stock_range;
ALTER TABLE public.items ADD CONSTRAINT ck_items_stock_range CHECK (
  minimum_stock_level IS NULL OR maximum_stock_level IS NULL OR minimum_stock_level <= maximum_stock_level
);

-- items: non-negative prices
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS ck_items_price_non_neg;
ALTER TABLE public.items ADD CONSTRAINT ck_items_price_non_neg CHECK (
  (cost_price IS NULL OR cost_price >= 0) AND (selling_price IS NULL OR selling_price >= 0)
);

-- batches: expiry > manufacture
ALTER TABLE public.batches DROP CONSTRAINT IF EXISTS ck_batches_expiry;
ALTER TABLE public.batches ADD CONSTRAINT ck_batches_expiry CHECK (
  expiry_date IS NULL OR manufacturing_date IS NULL OR expiry_date > manufacturing_date
);

-- batches: non-negative quantity
ALTER TABLE public.batches DROP CONSTRAINT IF EXISTS ck_batches_qty;
ALTER TABLE public.batches ADD CONSTRAINT ck_batches_qty CHECK (quantity >= 0);

-- stock_transfers: different warehouses
ALTER TABLE public.stock_transfers DROP CONSTRAINT IF EXISTS ck_transfer_diff_wh;
ALTER TABLE public.stock_transfers ADD CONSTRAINT ck_transfer_diff_wh CHECK (from_warehouse_id <> to_warehouse_id);

-- purchase_order_lines: received <= quantity
ALTER TABLE public.purchase_order_lines DROP CONSTRAINT IF EXISTS ck_po_lines_received;
ALTER TABLE public.purchase_order_lines ADD CONSTRAINT ck_po_lines_received CHECK (received_quantity <= quantity);

-- goods_receipt_lines: accepted + rejected <= received
ALTER TABLE public.goods_receipt_lines DROP CONSTRAINT IF EXISTS ck_gr_lines_qty;
ALTER TABLE public.goods_receipt_lines ADD CONSTRAINT ck_gr_lines_qty CHECK (
  quantity_accepted + quantity_rejected <= quantity_received
);

-- production_routings: effective range
ALTER TABLE public.production_routings DROP CONSTRAINT IF EXISTS ck_routing_effective;
ALTER TABLE public.production_routings ADD CONSTRAINT ck_routing_effective CHECK (
  effective_from IS NULL OR effective_to IS NULL OR effective_to >= effective_from
);

-- bom_lines: positive quantity
ALTER TABLE public.bom_lines DROP CONSTRAINT IF EXISTS ck_bom_lines_qty;
ALTER TABLE public.bom_lines ADD CONSTRAINT ck_bom_lines_qty CHECK (quantity > 0);

-- maintenance_job_cards: non-negative downtime
ALTER TABLE public.maintenance_job_cards DROP CONSTRAINT IF EXISTS ck_mjc_downtime;
ALTER TABLE public.maintenance_job_cards ADD CONSTRAINT ck_mjc_downtime CHECK (downtime_minutes IS NULL OR downtime_minutes >= 0);

-- =====================================================
-- PART 7: MISSING INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_erp_users_auth_user_id ON public.erp_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_erp_users_default_company ON public.erp_users(default_company_id);
CREATE INDEX IF NOT EXISTS idx_erp_users_email ON public.erp_users(email);
CREATE INDEX IF NOT EXISTS idx_items_weight_uom ON public.items(weight_uom_id);
CREATE INDEX IF NOT EXISTS idx_items_dimension_uom ON public.items(dimension_uom_id);
CREATE INDEX IF NOT EXISTS idx_items_volume_uom ON public.items(volume_uom_id);
CREATE INDEX IF NOT EXISTS idx_serial_numbers_warehouse ON public.serial_numbers(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_serial_numbers_location ON public.serial_numbers(location_id);
CREATE INDEX IF NOT EXISTS idx_serial_numbers_batch ON public.serial_numbers(batch_id);
CREATE INDEX IF NOT EXISTS idx_production_entries_machine ON public.production_entries(machine_id);
CREATE INDEX IF NOT EXISTS idx_production_entries_uom ON public.production_entries(uom_id);
CREATE INDEX IF NOT EXISTS idx_mjc_root_cause ON public.maintenance_job_cards(root_cause_category_id);
CREATE INDEX IF NOT EXISTS idx_mjc_failure ON public.maintenance_job_cards(failure_category_id);
CREATE INDEX IF NOT EXISTS idx_mjc_team ON public.maintenance_job_cards(team_id);
CREATE INDEX IF NOT EXISTS idx_mjc_requested_by ON public.maintenance_job_cards(requested_by);
CREATE INDEX IF NOT EXISTS idx_mjc_created_by ON public.maintenance_job_cards(created_by);
CREATE INDEX IF NOT EXISTS idx_mjc_status_history_changed_by ON public.maintenance_job_card_status_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_by ON public.activity_logs(created_by);
CREATE INDEX IF NOT EXISTS idx_activity_logs_updated_by ON public.activity_logs(updated_by);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON public.customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON public.customer_addresses(customer_id);