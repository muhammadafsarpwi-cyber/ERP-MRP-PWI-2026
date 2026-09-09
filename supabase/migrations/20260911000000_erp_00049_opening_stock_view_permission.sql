-- Migration: Add inventory.opening_stock.view permission
-- Purpose: Opening Stock has a backend API and sidebar entry but was missing
-- the VIEW permission required for the permission matrix and sidebar access control.

-- =====================================================
-- Add VIEW permission for Opening Stock
-- =====================================================
INSERT INTO permissions (permission_code, name, module, resource, action, description, status)
VALUES
  ('inventory.opening_stock.view', 'View Opening Stock', 'inventory', 'opening_stock', 'VIEW', 'View opening stock records and balances', 'ACTIVE')
ON CONFLICT (permission_code) DO NOTHING;

-- =====================================================
-- Grant to SUPER_ADMIN (all permissions)
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN' AND p.permission_code = 'inventory.opening_stock.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- Grant to ADMIN (all permissions except DELETE)
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN' AND p.permission_code = 'inventory.opening_stock.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- Grant to INVENTORY role (all inventory permissions)
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'INVENTORY' AND p.permission_code = 'inventory.opening_stock.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- Grant to MANAGEMENT role (view + update permissions)
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'MANAGEMENT' AND p.permission_code = 'inventory.opening_stock.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;
