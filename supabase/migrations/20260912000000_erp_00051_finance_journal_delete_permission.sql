-- Migration: Add finance.journal.delete permission
-- The DELETE endpoint for journals was incorrectly using finance.journal.create.
-- This creates the dedicated delete permission and grants it to ADMIN.

-- 1. Insert the missing finance.journal.delete permission
INSERT INTO permissions (code, name, module, resource, action, description, status)
VALUES (
  'finance.journal.delete',
  'Delete Journal Entry',
  'finance',
  'journal',
  'DELETE',
  'Delete draft journal entries',
  'ACTIVE'
)
ON CONFLICT (code) DO NOTHING;

-- 2. Grant finance.journal.delete to ADMIN role
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
JOIN permissions p ON p.code = 'finance.journal.delete'
WHERE r.role_code = 'ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;
