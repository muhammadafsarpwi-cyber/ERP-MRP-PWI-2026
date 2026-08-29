-- ============================================================================
-- PROMPT-07 / PROMPT-07-FIX: Machine Master canonical inventory seed
-- Migration: 20260822040000_erp_00014b_machine_master_alignment.sql
--
-- PURPOSE:
--   Seeds the canonical 57-machine inventory (MCH001..MCH057) into
--   public.machines, mapping every machine to the CURRENT active organization
--   (SPD / CCD division -> section -> department). Legacy divisions
--   (Manufacturing / Sales & Marketing / Supply Chain / Finance &
--   Administration / Quality & Engineering) are NOT recreated and NOT used.
--
-- DEPENDENCY:
--   Requires public.machines (created by
--   20260821190000_erp_00012b_machine_master_base.sql). The precondition
--   below makes a wrong application order explicit instead of failing with
--   '42P01: relation "public.machines" does not exist'.
--
-- IDEMPOTENCY / DUPLICATE PROTECTION (STEP 5/6/8/9):
--   - Each record is matched FIRST by machine_id, THEN by business identity
--     (company + department + machine_code among ACTIVE rows).
--   - Existing records are preserved; existing MCH001..MCH057 values are
--     NEVER regenerated. Only missing machines are inserted.
--   - machine_code is intentionally NOT globally unique: SP-01 legitimately
--     exists in Spoke, Spiral and PVC departments. Uniqueness is scoped to
--     company+department among active rows; machine_id alone is unique.
--
-- Run order: erp_00012b -> erp_00013 -> erp_00014 -> THIS FILE.
-- ============================================================================

DO $$ BEGIN
  IF to_regclass('public.machines') IS NULL THEN
    RAISE EXCEPTION
      'public.machines does not exist. Apply 20260821190000_erp_00012b_machine_master_base.sql FIRST (it CREATEs the Machine Master table), then re-run this migration.';
  END IF;
END $$;

-- Status vocabulary includes RETIRED (idempotent re-assertion of the base def)
ALTER TABLE public.machines DROP CONSTRAINT IF EXISTS ck_machines_status;
ALTER TABLE public.machines ADD CONSTRAINT ck_machines_status
  CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED'));

COMMENT ON INDEX public.uq_machines_company_dept_code_active IS
  'Machine code unique per company+department among active rows; departmentless machines share one synthetic bucket.';

