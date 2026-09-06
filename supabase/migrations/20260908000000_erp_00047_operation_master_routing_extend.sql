-- =============================================================================
-- ERP-00047: Operation Master + Routing Operation Machine/Operation Links
-- =============================================================================
-- PROMPT-32: Item Production Routing
--
-- Responsibilities (all idempotent, non-destructive):
--   1. Create the Operation Master table (public.operations) — the reusable
--      manufacturing operation definitions that routing steps reference.
--   2. Seed Operation permission codes (manufacturing.operation.*) and grant
--      every active manufacturing permission to the Super Administrator role.
--   3. Extend routing_operations with two nullable foreign keys:
--        - operation_id -> operations(id)  (real Operation Master record)
--        - machine_id   -> machines(id)    (real Machine Master record)
--   4. Backfill: derive Operation Master rows from the distinct operation
--      codes already present in routing_operations (no data loss), then link
--      the existing routing_operations.operation_id to those rows.
--
-- Existing routing_operations rows keep their denormalized operation_code /
-- operation_name columns untouched; only operation_id is augmented.
-- =============================================================================

-- =============================================================================
-- SECTION 1: OPERATION MASTER TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  operation_code VARCHAR(50) NOT NULL,
  operation_name VARCHAR(255) NOT NULL,
  description TEXT,
  division_id UUID REFERENCES divisions(id),
  section_id UUID REFERENCES sections(id),
  department_id UUID REFERENCES departments(id),
  setup_time_minutes DECIMAL(19,4) NOT NULL DEFAULT 0,
  run_time_minutes DECIMAL(19,4) NOT NULL DEFAULT 0,
  queue_time_minutes DECIMAL(19,4) NOT NULL DEFAULT 0,
  wait_time_minutes DECIMAL(19,4) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Business identity: operation code is unique per company among ACTIVE rows
CREATE UNIQUE INDEX IF NOT EXISTS uq_operations_code_company_active
  ON operations (operation_code, company_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_operations_company
  ON operations (company_id);

CREATE INDEX IF NOT EXISTS idx_operations_department
  ON operations (department_id);

CREATE INDEX IF NOT EXISTS idx_operations_status
  ON operations (status);

-- =============================================================================
-- SECTION 2: OPERATION PERMISSIONS + GRANT TO SUPERVISOR ROLE
-- =============================================================================

INSERT INTO permissions (id, permission_code, name, module, resource, action, description, created_at, updated_at, is_active)
VALUES
  (gen_random_uuid(), 'manufacturing.operation.view', 'View Operations', 'manufacturing', 'operation', 'VIEW', 'View operation master records', NOW(), NOW(), true),
  (gen_random_uuid(), 'manufacturing.operation.create', 'Create Operations', 'manufacturing', 'operation', 'CREATE', 'Create operation master records', NOW(), NOW(), true),
  (gen_random_uuid(), 'manufacturing.operation.update', 'Update Operations', 'manufacturing', 'operation', 'UPDATE', 'Update operation master records', NOW(), NOW(), true),
  (gen_random_uuid(), 'manufacturing.operation.delete', 'Delete Operations', 'manufacturing', 'operation', 'DELETE', 'Delete operation master records', NOW(), NOW(), true),
  (gen_random_uuid(), 'manufacturing.operation.change_status', 'Change Operation Status', 'manufacturing', 'operation', 'CHANGE_STATUS', 'Change operation master status', NOW(), NOW(), true)
ON CONFLICT (permission_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Grant all manufacturing permissions to Super Administrator role
DO $$
DECLARE
  v_role_id UUID := 'c37e82cb-5242-4987-a92a-3edb208da6f4';
BEGIN
  INSERT INTO role_permissions (id, role_id, permission_id, created_at, updated_at, is_active)
  SELECT gen_random_uuid(), v_role_id, p.id, NOW(), NOW(), true
  FROM permissions p
  WHERE p.module = 'manufacturing'
    AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
      WHERE rp.role_id = v_role_id
        AND rp.permission_id = p.id
        AND rp.is_active = true
    );
END $$;

-- =============================================================================
-- SECTION 3: EXTEND ROUTING_OPERATIONS WITH OPERATION + MACHINE FK
-- =============================================================================

ALTER TABLE routing_operations
  ADD COLUMN IF NOT EXISTS operation_id UUID REFERENCES operations(id);

ALTER TABLE routing_operations
  ADD COLUMN IF NOT EXISTS machine_id UUID REFERENCES machines(id);

CREATE INDEX IF NOT EXISTS idx_op_operation
  ON routing_operations (operation_id);

CREATE INDEX IF NOT EXISTS idx_op_machine
  ON routing_operations (machine_id);

-- =============================================================================
-- SECTION 4: BACKFILL OPERATION MASTER FROM EXISTING ROUTING OPERATIONS
-- =============================================================================
-- Derives one Operation Master row per distinct (company, operation_code) used
-- by routing operations so existing steps reference real master records.

INSERT INTO operations (company_id, operation_code, operation_name, description,
                        division_id, section_id, department_id,
                        setup_time_minutes, run_time_minutes,
                        queue_time_minutes, wait_time_minutes,
                        status, created_at, updated_at, is_active)
SELECT DISTINCT ON (ro.company_id, ro.operation_code)
  ro.company_id,
  ro.operation_code,
  ro.operation_name,
  ro.remarks,
  ro.division_id,
  ro.section_id,
  ro.department_id,
  ro.setup_time_minutes,
  ro.run_time_minutes,
  ro.queue_time_minutes,
  ro.wait_time_minutes,
  'ACTIVE',
  NOW(),
  NOW(),
  true
FROM routing_operations ro
WHERE ro.operation_code IS NOT NULL
  AND ro.operation_code <> ''
  AND ro.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM operations o
    WHERE o.company_id = ro.company_id
      AND o.operation_code = ro.operation_code
  )
ORDER BY ro.company_id, ro.operation_code;

-- Link existing routing operations to the derived master records
UPDATE routing_operations ro
SET operation_id = o.id
FROM operations o
WHERE ro.company_id = o.company_id
  AND ro.operation_code = o.operation_code
  AND ro.operation_id IS NULL
  AND o.is_active = true;