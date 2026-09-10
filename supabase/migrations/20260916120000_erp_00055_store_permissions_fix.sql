-- Migration: ERP 00055 - Store Department permission fixes
-- Adds the 7 store permission codes referenced by navigationConfig.tsx but
-- missing from the permissions catalog (F1 in ERP_STORE_AUDIT_MATRIX.md).
-- Idempotent: safe to run multiple times.

-- 1. INSERT PERMISSIONS
INSERT INTO permissions (permission_code, name, module, resource, action, description, status) VALUES
  ('store.master.view', 'View Store Master', 'store', 'master', 'VIEW', 'View store master catalog', 'ACTIVE'),
  ('store.master.edit', 'Edit Store Master', 'store', 'master', 'EDIT', 'Edit store master records', 'ACTIVE'),
  ('store.transfer.view', 'View Store Transfers', 'store', 'transfer', 'VIEW', 'View store transfer documents', 'ACTIVE'),
  ('store.adjustment.view', 'View Store Adjustments', 'store', 'adjustment', 'VIEW', 'View store stock adjustment documents', 'ACTIVE'),
  ('store.reports.view', 'View Store Reports Hub', 'store', 'reports', 'VIEW', 'View the store reports hub', 'ACTIVE'),
  ('store.settings.view', 'View Store Settings', 'store', 'settings', 'VIEW', 'View store settings', 'ACTIVE'),
  ('store.settings.edit', 'Edit Store Settings', 'store', 'settings', 'EDIT', 'Edit store settings', 'ACTIVE')
ON CONFLICT (permission_code) DO NOTHING;

-- 2. GRANT TO SUPER_ADMIN
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN' AND p.permission_code IN (
  'store.master.view', 'store.master.edit', 'store.transfer.view', 'store.adjustment.view',
  'store.reports.view', 'store.settings.view', 'store.settings.edit'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. GRANT TO ADMIN (all except DELETE)
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN' AND p.permission_code IN (
  'store.master.view', 'store.master.edit', 'store.transfer.view', 'store.adjustment.view',
  'store.reports.view', 'store.settings.view', 'store.settings.edit'
) AND p.action NOT IN ('DELETE')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. GRANT TO MANAGEMENT (VIEW only, matching the store dept permission convention)
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'MANAGEMENT' AND p.permission_code IN (
  'store.master.view', 'store.master.edit', 'store.transfer.view', 'store.adjustment.view',
  'store.reports.view', 'store.settings.view', 'store.settings.edit'
) AND p.action IN ('VIEW', 'VIEW_REPORTS')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 5. GRANT TO INVENTORY (full store access, matching erp_00052)
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'INVENTORY' AND p.permission_code IN (
  'store.master.view', 'store.master.edit', 'store.transfer.view', 'store.adjustment.view',
  'store.reports.view', 'store.settings.view', 'store.settings.edit'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;