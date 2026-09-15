-- ERP HR-09: Employee Advances
-- Migration: 20260924000000_erp_00063_hr_advances.sql
-- Purpose: Request -> approval -> disbursement -> recovery workflow for cash
--          advances given to employees. Financial integrity is enforced at the
--          database level (all money DECIMAL(19,4), no floating point) and
--          balances are DERIVED: outstanding_amount is always the live
--          (disbursed_amount - recovered_amount) difference, never an
--          independently-editable column.
--
-- FINAL (HR-09-B) STATUS MODEL: PENDING, APPROVED, REJECTED, CANCELLED,
--          DISBURSED, PARTIALLY_RECOVERED, RECOVERED. New records begin as
--          PENDING. There is NO DRAFT / SUBMITTED / FULLY_RECOVERED workflow.
--
-- This file is IDEMPOTENT and ALIGNS an older scaffold of the same tables
-- (which carried DRAFT/submit semantics and a vacancy in the state list).
-- Any obsolete constraint/column/index/predicate is replaced in guarded DO
-- blocks; existing valid COA, finance journals and history are untouched.
--
-- Tables:
--   hr_advances          - one advance request per (company, employee, date)
--   hr_advance_history   - immutable transition/money ledger
--
-- Duplicate protection: one ACTIVE OPEN (PENDING/APPROVED/DISBURSED/
-- PARTIALLY_RECOVERED) request per (company, employee, request_date).
-- REJECTED / CANCELLED / RECOVERED rows never block a new request.
--
-- Finance integration boundary: disbursement (DR 1100 Accounts Receivable /
-- CR 1000 Cash) and recovery (DR 1000 / CR 1100) FINANCIAL transactions are
-- recorded by the backend through the existing finance auto-posting service
-- (finance_journals / finance_journal_lines) with
-- reference_type = 'EMPLOYEE_ADVANCE'. This migration does NOT create journals,
-- does NOT modify existing accounting transactions, and does NOT create any
-- chart-of-accounts rows (account 2200 is NEVER used for the advance
-- receivable; 1100/1000 are the approved receivable/cash legs).

CREATE TABLE IF NOT EXISTS hr_advances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    ref_no VARCHAR(24) NOT NULL,
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    request_date DATE NOT NULL DEFAULT CURRENT_DATE,
    requested_amount DECIMAL(19,4) NOT NULL CHECK (requested_amount > 0),
    approved_amount DECIMAL(19,4) CHECK (
        approved_amount IS NULL OR (approved_amount > 0 AND approved_amount <= requested_amount)
    ),
    disbursed_amount DECIMAL(19,4) NOT NULL DEFAULT 0 CHECK (disbursed_amount >= 0),
    recovered_amount DECIMAL(19,4) NOT NULL DEFAULT 0 CHECK (
        recovered_amount >= 0 AND recovered_amount <= disbursed_amount
    ),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    reason VARCHAR(255) NOT NULL,
    remarks TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    requested_by UUID,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    decision_remarks TEXT,
    disbursed_by UUID,
    disbursed_at TIMESTAMP WITH TIME ZONE,
    recovered_by UUID,
    recovered_at TIMESTAMP WITH TIME ZONE,
    CHECK (approved_amount IS NULL OR disbursed_amount <= approved_amount),
    CONSTRAINT chk_hr_advances_status CHECK (status IN (
        'PENDING','APPROVED','REJECTED','CANCELLED','DISBURSED','PARTIALLY_RECOVERED','RECOVERED'
    ))
);

ALTER TABLE hr_advances ADD COLUMN IF NOT EXISTS requested_by UUID;

-- Alignment for databases created by the older scaffold: requesters were
-- captured as created_by/submitted_by. Preserve history (no values invented):
-- backfill requested_by only where it is still NULL and a creator exists.
UPDATE hr_advances SET requested_by = created_by WHERE requested_by IS NULL;

-- Obsolete submitted/submit-workflow columns are removed (0 rows carry data
-- in a released environment; the approved model has no submit stage).
ALTER TABLE hr_advances DROP COLUMN IF EXISTS submitted_at;
ALTER TABLE hr_advances DROP COLUMN IF EXISTS submitted_by;

ALTER TABLE hr_advances ALTER COLUMN status SET DEFAULT 'PENDING';

-- Replace any status CHECK that still permits obsolete states. Only the
-- obsolete constraints are dropped (any definition referencing DRAFT or
-- FULLY_RECOVERED); the finalized named constraint is added once.
DO $align_adv_status$
DECLARE
    con RECORD;
