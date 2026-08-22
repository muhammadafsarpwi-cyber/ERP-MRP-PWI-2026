-- ============================================================================
-- PROMPT-05: Daily Production Entry & Department-Wise Production Reporting
-- Migration: 20260822000000_erp_00013_daily_production_entry.sql
--
-- Purpose:
--   1. Create smallest reusable manufacturing masters that do not exist yet:
--        - machines            (machine master, scoped to a department)
--        - shifts              (shift master with planned hours per shift)
--        - downtime_reasons    (standardized downtime reason lookup)
--   2. Create production_entries (daily production entry transaction table)
--   3. Create production permissions and grant them to SUPER_ADMIN
--   4. Seed default shifts, downtime reasons and demo machines for SPD/CCD
--
-- Design notes:
--   - production_entries links to the existing Division → Section → Department
--     organization hierarchy (no fake divisions are created).
--   - production_order_id is OPTIONAL: supports both Make-to-Order and
--     Make-to-Stock daily entries.
--   - Target vs Actual are stored separately and never overwrite each other.
--   - Running hours and downtime hours are stored separately; downtime is
--     never included in running hours.
--   - Scrap/rejection quantity is stored separately from actual good output.
--   - UOM is item-driven: uom_id must be valid for the item (validated in
--     service layer using items.base_uom_id / uoms / uom_conversions).
--   - Efficiency assumption (documented): no formal shift calendar exists in
--     this system yet. efficiency = running_hours / planned_hours × 100 where
--     planned_hours comes from the shift master row selected for the entry.
--     If the shift has no planned hours, planned = running + downtime.
--   - Duplicate protection: one ACTIVE entry per
--     (company, department, date, shift, machine, item).
--
-- Safety:
--   - All operations idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING)
--   - No existing tables altered destructively
--   - No data destroyed
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: machines (smallest reusable machine master)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  department_id UUID REFERENCES departments(id),
  machine_code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT uq_machines_company_code UNIQUE (company_id, machine_code)
);

CREATE INDEX IF NOT EXISTS idx_machines_company ON machines (company_id);
CREATE INDEX IF NOT EXISTS idx_machines_department ON machines (department_id);

COMMENT ON TABLE machines IS 'Machine master for daily production entry; optionally scoped to a department.';
COMMENT ON COLUMN machines.status IS 'ACTIVE | INACTIVE | MAINTENANCE | RETIRED (vocabulary owned by erp_00012b base migration)';

DROP TRIGGER IF EXISTS trg_machines_updated_at ON machines;
CREATE TRIGGER trg_machines_updated_at
  BEFORE UPDATE ON machines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: shifts (shift master — replaces hard-coded Shift 1/2/3)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  shift_code VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  start_time TIME,
  end_time TIME,
  planned_hours DECIMAL(5,2) NOT NULL DEFAULT 8,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT uq_shifts_company_code UNIQUE (company_id, shift_code),
  CONSTRAINT ck_shifts_planned_hours CHECK (planned_hours > 0)
);

CREATE INDEX IF NOT EXISTS idx_shifts_company ON shifts (company_id);

COMMENT ON TABLE shifts IS 'Shift master. planned_hours drives the documented efficiency calculation.';
COMMENT ON COLUMN shifts.planned_hours IS 'Scheduled production hours used as denominator of Efficiency %';

DROP TRIGGER IF EXISTS trg_shifts_updated_at ON shifts;
CREATE TRIGGER trg_shifts_updated_at
  BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: downtime_reasons (standardized reason lookup)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS downtime_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT uq_downtime_reasons_company_code UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_downtime_reasons_company ON downtime_reasons (company_id);

COMMENT ON TABLE downtime_reasons IS 'Standardized machine downtime reasons for daily production entry.';

DROP TRIGGER IF EXISTS trg_downtime_reasons_updated_at ON downtime_reasons;
CREATE TRIGGER trg_downtime_reasons_updated_at
  BEFORE UPDATE ON downtime_reasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: production_entries (daily production entry transactions)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS production_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),

  -- Optional Production Order linkage (Make-to-Order); null = Make-to-Stock
  production_order_id UUID REFERENCES production_orders(id),
  production_order_operation_id UUID REFERENCES production_order_operations(id),

  -- Organization context (existing Division → Section → Department hierarchy)
  division_id UUID NOT NULL REFERENCES divisions(id),
  section_id UUID NOT NULL REFERENCES sections(id),
  department_id UUID NOT NULL REFERENCES departments(id),

  -- Day / Shift / Machine / People
  entry_date DATE NOT NULL,
  shift_id UUID NOT NULL REFERENCES shifts(id),
  machine_id UUID REFERENCES machines(id),
  machine_no VARCHAR(50) NOT NULL,
  operator_name VARCHAR(255) NOT NULL,
  supervisor_name VARCHAR(255),

  -- Item context (UOM is item-driven)
  coil_size VARCHAR(50),
  item_id UUID NOT NULL REFERENCES items(id),
  uom_id UUID NOT NULL REFERENCES uoms(id),

  -- Quantities: target never overwritten by actual
  target_quantity DECIMAL(19,4) NOT NULL,
  actual_quantity DECIMAL(19,4) NOT NULL DEFAULT 0,

  -- Calculated metrics (recomputed server-side on save)
  achievement_percentage DECIMAL(7,2) NOT NULL DEFAULT 0,
  efficiency_percentage DECIMAL(7,2) NOT NULL DEFAULT 0,

  -- Time accounting: downtime NEVER inside running hours
  running_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
  downtime_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
  downtime_reason_id UUID REFERENCES downtime_reasons(id),
  downtime_reason TEXT,

  -- Quality: scrap kept separate from actual good output
  scrap_quantity DECIMAL(19,4) NOT NULL DEFAULT 0,

  remarks TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT ck_prod_entries_target_positive CHECK (target_quantity > 0),
  CONSTRAINT ck_prod_entries_actual_nonneg CHECK (actual_quantity >= 0),
  CONSTRAINT ck_prod_entries_scrap_nonneg CHECK (scrap_quantity >= 0),
  CONSTRAINT ck_prod_entries_running_nonneg CHECK (running_hours >= 0),
  CONSTRAINT ck_prod_entries_downtime_nonneg CHECK (downtime_hours >= 0)
);

