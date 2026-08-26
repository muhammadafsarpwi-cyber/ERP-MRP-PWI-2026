-- =====================================================
-- ERP-00019: Item delete permission
--
-- Adds the missing 'item.delete' permission so the Item Master
-- DELETE endpoint (guarded by PermissionGuard) can be granted to
-- roles. No table or column changes; existing data is untouched.
-- Idempotent: safe to run multiple times.
-- =====================================================

INSERT INTO permissions (permission_code, name, module, resource, action, status) VALUES
    ('item.delete', 'Delete Items', 'item', 'item', 'delete', 'ACTIVE')
ON CONFLICT (permission_code) DO NOTHING;

-- Grant to SUPER_ADMIN, consistent with every other item.* permission.
-- Idempotent: safe to run multiple times.
INSERT INTO role_permissions (role_id, permission_id)
SELECT ro.id, p.id
FROM roles ro
JOIN permissions p ON p.permission_code = 'item.delete'
WHERE ro.role_code = 'SUPER_ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = ro.id AND rp.permission_id = p.id
  );