-- â”€â”€â”€ Canonical inventory seed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DO $seed$
DECLARE
  v_company   UUID;
  v_div       UUID;
  v_sec       UUID;
  v_existing  UUID;
  v_row       RECORD;
  v_inserted  INT := 0;
  v_matched   INT := 0;
  v_updated   INT := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM (VALUES
      -- SPD â€” Straightener Department (5)
      ('ST-01',  'd3000000-0000-0000-0000-000000000001', 'MCH001', 'Straightener Machine 01'),
      ('ST-02',  'd3000000-0000-0000-0000-000000000001', 'MCH002', 'Straightener Machine 02'),
      ('ST-03',  'd3000000-0000-0000-0000-000000000001', 'MCH003', 'Straightener Machine 03'),
      ('ST-04',  'd3000000-0000-0000-0000-000000000001', 'MCH004', 'Straightener Machine 04'),
      ('ST-05',  'd3000000-0000-0000-0000-000000000001', 'MCH005', 'Straightener Machine 05'),
      -- SPD â€” Swagging Department (6)
      ('SW-01',  'd3000000-0000-0000-0000-000000000002', 'MCH006', 'Swagging Machine 01'),
      ('SW-02',  'd3000000-0000-0000-0000-000000000002', 'MCH007', 'Swagging Machine 02'),
      ('SW-03',  'd3000000-0000-0000-0000-000000000002', 'MCH008', 'Swagging Machine 03'),
      ('SW-04',  'd3000000-0000-0000-0000-000000000002', 'MCH009', 'Swagging Machine 04'),
      ('SW-05',  'd3000000-0000-0000-0000-000000000002', 'MCH010', 'Swagging Machine 05'),
      ('SW-06',  'd3000000-0000-0000-0000-000000000002', 'MCH011', 'Swagging Machine 06'),
      -- SPD â€” Spoke Department (7)
      ('SP-01',  'd3000000-0000-0000-0000-000000000003', 'MCH012', 'Spoke Machine SP-01'),
      ('SP-02',  'd3000000-0000-0000-0000-000000000003', 'MCH013', 'Spoke Machine SP-02'),
      ('SP-03',  'd3000000-0000-0000-0000-000000000003', 'MCH014', 'Spoke Machine SP-03'),
      ('SP-04',  'd3000000-0000-0000-0000-000000000003', 'MCH015', 'Spoke Machine SP-04'),
      ('SP-05',  'd3000000-0000-0000-0000-000000000003', 'MCH016', 'Spoke Machine SP-05'),
      ('SP-06',  'd3000000-0000-0000-0000-000000000003', 'MCH017', 'Spoke Machine SP-06'),
      ('SP-07',  'd3000000-0000-0000-0000-000000000003', 'MCH018', 'Spoke Machine SP-07'),
      -- SPD â€” Spoke Plating Department: barrel lines BL-01..09 + APS-01 (10)
      ('BL-01',  'd3000000-0000-0000-0000-000000000006', 'MCH019', 'Barrel Machine BL-01'),
      ('BL-02',  'd3000000-0000-0000-0000-000000000006', 'MCH020', 'Barrel Machine BL-02'),
      ('BL-03',  'd3000000-0000-0000-0000-000000000006', 'MCH021', 'Barrel Machine BL-03'),
      ('BL-04',  'd3000000-0000-0000-0000-000000000006', 'MCH022', 'Barrel Machine BL-04'),
      ('BL-05',  'd3000000-0000-0000-0000-000000000006', 'MCH023', 'Barrel Machine BL-05'),
      ('BL-06',  'd3000000-0000-0000-0000-000000000006', 'MCH024', 'Barrel Machine BL-06'),
      ('BL-07',  'd3000000-0000-0000-0000-000000000006', 'MCH025', 'Barrel Machine BL-07'),
      ('BL-08',  'd3000000-0000-0000-0000-000000000006', 'MCH026', 'Barrel Machine BL-08'),
      ('BL-09',  'd3000000-0000-0000-0000-000000000006', 'MCH027', 'Barrel Machine BL-09'),
      ('APS-01', 'd3000000-0000-0000-0000-000000000006', 'MCH031', 'Spoke Plating APS-01'),
      -- SPD â€” Nipple Plating Department: barrel lines BL-10..12 + APS-01 (4)
      ('BL-10',  'd3000000-0000-0000-0000-000000000007', 'MCH028', 'Barrel Machine BL-10'),
      ('BL-11',  'd3000000-0000-0000-0000-000000000007', 'MCH029', 'Barrel Machine BL-11'),
      ('BL-12',  'd3000000-0000-0000-0000-000000000007', 'MCH030', 'Barrel Machine BL-12'),
      ('APS-01', 'd3000000-0000-0000-0000-000000000007', 'MCH032', 'Nipple Plating APS-01'),
      -- SPD â€” Spoke Packing Department (2)
      ('PKS-01', 'd3000000-0000-0000-0000-000000000008', 'MCH033', 'Spoke Packing Station 01'),
      ('PKS-02', 'd3000000-0000-0000-0000-000000000008', 'MCH034', 'Spoke Packing Station 02'),
      -- CCD â€” Flattening Department (5)
      ('FT-01',  'd3000000-0000-0000-0000-000000000010', 'MCH035', 'Flattening Machine FT-01'),
      ('FT-02',  'd3000000-0000-0000-0000-000000000010', 'MCH036', 'Flattening Machine FT-02'),
      ('FT-03',  'd3000000-0000-0000-0000-000000000010', 'MCH037', 'Flattening Machine FT-03'),
      ('FT-04',  'd3000000-0000-0000-0000-000000000010', 'MCH038', 'Flattening Machine FT-04'),
      ('FT-05',  'd3000000-0000-0000-0000-000000000010', 'MCH039', 'Flattening Machine FT-05'),
      -- CCD â€” Spiral Department (14)
      ('SP-01',  'd3000000-0000-0000-0000-000000000011', 'MCH040', 'Spiral Machine SP-01'),
      ('SP-02',  'd3000000-0000-0000-0000-000000000011', 'MCH041', 'Spiral Machine SP-02'),
      ('SP-03',  'd3000000-0000-0000-0000-000000000011', 'MCH042', 'Spiral Machine SP-03'),
      ('SP-04',  'd3000000-0000-0000-0000-000000000011', 'MCH043', 'Spiral Machine SP-04'),
      ('SP-05',  'd3000000-0000-0000-0000-000000000011', 'MCH044', 'Spiral Machine SP-05'),
      ('SP-06',  'd3000000-0000-0000-0000-000000000011', 'MCH045', 'Spiral Machine SP-06'),
      ('SP-07',  'd3000000-0000-0000-0000-000000000011', 'MCH046', 'Spiral Machine SP-07'),
      ('SP-08',  'd3000000-0000-0000-0000-000000000011', 'MCH047', 'Spiral Machine SP-08'),
      ('SP-09',  'd3000000-0000-0000-0000-000000000011', 'MCH048', 'Spiral Machine SP-09'),
      ('SP-10',  'd3000000-0000-0000-0000-000000000011', 'MCH049', 'Spiral Machine SP-10'),
      ('SP-11',  'd3000000-0000-0000-0000-000000000011', 'MCH050', 'Spiral Machine SP-11'),
      ('SP-12',  'd3000000-0000-0000-0000-000000000011', 'MCH051', 'Spiral Machine SP-12'),
      ('SP-13',  'd3000000-0000-0000-0000-000000000011', 'MCH052', 'Spiral Machine SP-13'),
      ('SP-14',  'd3000000-0000-0000-0000-000000000011', 'MCH053', 'Spiral Machine SP-14'),
      -- CCD â€” PVC Department (2)
      ('SP-01',  'd3000000-0000-0000-0000-000000000012', 'MCH054', 'PVC Coating Line SP-01'),
      ('SP-02',  'd3000000-0000-0000-0000-000000000012', 'MCH055', 'PVC Coating Line SP-02'),
      -- CCD â€” CCD Packing Department (2)
      ('PK-01',  'd3000000-0000-0000-0000-000000000013', 'MCH056', 'CCD Packing Station PK-01'),
      ('PK-02',  'd3000000-0000-0000-0000-000000000013', 'MCH057', 'CCD Packing Station PK-02')
    ) AS t(code, dept, mid, name)
    ORDER BY t.mid
  LOOP
    SELECT d.company_id, d.division_id, d.section_id
    INTO v_company, v_div, v_sec
    FROM departments d WHERE d.id = v_row.dept::uuid;

    IF NOT FOUND THEN
      RAISE WARNING 'Department % not found; skipping % (%)', v_row.dept, v_row.code, v_row.mid;
      CONTINUE;
    END IF;

    -- STEP 9.1: check by Machine ID first
    SELECT id INTO v_existing
    FROM public.machines WHERE machine_id = v_row.mid
    LIMIT 1;

    -- STEP 9.2: then by business identity (company + dept + code, active rows)
    IF v_existing IS NULL THEN
      SELECT id INTO v_existing
      FROM public.machines
      WHERE company_id = v_company
        AND COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(v_row.dept::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND LOWER(machine_code) = LOWER(v_row.code)
        AND is_active = true
      LIMIT 1;
    END IF;

    IF v_existing IS NOT NULL THEN
      v_matched := v_matched + 1;
      UPDATE public.machines
      SET machine_id     = v_row.mid,
          machine_number = COALESCE(machine_number, REPLACE(v_row.code, '-', ' # ')),
          updated_at     = now()
      WHERE id = v_existing
        AND (machine_id IS DISTINCT FROM v_row.mid OR machine_number IS NULL);
      IF FOUND THEN v_updated := v_updated + 1; END IF;
    ELSE
      INSERT INTO public.machines (
        id, company_id, department_id, division_id, section_id,
        machine_id, machine_code, machine_name, machine_number,
        criticality, status, qr_code, is_active, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_company, v_row.dept::uuid, v_div, v_sec,
        v_row.mid, v_row.code, v_row.name, REPLACE(v_row.code, '-', ' # '),
        'MEDIUM', 'ACTIVE', NULL, true, now(), now()
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '[erp_00014b] canonical seed: inserted=% matched=% updated=%',
    v_inserted, v_matched, v_updated;
END $seed$;

-- Stable deep-link QR content for every machine
UPDATE public.machines
SET qr_code = '/production/machines/' || id::text
WHERE qr_code IS NULL OR qr_code LIKE 'machine:%';

-- Keep the sequence ahead of all used numbers (floor at 57: reserved range)
SELECT setval('public.machines_machine_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(NULLIF(regexp_replace(machine_id, '\D', '', 'g'), '')::bigint)
              FROM public.machines WHERE machine_id ~ '^MCH[0-9]+$'), 0),
    57)
);

-- â”€â”€â”€ Verification (STEP 10) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DO $$
DECLARE
  v_count INT; v_canonical INT; v_dups INT; v_no_org INT; v_bad_qr INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.machines WHERE is_active;
  SELECT COUNT(*) INTO v_canonical FROM public.machines
  WHERE machine_id ~ '^MCH[0-9]{3}$' AND is_active;
  SELECT COUNT(*) INTO v_dups FROM (
    SELECT machine_id FROM public.machines GROUP BY machine_id HAVING COUNT(*) > 1
  ) d;
  SELECT COUNT(*) INTO v_no_org FROM public.machines m
  JOIN public.departments d ON d.id = m.department_id
  WHERE m.division_id IS NULL OR m.section_id IS NULL OR d.is_active = false;
  SELECT COUNT(*) INTO v_bad_qr FROM public.machines
  WHERE qr_code IS NULL OR qr_code <> '/production/machines/' || id::text;
  RAISE NOTICE '[erp_00014b] active_machines=% canonical_MCH=% duplicate_machine_id=% incomplete_hierarchy=% bad_qr=%',
    v_count, v_canonical, v_dups, v_no_org, v_bad_qr;
END $$;
