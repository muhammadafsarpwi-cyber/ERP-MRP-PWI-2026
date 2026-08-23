-- ═══════════════════════════════════════════════════════════════════════════
-- ERP-00016 — MACHINE TARGET MASTER
-- ═══════════════════════════════════════════════════════════════════════════
-- PROMPT-08 (Machine Target Master & automatic production target integration)
--
-- Responsibilities:
--   1. Create public.machine_targets (separate master — NOT columns on machines)
--      machine → shift → uom with effective-date history + audit fields
--   2. Target snapshot columns on production_entries:
--      machine_target_id, standard_hours, calculated_target
--   3. Seed missing production UOM 'PCS' (KG and METER/M already exist)
--   4. Seed 'GENERAL' shift for COMP-001 (SHIFT-1/2/3 already exist from ERP-00013)
--   5. Permissions manufacturing.machine_target.* + SUPER_ADMIN grants
--
-- Idempotency: IF NOT EXISTS / ON CONFLICT DO NOTHING / guarded DO blocks.
-- Does NOT recreate machines, shifts or UOMs that already exist.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: machine_targets table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.machine_targets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  machine_id      UUID NOT NULL,
  shift_id        UUID NOT NULL,
  uom_id          UUID NOT NULL,
  standard_hours  NUMERIC(19,4) NOT NULL DEFAULT 8 CONSTRAINT ck_machine_targets_std_hours CHECK (standard_hours > 0),
  target_quantity NUMERIC(19,4) NOT NULL CONSTRAINT ck_machine_targets_qty CHECK (target_quantity > 0),
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to    DATE NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                  CONSTRAINT ck_machine_targets_status CHECK (status IN ('ACTIVE', 'INACTIVE')),
  remarks         TEXT NULL,
  created_by      UUID NULL,
  updated_by      UUID NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT ck_machine_targets_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_machine_targets_company') THEN
    ALTER TABLE public.machine_targets
      ADD CONSTRAINT fk_machine_targets_company FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_machine_targets_machine') THEN
    ALTER TABLE public.machine_targets
      ADD CONSTRAINT fk_machine_targets_machine FOREIGN KEY (machine_id) REFERENCES public.machines(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_machine_targets_shift') THEN
    ALTER TABLE public.machine_targets
      ADD CONSTRAINT fk_machine_targets_shift FOREIGN KEY (shift_id) REFERENCES public.shifts(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_machine_targets_uom') THEN
    ALTER TABLE public.machine_targets
      ADD CONSTRAINT fk_machine_targets_uom FOREIGN KEY (uom_id) REFERENCES public.uoms(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_machine_targets_company   ON public.machine_targets(company_id);
CREATE INDEX IF NOT EXISTS idx_machine_targets_machine   ON public.machine_targets(machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_targets_shift     ON public.machine_targets(shift_id);
CREATE INDEX IF NOT EXISTS idx_machine_targets_uom       ON public.machine_targets(uom_id);
CREATE INDEX IF NOT EXISTS idx_machine_targets_effective ON public.machine_targets(effective_from, effective_to);

-- Safety net: at most ONE open-ended ACTIVE target per (company, machine,
-- shift, uom). Bounded-period overlaps are rejected by the service layer.
CREATE UNIQUE INDEX IF NOT EXISTS uq_machine_targets_active_open_combo
  ON public.machine_targets(company_id, machine_id, shift_id, uom_id)
  WHERE status = 'ACTIVE' AND is_active = TRUE AND effective_to IS NULL;

DROP TRIGGER IF EXISTS trg_machine_targets_updated_at ON public.machine_targets;
CREATE TRIGGER trg_machine_targets_updated_at
  BEFORE UPDATE ON public.machine_targets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: production_entries target-snapshot columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS machine_target_id UUID NULL;
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS standard_hours   NUMERIC(6,2) NULL;
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS calculated_target NUMERIC(19,4) NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_production_entries_machine_target') THEN
    ALTER TABLE public.production_entries
      ADD CONSTRAINT fk_production_entries_machine_target
      FOREIGN KEY (machine_target_id) REFERENCES public.machine_targets(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_production_entries_machine_target
  ON public.production_entries(machine_target_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: UOM seed — PCS only if missing (KG / M exist from item_master)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.uoms (code, name, symbol, uom_type, decimal_precision, status)
VALUES ('PCS', 'Pieces', 'pcs', 'COUNT', 0, 'ACTIVE')
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: GENERAL shift seed (per company; SHIFT-1/2/3 come from ERP-00013)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT id INTO v_company_id FROM public.companies WHERE company_code = 'COMP-001';
  IF v_company_id IS NULL THEN
    RAISE NOTICE '[erp_00016] COMP-001 not found; skipping GENERAL shift seed';
    RETURN;
  END IF;

  INSERT INTO public.shifts (company_id, shift_code, name, start_time, end_time, planned_hours, status, created_at, updated_at)
  VALUES (v_company_id, 'GENERAL', 'General Shift', '00:00', '23:59', 8, 'ACTIVE', now(), now())
  ON CONFLICT (company_id, shift_code) DO NOTHING;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: Permissions + SUPER_ADMIN grants
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO permissions (permission_code, name, description, module, resource, action, is_active, created_at, updated_at)
VALUES
  ('manufacturing.machine_target.view',          'View Machine Targets',          'View machine target master',            'manufacturing', 'machine-targets', 'view',          true, now(), now()),
  ('manufacturing.machine_target.create',        'Create Machine Targets',        'Create machine target records',         'manufacturing', 'machine-targets', 'create',        true, now(), now()),
  ('manufacturing.machine_target.update',        'Update Machine Targets',        'Update machine target records',         'manufacturing', 'machine-targets', 'update',        true, now(), now()),
  ('manufacturing.machine_target.delete',        'Delete Machine Targets',        'Soft-delete machine target records',    'manufacturing', 'machine-targets', 'delete',        true, now(), now()),
  ('manufacturing.machine_target.change_status', 'Change Machine Target Status',  'Activate / deactivate machine targets', 'manufacturing', 'machine-targets', 'change_status', true, now(), now())
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status, is_active, created_at, updated_at)
SELECT r.id, p.id, 'ACTIVE', true, now(), now()
FROM roles r
JOIN permissions p ON p.permission_code IN (
  'manufacturing.machine_target.view',
  'manufacturing.machine_target.create',
  'manufacturing.machine_target.update',
  'manufacturing.machine_target.delete',
  'manufacturing.machine_target.change_status'
)
WHERE r.role_code = 'SUPER_ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification notices
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tables   INT;
  v_shifts   INT;
  v_pcs      INT;
  v_kg       INT;
  v_meter    INT;
  v_perms    INT;
BEGIN
  SELECT COUNT(*) INTO v_tables FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'machine_targets';
  SELECT COUNT(*) INTO v_shifts FROM public.shifts WHERE shift_code IN ('SHIFT-1','SHIFT-2','SHIFT-3','GENERAL');
  SELECT COUNT(*) INTO v_pcs   FROM public.uoms WHERE UPPER(code) = 'PCS';
  SELECT COUNT(*) INTO v_kg    FROM public.uoms WHERE UPPER(code) = 'KG';
  SELECT COUNT(*) INTO v_meter FROM public.uoms WHERE UPPER(code) IN ('M','METER');
  SELECT COUNT(*) INTO v_perms FROM public.permissions WHERE permission_code LIKE 'manufacturing.machine_target.%';

  RAISE NOTICE '[erp_00016] machine_targets table=% | shifts(S1/S2/S3/GEN)=% | uoms KG=% PCS=% METER=% | perms=%',
    v_tables, v_shifts, v_kg, v_pcs, v_meter, v_perms;
END $$;

COMMIT;
