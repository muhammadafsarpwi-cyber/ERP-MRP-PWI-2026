-- ============================================================================
-- PROMPT-02: Correct Organization Hierarchy & Centralized Department Scoping
-- Migration: 20260821160000_erp_00011_org_hierarchy_correction.sql
--
-- Purpose:
--   1. Create department_division_scopes table (centralized dept ↔ division mapping)
--   2. Insert 7 centralized company-level departments
--   3. Populate division scopes for backward compatibility
--   4. Deactivate placeholder divisions DIV-001..DIV-005
--   5. Migrate erp_users defaults from DIV-001/DEPT-001 to SPD
--
-- Safety:
--   - All operations are idempotent (INSERT ... ON CONFLICT DO NOTHING / UPDATE)
--   - No primary keys changed
--   - No foreign keys broken
--   - Old rows are deactivated, not deleted
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: Create department_division_scopes table
-- Links centralized company-level departments to specific divisions for
-- reporting, responsibility assignment, and operational visibility.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS department_division_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  CONSTRAINT uq_dept_div_scope UNIQUE (department_id, division_id)
);

CREATE INDEX IF NOT EXISTS idx_dept_div_scope_dept ON department_division_scopes (department_id);
CREATE INDEX IF NOT EXISTS idx_dept_div_scope_div ON department_division_scopes (division_id);

COMMENT ON TABLE department_division_scopes IS 'Maps centralized company-level departments to divisions for scoped reporting and assignment.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: Insert 7 centralized company-level departments
-- These are NOT business divisions. They are company-wide functions.
-- division_id = NULL, section_id = NULL (they belong to the company, not a division)
-- ─────────────────────────────────────────────────────────────────────────────

-- Resolve COMP-001 ID
DO $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT id INTO v_company_id FROM companies WHERE company_code = 'COMP-001';

  -- 1. Human Resources
  INSERT INTO departments (company_id, department_code, name, description, division_id, section_id, status, is_active, created_at, updated_at)
  VALUES (v_company_id, 'CENT-HR', 'Human Resources', 'HR management, recruitment, employee relations and administration', NULL, NULL, 'ACTIVE', true, now(), now())
  ON CONFLICT (department_code, company_id) DO NOTHING;

  -- 2. Accounts & Finance
  INSERT INTO departments (company_id, department_code, name, description, division_id, section_id, status, is_active, created_at, updated_at)
  VALUES (v_company_id, 'CENT-FIN', 'Accounts & Finance', 'Accounting, treasury, financial control, budgeting and reporting', NULL, NULL, 'ACTIVE', true, now(), now())
  ON CONFLICT (department_code, company_id) DO NOTHING;

  -- 3. Supply Chain
  INSERT INTO departments (company_id, department_code, name, description, division_id, section_id, status, is_active, created_at, updated_at)
  VALUES (v_company_id, 'CENT-SC', 'Supply Chain', 'Procurement, logistics, inventory management and supply chain coordination', NULL, NULL, 'ACTIVE', true, now(), now())
  ON CONFLICT (department_code, company_id) DO NOTHING;

  -- 4. Maintenance
  INSERT INTO departments (company_id, department_code, name, description, division_id, section_id, status, is_active, created_at, updated_at)
  VALUES (v_company_id, 'CENT-MAINT', 'Maintenance', 'Facility maintenance, equipment upkeep, preventive maintenance and repairs', NULL, NULL, 'ACTIVE', true, now(), now())
  ON CONFLICT (department_code, company_id) DO NOTHING;

  -- 5. IT & Systems
  INSERT INTO departments (company_id, department_code, name, description, division_id, section_id, status, is_active, created_at, updated_at)
  VALUES (v_company_id, 'CENT-IT', 'IT & Systems', 'IT infrastructure, business systems, ERP administration and technical support', NULL, NULL, 'ACTIVE', true, now(), now())
  ON CONFLICT (department_code, company_id) DO NOTHING;

  -- 6. Quality & Engineering
  INSERT INTO departments (company_id, department_code, name, description, division_id, section_id, status, is_active, created_at, updated_at)
  VALUES (v_company_id, 'CENT-QE', 'Quality & Engineering', 'Quality assurance, quality control, R&D and engineering support', NULL, NULL, 'ACTIVE', true, now(), now())
  ON CONFLICT (department_code, company_id) DO NOTHING;

  -- 7. Administration
  INSERT INTO departments (company_id, department_code, name, description, division_id, section_id, status, is_active, created_at, updated_at)
  VALUES (v_company_id, 'CENT-ADM', 'Administration', 'General administration, office management, compliance and corporate services', NULL, NULL, 'ACTIVE', true, now(), now())
  ON CONFLICT (department_code, company_id) DO NOTHING;

