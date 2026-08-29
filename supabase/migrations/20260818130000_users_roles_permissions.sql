-- Supabase Migration: Users, Roles, Permissions & Organizational Access Control
-- Migration: 20260818130000_users_roles_permissions.sql
-- Description: Creates user profiles, roles, permissions, role-permission, user-role, and organizational scope tables

-- =====================================================
-- ERP USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS erp_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    auth_user_id UUID UNIQUE NOT NULL,
    employee_id VARCHAR(100),
    username VARCHAR(100),
    display_name VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    avatar_url VARCHAR(500),
    default_company_id UUID REFERENCES companies(id),
    default_division_id UUID REFERENCES divisions(id),
    default_section_id UUID REFERENCES sections(id),
    default_department_id UUID REFERENCES departments(id),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    last_login_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_erp_users_auth_user_id ON erp_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_erp_users_email ON erp_users(email);
CREATE INDEX IF NOT EXISTS idx_erp_users_username ON erp_users(username);
CREATE INDEX IF NOT EXISTS idx_erp_users_status ON erp_users(status);
CREATE INDEX IF NOT EXISTS idx_erp_users_default_company_id ON erp_users(default_company_id);

-- =====================================================
-- ROLES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    role_code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'ACTIVE'
);

CREATE INDEX IF NOT EXISTS idx_roles_role_code ON roles(role_code);
CREATE INDEX IF NOT EXISTS idx_roles_status ON roles(status);

-- =====================================================
-- PERMISSIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    permission_code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    module VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE'
);

CREATE INDEX IF NOT EXISTS idx_permissions_permission_code ON permissions(permission_code);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);
CREATE INDEX IF NOT EXISTS idx_permissions_action ON permissions(action);

-- =====================================================
-- USER ROLES TABLE (Many-to-Many)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    user_id UUID NOT NULL REFERENCES erp_users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

-- =====================================================
-- ROLE PERMISSIONS TABLE (Many-to-Many)
-- =====================================================
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);

