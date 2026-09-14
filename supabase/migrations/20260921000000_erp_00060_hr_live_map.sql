-- ERP HR-05: HR Live Map view permission
-- Migration: 20260921000000_erp_00060_hr_live_map.sql
-- Purpose: Grants view access to the HR Live Map page when the employee's
--          attendance presence + location status is read through
--          GET /hr/live-map and GET /hr/live-map/options.
--
-- REAL-DATA NOTE: the HR module has NO geo-location source yet, so this page
-- reports truthful "no location" states (NO_LOCATION) and real attendance
-- presence. This migration only seeds the permission — NO table and NO demo
-- location data are created (there is no location table to add data to, and
-- fabricating coordinates is explicitly forbidden by the feature policy).
--
-- The permission follows the existing hr.* convention (module = 'hr',
-- resource = 'live_map', action = 'VIEW') and is seeded idempotently.

INSERT INTO permissions (permission_code, name, module, resource, action, description, status)
SELECT * FROM (VALUES
  ('hr.live_map.view','View Live Map','hr','live_map','VIEW','View current workforce presence and location status on the HR Live Map','ACTIVE')
) AS v(permission_code, name, module, resource, action, description, status)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_code = v.permission_code);

-- SUPER_ADMIN / ADMIN receive the read view (the only action that exists).
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code IN ('SUPER_ADMIN', 'ADMIN') AND p.permission_code = 'hr.live_map.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- MANAGEMENT / REPORT_VIEWER receive VIEW (initial seed convention).
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code IN ('MANAGEMENT', 'REPORT_VIEWER') AND p.permission_code = 'hr.live_map.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;