-- ERP HR-07: Attendance Regularizations
-- Migration: 20260922000000_erp_00061_hr_regularizations.sql
-- Purpose: Auditable request -> approval workflow for attendance corrections.
--          Employees (or HR on their behalf) submit a regularization request
--          describing the ORIGINAL (current) attendance values and the REQUESTED
--          values. APPROVAL is a backend-side, controlled action that preserves
--          the original attendance row in hr_attendance_history BEFORE applying
--          the correction. No direct attendance overwrite is possible through
--          this feature — the only write path is the APPROVED transition.
--
-- Tables:
--   hr_regularizations     - one request per (company, employee, date)
--   hr_attendance_history  - point-in-time snapshot of the original attendance
--                            row, written only when a request is APPROVED
--
-- Duplicate protection: one ACTIVE SUBMITTED request per
-- (company, employee, attendance_date) enforced at the DB level.
-- No demo/seed data is inserted.

CREATE TABLE IF NOT EXISTS hr_regularizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    request_no VARCHAR(24) NOT NULL,
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    attendance_id UUID REFERENCES hr_attendance(id) ON DELETE SET NULL,
    attendance_date DATE NOT NULL,
    correction_type VARCHAR(30) NOT NULL CHECK (correction_type IN ('CHECK_IN','CHECK_OUT','CHECK_IN_OUT','STATUS')),
    reason VARCHAR(50) NOT NULL CHECK (reason IN ('MISSING_CHECK_IN','MISSING_CHECK_OUT','WRONG_CHECK_IN','WRONG_CHECK_OUT','STATUS_ERROR','FORGOT_TO_PUNCH','DEVICE_ISSUE','OFFICIAL_DUTY','OTHER')),
    current_check_in TIMESTAMP WITH TIME ZONE,
    current_check_out TIMESTAMP WITH TIME ZONE,
    current_status VARCHAR(20),
    requested_check_in TIMESTAMP WITH TIME ZONE,
    requested_check_out TIMESTAMP WITH TIME ZONE,
    requested_status VARCHAR(20),
    approved_check_in TIMESTAMP WITH TIME ZONE,
    approved_check_out TIMESTAMP WITH TIME ZONE,
    approved_status VARCHAR(20),
    remarks TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','APPROVED','REJECTED')),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_by UUID,
    decided_by UUID,
    decided_at TIMESTAMP WITH TIME ZONE,
    decision_remarks TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_reg_request_no ON hr_regularizations(request_no);
CREATE INDEX IF NOT EXISTS idx_hr_reg_company_status ON hr_regularizations(company_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_reg_company_emp ON hr_regularizations(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_reg_company_date ON hr_regularizations(company_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_hr_reg_company_status_date ON hr_regularizations(company_id, status, attendance_date);

-- One ACTIVE SUBMITTED request per (company, employee, attendance date). Soft-deleted
-- or decided rows do not block a new request, but a still-pending request does (409).
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_reg_active
    ON hr_regularizations(company_id, employee_id, attendance_date)
    WHERE is_active = true AND status = 'SUBMITTED';

DROP TRIGGER IF EXISTS update_hr_regularizations_updated_at ON hr_regularizations;
CREATE TRIGGER update_hr_regularizations_updated_at BEFORE UPDATE ON hr_regularizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: company-scoped, mirroring hr_attendance.
ALTER TABLE hr_regularizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_regularizations_select ON hr_regularizations;
CREATE POLICY hr_regularizations_select ON hr_regularizations
    FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_regularizations_insert ON hr_regularizations;
CREATE POLICY hr_regularizations_insert ON hr_regularizations
    FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_regularizations_update ON hr_regularizations;
CREATE POLICY hr_regularizations_update ON hr_regularizations
    FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_regularizations_delete ON hr_regularizations;
CREATE POLICY hr_regularizations_delete ON hr_regularizations
    FOR DELETE USING (erp_core.company_in_scope(company_id));

-- Audit trail for approved corrections: the ORIGINAL attendance row is snapshotted
-- here before any modification, so a decision can always be reconstructed or undone.
CREATE TABLE IF NOT EXISTS hr_attendance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    company_id UUID NOT NULL,
    attendance_id UUID NOT NULL REFERENCES hr_attendance(id) ON DELETE CASCADE,
    regularization_id UUID REFERENCES hr_regularizations(id) ON DELETE SET NULL,
    operation VARCHAR(20) NOT NULL CHECK (operation IN ('UPDATE','INSERT')),
    snapshot JSONB NOT NULL,
    changed_fields TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_hr_att_hist_attendance ON hr_attendance_history(attendance_id);
CREATE INDEX IF NOT EXISTS idx_hr_att_hist_reg ON hr_attendance_history(regularization_id);

ALTER TABLE hr_attendance_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_attendance_history_select ON hr_attendance_history;
CREATE POLICY hr_attendance_history_select ON hr_attendance_history
    FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_attendance_history_insert ON hr_attendance_history;
CREATE POLICY hr_attendance_history_insert ON hr_attendance_history
    FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_attendance_history_update ON hr_attendance_history;
CREATE POLICY hr_attendance_history_update ON hr_attendance_history
    FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_attendance_history_delete ON hr_attendance_history;
CREATE POLICY hr_attendance_history_delete ON hr_attendance_history
    FOR DELETE USING (erp_core.company_in_scope(company_id));

-- Permissions (only if not already present).
INSERT INTO permissions (permission_code, name, module, resource, action, description, status)
SELECT * FROM (VALUES
  ('hr.regularization.view','View Regularizations','hr','regularization','VIEW','View attendance regularization requests and their audit trail','ACTIVE'),
  ('hr.regularization.create','Create Regularization','hr','regularization','CREATE','Submit attendance regularization requests','ACTIVE'),
  ('hr.regularization.update','Update Regularization','hr','regularization','UPDATE','Edit a submitted regularization request','ACTIVE'),
  ('hr.regularization.approve','Approve Regularization','hr','regularization','APPROVE','Approve or reject regularization requests and apply controlled attendance corrections','ACTIVE'),
  ('hr.regularization.delete','Delete Regularization','hr','regularization','DELETE','Remove a submitted regularization request (soft delete)','ACTIVE')
) AS v(permission_code, name, module, resource, action, description, status)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_code = v.permission_code);

-- SUPER_ADMIN gets the full set.
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN' AND p.permission_code LIKE 'hr.regularization.%'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ADMIN gets everything except DELETE (matches the project backfill convention).
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN' AND p.permission_code LIKE 'hr.regularization.%' AND p.permission_code <> 'hr.regularization.delete'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- MANAGEMENT / REPORT_VIEWER receive VIEW (initial seed convention).
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code IN ('MANAGEMENT', 'REPORT_VIEWER') AND p.permission_code = 'hr.regularization.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;