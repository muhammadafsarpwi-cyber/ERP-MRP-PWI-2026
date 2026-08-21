-- Supabase Migration: Schema Fixes (Entity <-> DB Column Mismatches)
-- Migration: 20260821000000_schema_fixes.sql
-- Description: Adds missing columns identified by the entity-database audit so that
--              application entities extending BaseEntity (is_active, created_by, updated_by)
--              and the Uom entity (company_id) map cleanly onto the database schema.
--
-- Safety notes:
--   * Every statement uses ADD COLUMN IF NOT EXISTS, so this migration is idempotent
--     and safe to run multiple times.
--   * All changes are purely additive: no existing columns are dropped or altered,
--     and no existing data is modified.
--   * New BOOLEAN columns default to true so existing rows remain "active" and no
--     backfill is required.

-- =====================================================
-- 1. public.user_roles
--    Entity UserRole extends BaseEntity which defines is_active.
-- =====================================================
ALTER TABLE public.user_roles
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- =====================================================
-- 2. public.permissions
--    Entity Permission extends BaseEntity which defines created_by / updated_by.
-- =====================================================
ALTER TABLE public.permissions
    ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE public.permissions
    ADD COLUMN IF NOT EXISTS updated_by UUID;

-- =====================================================
-- 3. public.role_permissions
--    Entity RolePermission extends BaseEntity which defines is_active / updated_by.
-- =====================================================
ALTER TABLE public.role_permissions
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

ALTER TABLE public.role_permissions
    ADD COLUMN IF NOT EXISTS updated_by UUID;

-- =====================================================
-- 4. public.user_organization_scopes
--    Entity UserOrganizationScope extends BaseEntity which defines is_active.
-- =====================================================
ALTER TABLE public.user_organization_scopes
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- =====================================================
-- 5. public.uoms
--    Entity Uom defines company_id as a nullable UUID for multi-company scoping.
-- =====================================================
ALTER TABLE public.uoms
    ADD COLUMN IF NOT EXISTS company_id UUID;
