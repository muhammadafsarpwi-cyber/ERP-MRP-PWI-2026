-- =============================================================================
-- ERP-00048: Item Type Standardization — add WORK_IN_PROGRESS
-- =============================================================================
-- Reconciles the app enum (backend + frontend) with the PostgreSQL CHECK on
-- public.items.item_type so the three layers share ONE canonical list:
--
--   RAW_MATERIAL, PACKAGING_MATERIAL, CONSUMABLE, SEMI_FINISHED,
--   FINISHED_GOOD, SPARE_PART, SERVICE, ASSET, OTHER, WORK_IN_PROGRESS
--
-- Changes vs. the old constraint:
--   * ADD    WORK_IN_PROGRESS
--   * ADD    PACKAGING_MATERIAL            (canonical value used by app)
--   * ADD    ASSET                          (canonical value used by app)
--   * REMOVE PACKAGING                     (legacy DB value -> normalize to PACKAGING_MATERIAL)
--   * REMOVE BOM                           (separate business concept; bill_of_materials table exists,
--                                            no items use 'BOM')
--
-- Idempotent: safe on fresh installs and existing DBs.
-- =============================================================================

-- 1) Temporarily drop the CHECK so legacy 'PACKAGING' rows can be normalized
--    to the canonical 'PACKAGING_MATERIAL' (the old constraint forbids the
--    new value, so the UPDATE must run before the constraint is re-added).
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS ck_items_item_type;
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_item_type_check;

-- 2) Normalize legacy 'PACKAGING' records to the canonical 'PACKAGING_MATERIAL'.
UPDATE public.items
SET item_type = 'PACKAGING_MATERIAL',
    updated_at = NOW()
WHERE item_type = 'PACKAGING';

-- 3) Rebuild the CHECK constraint with the canonical list.
ALTER TABLE public.items ADD CONSTRAINT ck_items_item_type CHECK (
    item_type IN ('RAW_MATERIAL', 'PACKAGING_MATERIAL', 'CONSUMABLE', 'SEMI_FINISHED', 'FINISHED_GOOD', 'SPARE_PART', 'SERVICE', 'ASSET', 'OTHER', 'WORK_IN_PROGRESS')
);

-- 4) Extend the demo item_type index is unaffected (still covers item_type).