-- ERP HR-08: Overtime Approval
-- Migration: 20260923000000_erp_00062_hr_overtime.sql
-- Purpose: Request -> approval workflow for overtime hours. The candidate
--          overtime on an attendance record is COMPUTED (display-only) as the
--          time between the actual check-out and the shift's scheduled end —
--          the backend never auto-writes overtime to hr_attendance. Approved
--          hours are recorded only on the overtime request itself so payroll
--          decisions stay explicit and auditable.
--
-- Tables:
--   hr_overtime          - one request per (company, employee, overtime date)
--   hr_overtime_history  - immutable transition ledger for every decision
--
-- Duplicate protection: one ACTIVE PENDING request per
-- (company, employee, overtime_date) enforced at the DB level.
-- No demo/seed data is inserted.

CREATE TABLE IF NOT EXISTS hr_overtime (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    ref_no VARCHAR(24) NOT NULL,
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    attendance_id UUID REFERENCES hr_attendance(id) ON DELETE SET NULL,
    overtime_date DATE NOT NULL,
    shift_id UUID REFERENCES hr_shifts(id) ON DELETE SET NULL,
    requested_hours NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (requested_hours > 0 AND requested_hours <= 24),
    approved_hours NUMERIC(6,2) CHECK (approved_hours IS NULL OR (approved_hours > 0 AND approved_hours <= 24)),
    reason VARCHAR(255) NOT NULL,
    remarks TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_by UUID,
    decided_by UUID,
    decided_at TIMESTAMP WITH TIME ZONE,
    decision_remarks TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_ot_ref_no ON hr_overtime(ref_no);
CREATE INDEX IF NOT EXISTS idx_hr_ot_company_status ON hr_overtime(company_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_ot_company_emp ON hr_overtime(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_ot_company_date ON hr_overtime(company_id, overtime_date);
CREATE INDEX IF NOT EXISTS idx_hr_ot_company_status_date ON hr_overtime(company_id, status, overtime_date);

-- One ACTIVE PENDING request per (company, employee, overtime date). Soft-deleted
-- or decided rows do not block a new request, but a still-pending request does (409).
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_ot_active
    ON hr_overtime(company_id, employee_id, overtime_date)
    WHERE is_active = true AND status = 'PENDING';

DROP TRIGGER IF EXISTS update_hr_overtime_updated_at ON hr_overtime;
CREATE TRIGGER update_hr_overtime_updated_at BEFORE UPDATE ON hr_overtime
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: company-scoped, mirroring hr_regularizations.
ALTER TABLE hr_overtime ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_overtime_select ON hr_overtime;
CREATE POLICY hr_overtime_select ON hr_overtime
    FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_overtime_insert ON hr_overtime;
CREATE POLICY hr_overtime_insert ON hr_overtime
    FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_overtime_update ON hr_overtime;
CREATE POLICY hr_overtime_update ON hr_overtime
    FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_overtime_delete ON hr_overtime;
CREATE POLICY hr_overtime_delete ON hr_overtime
    FOR DELETE USING (erp_core.company_in_scope(company_id));

-- Immutable transition ledger: every state change is recorded (created -> PENDING
-- on submission, PENDING -> APPROVED / PENDING -> REJECTED on decisions).
CREATE TABLE IF NOT EXISTS hr_overtime_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    company_id UUID NOT NULL,
    overtime_id UUID NOT NULL REFERENCES hr_overtime(id) ON DELETE CASCADE,
    from_status VARCHAR(20),
    to_status VARCHAR(20) NOT NULL CHECK (to_status IN ('PENDING','APPROVED','REJECTED')),
    requested_hours NUMERIC(6,2) NOT NULL,
    approved_hours NUMERIC(6,2),
    remarks TEXT,
    changed_fields TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_hr_ot_hist_overtime ON hr_overtime_history(overtime_id);
CREATE INDEX IF NOT EXISTS idx_hr_ot_hist_company ON hr_overtime_history(company_id);

ALTER TABLE hr_overtime_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_overtime_history_select ON hr_overtime_history;
CREATE POLICY hr_overtime_history_select ON hr_overtime_history
    FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_overtime_history_insert ON hr_overtime_history;
CREATE POLICY hr_overtime_history_insert ON hr_overtime_history
    FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_overtime_history_update ON hr_overtime_history;
CREATE POLICY hr_overtime_history_update ON hr_overtime_history
    FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_overtime_history_delete ON hr_overtime_history;
CREATE POLICY hr_overtime_history_delete ON hr_overtime_history
    FOR DELETE USING (erp_core.company_in_scope(company_id));

-- Permissions (only if not already present).
INSERT INTO permissions (permission_code, name, module, resource, action, description, status)
SELECT * FROM (VALUES
  ('hr.overtime.view','View Overtime Approvals','hr','overtime','VIEW','View overtime approval requests and their audit trail','ACTIVE'),
  ('hr.overtime.create','Create Overtime Request','hr','overtime','CREATE','Submit overtime approval requests','ACTIVE'),
  ('hr.overtime.update','Update Overtime Request','hr','overtime','UPDATE','Edit a pending overtime request','ACTIVE'),
  ('hr.overtime.approve','Approve Overtime Request','hr','overtime','APPROVE','Approve or reject overtime requests','ACTIVE'),
  ('hr.overtime.delete','Delete Overtime Request','hr','overtime','DELETE','Remove a pending overtime request (soft delete)','ACTIVE')
) AS v(permission_code, name, module, resource, action, description, status)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_code = v.permission_code);

-- SUPER_ADMIN gets the full set.
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN' AND p.permission_code LIKE 'hr.overtime.%'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ADMIN gets everything except DELETE (matches the project backfill convention).
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN' AND p.permission_code LIKE 'hr.overtime.%' AND p.permission_code <> 'hr.overtime.delete'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- MANAGEMENT / REPORT_VIEWER receive VIEW (initial seed convention).
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code IN ('MANAGEMENT', 'REPORT_VIEWER') AND p.permission_code = 'hr.overtime.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;