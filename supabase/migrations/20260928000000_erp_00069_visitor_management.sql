-- ERP-00069: Visitor Management foundation — Location master + Visitor Entry
-- Migration: 20260928000000_erp_00069_visitor_management.sql
-- Prompt #17 (Phase 1: foundation + visitor entry only).
--
-- WHY A NEW `locations` TABLE
--   The only existing "location" master is `warehouse_locations`, which hangs
--   off a WAREHOUSE (warehouse_locations.warehouse_id) and carries no division.
--   Visitor Management needs the hierarchy  Company → Division → Location, and
--   the brief explicitly forbids repurposing Branch / Warehouse / Store /
--   Department masters to represent visitor locations. Nothing is renamed,
--   dropped or altered: this is purely additive.
--
-- NO DATA IS SEEDED
--   No location rows and no fake divisions (e.g. "Nooriabad") are created here.
--   Locations are created through the Locations master UI/API by an authorised
--   user once the real organizational relationship is confirmed.
--
-- CONVENTIONS
--   Same audit-column block as every other table (id / created_at / updated_at /
--   created_by / updated_by / is_active / status), idempotent (`IF NOT EXISTS`),
--   `update_updated_at_column()` trigger, RLS via erp_core.company_in_scope().
--
-- FUTURE PHASES (not implemented now)
--   time_out stays NULL until Prompt #18; `status` already accepts the values
--   Prompt #18/19/20 will use so no ALTER TABLE is required later.
--   Slip/signature (19), dashboards (20) reuse these tables as-is.
--
-- ROLLBACK (see the comment at the end of this file).

-- =====================================================
-- 1. LOCATIONS  (Company → Division → Location)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN NOT NULL DEFAULT true,
    company_id UUID NOT NULL REFERENCES public.companies(id),
    division_id UUID NOT NULL REFERENCES public.divisions(id),
    location_code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    -- Same scoping as divisions/sections/departments: codes are unique per company.
    CONSTRAINT uq_locations_code_company UNIQUE (location_code, company_id)
);

CREATE INDEX IF NOT EXISTS idx_locations_company ON public.locations(company_id);
CREATE INDEX IF NOT EXISTS idx_locations_division ON public.locations(division_id);
CREATE INDEX IF NOT EXISTS idx_locations_status ON public.locations(status);

-- =====================================================
-- 2. VISITOR ENTRIES
-- =====================================================
--   time_out      : nullable on purpose — Prompt #18 writes it.
--   status        : PENDING is what Prompt #17 creates; the CHECK already
--                   covers the values the next phases need.
--   host_*        : FK to the existing employee master (hr_employees) plus a
--                   name snapshot so an old entry still reads correctly after
--                   the employee record is renamed or archived.
--   photo_path    : path inside STORAGE_PATH (NOT a public URL). The photo is
--                   served only through the authorised GET .../photo endpoint.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.visitor_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN NOT NULL DEFAULT true,
    company_id UUID NOT NULL REFERENCES public.companies(id),
    division_id UUID NOT NULL REFERENCES public.divisions(id),
    location_id UUID NOT NULL REFERENCES public.locations(id),
    visitor_name VARCHAR(255) NOT NULL,
    cnic VARCHAR(20),
    mobile VARCHAR(20),
    visitor_company VARCHAR(255),
    host_employee_id UUID REFERENCES public.hr_employees(id) ON DELETE SET NULL,
    host_name_snapshot VARCHAR(255),
    photo_path VARCHAR(500),
    photo_mime VARCHAR(100),
    time_in TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    time_out TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'INSIDE', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT chk_visitor_time_out_after_time_in CHECK (time_out IS NULL OR time_out >= time_in)
);

