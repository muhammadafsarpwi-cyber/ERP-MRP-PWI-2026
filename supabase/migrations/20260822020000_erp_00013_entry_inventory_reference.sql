-- ═══════════════════════════════════════════════════════════════════════════
-- ERP-00013 · Daily Production Entry — Migration 00013c
-- Add production_entries.inventory_reference_id
--
-- Stores the stock_ledger receipt id created when a make-to-stock entry posts
-- directly to inventory. Provides an auditable back-reference and acts as the
-- double-posting guard (order-linked entries keep it NULL because Production
-- Order completion is the single authoritative posting point).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.production_entries
  ADD COLUMN IF NOT EXISTS inventory_reference_id uuid;

COMMENT ON COLUMN public.production_entries.inventory_reference_id IS
  'stock_ledger receipt id for direct (make-to-stock) inventory posting; NULL for order-linked entries';