-- =====================================================
-- USER ORGANIZATIONAL SCOPES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS user_organization_scopes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    user_id UUID NOT NULL REFERENCES erp_users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id),
    division_id UUID REFERENCES divisions(id),
    section_id UUID REFERENCES sections(id),
    department_id UUID REFERENCES departments(id),
    scope_level VARCHAR(20) NOT NULL CHECK (scope_level IN ('COMPANY', 'DIVISION', 'SECTION', 'DEPARTMENT')),
    is_full_scope BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(user_id, company_id, division_id, section_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_user_org_scopes_user_id ON user_organization_scopes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_org_scopes_company_id ON user_organization_scopes(company_id);
CREATE INDEX IF NOT EXISTS idx_user_org_scopes_division_id ON user_organization_scopes(division_id);
CREATE INDEX IF NOT EXISTS idx_user_org_scopes_section_id ON user_organization_scopes(section_id);
CREATE INDEX IF NOT EXISTS idx_user_org_scopes_department_id ON user_organization_scopes(department_id);

-- =====================================================
-- SEED DATA: Initial System Roles
-- SUPER_ADMIN uses a fixed UUID so later migrations can grant it deterministically
-- =====================================================
INSERT INTO roles (id, role_code, name, description, is_system_role, status) VALUES
    ('c37e82cb-5242-4987-a92a-3edb208da6f4', 'SUPER_ADMIN', 'Super Administrator', 'Full system access with all permissions', true, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;
INSERT INTO roles (role_code, name, description, is_system_role, status) VALUES
    ('ADMIN', 'Administrator', 'System administration with most permissions', true, 'ACTIVE'),
    ('MANAGEMENT', 'Management', 'Management level access', true, 'ACTIVE'),
    ('SALES', 'Sales', 'Sales department access', false, 'ACTIVE'),
    ('PROCUREMENT', 'Procurement', 'Procurement department access', false, 'ACTIVE'),
    ('INVENTORY', 'Inventory', 'Inventory management access', false, 'ACTIVE'),
    ('PRODUCTION', 'Production', 'Production department access', false, 'ACTIVE'),
    ('QUALITY_CONTROL', 'Quality Control', 'Quality control department access', false, 'ACTIVE'),
    ('FINANCE', 'Finance', 'Finance department access', false, 'ACTIVE'),
    ('HR', 'Human Resources', 'Human resources department access', false, 'ACTIVE'),
    ('REPORT_VIEWER', 'Report Viewer', 'Read-only access to reports', false, 'ACTIVE')
ON CONFLICT (role_code) DO NOTHING;

-- =====================================================
-- SEED DATA: Organization Module Permissions
-- =====================================================
INSERT INTO permissions (permission_code, name, module, resource, action, description, status) VALUES
    -- Company permissions
    ('company.view', 'View Company', 'organization', 'company', 'VIEW', 'View company details', 'ACTIVE'),
    ('company.create', 'Create Company', 'organization', 'company', 'CREATE', 'Create new companies', 'ACTIVE'),
    ('company.update', 'Update Company', 'organization', 'company', 'UPDATE', 'Update company details', 'ACTIVE'),
    ('company.activate', 'Activate Company', 'organization', 'company', 'ACTIVATE', 'Activate companies', 'ACTIVE'),
    ('company.deactivate', 'Deactivate Company', 'organization', 'company', 'DEACTIVATE', 'Deactivate companies', 'ACTIVE'),
    ('company.delete', 'Delete Company', 'organization', 'company', 'DELETE', 'Delete companies', 'ACTIVE'),
    -- Branch permissions
    ('branch.view', 'View Branch', 'organization', 'branch', 'VIEW', 'View branch details', 'ACTIVE'),
    ('branch.create', 'Create Branch', 'organization', 'branch', 'CREATE', 'Create new branches', 'ACTIVE'),
    ('branch.update', 'Update Branch', 'organization', 'branch', 'UPDATE', 'Update branch details', 'ACTIVE'),
    ('branch.activate', 'Activate Branch', 'organization', 'branch', 'ACTIVATE', 'Activate branches', 'ACTIVE'),
    ('branch.deactivate', 'Deactivate Branch', 'organization', 'branch', 'DEACTIVATE', 'Deactivate branches', 'ACTIVE'),
    ('branch.delete', 'Delete Branch', 'organization', 'branch', 'DELETE', 'Delete branches', 'ACTIVE'),
    -- Division permissions
    ('division.view', 'View Division', 'organization', 'division', 'VIEW', 'View division details', 'ACTIVE'),
    ('division.create', 'Create Division', 'organization', 'division', 'CREATE', 'Create new divisions', 'ACTIVE'),
    ('division.update', 'Update Division', 'organization', 'division', 'UPDATE', 'Update division details', 'ACTIVE'),
    ('division.activate', 'Activate Division', 'organization', 'division', 'ACTIVATE', 'Activate divisions', 'ACTIVE'),
    ('division.deactivate', 'Deactivate Division', 'organization', 'division', 'DEACTIVATE', 'Deactivate divisions', 'ACTIVE'),
    ('division.delete', 'Delete Division', 'organization', 'division', 'DELETE', 'Delete divisions', 'ACTIVE'),
    -- Section permissions
    ('section.view', 'View Section', 'organization', 'section', 'VIEW', 'View section details', 'ACTIVE'),
    ('section.create', 'Create Section', 'organization', 'section', 'CREATE', 'Create new sections', 'ACTIVE'),
    ('section.update', 'Update Section', 'organization', 'section', 'UPDATE', 'Update section details', 'ACTIVE'),
    ('section.activate', 'Activate Section', 'organization', 'section', 'ACTIVATE', 'Activate sections', 'ACTIVE'),
    ('section.deactivate', 'Deactivate Section', 'organization', 'section', 'DEACTIVATE', 'Deactivate sections', 'ACTIVE'),
    ('section.delete', 'Delete Section', 'organization', 'section', 'DELETE', 'Delete sections', 'ACTIVE'),
    -- Department permissions
    ('department.view', 'View Department', 'organization', 'department', 'VIEW', 'View department details', 'ACTIVE'),
    ('department.create', 'Create Department', 'organization', 'department', 'CREATE', 'Create new departments', 'ACTIVE'),
    ('department.update', 'Update Department', 'organization', 'department', 'UPDATE', 'Update department details', 'ACTIVE'),
    ('department.activate', 'Activate Department', 'organization', 'department', 'ACTIVATE', 'Activate departments', 'ACTIVE'),
    ('department.deactivate', 'Deactivate Department', 'organization', 'department', 'DEACTIVATE', 'Deactivate departments', 'ACTIVE'),
    ('department.delete', 'Delete Department', 'organization', 'department', 'DELETE', 'Delete departments', 'ACTIVE'),
    -- Warehouse permissions
    ('warehouse.view', 'View Warehouse', 'organization', 'warehouse', 'VIEW', 'View warehouse details', 'ACTIVE'),
    ('warehouse.create', 'Create Warehouse', 'organization', 'warehouse', 'CREATE', 'Create new warehouses', 'ACTIVE'),
    ('warehouse.update', 'Update Warehouse', 'organization', 'warehouse', 'UPDATE', 'Update warehouse details', 'ACTIVE'),
    ('warehouse.activate', 'Activate Warehouse', 'organization', 'warehouse', 'ACTIVATE', 'Activate warehouses', 'ACTIVE'),
    ('warehouse.deactivate', 'Deactivate Warehouse', 'organization', 'warehouse', 'DEACTIVATE', 'Deactivate warehouses', 'ACTIVE'),
    ('warehouse.delete', 'Delete Warehouse', 'organization', 'warehouse', 'DELETE', 'Delete warehouses', 'ACTIVE'),
    -- Admin permissions
    ('admin.users.view', 'View Users', 'admin', 'user', 'VIEW', 'View user list and details', 'ACTIVE'),
    ('admin.users.create', 'Create Users', 'admin', 'user', 'CREATE', 'Create or invite users', 'ACTIVE'),
    ('admin.users.update', 'Update Users', 'admin', 'user', 'UPDATE', 'Update user profiles', 'ACTIVE'),
    ('admin.users.activate', 'Activate Users', 'admin', 'user', 'ACTIVATE', 'Activate users', 'ACTIVE'),
    ('admin.users.deactivate', 'Deactivate Users', 'admin', 'user', 'DEACTIVATE', 'Deactivate users', 'ACTIVE'),
    ('admin.users.assign_roles', 'Assign User Roles', 'admin', 'user', 'ASSIGN_ROLES', 'Assign roles to users', 'ACTIVE'),
    ('admin.users.remove_roles', 'Remove User Roles', 'admin', 'user', 'REMOVE_ROLES', 'Remove roles from users', 'ACTIVE'),
    ('admin.users.manage_scope', 'Manage User Scope', 'admin', 'user', 'MANAGE_SCOPE', 'Manage user organizational scope', 'ACTIVE'),
    ('admin.users.set_default_context', 'Set Default Context', 'admin', 'user', 'SET_DEFAULT_CONTEXT', 'Set user default organizational context', 'ACTIVE'),
    ('admin.roles.view', 'View Roles', 'admin', 'role', 'VIEW', 'View role list and details', 'ACTIVE'),
    ('admin.roles.create', 'Create Roles', 'admin', 'role', 'CREATE', 'Create new roles', 'ACTIVE'),
    ('admin.roles.update', 'Update Roles', 'admin', 'role', 'UPDATE', 'Update role details', 'ACTIVE'),
    ('admin.roles.activate', 'Activate Roles', 'admin', 'role', 'ACTIVATE', 'Activate roles', 'ACTIVE'),
    ('admin.roles.deactivate', 'Deactivate Roles', 'admin', 'role', 'DEACTIVATE', 'Deactivate roles', 'ACTIVE'),
    ('admin.roles.assign_permissions', 'Assign Role Permissions', 'admin', 'role', 'ASSIGN_PERMISSIONS', 'Assign permissions to roles', 'ACTIVE'),
    ('admin.roles.remove_permissions', 'Remove Role Permissions', 'admin', 'role', 'REMOVE_PERMISSIONS', 'Remove permissions from roles', 'ACTIVE'),
    ('admin.permissions.view', 'View Permissions', 'admin', 'permission', 'VIEW', 'View permission list and details', 'ACTIVE')
ON CONFLICT (permission_code) DO NOTHING;

-- =====================================================
-- SEED DATA: SUPER_ADMIN gets all permissions
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- SEED DATA: ADMIN gets most permissions (not delete)
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'ADMIN' AND p.action != 'DELETE'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- SEED DATA: MANAGEMENT gets view and some update permissions
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'MANAGEMENT' AND p.action IN ('VIEW', 'UPDATE', 'ACTIVATE', 'DEACTIVATE')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- SEED DATA: REPORT_VIEWER gets only view permissions
-- =====================================================
INSERT INTO role_permissions (role_id, permission_id, status)
SELECT r.id, p.id, 'ACTIVE'
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'REPORT_VIEWER' AND p.action = 'VIEW'
ON CONFLICT (role_id, permission_id) DO NOTHING;
