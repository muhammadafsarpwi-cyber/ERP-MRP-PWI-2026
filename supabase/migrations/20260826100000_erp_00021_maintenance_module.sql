-- ============================================================================
-- ERP-00021: Maintenance / Job Card Module
-- Migration: 20260826100000_erp_00021_maintenance_module.sql
-- Description: Creates 13 maintenance tables, permissions, and seed data
-- ============================================================================

-- =====================================================
-- 1. COMPLAINT CATEGORIES
-- =====================================================
CREATE TABLE IF NOT EXISTS maintenance_complaint_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    company_id UUID REFERENCES companies(id),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mcc_company_id ON maintenance_complaint_categories(company_id);
CREATE INDEX IF NOT EXISTS idx_mcc_is_active ON maintenance_complaint_categories(is_active);

-- =====================================================
-- 2. ROOT CAUSE CATEGORIES
-- =====================================================
CREATE TABLE IF NOT EXISTS maintenance_root_cause_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    company_id UUID REFERENCES companies(id),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mrcc_company_id ON maintenance_root_cause_categories(company_id);

-- =====================================================
-- 3. FAILURE CATEGORIES
-- =====================================================
CREATE TABLE IF NOT EXISTS maintenance_failure_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    company_id UUID REFERENCES companies(id),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mfc_company_id ON maintenance_failure_categories(company_id);

-- =====================================================
-- 4. MAINTENANCE TEAMS
-- =====================================================
CREATE TABLE IF NOT EXISTS maintenance_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    department_id UUID REFERENCES departments(id)
);

CREATE INDEX IF NOT EXISTS idx_mt_company_id ON maintenance_teams(company_id);
CREATE INDEX IF NOT EXISTS idx_mt_is_active ON maintenance_teams(is_active);

-- =====================================================
-- 5. MAINTENANCE TEAM MEMBERS
-- =====================================================
CREATE TABLE IF NOT EXISTS maintenance_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    team_id UUID NOT NULL REFERENCES maintenance_teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES erp_users(id),
    role VARCHAR(50) DEFAULT 'MEMBER',
    is_active BOOLEAN DEFAULT true,
    UNIQUE(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mtm_team_id ON maintenance_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_mtm_user_id ON maintenance_team_members(user_id);

-- =====================================================
-- 6. MAINTENANCE JOB CARDS
-- =====================================================
CREATE TABLE IF NOT EXISTS maintenance_job_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES erp_users(id),
    updated_by UUID REFERENCES erp_users(id),
    is_active BOOLEAN DEFAULT true,

    company_id UUID NOT NULL REFERENCES companies(id),
    job_card_no VARCHAR(30) NOT NULL,

    machine_id UUID NOT NULL REFERENCES machines(id),

    assigned_department_id UUID REFERENCES departments(id),

    complaint_category_id UUID REFERENCES maintenance_complaint_categories(id),
    complaint TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'MEDIUM',
    requested_by UUID REFERENCES erp_users(id),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    description TEXT,
    diagnosis TEXT,
    root_cause_category_id UUID REFERENCES maintenance_root_cause_categories(id),
    failure_category_id UUID REFERENCES maintenance_failure_categories(id),
    corrective_action TEXT,
    preventive_action TEXT,

    current_status VARCHAR(30) DEFAULT 'OPEN',
    assigned_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    verified_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,

    started_by UUID REFERENCES erp_users(id),
    completed_by UUID REFERENCES erp_users(id),
    closed_by UUID REFERENCES erp_users(id),
    verified_by UUID REFERENCES erp_users(id),
    approved_by UUID REFERENCES erp_users(id),

    downtime_start TIMESTAMP WITH TIME ZONE,
    downtime_end TIMESTAMP WITH TIME ZONE,
    downtime_minutes INTEGER,

    remarks TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mjc_job_card_no ON maintenance_job_cards(job_card_no);
CREATE INDEX IF NOT EXISTS idx_mjc_company_id ON maintenance_job_cards(company_id);
CREATE INDEX IF NOT EXISTS idx_mjc_machine_id ON maintenance_job_cards(machine_id);
CREATE INDEX IF NOT EXISTS idx_mjc_current_status ON maintenance_job_cards(current_status);
CREATE INDEX IF NOT EXISTS idx_mjc_priority ON maintenance_job_cards(priority);
CREATE INDEX IF NOT EXISTS idx_mjc_requested_at ON maintenance_job_cards(requested_at);
CREATE INDEX IF NOT EXISTS idx_mjc_assigned_department_id ON maintenance_job_cards(assigned_department_id);
CREATE INDEX IF NOT EXISTS idx_mjc_complaint_category_id ON maintenance_job_cards(complaint_category_id);
CREATE INDEX IF NOT EXISTS idx_mjc_is_active ON maintenance_job_cards(is_active);

-- =====================================================
-- 7. JOB CARD TECHNICIANS
-- =====================================================
CREATE TABLE IF NOT EXISTS maintenance_job_card_technicians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    job_card_id UUID NOT NULL REFERENCES maintenance_job_cards(id) ON DELETE CASCADE,
    technician_user_id UUID NOT NULL REFERENCES erp_users(id),
    role VARCHAR(50) DEFAULT 'PRIMARY',
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(job_card_id, technician_user_id)
);

