-- ═══════════════════════════════════════════════════════════════════════════
-- ERP-00015 — MACHINE MASTER IMPROVEMENTS
-- ═══════════════════════════════════════════════════════════════════════════
-- PROMPT-09 STEP 3 (Machine Master final hardening)
--
-- Responsibilities:
--   1. MCH### Machine ID generation — collision-safe DB trigger function
--      (skips sequence values already taken by manual/restored rows).
--   2. Machine ID uniqueness — unique index on public.machines(machine_id).
--   3. Fast case-insensitive Machine ID / code resolution index.
--   4. Capacity typed as DECIMAL(19,4) (conditional ALTER only when needed).
--   5. Display formatting — fill NULL machine_number from machine_code,
--      normalize QR deep-links, backfill any missing machine_id.
--   6. Sequence alignment ahead of every used number (floor at 57 =
--      reserved canonical range MCH001..MCH057).
--
-- SAFETY / IDEMPOTENCY:
--   - IF NOT EXISTS / guarded DO blocks everywhere; safe to run repeatedly.
--   - NEVER recreates the machines table, duplicates columns, or overwrites
--     existing machine information (only NULL/legacy-pattern values filled).
--   - Existing foreign keys, indexes and records are preserved.
--
-- Run order: erp_00012b -> erp_00013 -> erp_00014 -> erp_00014b -> THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$ BEGIN
  IF to_regclass('public.machines') IS NULL THEN
    RAISE EXCEPTION
      'public.machines does not exist. Apply 20260821190000_erp_00012b_machine_master_base.sql FIRST, then re-run this migration.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: Machine ID sequence (exists + owned by machines.machine_id)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.machines_machine_id_seq START 1;

DO $$
BEGIN
  EXECUTE 'ALTER SEQUENCE public.machines_machine_id_seq OWNED BY public.machines.machine_id';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[erp_00015] sequence ownership unchanged (%)', SQLERRM;
END $$;

-- Align the sequence beyond every used number (floor at reserved range 57)
SELECT setval('public.machines_machine_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(NULLIF(regexp_replace(machine_id, '\D', '', 'g'), '')::bigint)
              FROM public.machines WHERE machine_id ~ '^MCH[0-9]+$'), 0),
    57),
  true);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: collision-safe MCH### generator + updated_at touch triggers
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_machines_assign_machine_id()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_candidate TEXT;
BEGIN
  IF NEW.machine_id IS NULL OR NEW.machine_id = '' OR NEW.machine_id !~ '^MCH[0-9]{3,}$' THEN
    LOOP
      v_candidate := 'MCH' || LPAD(nextval('public.machines_machine_id_seq')::text, 3, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.machines WHERE machine_id = v_candidate);
    END LOOP;
    NEW.machine_id := v_candidate;
  ELSE
    -- Normalize manually supplied IDs to the canonical upper-case form
    NEW.machine_id := UPPER(NEW.machine_id);
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_machines_assign_machine_id ON public.machines;
CREATE TRIGGER trg_machines_assign_machine_id
  BEFORE INSERT ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.fn_machines_assign_machine_id();

CREATE OR REPLACE FUNCTION public.fn_machines_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_machines_updated_at ON public.machines;
CREATE TRIGGER trg_machines_updated_at
  BEFORE UPDATE ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.fn_machines_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: uniqueness + lookup indexes (IF NOT EXISTS keeps existing defs)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_machines_machine_id
  ON public.machines (machine_id);

CREATE INDEX IF NOT EXISTS idx_machines_machine_id_lower
  ON public.machines (lower(machine_id));

CREATE INDEX IF NOT EXISTS idx_machines_code_lower
  ON public.machines (lower(machine_code));

-- Business identity: code unique per company+department among ACTIVE rows
CREATE UNIQUE INDEX IF NOT EXISTS uq_machines_company_dept_code_active
  ON public.machines (
    company_id,
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(machine_code)
  )
  WHERE is_active AND machine_code IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: capacity as DECIMAL(19,4) — alter ONLY when type differs
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT data_type || '(' || numeric_precision || ',' || numeric_scale || ')'
    INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'machines' AND column_name = 'capacity';

  IF v_type IS DISTINCT FROM 'numeric(19,4)' THEN
    EXECUTE
      'ALTER TABLE public.machines ALTER COLUMN capacity TYPE numeric(19,4) USING NULLIF(regexp_replace(capacity::text, ''[^0-9.\-]'', '''', ''g''), '''')::numeric';
    RAISE NOTICE '[erp_00015] capacity altered to numeric(19,4) (was %)', v_type;
  ELSE
    RAISE NOTICE '[erp_00015] capacity already numeric(19,4)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: idempotent data hygiene (fills gaps only — never overwrites)
-- ─────────────────────────────────────────────────────────────────────────────

-- Any legacy row without a Machine ID gets one from the sequence
UPDATE public.machines
SET machine_id = 'MCH' || LPAD(nextval('public.machines_machine_id_seq')::text, 3, '0')
WHERE machine_id IS NULL OR machine_id = '';

-- Stable deep-link QR payload for every machine
UPDATE public.machines
SET qr_code = '/production/machines/' || id::text
WHERE qr_code IS NULL OR qr_code LIKE 'machine:%';

-- Display formatting: derive a human-readable number where none exists
UPDATE public.machines
SET machine_number = REPLACE(machine_code, '-', ' # ')
WHERE machine_number IS NULL AND machine_code IS NOT NULL;

-- Keep hierarchy inherited from the department chain where missing
UPDATE public.machines m
SET division_id = d.division_id,
    section_id  = d.section_id
FROM public.departments d
WHERE d.id = m.department_id
  AND (m.division_id IS NULL OR m.section_id IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: verification
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_total INT; v_active INT; v_canonical INT; v_dups INT;
  v_bad_fmt INT; v_bad_qr INT; v_no_num INT; v_cap TEXT;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active) INTO v_total, v_active FROM public.machines;
  SELECT COUNT(*) INTO v_canonical FROM public.machines
    WHERE is_active AND machine_id ~ '^MCH[0-9]{3}$'
      AND regexp_replace(machine_id, '\D', '', 'g')::int BETWEEN 1 AND 57;
  SELECT COUNT(*) INTO v_dups FROM (
    SELECT machine_id FROM public.machines GROUP BY machine_id HAVING COUNT(*) > 1) x;
  SELECT COUNT(*) INTO v_bad_fmt FROM public.machines
    WHERE machine_id IS NULL OR machine_id !~ '^MCH[0-9]{3,}$';
  SELECT COUNT(*) INTO v_bad_qr FROM public.machines
    WHERE qr_code IS NULL OR qr_code <> '/production/machines/' || id::text;
  SELECT COUNT(*) INTO v_no_num FROM public.machines
    WHERE machine_number IS NULL AND machine_code IS NOT NULL;
  SELECT data_type || '(' || numeric_precision || ',' || numeric_scale || ')' INTO v_cap
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='machines' AND column_name='capacity';

  RAISE NOTICE '[erp_00015] machines=% active=% canonical_MCH001..057=% dup_ids=% bad_format=% bad_qr=% null_number=% capacity=%',
    v_total, v_active, v_canonical, v_dups, v_bad_fmt, v_bad_qr, v_no_num, v_cap;

  IF v_dups > 0 OR v_bad_fmt > 0 THEN
    RAISE EXCEPTION '[erp_00015] verification failed: duplicate or malformed machine ids';
  END IF;
END $$;

COMMIT;
