-- ERP Demo Users Seed (early — required by 21130000 user_roles insert)
-- Migration: 20260818140000_seed_demo_erp_users.sql
-- Seeds demo erp_users with safe demo identities (no real credentials).
-- auth.users entries are created out-of-band in Supabase.

INSERT INTO public.erp_users (id, auth_user_id, email, username, display_name, default_company_id, status, is_active)
VALUES
  ('52e0c38e-2b29-47ca-9fa5-30dcbadea734', '5783fb36-a11c-4707-aa9e-01a93ffa4abc', 'dev@erp-local.test', 'Admin', 'ERP Admin', '7725aa04-a270-4314-9e82-90949cbe7791', 'ACTIVE', true),
  ('cc1a56cf-07af-487a-8a67-e6859292894b', '5205a16e-1f34-442b-ac33-d85e740081bc', 'admin@erp.com', 'super_admim', 'Super Admin', '7725aa04-a270-4314-9e82-90949cbe7791', 'ACTIVE', true),
  ('0804af57-1f03-4d11-ad84-dc34f8829db1', 'ddde0718-1ce6-4394-a075-a599e77de28e', 'system.admin@erp.com', 'system.admin', 'System Admin', '7725aa04-a270-4314-9e82-90949cbe7791', 'ACTIVE', true),
  ('b197d6d1-4911-429c-b0b8-3cc440e433ce', '36e816a9-b7a9-4e9d-9fb9-0c20270aec89', 'muhammadafsarpwi@gmail.com', 'muhammadafsarpwi', 'Muhammad Afsar', '7725aa04-a270-4314-9e82-90949cbe7791', 'ACTIVE', true)
ON CONFLICT (id) DO NOTHING;

-- Assign SUPER_ADMIN role (idempotent)
INSERT INTO public.user_roles (user_id, role_id, status)
SELECT eu.id, r.id, 'ACTIVE'
FROM public.erp_users eu CROSS JOIN public.roles r
WHERE eu.id IN ('52e0c38e-2b29-47ca-9fa5-30dcbadea734','cc1a56cf-07af-487a-8a67-e6859292894b','0804af57-1f03-4d11-ad84-dc34f8829db1','b197d6d1-4911-429c-b0b8-3cc440e433ce')
  AND r.role_code = 'SUPER_ADMIN'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = eu.id AND ur.role_id = r.id);

-- Company scope (idempotent)
INSERT INTO public.user_organization_scopes (user_id, company_id, scope_level, is_full_scope, status)
SELECT eu.id, '7725aa04-a270-4314-9e82-90949cbe7791', 'COMPANY', true, 'ACTIVE'
FROM public.erp_users eu
WHERE eu.id IN ('52e0c38e-2b29-47ca-9fa5-30dcbadea734','cc1a56cf-07af-487a-8a67-e6859292894b','0804af57-1f03-4d11-ad84-dc34f8829db1','b197d6d1-4911-429c-b0b8-3cc440e433ce')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_organization_scopes s
    WHERE s.user_id = eu.id AND s.company_id = '7725aa04-a270-4314-9e82-90949cbe7791'
      AND s.division_id IS NULL AND s.section_id IS NULL AND s.department_id IS NULL
  );