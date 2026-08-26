-- ═══════════════════════════════════════════════════════════════════════════
-- ERP-00018 — MACHINE TARGET MASTER: ITEM LINK (PROMPT-10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Extends the EXISTING machine_targets table (ERP-00016) with the item
-- dimension so the business key becomes:
--
--     Machine + Shift + Item + UOM + Effective period
--
-- The target stays linked to the existing Item Master (PROMPT-09), Shift
-- Master, Machine Master and UOM structure — no new/duplicate tables.
--
-- Existing records are preserved: item_id starts as NULL for legacy rows.
-- Idempotency: IF NOT EXISTS / guarded constraint creation / index swap.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: item_id column on machine_targets
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.machine_targets ADD COLUMN IF NOT EXISTS item_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_machine_targets_item') THEN
    ALTER TABLE public.machine_targets
      ADD CONSTRAINT fk_machine_targets_item
      FOREIGN KEY (item_id) REFERENCES public.items(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_machine_targets_item ON public.machine_targets(item_id);

COMMENT ON COLUMN public.machine_targets.item_id IS
  'PROMPT-10: produced Item (existing Item Master). NULL = pre-PROMPT-10 record.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: uniqueness must include the item dimension.
-- Old key: (company, machine, shift, uom) open-active.
-- New key: (company, machine, shift, item_id, uom_id) open-active.
-- Postgres treats NULLs as distinct, so legacy rows never collide with new
-- item-scoped rows; live duplicates were verified absent before this change.
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.uq_machine_targets_active_open_combo;

CREATE UNIQUE INDEX IF NOT EXISTS uq_machine_targets_active_open_combo
  ON public.machine_targets(company_id, machine_id, shift_id, item_id, uom_id)
  WHERE status = 'ACTIVE' AND is_active = TRUE AND effective_to IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification notice
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_col   INT;
  v_fk    INT;
  v_idx   TEXT;
  v_total INT;
BEGIN
  SELECT COUNT(*) INTO v_col FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'machine_targets' AND column_name = 'item_id';
  SELECT COUNT(*) INTO v_fk FROM pg_constraint
   WHERE conname = 'fk_machine_targets_item';
  SELECT indexname INTO v_idx FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'machine_targets'
     AND indexname = 'uq_machine_targets_active_open_combo';
  SELECT COUNT(*) INTO v_total FROM public.machine_targets;

  RAISE NOTICE '[erp_00018] item_id column=% | fk=% | unique-index=% | rows preserved=%',
    v_col, v_fk, v_idx, v_total;
END $$;

COMMIT;
