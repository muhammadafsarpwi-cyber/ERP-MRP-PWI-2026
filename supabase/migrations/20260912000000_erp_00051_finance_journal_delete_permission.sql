-- Migration: Add finance.journal.delete permission
-- The DELETE endpoint for journals was incorrectly using finance.journal.create.
-- This creates the dedicated delete permission and grants it to ADMIN + SUPER_ADMIN.
-- Column name: permission_code (NOT code) — matches the permissions table schema.
-- Idempotent: ON CONFLICT (permission_code) DO NOTHING.

-- =====================================================
-- Add DELETE permission for Journal Entries
-- =====================================================
INSERT INTO permissions (permission_code, name, module, resource, action, description, status)
VALUES
  ('finance.journal.delete', 'Delete Journal Entry', 'finance', 'journal', 'DELETE', 'Delete draft journal entries', 'ACTIVE')
ON CONFLICT (permission_code) DO NOTHING;

-- =====================================================
-- Grant to SUPER_ADMIN (all permissions)
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN' AND p.permission_code = 'finance.journal.delete'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- Grant to ADMIN (consistent with existing 16 DELETE permissions already granted)
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN' AND p.permission_code = 'finance.journal.delete'
ON CONFLICT (role_id, permission_id) DO NOTHING;