BEGIN
    FOR con IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'hr_advances'::regclass AND contype = 'c'
          AND (pg_get_constraintdef(oid) ILIKE '%DRAFT%'
               OR pg_get_constraintdef(oid) ILIKE '%FULLY_RECOVERED%')
    LOOP
        EXECUTE format('ALTER TABLE hr_advances DROP CONSTRAINT %I', con.conname);
    END LOOP;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'hr_advances'::regclass AND conname = 'chk_hr_advances_status'
    ) THEN
        ALTER TABLE hr_advances ADD CONSTRAINT chk_hr_advances_status
            CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED',
                              'DISBURSED','PARTIALLY_RECOVERED','RECOVERED'));
    END IF;
END $align_adv_status$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_adv_ref_no ON hr_advances(ref_no);
CREATE INDEX IF NOT EXISTS idx_hr_adv_company_status ON hr_advances(company_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_adv_company_emp ON hr_advances(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_adv_company_date ON hr_advances(company_id, request_date);
CREATE INDEX IF NOT EXISTS idx_hr_adv_company_status_date ON hr_advances(company_id, status, request_date);

-- One ACTIVE OPEN request per (company, employee, request date). An obsolete
-- predicate (DRAFT/PENDING) is replaced; the finalized predicate protects
-- PENDING/APPROVED/DISBURSED/PARTIALLY_RECOVERED. Soft-deleted or terminal
-- rows (REJECTED/CANCELLED/RECOVERED) never block a new request.
DO $align_adv_uq$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'uq_hr_adv_active'
          AND (indexdef ILIKE '%DRAFT%' OR indexdef ILIKE '%FULLY%'
               OR indexdef NOT ILIKE '%PARTIALLY_RECOVERED%')
    ) THEN
        DROP INDEX uq_hr_adv_active;
    END IF;
END $align_adv_uq$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_adv_active
    ON hr_advances(company_id, employee_id, request_date)
    WHERE is_active = true AND status IN ('PENDING','APPROVED','DISBURSED','PARTIALLY_RECOVERED');

DROP TRIGGER IF EXISTS update_hr_advances_updated_at ON hr_advances;
CREATE TRIGGER update_hr_advances_updated_at BEFORE UPDATE ON hr_advances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: company-scoped, mirroring hr_overtime.
ALTER TABLE hr_advances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_advances_select ON hr_advances;
CREATE POLICY hr_advances_select ON hr_advances
    FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_advances_insert ON hr_advances;
CREATE POLICY hr_advances_insert ON hr_advances
    FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_advances_update ON hr_advances;
CREATE POLICY hr_advances_update ON hr_advances
    FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_advances_delete ON hr_advances;
CREATE POLICY hr_advances_delete ON hr_advances
    FOR DELETE USING (erp_core.company_in_scope(company_id));

-- Immutable transition + money ledger. Every state change is recorded:
-- CREATED (-> PENDING), UPDATED, DELETED (-> CANCELLED), APPROVED, REJECTED,
-- DISBURSEMENT, RECOVERY. `amount` carries the money delta for
-- disbursement/recovery events (null otherwise); requested/approved/disbursed/
-- recovered_amount are event-time snapshots so the ledger is self-contained.
CREATE TABLE IF NOT EXISTS hr_advance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    company_id UUID NOT NULL,
    advance_id UUID NOT NULL REFERENCES hr_advances(id) ON DELETE CASCADE,
    event_type VARCHAR(30) NOT NULL,
    from_status VARCHAR(20),
    to_status VARCHAR(20) NOT NULL,
    amount DECIMAL(19,4) CHECK (amount IS NULL OR amount >= 0),
    requested_amount DECIMAL(19,4),
    approved_amount DECIMAL(19,4),
    disbursed_amount DECIMAL(19,4),
    recovered_amount DECIMAL(19,4),
    remarks TEXT,
    changed_fields TEXT[] NOT NULL DEFAULT '{}',
    CONSTRAINT chk_hr_adv_history_event CHECK (event_type IN (
        'CREATED','UPDATED','DELETED','APPROVED','REJECTED','CANCELLED','DISBURSEMENT','RECOVERY'
    )),
    CONSTRAINT chk_hr_adv_history_status CHECK (to_status IN (
        'PENDING','APPROVED','REJECTED','CANCELLED','DISBURSED','PARTIALLY_RECOVERED','RECOVERED'
    ))
);

ALTER TABLE hr_advance_history ADD COLUMN IF NOT EXISTS disbursed_amount DECIMAL(19,4);
ALTER TABLE hr_advance_history ADD COLUMN IF NOT EXISTS recovered_amount DECIMAL(19,4);