CREATE INDEX IF NOT EXISTS idx_visitor_entries_company ON public.visitor_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_visitor_entries_division ON public.visitor_entries(division_id);
CREATE INDEX IF NOT EXISTS idx_visitor_entries_location ON public.visitor_entries(location_id);
CREATE INDEX IF NOT EXISTS idx_visitor_entries_status ON public.visitor_entries(status);
CREATE INDEX IF NOT EXISTS idx_visitor_entries_time_in ON public.visitor_entries(time_in DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_entries_host ON public.visitor_entries(host_employee_id);
-- Gate register lookup ("who is still inside today") without scanning personal data.
CREATE INDEX IF NOT EXISTS idx_visitor_entries_division_time_in
    ON public.visitor_entries(division_id, time_in DESC);

-- =====================================================
-- 3. updated_at TRIGGER (mirrors ERP-00065)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        DROP TRIGGER IF EXISTS trg_locations_updated_at ON public.locations;
        CREATE TRIGGER trg_locations_updated_at
            BEFORE UPDATE ON public.locations
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

        DROP TRIGGER IF EXISTS trg_visitor_entries_updated_at ON public.visitor_entries;
        CREATE TRIGGER trg_visitor_entries_updated_at
            BEFORE UPDATE ON public.visitor_entries
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- =====================================================
-- 4. RLS (mirrors the company-scoped data tables)
-- =====================================================
--   Authorisation is enforced by the NestJS service layer (Prompt #17 §11);
--   RLS only stops PostgREST from bypassing it.
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'company_in_scope') THEN
        ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS locations_select ON public.locations;
        CREATE POLICY locations_select ON public.locations FOR SELECT USING (erp_core.company_in_scope(company_id));
        DROP POLICY IF EXISTS locations_insert ON public.locations;
        CREATE POLICY locations_insert ON public.locations FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
        DROP POLICY IF EXISTS locations_update ON public.locations;
        CREATE POLICY locations_update ON public.locations FOR UPDATE USING (erp_core.company_in_scope(company_id));
        DROP POLICY IF EXISTS locations_delete ON public.locations;
        CREATE POLICY locations_delete ON public.locations FOR DELETE USING (erp_core.company_in_scope(company_id));

        ALTER TABLE public.visitor_entries ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS visitor_entries_select ON public.visitor_entries;
        CREATE POLICY visitor_entries_select ON public.visitor_entries FOR SELECT USING (erp_core.company_in_scope(company_id));
        DROP POLICY IF EXISTS visitor_entries_insert ON public.visitor_entries;
        CREATE POLICY visitor_entries_insert ON public.visitor_entries FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
        DROP POLICY IF EXISTS visitor_entries_update ON public.visitor_entries;
        CREATE POLICY visitor_entries_update ON public.visitor_entries FOR UPDATE USING (erp_core.company_in_scope(company_id));
        DROP POLICY IF EXISTS visitor_entries_delete ON public.visitor_entries;
        CREATE POLICY visitor_entries_delete ON public.visitor_entries FOR DELETE USING (erp_core.company_in_scope(company_id));
    END IF;
END $$;

-- =====================================================
-- 5. PERMISSIONS  (existing <module>.<resource>.<action> convention)
-- =====================================================
--   Purely additive: WHERE NOT EXISTS + ON CONFLICT DO NOTHING, so no existing
--   user, role or permission is changed or removed.
-- =====================================================
INSERT INTO permissions (permission_code, name, module, resource, action, description, status)
SELECT * FROM (VALUES
  ('visitor.entry.view','View Visitor Entries','visitor','entry','VIEW','View the visitor list and visitor detail records','ACTIVE'),
  ('visitor.entry.create','Create Visitor Entry','visitor','entry','CREATE','Register a visitor: server-generated Time-In, status PENDING','ACTIVE'),
  ('location.view','View Locations','organization','location','VIEW','View division locations used by Visitor Management','ACTIVE'),
  ('location.create','Create Location','organization','location','CREATE','Create a location under a division','ACTIVE'),
  ('location.update','Update Location','organization','location','UPDATE','Update a location''s code, name or status','ACTIVE'),
  ('location.delete','Delete Location','organization','location','DELETE','Delete an unused location','ACTIVE')
) AS v(permission_code, name, module, resource, action, description, status)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_code = v.permission_code);

-- SUPER_ADMIN gets everything.
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN'
  AND p.permission_code IN ('visitor.entry.view','visitor.entry.create','location.view','location.create','location.update','location.delete')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ADMIN gets everything except DELETE (project backfill convention).
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN'
  AND p.permission_code IN ('visitor.entry.view','visitor.entry.create','location.view','location.create','location.update')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- MANAGEMENT can run the gate and read locations.
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'MANAGEMENT'
  AND p.permission_code IN ('visitor.entry.view','visitor.entry.create','location.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- REPORT_VIEWER is read-only (VIEW permissions only).
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'REPORT_VIEWER'
  AND p.permission_code IN ('visitor.entry.view','location.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- VERIFY (read-only)
--   SELECT table_name FROM information_schema.tables
--    WHERE table_name IN ('locations','visitor_entries');
--   SELECT permission_code FROM permissions WHERE permission_code LIKE 'visitor%'
--      OR permission_code = 'location.view';
--   SELECT count(*) FROM locations;            -- expect 0: nothing is seeded
--   SELECT count(*) FROM visitor_entries;      -- expect 0
--
-- ROLLBACK
--   DROP TABLE IF EXISTS public.visitor_entries;
--   DROP TABLE IF EXISTS public.locations;
--   DELETE FROM role_permissions WHERE permission_id IN
--     (SELECT id FROM permissions WHERE permission_code IN
--       ('visitor.entry.view','visitor.entry.create','location.view',
--        'location.create','location.update','location.delete'));
--   DELETE FROM permissions WHERE permission_code IN
--     ('visitor.entry.view','visitor.entry.create','location.view',
--      'location.create','location.update','location.delete');
-- =====================================================