CREATE INDEX IF NOT EXISTS idx_mjct_job_card_id ON maintenance_job_card_technicians(job_card_id);
CREATE INDEX IF NOT EXISTS idx_mjct_technician_user_id ON maintenance_job_card_technicians(technician_user_id);

-- =====================================================
-- 8. JOB CARD PARTS
-- =====================================================
CREATE TABLE IF NOT EXISTS maintenance_job_card_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    job_card_id UUID NOT NULL REFERENCES maintenance_job_cards(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id),
    quantity DECIMAL(15,4) NOT NULL,
    uom_id UUID NOT NULL REFERENCES uoms(id),
    unit_cost DECIMAL(15,4),
    total_cost DECIMAL(15,4),
    issued_from UUID REFERENCES warehouses(id),
    issued_at TIMESTAMP WITH TIME ZONE,
    issued_by UUID REFERENCES erp_users(id),
    returned_quantity DECIMAL(15,4) DEFAULT 0,
    remarks TEXT
);

CREATE INDEX IF NOT EXISTS idx_mjcp_job_card_id ON maintenance_job_card_parts(job_card_id);
CREATE INDEX IF NOT EXISTS idx_mjcp_item_id ON maintenance_job_card_parts(item_id);

-- =====================================================
-- 9. JOB CARD ATTACHMENTS
-- =====================================================
CREATE TABLE IF NOT EXISTS maintenance_job_card_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_card_id UUID NOT NULL REFERENCES maintenance_job_cards(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100),
    file_size INTEGER,
    uploaded_by UUID REFERENCES erp_users(id),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT
);

CREATE INDEX IF NOT EXISTS idx_mjca_job_card_id ON maintenance_job_card_attachments(job_card_id);

-- =====================================================
-- 10. JOB CARD STATUS HISTORY
-- =====================================================
CREATE TABLE IF NOT EXISTS maintenance_job_card_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_card_id UUID NOT NULL REFERENCES maintenance_job_cards(id) ON DELETE CASCADE,
    from_status VARCHAR(30),
    to_status VARCHAR(30) NOT NULL,
    changed_by UUID REFERENCES erp_users(id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    remarks TEXT
);

CREATE INDEX IF NOT EXISTS idx_mjcsh_job_card_id ON maintenance_job_card_status_history(job_card_id);
CREATE INDEX IF NOT EXISTS idx_mjcsh_changed_at ON maintenance_job_card_status_history(changed_at);

-- =====================================================
-- 11. JOB CARD WORK LOGS
-- =====================================================
CREATE TABLE IF NOT EXISTS maintenance_job_card_work_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    job_card_id UUID NOT NULL REFERENCES maintenance_job_cards(id) ON DELETE CASCADE,
    technician_user_id UUID NOT NULL REFERENCES erp_users(id),
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER,
    work_description TEXT NOT NULL,
    remarks TEXT
);

CREATE INDEX IF NOT EXISTS idx_mjcw_job_card_id ON maintenance_job_card_work_logs(job_card_id);