CREATE INDEX IF NOT EXISTS idx_prod_entries_company ON production_entries (company_id);
CREATE INDEX IF NOT EXISTS idx_prod_entries_date ON production_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_prod_entries_department ON production_entries (department_id);
CREATE INDEX IF NOT EXISTS idx_prod_entries_section ON production_entries (section_id);
CREATE INDEX IF NOT EXISTS idx_prod_entries_division ON production_entries (division_id);
CREATE INDEX IF NOT EXISTS idx_prod_entries_shift ON production_entries (shift_id);
CREATE INDEX IF NOT EXISTS idx_prod_entries_item ON production_entries (item_id);
CREATE INDEX IF NOT EXISTS idx_prod_entries_po ON production_entries (production_order_id);

-- Duplicate / accidental repeated submission protection:
-- one ACTIVE entry per company + department + date + shift + machine + item.
CREATE UNIQUE INDEX IF NOT EXISTS uq_prod_entries_unique_submission
  ON production_entries (company_id, department_id, entry_date, shift_id, machine_no, item_id)
  WHERE is_active = true;

COMMENT ON TABLE production_entries IS 'Daily production entry per department/shift/machine/item. Supports order-driven (production_order_id set) and stock-driven (null) production.';
COMMENT ON COLUMN production_entries.entry_date IS 'Production date (DATE only)';
COMMENT ON COLUMN production_entries.machine_no IS 'Denormalized machine number; resolved from machines master when machine_id given';
COMMENT ON COLUMN production_entries.actual_quantity IS 'Actual GOOD production output; scrap_quantity is recorded separately';
COMMENT ON COLUMN production_entries.achievement_percentage IS 'actual_quantity / target_quantity × 100';
COMMENT ON COLUMN production_entries.efficiency_percentage IS 'running_hours / shift planned_hours × 100 (documented assumption: no formal shift calendar exists)';