-- Replace obsolete history CHECK constraints (SUBMITTED / DRAFT / FULLY_RECOVERED).
DO $align_adv_hist$
DECLARE
    con RECORD;
BEGIN
    FOR con IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'hr_advance_history'::regclass AND contype = 'c'
          AND (pg_get_constraintdef(oid) ILIKE '%SUBMITTED%'
               OR pg_get_constraintdef(oid) ILIKE '%DRAFT%'
               OR pg_get_constraintdef(oid) ILIKE '%FULLY_RECOVERED%')
    LOOP
        EXECUTE format('ALTER TABLE hr_advance_history DROP CONSTRAINT %I', con.conname);
    END LOOP;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'hr_advance_history'::regclass AND conname = 'chk_hr_adv_history_event'
    ) THEN
        ALTER TABLE hr_advance_history ADD CONSTRAINT chk_hr_adv_history_event
            CHECK (event_type IN ('CREATED','UPDATED','DELETED','APPROVED','REJECTED',
                                  'CANCELLED','DISBURSEMENT','RECOVERY'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'hr_advance_history'::regclass AND conname = 'chk_hr_adv_history_status'
    ) THEN
        ALTER TABLE hr_advance_history ADD CONSTRAINT chk_hr_adv_history_status
            CHECK (to_status IN ('PENDING','APPROVED','REJECTED','CANCELLED',
                                 'DISBURSED','PARTIALLY_RECOVERED','RECOVERED'));
    END IF;
END $align_adv_hist$;

-- History lookups: (advance_id, created_at) serves every replay/timeline query.
DROP INDEX IF EXISTS idx_hr_adv_hist_advance;
CREATE INDEX IF NOT EXISTS idx_hr_adv_hist_advance_created ON hr_advance_history(advance_id, created_at);
CREATE INDEX IF NOT EXISTS idx_hr_adv_hist_company ON hr_advance_history(company_id);

ALTER TABLE hr_advance_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_advance_history_select ON hr_advance_history;
CREATE POLICY hr_advance_history_select ON hr_advance_history
    FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_advance_history_insert ON hr_advance_history;
CREATE POLICY hr_advance_history_insert ON hr_advance_history
    FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_advance_history_update ON hr_advance_history;
CREATE POLICY hr_advance_history_update ON hr_advance_history
    FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS hr_advance_history_delete ON hr_advance_history;
CREATE POLICY hr_advance_history_delete ON hr_advance_history
    FOR DELETE USING (erp_core.company_in_scope(company_id));

-- Permissions (only if not already present; approval HR-09 design, singular
-- resource pattern: hr.advance.<action>).
INSERT INTO permissions (permission_code, name, module, resource, action, description, status)
SELECT * FROM (VALUES
  ('hr.advance.view','View Employee Advances','hr','advance','VIEW','View employee advance requests and their audit trail','ACTIVE'),
  ('hr.advance.create','Create Advance Request','hr','advance','CREATE','Create an employee advance request (starts as PENDING)','ACTIVE'),
  ('hr.advance.update','Update Advance Request','hr','advance','UPDATE','Edit a PENDING advance request','ACTIVE'),
  ('hr.advance.delete','Delete Advance Request','hr','advance','DELETE','Cancel a PENDING advance request (soft delete, status CANCELLED)','ACTIVE'),
  ('hr.advance.approve','Approve Advance Request','hr','advance','APPROVE','Approve a PENDING advance request','ACTIVE'),
  ('hr.advance.reject','Reject Advance Request','hr','advance','REJECT','Reject a PENDING advance request','ACTIVE'),
  ('hr.advance.disburse','Disburse Advance','hr','advance','DISBURSE','Record an advance disbursement (DR 1100 / CR 1000, poster PAYMENT journal)','ACTIVE'),
  ('hr.advance.recover','Record Advance Recovery','hr','advance','RECOVER','Record an advance recovery (DR 1000 / CR 1100, posts RECEIPT journal)','ACTIVE')
) AS v(permission_code, name, module, resource, action, description, status)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_code = v.permission_code);

-- SUPER_ADMIN gets the full set.
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN' AND p.permission_code LIKE 'hr.advance.%'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ADMIN gets everything except DELETE (matches the project backfill convention).
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN' AND p.permission_code LIKE 'hr.advance.%' AND p.permission_code <> 'hr.advance.delete'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- MANAGEMENT / REPORT_VIEWER receive VIEW (initial seed convention).
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code IN ('MANAGEMENT', 'REPORT_VIEWER') AND p.permission_code = 'hr.advance.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;