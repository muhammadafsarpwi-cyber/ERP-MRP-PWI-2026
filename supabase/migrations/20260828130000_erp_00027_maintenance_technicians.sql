-- ============================================================================
-- ERP-00027: Maintenance Technician Master + Job Card Technician linkage
-- Migration: 20260828130000_erp_00027_maintenance_technicians.sql
--
-- Introduces a Technician Master (maintenance_technicians) that the Job Card
-- Assignment flow references via a new nullable technician_id FK on
-- maintenance_job_card_technicians. The existing technician_user_id column is
-- KEPT for backward compatibility and continues to work for older rows.
--
-- Non-breaking architecture:
--   maintenance_technicians
--             |  technician_id (NEW FK)
--             v
--   maintenance_job_card_technicians
--             |  technician_user_id (KEPT, now nullable)
--             v
--   erp_users
--
-- Notes:
--   * technician_user_id is made NULLABLE so an unlinked Technician Master
--     record (user_id NULL) can still be assigned; the master row remains the
--     authoritative reference.
--   * Existing assignment rows (technician_user_id only, technician_id NULL)
--     remain valid.
--   * Seed only uses real employee codes with user_id = NULL (no fabricated
--     ERP user UUIDs).
-- ============================================================================

BEGIN;

-- =====================================================
-- 1. TECHNICIAN MASTER
-- =====================================================
CREATE TABLE IF NOT EXISTS maintenance_technicians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES erp_users(id),
    updated_by UUID REFERENCES erp_users(id),
    is_active BOOLEAN DEFAULT true,

    employee_id VARCHAR(50) NOT NULL,
    technician_name VARCHAR(255) NOT NULL,
    department VARCHAR(100) DEFAULT 'Maintenance',
    skill VARCHAR(100),
    shift VARCHAR(50),
    status VARCHAR(30) DEFAULT 'ACTIVE',
    user_id UUID REFERENCES erp_users(id),
    remarks TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mt_employee_id ON maintenance_technicians(employee_id);
CREATE INDEX IF NOT EXISTS idx_mt_status ON maintenance_technicians(status);
CREATE INDEX IF NOT EXISTS idx_mt_department ON maintenance_technicians(department);
CREATE INDEX IF NOT EXISTS idx_mt_skill ON maintenance_technicians(skill);
CREATE INDEX IF NOT EXISTS idx_mt_user_id ON maintenance_technicians(user_id);
CREATE INDEX IF NOT EXISTS idx_mt_is_active ON maintenance_technicians(is_active);

-- =====================================================
-- 2. JOB CARD TECHNICIAN LINKAGE (non-breaking)
-- =====================================================
ALTER TABLE maintenance_job_card_technicians
    ADD COLUMN IF NOT EXISTS technician_id UUID;

ALTER TABLE maintenance_job_card_technicians
    ADD COLUMN IF NOT EXISTS remarks TEXT;

-- Allow unlinked technicians (user_id NULL) while keeping technician_user_id.
ALTER TABLE maintenance_job_card_technicians
    ALTER COLUMN technician_user_id DROP NOT NULL;

ALTER TABLE maintenance_job_card_technicians
    DROP CONSTRAINT IF EXISTS fk_mjct_technician;
ALTER TABLE maintenance_job_card_technicians
    ADD CONSTRAINT fk_mjct_technician
    FOREIGN KEY (technician_id) REFERENCES maintenance_technicians(id);

CREATE INDEX IF NOT EXISTS idx_mjct_technician_id ON maintenance_job_card_technicians(technician_id);

-- Prevent the same technician being assigned twice to the same job card.
-- (NULL technician_id rows are treated as distinct by PostgreSQL.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_mjct_job_technician
    ON maintenance_job_card_technicians(job_card_id, technician_id);

-- =====================================================
-- 2b. JOB CARD -> TEAM (nullable, persisted on assignment)
-- =====================================================
ALTER TABLE maintenance_job_cards
    ADD COLUMN IF NOT EXISTS team_id UUID;

ALTER TABLE maintenance_job_cards
    DROP CONSTRAINT IF EXISTS fk_mjc_team;
ALTER TABLE maintenance_job_cards
    ADD CONSTRAINT fk_mjc_team
    FOREIGN KEY (team_id) REFERENCES maintenance_teams(id);

CREATE INDEX IF NOT EXISTS idx_mjc_team_id ON maintenance_job_cards(team_id);

-- =====================================================
-- 3. PERMISSIONS
-- =====================================================
INSERT INTO permissions (permission_code, name, module, resource, action, description, status) VALUES
    ('maintenance.technician.view', 'View Technicians', 'maintenance', 'technician', 'VIEW', 'View maintenance technicians master', 'ACTIVE'),
    ('maintenance.technician.manage', 'Manage Technicians', 'maintenance', 'technician', 'MANAGE', 'Create, update, deactivate maintenance technicians', 'ACTIVE')
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN' AND p.module = 'maintenance' AND p.resource = 'technician'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'MANAGEMENT' AND p.module = 'maintenance' AND p.resource = 'technician' AND p.action = 'VIEW'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- 4. SEED: EMP001-EMP007 (user_id = NULL, linked later)
-- =====================================================
INSERT INTO maintenance_technicians (employee_id, technician_name, department, skill, shift, status, remarks)
VALUES
    ('EMP001', 'ASHRAF',  'Maintenance', 'Mechanical',      'General', 'ACTIVE', 'Mechanical technician'),
    ('EMP002', 'MEHMOUD', 'Maintenance', 'Mechanical',      'General', 'ACTIVE', 'Mechanical technician'),
    ('EMP003', 'MOEES',   'Maintenance', 'Mechanical',      'General', 'ACTIVE', 'Mechanical technician'),
    ('EMP004', 'ARIF',    'Maintenance', 'Instrumentation', 'General', 'ACTIVE', 'Instrumentation technician'),
    ('EMP005', 'JAVED',   'Maintenance', 'Mechanical',      'General', 'ACTIVE', 'Mechanical technician'),
    ('EMP006', 'ARSALAN', 'Maintenance', 'Electrical',      'General', 'ACTIVE', 'Electrical technician'),
    ('EMP007', 'ZUBAIR',  'Maintenance', 'Mechanical',      'General', 'ACTIVE', 'Mechanical technician')
ON CONFLICT (employee_id) DO NOTHING;

COMMIT;
