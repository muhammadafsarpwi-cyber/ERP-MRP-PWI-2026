-- Migration: ERP 00056 - Grant organization VIEW permissions to store roles
-- The store module's material request / issue / return forms load Department
-- records from GET /departments, which is guarded by @RequirePermission('department.view').
-- SUPER_ADMIN / ADMIN / MANAGEMENT / REPORT_VIEWER already receive the
-- organization VIEW permissions from erp_00052 base seeding, but the
-- store-operational roles (INVENTORY, PRODUCTION, PROCUREMENT) did not, which left
-- the Department dropdown empty (403) for those users and forced them to type free
-- text (e.g. 'Flattening') into UUID columns, causing 'departmentId must be a UUID'.
--
-- This migration grants the organization VIEW permissions (company / branch /
-- business_unit / division / section / department / warehouse) to those roles so the
-- Department dropdown renders real records. VIEW is read-only; no write permission
-- is granted. Idempotent: safe to run multiple times.

INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code IN ('INVENTORY', 'PRODUCTION', 'PROCUREMENT')
  AND p.module = 'organization'
  AND p.action = 'VIEW'
ON CONFLICT (role_id, permission_id) DO NOTHING;