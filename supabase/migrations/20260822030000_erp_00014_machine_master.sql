-- ============================================================================
-- PROMPT-07 / PROMPT-07-FIX: Machine Master extension, backfills & permissions
-- Migration: 20260822030000_erp_00014_machine_master.sql
--
-- DEPENDENCY (fixed ordering - see PROMPT-07-FIX STEP 7/11):
--   Structure of public.machines (table, columns, constraints, indexes,
--   triggers, sequence) is OWNED BY the base migration
--     20260821190000_erp_00012b_machine_master_base.sql
--   which sorts before this file and before ERP-00013 (whose
--   production_entries.machine_id FK targets machines).
--   The precondition below turns a wrong application order into an explicit,
--   actionable error INSTEAD of a mid-file
--   '42P01: relation "public.machines" does not exist'.
--
-- SAFETY:
--   - Fully idempotent; safe to re-run.
--   - Preserves every existing machine record and its machine_id value.
--   - Adds no destructive statements.
-- ============================================================================

DO $$ BEGIN
  IF to_regclass('public.machines') IS NULL THEN
    RAISE EXCEPTION
      'public.machines does not exist. Apply 20260821190000_erp_00012b_machine_master_base.sql FIRST (it CREATEs the Machine Master table), then re-run this migration.';
  END IF;
END $$;

-- ─── Data backfills ──────────────────────────────────────────────────────────

-- Inherit division/section from the department chain where missing.
UPDATE public.machines m
SET division_id = d.division_id,
    section_id  = d.section_id
FROM public.departments d
WHERE d.id = m.department_id
  AND (m.division_id IS NULL OR m.section_id IS NULL);

-- Canonical deep-link QR content for every machine (idempotent; keeps any
-- already-canonical value untouched).
UPDATE public.machines
SET qr_code = '/production/machines/' || id::text
WHERE qr_code IS NULL OR qr_code LIKE 'machine:%';

-- ─── Permissions (manufacturing namespace, matching manufacturing.routing.*) ─
INSERT INTO permissions (permission_code, name, description, module, resource, action, is_active, created_at, updated_at)
VALUES
  ('manufacturing.machine.view',          'View Machines',        'View machine master list and details', 'manufacturing', 'machine', 'view',          true, now(), now()),
  ('manufacturing.machine.create',        'Create Machines',      'Create machine master records',        'manufacturing', 'machine', 'create',        true, now(), now()),
  ('manufacturing.machine.update',        'Update Machines',      'Update machine master records',        'manufacturing', 'machine', 'update',        true, now(), now()),
  ('manufacturing.machine.delete',        'Delete Machines',      'Soft-delete machine master records',   'manufacturing', 'machine', 'delete',        true, now(), now()),
  ('manufacturing.machine.change_status', 'Change Machine Status','Activate/deactivate/set maintenance',  'manufacturing', 'machine', 'change_status', true, now(), now())
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status, is_active, created_at, updated_at)
SELECT r.id, p.id, 'ACTIVE', true, now(), now()
FROM roles r
JOIN permissions p ON p.permission_code IN (
  'manufacturing.machine.view',
  'manufacturing.machine.create',
  'manufacturing.machine.update',
  'manufacturing.machine.delete',
  'manufacturing.machine.change_status'
)
WHERE r.role_code = 'SUPER_ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ─── Verification (STEP 7 items 7-9: records / relationships / QR) ──────────
DO $$
DECLARE
  v_count INT; v_dups INT; v_no_org INT; v_bad_qr INT; v_no_mid INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.machines;
  SELECT COUNT(*) INTO v_dups FROM (
    SELECT machine_id FROM public.machines GROUP BY machine_id HAVING COUNT(*) > 1
  ) d;
  SELECT COUNT(*) INTO v_no_org FROM public.machines WHERE company_id IS NULL;
  SELECT COUNT(*) INTO v_bad_qr FROM public.machines
  WHERE qr_code IS NOT NULL AND qr_code NOT LIKE '/production/machines/%';
  SELECT COUNT(*) INTO v_no_mid FROM public.machines WHERE machine_id IS NULL OR machine_id = '';
  RAISE NOTICE '[erp_00014] machines=% duplicate_machine_id=% missing_company=% malformed_qr=% missing_machine_id=%',
    v_count, v_dups, v_no_org, v_bad_qr, v_no_mid;
END $$;
