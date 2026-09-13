-- ERP HR-01: HR Dashboard & HR Navigation Foundation
-- Migration: 20260919000000_erp_00058_hr_dashboard_view_permission.sql
-- Purpose: Add the dedicated 'hr.dashboard.view' permission so the HR
--          Dashboard API (GET /hr/dashboard) and its sidebar entry follow the
--          same module.permission convention as every other ERP module.
-- Idempotent.

INSERT INTO permissions (permission_code, name, module, resource, action, description, status)
SELECT * FROM (VALUES
  ('hr.dashboard.view','View HR Dashboard','hr','dashboard','VIEW','View HR dashboard KPIs, attendance trend and department distribution','ACTIVE')
) AS v(permission_code, name, module, resource, action, description, status)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_code = v.permission_code);

-- SUPER_ADMIN gets everything (module-wide grant, mirrors initial seed).
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN' AND p.permission_code = 'hr.dashboard.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ADMIN gets all non-DELETE permissions (match 20260911000001 backfill).
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN' AND p.permission_code = 'hr.dashboard.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- MANAGEMENT / REPORT_VIEWER receive VIEW permissions (initial seed convention).
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code IN ('MANAGEMENT', 'REPORT_VIEWER') AND p.permission_code = 'hr.dashboard.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;