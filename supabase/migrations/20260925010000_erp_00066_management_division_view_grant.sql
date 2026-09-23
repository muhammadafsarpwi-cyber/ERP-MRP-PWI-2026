-- ERP-00066: Grant `division.view` to the MANAGEMENT role
--
-- Symptom: store.gm.qa@erp-local.test (MANAGEMENT) received 403 on
-- GET /divisions because PermissionGuard requires
--   role_permissions.status = 'ACTIVE' (permission.service.checkUserPermission)
-- and MANAGEMENT's existing `division.view` grant row was parked at 'INACTIVE'.
--
-- Non-destructive + idempotent: activates the existing grant row, inserting one
-- only if the grant is somehow missing. No other permissions are touched.

DO $$
DECLARE
  v_role_id UUID;
  v_perm_id UUID;
BEGIN
  SELECT id INTO v_role_id FROM roles WHERE role_code = 'MANAGEMENT';
  SELECT id INTO v_perm_id FROM permissions WHERE permission_code = 'division.view';

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role MANAGEMENT not found';
  END IF;
  IF v_perm_id IS NULL THEN
    RAISE EXCEPTION 'Permission division.view not found';
  END IF;

  UPDATE role_permissions
  SET status = 'ACTIVE',
      is_active = TRUE,
      updated_at = NOW()
  WHERE role_id = v_role_id
    AND permission_id = v_perm_id;

  IF NOT FOUND THEN
    INSERT INTO role_permissions (role_id, permission_id, status, is_active)
    VALUES (v_role_id, v_perm_id, 'ACTIVE', TRUE);
  END IF;
END $$;

-- Expected: 1 row affected on first run, 0 on re-run.
-- Verify:
--   SELECT r.role_code, p.permission_code, rp.status
--   FROM role_permissions rp
--   JOIN roles r ON r.id = rp.role_id
--   JOIN permissions p ON p.id = rp.permission_id
--   WHERE r.role_code = 'MANAGEMENT' AND p.permission_code = 'division.view';
