-- ERP-00067: Activate the remaining cascading view grants for MANAGEMENT
--
-- Symptom: store.gm.qa@erp-local.test (MANAGEMENT) could load divisions after
-- ERP-00066 but still received 403 on the cascade:
--   GET /sections     -> Missing required permission: section.view
--   GET /departments  -> Missing required permission: department.view
--   GET /machines     -> Missing required permission: manufacturing.machine.view
-- because section.view / department.view were parked at status='INACTIVE' and
-- manufacturing.machine.view had no grant row at all.
--
-- Mirrors ERP-00066: non-destructive (activates existing rows, inserts only when
-- absent) and idempotent (re-running affects 0 rows).

DO $$
DECLARE
  v_role_id UUID;
  v_perm_id UUID;
  v_code TEXT;
BEGIN
  SELECT id INTO v_role_id FROM roles WHERE role_code = 'MANAGEMENT';
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role MANAGEMENT not found';
  END IF;

  -- 1 & 2: existing rows parked INACTIVE -> ACTIVE
  FOREACH v_code IN ARRAY ARRAY['section.view', 'department.view'] LOOP
    SELECT id INTO v_perm_id FROM permissions WHERE permission_code = v_code;
    IF v_perm_id IS NULL THEN
      RAISE EXCEPTION 'Permission % not found', v_code;
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
  END LOOP;

  -- 3: machine grant does not exist yet -> insert
  SELECT id INTO v_perm_id FROM permissions WHERE permission_code = 'manufacturing.machine.view';
  IF v_perm_id IS NULL THEN
    RAISE EXCEPTION 'Permission manufacturing.machine.view not found';
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

-- Expected: 3 rows touched on first run, 0 on re-run.
-- Verify:
--   SELECT p.permission_code, rp.status, rp.is_active
--   FROM role_permissions rp
--   JOIN roles r ON r.id = rp.role_id
--   JOIN permissions p ON p.id = rp.permission_id
--   WHERE r.role_code = 'MANAGEMENT'
--     AND p.permission_code IN ('division.view','section.view','department.view','manufacturing.machine.view')
--   ORDER BY p.permission_code;
