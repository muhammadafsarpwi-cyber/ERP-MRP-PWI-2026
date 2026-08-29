-- Migration: 20260829130000_erp_00029_rls_helper_functions_fix.sql
-- Fix: RLS helper functions must be SECURITY DEFINER so they can read the
-- RLS-protected authorization tables (user_organization_scopes, roles, erp_users)
-- when invoked from within a policy under the 'authenticated' role.
-- Re-applies 00028 with corrected definitions (idempotent).

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

CREATE OR REPLACE FUNCTION erp_core.uom_conversion_in_scope(p_from_uom_id UUID, p_to_uom_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT erp_core.is_admin() OR EXISTS (
    SELECT 1 FROM public.uoms u WHERE u.id IN (p_from_uom_id, p_to_uom_id)
      AND erp_core.company_in_scope(u.company_id)
  );
$$;

CREATE OR REPLACE FUNCTION erp_core.procurement_line_in_scope(p_parent_table TEXT, p_parent_id UUID)
RETURNS BOOLEAN
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
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
END;
$$;

CREATE OR REPLACE FUNCTION erp_core.job_card_company_id(p_job_card_id UUID)
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$ SELECT company_id FROM public.maintenance_job_cards WHERE id = p_job_card_id; $$;