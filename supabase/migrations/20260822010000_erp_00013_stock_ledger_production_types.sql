-- ═══════════════════════════════════════════════════════════════════════════
-- ERP-00013 · Daily Production Entry & Department-Wise Production Reporting
-- Migration 00013b: allow PRODUCTION_* transaction types on stock_ledger
--
-- The application layer (production-order.service completeProductionOrder,
-- production-entry.service postInventory) records finished-goods receipts as
-- PRODUCTION_RECEIPT, scrap/rejection as PRODUCTION_SCRAP and raw-material
-- consumption as PRODUCTION_ISSUE. The original CHECK constraint predated
-- these production flows and only allowed trade/inventory types, so any
-- production posting violated stock_ledger_transaction_type_check.
--
-- This migration widens the CHECK (idempotent) without weakening any other
-- value; unknown types remain rejected by the database.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.stock_ledger
  DROP CONSTRAINT IF EXISTS stock_ledger_transaction_type_check;

ALTER TABLE public.stock_ledger
  ADD CONSTRAINT stock_ledger_transaction_type_check
  CHECK (
    (transaction_type)::text = ANY (ARRAY[
      -- original trade / inventory types
      'RECEIPT', 'ISSUE', 'TRANSFER_OUT', 'TRANSFER_IN',
      'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'OPENING',
      'RETURN_IN', 'RETURN_OUT', 'SALES_DELIVERY', 'SALES_RETURN',
      -- production types used by manufacturing modules
      'PRODUCTION_RECEIPT', 'PRODUCTION_ISSUE', 'PRODUCTION_SCRAP'
    ]::text[])
  );
