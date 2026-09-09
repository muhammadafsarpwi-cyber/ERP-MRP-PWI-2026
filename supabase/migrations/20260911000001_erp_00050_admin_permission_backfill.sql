-- Migration: Grant ADMIN all missing non-DELETE permissions
-- Purpose: ADMIN role was only granted permissions from the initial migration (20260818130000).
-- Subsequent migrations added permissions but only granted them to SUPER_ADMIN,
-- leaving ADMIN without access to many modules. This migration backfills ADMIN
-- with all missing non-DELETE permissions to restore the intended access model.
-- Pattern: ADMIN gets everything except DELETE (matching the initial seed convention).

-- =====================================================
-- ITEM MODULE (from 20260819100000 - had no role_permissions insert)
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN'
  AND p.module = 'item'
  AND p.action NOT IN ('DELETE')
  AND p.status = 'ACTIVE'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- INVENTORY MODULE (from 20260819140000 - only granted to INVENTORY role)
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN'
  AND p.module = 'inventory'
  AND p.action NOT IN ('DELETE')
  AND p.status = 'ACTIVE'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- MANUFACTURING MODULE (from multiple migrations - only granted to SUPER_ADMIN)
-- Covers: bom, bom_line, routing, routing_operation, production (orders, operations, entries, planning),
--         machine, machine_target, operation, material_receiving, material_return
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN'
  AND p.module = 'manufacturing'
  AND p.action NOT IN ('DELETE')
  AND p.status = 'ACTIVE'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- FINANCE MODULE (from 20260830000000 - only granted to SUPER_ADMIN)
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN'
  AND p.module = 'finance'
  AND p.action NOT IN ('DELETE')
  AND p.status = 'ACTIVE'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- HR MODULE (from 20260830010000 - only granted to SUPER_ADMIN)
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN'
  AND p.module = 'hr'
  AND p.action NOT IN ('DELETE')
  AND p.status = 'ACTIVE'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- QC MODULE (from 20260830020000 - only granted to SUPER_ADMIN)
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN'
  AND p.module = 'qc'
  AND p.action NOT IN ('DELETE')
  AND p.status = 'ACTIVE'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- NOTIFICATIONS MODULE (from 20260831020000 - only granted to SUPER_ADMIN)
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN'
  AND p.module = 'notifications'
  AND p.action NOT IN ('DELETE')
  AND p.status = 'ACTIVE'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- COMMUNICATION MODULE (from 20260831030000 - only granted to SUPER_ADMIN)
-- NOTE: Communication permissions use module='communication' with resource prefixes
--       like 'email_settings', 'email_templates', 'email_logs', 'whatsapp_*'
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN'
  AND p.module = 'communication'
  AND p.action NOT IN ('DELETE')
  AND p.status = 'ACTIVE'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- ITEM ROUTE TYPE (from TypeORM migration 1789000000000)
-- These permissions may have been added via TypeORM, ensure ADMIN has them
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN'
  AND p.permission_code LIKE 'item_route_type.%'
  AND p.action NOT IN ('DELETE')
  AND p.status = 'ACTIVE'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- MANAGEMENT ROLE: Grant VIEW permissions for all modules
-- (Management should be able to view all modules per the initial seed convention)
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'MANAGEMENT'
  AND p.action IN ('VIEW', 'VIEW_REPORTS')
  AND p.status = 'ACTIVE'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- REPORT_VIEWER: Grant all VIEW permissions
-- (Already handled in initial seed, but ensure completeness for new modules)
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'REPORT_VIEWER'
  AND p.action IN ('VIEW', 'VIEW_REPORTS')
  AND p.status = 'ACTIVE'
ON CONFLICT (role_id, permission_id) DO NOTHING;
