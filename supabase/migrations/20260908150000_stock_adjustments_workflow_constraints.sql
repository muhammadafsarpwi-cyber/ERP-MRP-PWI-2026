-- Migration: 20260908150000_stock_adjustments_workflow_constraints.sql
-- Update status and adjustment_type check constraints for complete approval workflow

ALTER TABLE stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_status_check;
ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_status_check 
  CHECK (status IN ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'RETURNED', 'REJECTED', 'POSTED', 'CANCELLED'));

ALTER TABLE stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_adjustment_type_check;
ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_adjustment_type_check 
  CHECK (adjustment_type IN ('INCREASE', 'DECREASE', 'REVALUATION', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'));