DROP TRIGGER IF EXISTS trg_production_entries_updated_at ON production_entries;
CREATE TRIGGER trg_production_entries_updated_at
  BEFORE UPDATE ON production_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: Permissions + SUPER_ADMIN grants
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO permissions (permission_code, name, description, module, resource, action, is_active, created_at, updated_at)
VALUES
  ('manufacturing.production.entries.view',    'View Daily Production Entries',   'View daily production entries',        'manufacturing', 'production-entries', 'view',    true, now(), now()),
  ('manufacturing.production.entries.create',  'Create Daily Production Entries', 'Create daily production entries',      'manufacturing', 'production-entries', 'create',  true, now(), now()),
  ('manufacturing.production.entries.update',  'Update Daily Production Entries', 'Update daily production entries',      'manufacturing', 'production-entries', 'update',  true, now(), now()),
  ('manufacturing.production.entries.delete',  'Delete Daily Production Entries', 'Soft-delete daily production entries', 'manufacturing', 'production-entries', 'delete',  true, now(), now()),
  ('manufacturing.production.entries.report',  'View Production Reports',         'View department-wise production reports', 'manufacturing', 'production-reports', 'report', true, now(), now())
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status, is_active, created_at, updated_at)
SELECT r.id, p.id, 'ACTIVE', true, now(), now()
FROM roles r
JOIN permissions p ON p.permission_code IN (
  'manufacturing.production.entries.view',
  'manufacturing.production.entries.create',
  'manufacturing.production.entries.update',
  'manufacturing.production.entries.delete',
  'manufacturing.production.entries.report'
)
WHERE r.role_code = 'SUPER_ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: Seed data (idempotent)
--   - 3 default shifts with planned hours (efficiency denominator)
--   - Standardized downtime reasons
--   - Demo machines for SPD / CCD production departments
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT id INTO v_company_id FROM companies WHERE company_code = 'COMP-001';

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'COMP-001 not found; skipping seed data';
    RETURN;
  END IF;

  -- Shifts (planned_hours = documented efficiency denominator)
  INSERT INTO shifts (company_id, shift_code, name, start_time, end_time, planned_hours, status, created_at, updated_at)
  VALUES
    (v_company_id, 'SHIFT-1', 'Shift 1 (Morning)',   '06:00', '14:00', 8, 'ACTIVE', now(), now()),
    (v_company_id, 'SHIFT-2', 'Shift 2 (Afternoon)', '14:00', '22:00', 8, 'ACTIVE', now(), now()),
    (v_company_id, 'SHIFT-3', 'Shift 3 (Night)',     '22:00', '06:00', 8, 'ACTIVE', now(), now())
  ON CONFLICT (company_id, shift_code) DO NOTHING;

  -- Standardized downtime reasons
  INSERT INTO downtime_reasons (company_id, code, name, description, status, created_at, updated_at)
  VALUES
    (v_company_id, 'MAINT',    'Machine Maintenance',  'Planned or breakdown maintenance',            'ACTIVE', now(), now()),
    (v_company_id, 'SETUP',    'Setup / Changeover',   'Die change, coil change, size changeover',    'ACTIVE', now(), now()),
    (v_company_id, 'POWER',    'Power Failure',        'Electricity outage or load shedding',         'ACTIVE', now(), now()),
    (v_company_id, 'MATERIAL', 'Material Shortage',    'Waiting for raw material / coils',            'ACTIVE', now(), now()),
    (v_company_id, 'NO_ORDER', 'No Order / Waiting',   'No production order or downstream blockage',  'ACTIVE', now(), now()),
    (v_company_id, 'QUALITY',  'Quality Issue',        'Quality problem stopping the machine',        'ACTIVE', now(), now()),
    (v_company_id, 'MANPOWER', 'Manpower Unavailable', 'Operator absent / no manpower',               'ACTIVE', now(), now()),
    (v_company_id, 'OTHER',    'Other',                'Any other reason (describe in remarks)',      'ACTIVE', now(), now())
  ON CONFLICT (company_id, code) DO NOTHING;

  -- Demo machines per department (SPD + CCD)
  -- PROMPT-07-FIX: canonical Machine Master columns (machine_name; machine_id
  -- auto-assigned by trg_machines_assign_machine_id; hierarchy inherited from
  -- the department). Duplicate guard is dept-scoped to mirror the canonical
  -- uniqueness strategy (codes may repeat ACROSS departments).
  INSERT INTO machines (
    company_id, department_id, division_id, section_id,
    machine_code, machine_name, machine_number, status, created_at, updated_at
  )
  SELECT v_company_id, d.id, d.division_id, d.section_id,
         m.machine_code, m.machine_name,
         REPLACE(m.machine_code, '-', ' # '), 'ACTIVE', now(), now()
  FROM (VALUES
    ('SPD-DEPT001', 'ST-01',  'Straightener Machine 01'),
    ('SPD-DEPT001', 'ST-02',  'Straightener Machine 02'),
    ('SPD-DEPT002', 'SW-01',  'Swagging Machine 01'),
    ('SPD-DEPT002', 'SW-02',  'Swagging Machine 02'),
    ('SPD-DEPT003', 'SPK-01', 'Spoke Machine 01'),
    ('SPD-DEPT003', 'SPK-02', 'Spoke Machine 02'),
    ('SPD-DEPT003', 'SPK-03', 'Spoke Machine 03'),
    ('SPD-DEPT004', 'HD-01',  'Header Machine 01'),
    ('SPD-DEPT004', 'HD-02',  'Header Machine 02'),
    ('SPD-DEPT005', 'NP-01',  'Nipple Machine 01'),
    ('SPD-DEPT005', 'NP-02',  'Nipple Machine 02'),
    ('SPD-DEPT006', 'SPL-01', 'Spoke Plating Line 01'),
    ('SPD-DEPT007', 'NPL-01', 'Nipple Plating Line 01'),
    ('SPD-DEPT008', 'PKS-01', 'Spoke Packing Station 01'),
    ('CCD-DEPT001', 'FL-01',  'Flattening Machine 01'),
    ('CCD-DEPT001', 'FL-02',  'Flattening Machine 02'),
    ('CCD-DEPT002', 'SR-01',  'Spiral Machine 01'),
    ('CCD-DEPT002', 'SR-02',  'Spiral Machine 02'),
    ('CCD-DEPT002', 'SR-03',  'Spiral Machine 03'),
    ('CCD-DEPT003', 'PV-01',  'PVC Coating Line 01'),
    ('CCD-DEPT003', 'PV-02',  'PVC Coating Line 02'),
    ('CCD-DEPT004', 'CPK-01', 'CCD Packing Station 01')
  ) AS m(dept_code, machine_code, machine_name)
  JOIN departments d ON d.department_code = m.dept_code AND d.company_id = v_company_id
  WHERE NOT EXISTS (
    SELECT 1 FROM machines x
    WHERE x.company_id = v_company_id
      AND COALESCE(x.department_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(d.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND LOWER(x.machine_code) = LOWER(m.machine_code)
      AND x.is_active
  );
END $$;

COMMIT;