END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: Populate department_division_scopes for backward compatibility
-- Each old division's centralized function gets scoped to that division.
-- This preserves the historical association without duplicating departments.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_company_id UUID;
  v_dept_hr UUID;
  v_dept_fin UUID;
  v_dept_sc UUID;
  v_dept_maint UUID;
  v_dept_it UUID;
  v_dept_qe UUID;
  v_dept_adm UUID;
  v_div_spd UUID;
  v_div_ccd UUID;
BEGIN
  SELECT id INTO v_company_id FROM companies WHERE company_code = 'COMP-001';

  -- Resolve centralized department IDs
  SELECT id INTO v_dept_hr   FROM departments WHERE department_code = 'CENT-HR'   AND company_id = v_company_id;
  SELECT id INTO v_dept_fin  FROM departments WHERE department_code = 'CENT-FIN'  AND company_id = v_company_id;
  SELECT id INTO v_dept_sc   FROM departments WHERE department_code = 'CENT-SC'   AND company_id = v_company_id;
  SELECT id INTO v_dept_maint FROM departments WHERE department_code = 'CENT-MAINT' AND company_id = v_company_id;
  SELECT id INTO v_dept_it   FROM departments WHERE department_code = 'CENT-IT'   AND company_id = v_company_id;
  SELECT id INTO v_dept_qe   FROM departments WHERE department_code = 'CENT-QE'   AND company_id = v_company_id;
  SELECT id INTO v_dept_adm  FROM departments WHERE department_code = 'CENT-ADM'  AND company_id = v_company_id;

  -- Resolve operational division IDs
  SELECT id INTO v_div_spd FROM divisions WHERE division_code = 'SPD' AND company_id = v_company_id;
  SELECT id INTO v_div_ccd FROM divisions WHERE division_code = 'CCD' AND company_id = v_company_id;

  -- SPD scopes: HR, Supply Chain, Maintenance, IT, Quality, Admin (all serve SPD)
  INSERT INTO department_division_scopes (department_id, division_id, created_at, updated_at) VALUES
    (v_dept_hr,    v_div_spd, now(), now()),
    (v_dept_sc,    v_div_spd, now(), now()),
    (v_dept_maint, v_div_spd, now(), now()),
    (v_dept_it,    v_div_spd, now(), now()),
    (v_dept_qe,    v_div_spd, now(), now()),
    (v_dept_adm,   v_div_spd, now(), now())
  ON CONFLICT (department_id, division_id) DO NOTHING;

  -- CCD scopes: HR, Supply Chain, Maintenance, IT, Quality, Admin (all serve CCD)
  INSERT INTO department_division_scopes (department_id, division_id, created_at, updated_at) VALUES
    (v_dept_hr,    v_div_ccd, now(), now()),
    (v_dept_sc,    v_div_ccd, now(), now()),
    (v_dept_maint, v_div_ccd, now(), now()),
    (v_dept_it,    v_div_ccd, now(), now()),
    (v_dept_qe,    v_div_ccd, now(), now()),
    (v_dept_adm,   v_div_ccd, now(), now())
  ON CONFLICT (department_id, division_id) DO NOTHING;

  -- Finance & Admin scoped to both (company-wide, not division-specific)
  INSERT INTO department_division_scopes (department_id, division_id, created_at, updated_at) VALUES
    (v_dept_fin, v_div_spd, now(), now()),
    (v_dept_fin, v_div_ccd, now(), now())
  ON CONFLICT (department_id, division_id) DO NOTHING;

END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: Deactivate placeholder divisions DIV-001..DIV-005
-- These are not real business divisions. They are historical artifacts.
-- Setting status='INACTIVE' and is_active=false keeps them for FK references
-- but removes them from active UI queries.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE divisions
SET status = 'INACTIVE',
    is_active = false,
    updated_at = now()
WHERE company_id = '7725aa04-a270-4314-9e82-90949cbe7791'
  AND division_code IN ('DIV-001', 'DIV-002', 'DIV-003', 'DIV-004', 'DIV-005')
  AND is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: Migrate erp_users defaults from DIV-001/DEPT-001 to SPD
-- The default user had DIV-001 as default division. Update to SPD.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE erp_users
SET default_division_id = (
    SELECT id FROM divisions
    WHERE company_id = '7725aa04-a270-4314-9e82-90949cbe7791'
    AND division_code = 'SPD'
),
default_department_id = (
    SELECT id FROM departments
    WHERE company_id = '7725aa04-a270-4314-9e82-90949cbe7791'
    AND department_code = 'SPD-DEPT001'
),
updated_at = now()
WHERE default_division_id = (
    SELECT id FROM divisions
    WHERE company_id = '7725aa04-a270-4314-9e82-90949cbe7791'
    AND division_code = 'DIV-001'
);

COMMIT;
