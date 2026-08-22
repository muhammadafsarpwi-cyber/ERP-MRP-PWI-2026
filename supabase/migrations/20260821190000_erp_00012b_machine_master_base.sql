-- ============================================================================
-- PROMPT-07-FIX STEP 1-3, 5-8: Machine Master BASE (canonical, self-healing)
-- Migration: 20260821190000_erp_00012b_machine_master_base.sql
--
-- WHY THIS FILE EXISTS (42P01 diagnosis):
--   ERP-00013 (daily_production_entry) creates production_entries with
--   machine_id REFERENCES machines(id) and ERP-00014/00014b only ALTER/seed
--   public.machines. The machines table itself was lost from the environment
--   (external DROP ... CASCADE), so any of those files now fails with
--   'ERROR: 42P01: relation "public.machines" does not exist'.
-- FIX (dependency/order):
--   This file sorts BEFORE ERP-00013 and CREATEs public.machines first, with
--   the complete canonical schema, so NOTHING can reference it before it
--   exists. It also NORMALIZES a pre-existing legacy-shaped table (adds the
--   canonical columns, migrates legacy name/model/capacity/qr data, re-keys
--   machine_id) so the whole chain converges to one final shape from ANY
--   starting state.
--
-- SAFETY / IDEMPOTENCY:
--   - CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS everywhere.
--   - No DROP TABLE, no data deletion. Existing machine_id values (MCH001..
--     MCH057) are preserved; only rows MISSING an id get the next sequence
--     value.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CREATE public.machines FIRST (nothing above references it)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.machines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL,
  machine_id          VARCHAR(50),
  machine_code        VARCHAR(100),
  machine_type        VARCHAR(100),
  machine_name        VARCHAR(255),
  machine_number      VARCHAR(100),
  division_id         UUID,
  section_id          UUID,
  department_id       UUID,
  location            VARCHAR(255),
  machine_model       VARCHAR(255),
  manufacturer        VARCHAR(255),
  serial_number       VARCHAR(255),
  capacity            DECIMAL(19,4),
  power_rating        VARCHAR(100),
  installation_date   DATE,
  warranty_expiry_date DATE,
  criticality         VARCHAR(30) DEFAULT 'MEDIUM',
  status              VARCHAR(30) DEFAULT 'ACTIVE',
  qr_code             VARCHAR(255),
  description         TEXT,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active           BOOLEAN NOT NULL DEFAULT true
);

-- Normalize any pre-existing LEGACY-shaped table (e.g. created by older
-- ERP-00013 revisions) up to the canonical column set.
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS machine_id           VARCHAR(50);
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS machine_name         VARCHAR(255);
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS machine_code         VARCHAR(100);
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS machine_type         VARCHAR(100);
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS machine_number       VARCHAR(100);
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS division_id          UUID;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS section_id           UUID;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS department_id        UUID;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS location             VARCHAR(255);
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS machine_model        VARCHAR(255);
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS manufacturer         VARCHAR(255);
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS serial_number        VARCHAR(255);
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS capacity             DECIMAL(19,4);
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS power_rating         VARCHAR(100);
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS installation_date    DATE;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS warranty_expiry_date DATE;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS criticality          VARCHAR(30);
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS status               VARCHAR(30);
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS qr_code              VARCHAR(255);
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS description          TEXT;

-- ---------------------------------------------------------------------------
-- 2. Migrate legacy column data (name/model/capacity VARCHAR/qr_payload)
--    into the canonical columns, then enforce canonical types/nullability.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='machines' AND column_name='name') THEN
    UPDATE public.machines SET machine_name = COALESCE(machine_name, name);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='machines' AND column_name='model') THEN
    UPDATE public.machines SET machine_model = COALESCE(machine_model, model);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='machines' AND column_name='qr_payload') THEN
    UPDATE public.machines SET qr_code = COALESCE(qr_code, qr_payload);
  END IF;
END $$;

