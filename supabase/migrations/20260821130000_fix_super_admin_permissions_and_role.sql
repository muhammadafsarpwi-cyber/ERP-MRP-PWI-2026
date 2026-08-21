-- Migration: 20260821130000_fix_super_admin_permissions_and_role.sql
-- BLOCKER 1: Assign dev@erp-local.test to SUPER_ADMIN role
-- BLOCKER 2: Grant SUPER_ADMIN all 174 permissions
-- Idempotent: safe to run multiple times

-- BLOCKER 1: user_roles for dev user
INSERT INTO public.user_roles (user_id, role_id, status, is_active)
SELECT
  '52e0c38e-2b29-47ca-9fa5-30dcbadea734'::uuid,
  r.id,
  'ACTIVE',
  true
FROM public.roles r
WHERE r.role_code = 'SUPER_ADMIN'
ON CONFLICT (user_id, role_id) DO UPDATE SET status = 'ACTIVE', is_active = true;

-- BLOCKER 1: user_organization_scopes for dev user (full company scope)
-- Note: UNIQUE constraint includes nullable columns, so we check existence first
INSERT INTO public.user_organization_scopes (user_id, company_id, scope_level, is_full_scope, status, is_active)
SELECT
  '52e0c38e-2b29-47ca-9fa5-30dcbadea734'::uuid,
  c.id,
  'COMPANY',
  true,
  'ACTIVE',
  true
FROM public.companies c
WHERE c.company_code = 'COMP-001'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_organization_scopes uos
    WHERE uos.user_id = '52e0c38e-2b29-47ca-9fa5-30dcbadea734'::uuid
      AND uos.company_id = c.id
  );

-- BLOCKER 2: Grant SUPER_ADMIN all 174 permissions
INSERT INTO public.role_permissions (role_id, permission_id, status, is_active)
SELECT
  r.id,
  p.id,
  'ACTIVE',
  true
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'SUPER_ADMIN'
ON CONFLICT (role_id, permission_id) DO UPDATE SET status = 'ACTIVE', is_active = true;
