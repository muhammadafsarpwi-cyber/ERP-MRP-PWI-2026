-- ERP-00068: Optional DIVISION scope for role → permission grants
--
-- Prompt #16 — Division-wise User & Permission Access.
--
-- WHY
--   `role_permissions` answers "may this role perform this action?". It has no
--   division dimension, so a single PRODUCTION grant satisfied every division.
--   This table adds the missing dimension WITHOUT touching any existing table.
--
-- BACKWARD COMPATIBILITY (critical)
--   ZERO rows for a (role, permission) ⇒ the permission is UNRESTRICTED and
--   behaves exactly as before. No existing grant is modified, no permission or
--   role is deleted. A row with division_id = NULL explicitly means
--   "all divisions" and is equivalent to having no restriction.
--
-- CONVENTIONS
--   Follows the audit-column pattern used by every other table in this project
--   (id / created_at / updated_at / created_by / updated_by / is_active /
--   status) and is idempotent (`IF NOT EXISTS`), matching ERP-00066 style.
--
-- Reversible by: DROP TABLE public.role_permission_division_scopes;
-- (nothing else depends on it at creation time.)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.role_permission_division_scopes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id        UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id  UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  -- NULL = every division (explicit global grant / no restriction)
  division_id    UUID REFERENCES public.divisions(id) ON DELETE CASCADE,
  -- Reserved for department-level access (Prompt #15 §6). NULL = whole division.
  department_id  UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  scope_level    VARCHAR(20) NOT NULL DEFAULT 'DIVISION'
                   CHECK (scope_level IN ('DIVISION', 'DEPARTMENT')),
  status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID,
  updated_by     UUID
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Unique constraint — PostgreSQL treats NULLs as DISTINCT, so a plain
--    UNIQUE(role_id, permission_id, division_id, department_id) would happily
--    accept duplicate "global" rows. COALESCE maps NULL → sentinel UUID so the
--    uniqueness actually holds for nullable columns.
--    Leading columns (role_id, permission_id) also serve the hot lookup:
--      "given my roles + this permission code → which divisions?"
--    so no extra (role_id, permission_id) index is needed.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_rpd_scope
  ON public.role_permission_division_scopes (
    role_id,
    permission_id,
    scope_level,
    COALESCE(division_id,   '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Reverse lookup: "which grants are scoped to this division?" (admin UI / audit)
CREATE INDEX IF NOT EXISTS idx_rpd_scope_division
  ON public.role_permission_division_scopes (division_id)
  WHERE division_id IS NOT NULL;

-- Future department-level access
CREATE INDEX IF NOT EXISTS idx_rpd_scope_department
  ON public.role_permission_division_scopes (department_id)
  WHERE department_id IS NOT NULL;

-- Denormalised lookup by permission alone (matrix UI loads by permission id)
CREATE INDEX IF NOT EXISTS idx_rpd_scope_permission
  ON public.role_permission_division_scopes (permission_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. updated_at trigger — reuses the function created in ERP-00001
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS update_role_permission_division_scopes_updated_at
  ON public.role_permission_division_scopes;
CREATE TRIGGER update_role_permission_division_scopes_updated_at
  BEFORE UPDATE ON public.role_permission_division_scopes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS — mirrors the existing policy style for authorization tables
--    (`roles` / `permissions` / `role_permissions` / `user_organization_scopes`
--    are all admin-only, see ERP-00028). The application layer is the
--    authority; this only prevents PostgREST from bypassing it.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.role_permission_division_scopes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rpd_scopes_admin_all ON public.role_permission_division_scopes;
CREATE POLICY rpd_scopes_admin_all ON public.role_permission_division_scopes
  FOR ALL USING (erp_core.is_admin()) WITH CHECK (erp_core.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS helper — division-level counterpart of erp_core.company_in_scope()
--    (ERP-00029). A NULL division_id in user_organization_scopes means
--    "company-wide", i.e. every division, so it is treated as in-scope.
--    NOT applied to application tables here: the NestJS service layer is the
--    enforcement point (Prompt #16 §16). Created idempotently for future use.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_core.division_in_scope(p_division_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT erp_core.is_admin() OR p_division_id IS NULL OR EXISTS (
    SELECT 1
    FROM public.user_organization_scopes s
    JOIN public.erp_users eu ON eu.id = s.user_id
    WHERE eu.auth_user_id = auth.uid()
      AND eu.status = 'ACTIVE'
      AND s.status = 'ACTIVE'
      AND (s.division_id IS NULL OR s.division_id = p_division_id)
  );
$$;

GRANT EXECUTE ON FUNCTION erp_core.division_in_scope(UUID) TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY
--   SELECT count(*) FROM role_permission_division_scopes;   -- expect 0 today
--   SELECT erp_core.division_in_scope(NULL);                -- expect true
-- ROLLBACK
--   DROP TABLE IF EXISTS public.role_permission_division_scopes;
--   DROP FUNCTION IF EXISTS erp_core.division_in_scope(UUID);