-- capacity: legacy VARCHAR(100) -> DECIMAL(19,4); non-numeric text becomes NULL
DO $$
DECLARE v_is_numeric BOOLEAN;
BEGIN
  SELECT (data_type = 'numeric') INTO v_is_numeric
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='machines' AND column_name='capacity';
  IF v_is_numeric IS FALSE THEN
    UPDATE public.machines
    SET capacity = NULL
    WHERE capacity IS NOT NULL AND capacity::text !~ '^[0-9]+(\.[0-9]+)?$';
    ALTER TABLE public.machines
      ALTER COLUMN capacity TYPE DECIMAL(19,4) USING capacity::text::numeric;
  END IF;
END $$;

UPDATE public.machines SET machine_name = machine_code WHERE machine_name IS NULL AND machine_code IS NOT NULL;
UPDATE public.machines SET criticality = 'MEDIUM' WHERE criticality IS NULL;
UPDATE public.machines SET status = 'ACTIVE'
WHERE status IS NULL OR status NOT IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED');

ALTER TABLE public.machines ALTER COLUMN machine_name SET NOT NULL;
ALTER TABLE public.machines ALTER COLUMN status      SET DEFAULT 'ACTIVE';
ALTER TABLE public.machines ALTER COLUMN criticality SET DEFAULT 'MEDIUM';

-- ---------------------------------------------------------------------------
-- 3. System-generated MACHINE ID (MCH001...) - concurrency-safe sequence
--    Existing MCH001..MCH057 values are NEVER regenerated (STEP 5).
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS machines_machine_id_seq START 1;

CREATE OR REPLACE FUNCTION public.fn_machines_assign_machine_id() RETURNS trigger AS $$
BEGIN
  IF NEW.machine_id IS NULL OR NEW.machine_id = '' THEN
    NEW.machine_id := 'MCH' || LPAD(nextval('public.machines_machine_id_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_machines_assign_machine_id ON public.machines;
CREATE TRIGGER trg_machines_assign_machine_id
  BEFORE INSERT ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.fn_machines_assign_machine_id();

-- Backfill machine_id ONLY for rows that lack one (never touch existing ids).
DO $$
DECLARE r RECORD; v_candidate TEXT;
BEGIN
  FOR r IN SELECT id FROM public.machines WHERE machine_id IS NULL OR machine_id = ''
           ORDER BY created_at, id
  LOOP
    LOOP
      v_candidate := 'MCH' || LPAD(nextval('public.machines_machine_id_seq')::text, 3, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.machines WHERE machine_id = v_candidate);
    END LOOP;
    UPDATE public.machines SET machine_id = v_candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.machines ALTER COLUMN machine_id SET NOT NULL;

-- Keep the sequence safely AHEAD of every used number; floor at 57 because the
-- canonical inventory reserves MCH001..MCH057 (seeded by ERP-00014b).
SELECT setval('public.machines_machine_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(NULLIF(regexp_replace(machine_id, '\D', '', 'g'), '')::bigint)
              FROM public.machines WHERE machine_id ~ '^MCH[0-9]+$'), 0),
    57)
);

