-- ERP HR/QC missing audit column patch
-- Migration: 20260830030000_erp_00034_hr_qc_audit_columns.sql
-- BaseEntity requires updated_at on every entity table.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['hr_designations','hr_employees','hr_employee_documents','hr_employee_skills',
    'hr_employee_training','hr_employee_histories','hr_attendance','hr_leave_requests','hr_leave_types',
    'hr_shifts','hr_holidays','qc_inspection_plans','qc_quality_characteristics','qc_inspections',
    'qc_inspection_results','qc_defect_classifications','qc_ncr','qc_capa'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by UUID', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_by UUID', t);
    END IF;
  END LOOP;
END $$;