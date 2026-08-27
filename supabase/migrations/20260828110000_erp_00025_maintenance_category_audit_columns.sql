-- ============================================================================
-- ERP-00025: Add missing BaseEntity audit columns to maintenance category tables
-- Migration: 20260828110000_erp_00025_maintenance_category_audit_columns.sql
--
-- Root cause: migration 00021 created maintenance_complaint_categories,
-- maintenance_root_cause_categories and maintenance_failure_categories WITHOUT
-- the created_by / updated_by columns that every maintenance entity maps via
-- the shared BaseEntity. As a result every TypeORM SELECT/INSERT on these
-- tables fails with "column created_by does not exist" -> HTTP 500, which
-- broke the Create Job Card category dropdowns, the category relations loaded
-- by findOne() right after a job card is created, and the "Add Category" modal.
--
-- Fix: align the three tables with the BaseEntity contract used by all other
-- maintenance tables (see maintenance_job_cards in migration 00021).
-- ============================================================================
BEGIN;

ALTER TABLE maintenance_complaint_categories
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES erp_users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES erp_users(id);

ALTER TABLE maintenance_root_cause_categories
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES erp_users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES erp_users(id);

ALTER TABLE maintenance_failure_categories
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES erp_users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES erp_users(id);

COMMIT;