-- updated_at maintenance
CREATE OR REPLACE FUNCTION public.fn_machines_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_machines_updated_at ON public.machines;
CREATE TRIGGER trg_machines_updated_at
  BEFORE UPDATE ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.fn_machines_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Constraints (only after the table exists - STEP 3/7)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_machines_company') THEN
    ALTER TABLE public.machines
      ADD CONSTRAINT fk_machines_company FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_machines_division') THEN
    ALTER TABLE public.machines
      ADD CONSTRAINT fk_machines_division FOREIGN KEY (division_id) REFERENCES public.divisions(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_machines_section') THEN
    ALTER TABLE public.machines
      ADD CONSTRAINT fk_machines_section FOREIGN KEY (section_id) REFERENCES public.sections(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_machines_department') THEN
    ALTER TABLE public.machines
      ADD CONSTRAINT fk_machines_department FOREIGN KEY (department_id) REFERENCES public.departments(id);
  END IF;
END $$;

-- Restore the FK lost together with the dropped table (production_entries side).
DO $$
BEGIN
  IF to_regclass('public.production_entries') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_production_entries_machine') THEN
    BEGIN
      ALTER TABLE public.production_entries
        ADD CONSTRAINT fk_production_entries_machine
        FOREIGN KEY (machine_id) REFERENCES public.machines(id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'production_entries.machine_id FK skipped: %', SQLERRM;
    END;
  END IF;
END $$;

ALTER TABLE public.machines DROP CONSTRAINT IF EXISTS uq_machines_company_code;      -- legacy hard unique
ALTER TABLE public.machines DROP CONSTRAINT IF EXISTS uq_machines_company_code_active; -- superseded

ALTER TABLE public.machines DROP CONSTRAINT IF EXISTS ck_machines_status;
ALTER TABLE public.machines ADD CONSTRAINT ck_machines_status
  CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED'));

ALTER TABLE public.machines DROP CONSTRAINT IF EXISTS ck_machines_criticality;
ALTER TABLE public.machines ADD CONSTRAINT ck_machines_criticality
  CHECK (criticality IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

-- STEP 6: machine_code repeats across departments (SP-01 x3) => scope the
-- uniqueness to company + department among ACTIVE rows; machine_id alone is
-- globally unique.
DROP INDEX IF EXISTS public.uq_machines_company_dept_code_active;
CREATE UNIQUE INDEX uq_machines_company_dept_code_active
  ON public.machines (
    company_id,
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    LOWER(machine_code)
  )
  WHERE is_active AND machine_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_machines_machine_id
  ON public.machines (machine_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_machines_company_serial
  ON public.machines (company_id, serial_number)
  WHERE serial_number IS NOT NULL AND is_active;

CREATE INDEX IF NOT EXISTS idx_machines_company    ON public.machines (company_id);
CREATE INDEX IF NOT EXISTS idx_machines_department ON public.machines (department_id);
CREATE INDEX IF NOT EXISTS idx_machines_division   ON public.machines (division_id);
CREATE INDEX IF NOT EXISTS idx_machines_section    ON public.machines (section_id);
CREATE INDEX IF NOT EXISTS idx_machines_type       ON public.machines (machine_type);
CREATE INDEX IF NOT EXISTS idx_machines_status     ON public.machines (status);
CREATE INDEX IF NOT EXISTS idx_machines_qr_code    ON public.machines (qr_code);

-- ---------------------------------------------------------------------------
-- 5. Documentation
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.machines IS
  'Machine Master (PROMPT-07/07-FIX): production assets keyed by system-generated machine_id (MCH###), organized under division > section > department.';
COMMENT ON COLUMN public.machines.machine_id   IS 'System-generated business identifier MCH001..., unique, assigned by trg_machines_assign_machine_id; never regenerated for existing rows.';
COMMENT ON COLUMN public.machines.machine_code IS 'Business code; may repeat across departments (scoped unique among active rows).';
COMMENT ON COLUMN public.machines.machine_name IS 'Human-readable display name (NOT NULL).';
COMMENT ON COLUMN public.machines.machine_number IS 'Display number shown on labels/floor boards (e.g. "ST # 01").';
COMMENT ON COLUMN public.machines.capacity     IS 'DECIMAL(19,4); unit carried by convention/documentation.';
COMMENT ON COLUMN public.machines.status       IS 'ACTIVE | INACTIVE | MAINTENANCE | RETIRED';
COMMENT ON COLUMN public.machines.criticality  IS 'LOW | MEDIUM | HIGH | CRITICAL';
COMMENT ON COLUMN public.machines.qr_code      IS 'Canonical QR content: deep-link path /production/machines/<uuid>.';

-- ---------------------------------------------------------------------------
-- 6. Verification notices (STEP 7 items 7-9 happen again after seeding in 14b)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_count INT; v_dups INT; v_missing_qr INT; v_bad_org INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.machines;
  SELECT COUNT(*) INTO v_dups FROM (
    SELECT machine_id FROM public.machines GROUP BY machine_id HAVING COUNT(*) > 1
  ) d;
  SELECT COUNT(*) INTO v_missing_qr FROM public.machines
  WHERE qr_code IS NOT NULL AND qr_code NOT LIKE '/production/machines/%';
  SELECT COUNT(*) INTO v_bad_org FROM public.machines m
  LEFT JOIN public.departments d ON d.id = m.department_id
  WHERE m.department_id IS NOT NULL AND d.id IS NULL;
  RAISE NOTICE '[erp_00012b] machines=% duplicate_machine_id=% malformed_qr=% orphan_department_refs=%',
    v_count, v_dups, v_missing_qr, v_bad_org;
END $$;