-- =====================================================
-- 12. PM PLANS
-- =====================================================
CREATE TABLE IF NOT EXISTS maintenance_pm_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES erp_users(id),
    updated_by UUID REFERENCES erp_users(id),
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    plan_code VARCHAR(50) NOT NULL,
    plan_name VARCHAR(255) NOT NULL,
    description TEXT,
    machine_id UUID NOT NULL REFERENCES machines(id),
    frequency_type VARCHAR(30) NOT NULL,
    frequency_value INTEGER NOT NULL,
    checklist JSONB,
    assigned_team_id UUID REFERENCES maintenance_teams(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mpp_plan_code ON maintenance_pm_plans(plan_code);
CREATE INDEX IF NOT EXISTS idx_mpp_company_id ON maintenance_pm_plans(company_id);
CREATE INDEX IF NOT EXISTS idx_mpp_machine_id ON maintenance_pm_plans(machine_id);

-- =====================================================
-- 13. PM SCHEDULES
-- =====================================================
CREATE TABLE IF NOT EXISTS maintenance_pm_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    pm_plan_id UUID NOT NULL REFERENCES maintenance_pm_plans(id) ON DELETE CASCADE,
    machine_id UUID NOT NULL REFERENCES machines(id),
    scheduled_date DATE NOT NULL,
    generated_job_card_id UUID REFERENCES maintenance_job_cards(id),
    status VARCHAR(30) DEFAULT 'SCHEDULED',
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_mps_pm_plan_id ON maintenance_pm_schedules(pm_plan_id);
CREATE INDEX IF NOT EXISTS idx_mps_machine_id ON maintenance_pm_schedules(machine_id);
CREATE INDEX IF NOT EXISTS idx_mps_scheduled_date ON maintenance_pm_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_mps_status ON maintenance_pm_schedules(status);

-- =====================================================
-- SEED DATA: Maintenance Permissions
-- =====================================================
INSERT INTO permissions (permission_code, name, module, resource, action, description, status) VALUES
    -- Job Card permissions
    ('maintenance.job_card.view', 'View Job Cards', 'maintenance', 'job_card', 'VIEW', 'View maintenance job cards', 'ACTIVE'),
    ('maintenance.job_card.create', 'Create Job Cards', 'maintenance', 'job_card', 'CREATE', 'Create maintenance job cards', 'ACTIVE'),
    ('maintenance.job_card.update', 'Update Job Cards', 'maintenance', 'job_card', 'UPDATE', 'Update maintenance job cards', 'ACTIVE'),
    ('maintenance.job_card.delete', 'Delete Job Cards', 'maintenance', 'job_card', 'DELETE', 'Delete maintenance job cards', 'ACTIVE'),
    ('maintenance.job_card.assign', 'Assign Job Cards', 'maintenance', 'job_card', 'ASSIGN', 'Assign technicians to job cards', 'ACTIVE'),
    ('maintenance.job_card.start', 'Start Job Cards', 'maintenance', 'job_card', 'START', 'Start working on job cards', 'ACTIVE'),
    ('maintenance.job_card.hold', 'Hold Job Cards', 'maintenance', 'job_card', 'HOLD', 'Put job cards on hold', 'ACTIVE'),
    ('maintenance.job_card.complete', 'Complete Job Cards', 'maintenance', 'job_card', 'COMPLETE', 'Mark job cards as completed', 'ACTIVE'),
    ('maintenance.job_card.close', 'Close Job Cards', 'maintenance', 'job_card', 'CLOSE', 'Close completed job cards', 'ACTIVE'),
    ('maintenance.job_card.verify', 'Verify Job Cards', 'maintenance', 'job_card', 'VERIFY', 'Verify completed job cards', 'ACTIVE'),
    ('maintenance.job_card.approve', 'Approve Job Cards', 'maintenance', 'job_card', 'APPROVE', 'Approve verified job cards', 'ACTIVE'),
    ('maintenance.job_card.reject', 'Reject Job Cards', 'maintenance', 'job_card', 'REJECT', 'Reject job cards', 'ACTIVE'),
    -- Team permissions
    ('maintenance.team.view', 'View Teams', 'maintenance', 'team', 'VIEW', 'View maintenance teams', 'ACTIVE'),
    ('maintenance.team.manage', 'Manage Teams', 'maintenance', 'team', 'MANAGE', 'Create, update, delete maintenance teams', 'ACTIVE'),
    -- Category permissions
    ('maintenance.category.view', 'View Categories', 'maintenance', 'category', 'VIEW', 'View maintenance categories', 'ACTIVE'),
    ('maintenance.category.manage', 'Manage Categories', 'maintenance', 'category', 'MANAGE', 'Manage maintenance categories', 'ACTIVE'),
    -- PM permissions
    ('maintenance.pm.view', 'View PM Plans', 'maintenance', 'pm', 'VIEW', 'View preventive maintenance plans', 'ACTIVE'),
    ('maintenance.pm.manage', 'Manage PM Plans', 'maintenance', 'pm', 'MANAGE', 'Manage preventive maintenance plans', 'ACTIVE'),
    -- Reports
    ('maintenance.reports.view', 'View Maintenance Reports', 'maintenance', 'reports', 'VIEW', 'View maintenance reports', 'ACTIVE')
ON CONFLICT (permission_code) DO NOTHING;

-- =====================================================
-- SEED DATA: Assign maintenance permissions to ADMIN and MANAGEMENT roles
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN' AND p.module = 'maintenance' AND p.action != 'DELETE'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'MANAGEMENT' AND p.module = 'maintenance' AND p.action IN ('VIEW', 'UPDATE', 'ASSIGN', 'APPROVE', 'VERIFY', 'CLOSE')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'PRODUCTION' AND p.module = 'maintenance' AND p.action IN ('VIEW', 'CREATE')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'REPORT_VIEWER' AND p.module = 'maintenance' AND p.action = 'VIEW'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- SEED DATA: Default Complaint Categories
-- =====================================================
INSERT INTO maintenance_complaint_categories (code, name, description, sort_order) VALUES
    ('MECH', 'Mechanical Failure', 'Mechanical component failure or malfunction', 1),
    ('ELEC', 'Electrical Failure', 'Electrical component failure or malfunction', 2),
    ('INST', 'Instrumentation Failure', 'Instrument or sensor failure', 3),
    ('SOFT', 'Software Issue', 'Software, PLC, or HMI related issue', 4),
    ('LUBE', 'Lubrication', 'Lubrication related issue', 5),
    ('BEAR', 'Bearing Failure', 'Bearing related failure', 6),
    ('MOTR', 'Motor Failure', 'Motor related failure', 7),
    ('SAFE', 'Safety Issue', 'Safety concern or incident', 8),
    ('OTHR', 'Other', 'Other maintenance issue', 9)
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED DATA: Default Root Cause Categories
-- =====================================================
INSERT INTO maintenance_root_cause_categories (code, name, description, sort_order) VALUES
    ('WEAR', 'Wear & Tear', 'Normal wear and tear', 1),
    ('LUBE', 'Improper Lubrication', 'Insufficient or incorrect lubrication', 2),
    ('ELEC', 'Electrical Fault', 'Electrical wiring or component fault', 3),
    ('OPER', 'Operator Error', 'Error caused by machine operator', 4),
    ('OVER', 'Overload', 'Machine operated beyond capacity', 5),
    ('MISL', 'Misalignment', 'Component misalignment', 6),
    ('POOR', 'Poor Installation', 'Issue caused by poor installation', 7),
    ('CONT', 'Contamination', 'Dust, dirt, or fluid contamination', 8),
    ('FATG', 'Metal Fatigue', 'Material fatigue failure', 9),
    ('UNKN', 'Unknown', 'Cause undetermined', 10)
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED DATA: Default Failure Categories
-- =====================================================
INSERT INTO maintenance_failure_categories (code, name, description, sort_order) VALUES
    ('BRKD', 'Breakdown', 'Unplanned machine breakdown', 1),
    ('PRED', 'Predicted', 'Failure predicted by condition monitoring', 2),
    ('DETR', 'Deterioration', 'Gradual performance deterioration', 3),
    ('SAFE', 'Safety', 'Safety-related failure', 4),
    ('ENVN', 'Environmental', 'Environmental condition caused failure', 5),
    ('OTHR', 'Other', 'Other failure type', 6)
ON CONFLICT DO NOTHING;
