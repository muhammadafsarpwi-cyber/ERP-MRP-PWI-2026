-- ============================================================================
-- ERP-00026: Maintenance BaseEntity / database drift consolidation
-- Migration: 20260828120000_erp_00026_maintenance_baseentity_drift_fix.sql
--
-- Context: This is the final consolidated fix for the Maintenance module. The
-- entity layer uses a shared BaseEntity that maps the following inherited
-- columns on every maintenance entity that extends it:
--
--   id            UUID (PK)
--   created_at    TIMESTAMP WITH TIME ZONE
--   updated_at    TIMESTAMP WITH TIME ZONE
--   created_by    UUID (nullable, FK -> erp_users(id))
--   updated_by    UUID (nullable, FK -> erp_users(id))
--   is_active     BOOLEAN (default true)
--
-- Any table created WITHOUT all of these columns breaks every TypeORM
-- SELECT / INSERT / UPDATE (TypeORM always lists every mapped column), which
-- produces "column X does not exist" errors -> HTTP 500 at runtime.
--
-- Audit results (entity vs table after migrations 00021..00025):
--   maintenance_job_cards             - complete (00021 + 00023 + 00024)
--   maintenance_pm_plans              - complete (00021 BaseEntity + 00024 start_date/next_due_date/last_generated_at)
--   maintenance_complaint_categories  - complete (00021 + 00025)
--   maintenance_root_cause_categories - complete (00021 + 00025)
--   maintenance_failure_categories    - complete (00021 + 00025)
--   maintenance_teams                 - MISSING created_by / updated_by
--   maintenance_job_card_parts        - MISSING created_by / updated_by / is_active
--   maintenance_job_card_technicians  - MISSING updated_at / created_by / updated_by / is_active
--   maintenance_job_card_attachments  - MISSING created_at / updated_at / created_by / updated_by / is_active
--
-- This migration only ADDS the genuinely missing columns. It never deletes or
-- renames columns, never drops data, and follows the exact conventions used by
-- migration 00021 for the matching BaseEntity columns.
-- ============================================================================
BEGIN;

-- =====================================================
-- 1. MAINTENANCE TEAMS (missing created_by / updated_by)
-- =====================================================
ALTER TABLE maintenance_teams
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES erp_users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES erp_users(id);

-- =====================================================
-- 2. JOB CARD PARTS (missing created_by / updated_by / is_active)
-- =====================================================
ALTER TABLE maintenance_job_card_parts
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES erp_users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES erp_users(id),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- =====================================================
-- 3. JOB CARD TECHNICIANS (missing updated_at / created_by / updated_by / is_active)
-- =====================================================
ALTER TABLE maintenance_job_card_technicians
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES erp_users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES erp_users(id),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- =====================================================
-- 4. JOB CARD ATTACHMENTS (missing created_at / updated_at / created_by / updated_by / is_active)
-- =====================================================
ALTER TABLE maintenance_job_card_attachments
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES erp_users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES erp_users(id),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

COMMIT;