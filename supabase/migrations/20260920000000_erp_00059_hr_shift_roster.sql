-- ERP HR-04: Shift Roster
-- Migration: 20260920000000_erp_00059_hr_shift_roster.sql
-- Purpose: Daily shift-rostering of real HR employees to real Shift Master
--          (hr_shifts) rows. Every row is company-scoped exactly like
--          hr_attendance. Soft deletion (is_active) is the only removal path.
--          Duplicate protection: one ACTIVE roster row per
--          (company, employee, roster date, shift). Idempotent.
-- No demo/seed data is inserted — the roster only ever contains real
-- assignments created through the Shift Roster UI/API.

CREATE TABLE IF NOT EXISTS hr_shift_roster (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES hr_shifts(id),
    roster_date DATE NOT NULL,
    assignment_status VARCHAR(20) DEFAULT 'ASSIGNED' CHECK (assignment_status IN ('ASSIGNED','TENTATIVE')),
    remarks TEXT
);

CREATE INDEX IF NOT EXISTS idx_hr_roster_company_date ON hr_shift_roster(company_id, roster_date);
CREATE INDEX IF NOT EXISTS idx_hr_roster_company_emp ON hr_shift_roster(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_roster_company_shift ON hr_shift_roster(company_id, shift_id);

-- One ACTIVE assignment per (company, employee, roster date, shift). Soft-deleted
-- rows are excluded so an entry can be re-assigned after delete.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_roster_active
    ON hr_shift_roster(company_id, employee_id, roster_date, shift_id)
    WHERE is_active = true;

DROP TRIGGER IF EXISTS update_hr_shift_roster_updated_at ON hr_shift_roster;
CREATE TRIGGER update_hr_shift_roster_updated_at BEFORE UPDATE ON hr_shift_roster
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: company-scoped, mirroring hr_attendance.
ALTER TABLE hr_shift_roster ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_shift_roster_select ON hr_shift_roster;
CREATE POLICY hr_shift_roster_select ON hr_shift_roster
    FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_shift_roster_insert ON hr_shift_roster;
CREATE POLICY hr_shift_roster_insert ON hr_shift_roster
    FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_shift_roster_update ON hr_shift_roster;
CREATE POLICY hr_shift_roster_update ON hr_shift_roster
    FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_shift_roster_delete ON hr_shift_roster;
CREATE POLICY hr_shift_roster_delete ON hr_shift_roster
    FOR DELETE USING (erp_core.company_in_scope(company_id));

-- Permissions (only if not already present).
INSERT INTO permissions (permission_code, name, module, resource, action, description, status)
SELECT * FROM (VALUES
  ('hr.shift_roster.view','View Shift Roster','hr','shift_roster','VIEW','View the daily shift roster and assignments','ACTIVE'),
  ('hr.shift_roster.create','Create Shift Roster','hr','shift_roster','CREATE','Assign employees to shifts on a roster date','ACTIVE'),
  ('hr.shift_roster.update','Update Shift Roster','hr','shift_roster','UPDATE','Edit shift roster assignments','ACTIVE'),
  ('hr.shift_roster.delete','Delete Shift Roster','hr','shift_roster','DELETE','Remove shift roster assignments (soft delete)','ACTIVE')
) AS v(permission_code, name, module, resource, action, description, status)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_code = v.permission_code);

-- SUPER_ADMIN gets the full CRUD set.
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN' AND p.permission_code LIKE 'hr.shift_roster.%'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ADMIN gets everything except DELETE (matches the project backfill convention).
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN' AND p.permission_code LIKE 'hr.shift_roster.%' AND p.permission_code <> 'hr.shift_roster.delete'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- MANAGEMENT / REPORT_VIEWER receive VIEW (initial seed convention).
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code IN ('MANAGEMENT', 'REPORT_VIEWER') AND p.permission_code = 'hr.shift_roster.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;