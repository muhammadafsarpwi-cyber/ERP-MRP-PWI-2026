# ERP Change Log and Instruction Tracking

## 1. Change Log

| Requirement ID | Date | Description | Status | Related Modules | Revision | Implementation Status |
|---------------|------|-------------|--------|-----------------|----------|----------------------|
| ERP-00001 | 2026-08-18 | Master Project Specification | Approved | All | R00 | Architecture Established |
| ERP-00002 | 2026-08-18 | Company & Organization Module | Approved | M01 | R00 | Implemented |
| ERP-00002-R01 | 2026-08-18 | Supabase DB & Division/Section Structure | Approved | M01 | R01 | Implemented |
| ERP-00003 | 2026-08-18 | Users, Roles, Permissions & Access Control | Approved | M02 | R00 | Implemented |
| ERP-00004 | 2026-08-19 | Item Master & UOM Module | Approved | M03 | R00 | Implemented |
| ERP-00005 | 2026-08-19 | Inventory & Warehouse Management | Approved | M06 | R07 | Completed |
| ERP-00006 | 2026-08-19 | Procurement Module | Approved | M07 | R00 | Code Complete |
| ERP-00006-R01 | 2026-08-20 | Local Dev Environment Recovery + Standards | Approved | DevOps | R01 | Completed |
| ERP-00006-R02 | 2026-08-20 | Authentication & Password Management Fix | Approved | Auth, Security | R02 | Completed |
| ERP-00006-R03 | 2026-08-20 | v.toFixed Runtime Crash Fix (Numeric Formatting) | Approved | Frontend | R03 | Completed |

## 2. ERP Instructions

### ERP-00001: Master Project Specification
- **Date**: 2026-08-18
- **Status**: Approved
- **Description**: Complete master specification for the manufacturing ERP system
- **Scope**: All modules and business processes
- **Implementation**: Architecture foundation established

### ERP-00002: Company & Organization Module
- **Date**: 2026-08-18
- **Status**: Approved
- **Description**: Implementation of Company, Branch, Business Unit, Department, Warehouse, and Warehouse Location entities with full CRUD, hierarchy support, and validation
- **Scope**: Organization module (M01)
- **Implementation**: Completed

### ERP-00002-R01: Supabase Database & Division/Section Structure
- **Date**: 2026-08-18
- **Status**: Approved
- **Description**: Revision establishing Supabase PostgreSQL as authoritative database with version-controlled migrations, and adding Division/Section entities with mandatory organizational hierarchy
- **Scope**: Organization module (M01)
- **Implementation**: Completed
- **Key Changes**:
  - Supabase PostgreSQL as authoritative database
  - Version-controlled migrations in `supabase/migrations/`
  - Division entity with unique code per company
  - Section entity (belongs to Division, unique code per company)
  - Department updated with `divisionId`/`sectionId` columns
  - Five initial Division seed records (configurable)
  - Cascading filters in UI
  - Organizational context architecture

### ERP-00003: Users, Roles, Permissions & Organizational Access Control
- **Date**: 2026-08-18
- **Status**: Approved
- **Description**: Implementation of Users, Roles, Permissions, User-Role assignments, Role-Permission assignments, Organizational Access Scopes, Supabase Auth integration, permission-based authorization guards, and administration UI
- **Scope**: Users, Roles, Permissions module (M02)
- **Implementation**: Completed
- **Key Changes**:
  - Supabase Auth integration (JWT verification, user invitation)
  - ERP User profiles linked to Supabase Auth
  - Role management with system role protection
  - Permission-based authorization (code-based, not role-name-based)
  - Role-Permission many-to-many assignments
  - User-Role many-to-many assignments
  - Organizational access scopes (Company/Division/Section/Department)
  - Default organizational context per user
  - Permission guards and Org Scope guards
  - Administration UI (Users, Roles, Permissions pages)
  - 11 initial system roles
  - Organization module permissions seed data
  - Supabase migration for all auth tables

### ERP-00004: Item Master & UOM Module
- **Date**: 2026-08-19
- **Status**: Approved
- **Description**: Implementation of Items, UOM, UOM Conversions, Item Categories, Item Attributes, Item Barcodes, Item Specifications, and Item Documents
- **Scope**: Item Master module (M03)
- **Implementation**: Completed

### ERP-00005: Inventory & Warehouse Management
- **Date**: 2026-08-19
- **Status**: Approved
- **Description**: Full Inventory & Warehouse Management module including Stock Ledger, Inventory Balances, Policies, Opening Stock, Adjustments, Transfers, Reservations, Batch/Lot Tracking, Serial Number Tracking, and Inventory Reports
- **Scope**: Inventory & Warehouse module (M06)
- **Implementation**: Completed (R07 — Final Acceptance)

### ERP-00006: Procurement Module
- **Date**: 2026-08-19
- **Status**: Approved
- **Description**: Complete Procurement module — Suppliers, Purchase Requisitions, RFQs, Quotations, Purchase Orders, Goods Receipts, Purchase Returns, Purchase Invoices
- **Scope**: Purchasing / Procurement module (M07)
- **Implementation**: Code Complete (42/42 E2E tests passed, backend rebuilt)

### ERP-00006-R01: Local Development Environment Recovery + Standards
- **Date**: 2026-08-20
- **Status**: Approved
- **Description**: Recovery of local development environment, permanent dev scripts, authentication flow, professional UI standards, documentation
- **Scope**: DevOps, Auth, UI, Documentation
- **Implementation**: Completed
- **Key Changes**:
  - start-dev.ps1 / stop-dev.ps1 scripts with TCP detection, PID management, health verification
  - Backend login endpoint (POST /auth/login) via Supabase Auth REST API
  - Login → Dashboard → MainLayout authenticated user flow
  - Dashboard with module overview cards and user greeting
  - Future module nav items hidden (Products, Customers, Sales, Production)
  - Demo data policy documented (supabase/README.md)
  - Development credentials documented (docs/DEVELOPMENT_CREDENTIALS.md)
  - Backend build fix (deleteOutDir + incremental conflict)
  - README.md and DEPLOYMENT.md updated

### ERP-00006-R03: v.toFixed Runtime Crash Fix (Numeric Formatting)
- **Date**: 2026-08-20
- **Status**: Approved
- **Description**: Root-cause fix for `TypeError: v.toFixed is not a function` browser crash across all numeric table columns
- **Scope**: Frontend numeric formatting
- **Implementation**: Completed
- **Root Cause**: PostgreSQL `decimal`/`numeric` fields returned as strings by the `pg` driver; `.toFixed()` called on strings throws TypeError
- **Fix**: Created shared `formatDecimal()` / `toNum()` utility; replaced all unsafe `.toFixed()` calls; added render functions to all raw decimal columns
- **Key Changes**:
  - New `frontend/src/utils/numberFormat.ts` with `toNum()`, `formatDecimal()`, `formatNumber()`
  - Fixed 3 HIGH-risk crashes in procurement pages (totalAmount columns)
  - Fixed MEDIUM-risk arithmetic fragility in InventoryReports (getStatusTag)
  - Fixed 8 LOW-risk raw decimal displays across 7 inventory pages
  - 12 table column renderers now use safe formatting

### ERP-00006-R02: Authentication & Password Management Fix
- **Date**: 2026-08-20
- **Status**: Approved
- **Description**: Root-cause fix for login failure, full password management lifecycle, route protection, security audit
- **Scope**: Auth, Security, UI
- **Implementation**: Completed
- **Root Cause**: No confirmed Supabase Auth user existed. Service role key equaled anon key (403 on admin API). Database trigger `on_auth_user_created` referenced non-existent `erp_core.users` table causing 500 on user creation. Email confirmation was enabled but unverifiable.
- **Fix**: Created dev auth user directly via PostgreSQL with `SET session_replication_role = 'replica'` to bypass broken trigger. Set password via bcrypt hash update. User confirmed with `email_confirmed_at = NOW()`.
- **Key Changes**:
  - SupabaseAuthService rewritten: verifyToken (local+API fallback), forgotPassword, resetPassword, changePassword, adminResetUserPassword
  - Forgot Password, Reset Password, Change Password pages
  - ProtectedRoute component wrapping all non-public routes
  - Admin reset-password modal in UserManagement
  - Persistent error display on login (not toast)
  - Password policy: min 8 chars, uppercase + lowercase + digit
  - 401 interceptor skips public paths, clears refresh_token
  - Security audit: 10/10 checks PASS
  - Temp scripts added to .gitignore to prevent credential leaks
- **Revisions**:
  - R01: Migration syntax fix (COALESCE UNIQUE constraint)
  - R02: Duplicate trigger fix (idempotent migration)
  - R05: Serial number trigger idempotency
  - R06: E2E bug fixes (onHand mapping, RELEASED constraint, permissions)
  - R07: Final acceptance audit (46/46 E2E, all verification PASS)
- **Key Changes**:
  - 9 database tables (stock_ledger, inventory_balances, inventory_reservations, stock_adjustments, stock_adjustment_lines, stock_transfers, stock_transfer_lines, batches, serial_numbers)
  - 8 update_updated_at triggers
  - 20 inventory permissions
  - 9 backend entities, 5 DTO sets, 7+2 services, 7+2 controllers
  - 9 frontend pages (8 functional + index)
  - Full workflow support: create→submit→approve→post with ledger/balance updates
  - Reservations with release/cancel and stock impact
  - Batch/Lot and Serial Number tracking
  - Opening Stock posting
  - Inventory Reports (stock summary, ledger view)
  - Supabase PostgreSQL with version-controlled migrations
  - JWT auth + permission-based guards on all inventory endpoints

## 3. Implementation Status by Module

### Phase 1: Foundation
| Module | Status | Notes |
|--------|--------|-------|
| M01: Company & Organization | Implemented | Complete with CRUD, hierarchy, Division, Section, validation, Supabase migrations |
| M02: Users, Roles & Permissions | Implemented | Complete with CRUD, authorization, Supabase Auth integration |
| M03: Products & Item Master | Implemented | Complete with CRUD, attributes, UOM, barcodes, categories, specifications |
| M04: Customers & CRM | Architecture Ready | Pending Implementation |

### Phase 2: Core Transactions
| Module | Status | Notes |
|--------|--------|-------|
| M05: Sales | Architecture Ready | Pending Implementation |
| M06: Inventory & Warehouse | Implemented | Complete: 9 entities, 20 permissions, 8 pages, full E2E (46/46 tests), Supabase verified |
| M07: Purchasing / Procurement | Implemented | Complete: 16 tables, 36 permissions, 8 pages, 42/42 E2E tests |

### Phase 3: Manufacturing
| Module | Status | Notes |
|--------|--------|-------|
| M08: Bill of Materials | Architecture Ready | Pending Implementation |
| M09: Production Planning | Architecture Ready | Pending Implementation |
| M10: Production / Manufacturing | Architecture Ready | Pending Implementation |
| M11: Work Orders | Architecture Ready | Pending Implementation |
| M12: Quality Control | Architecture Ready | Pending Implementation |

### Phase 4: Fulfillment
| Module | Status | Notes |
|--------|--------|-------|
| M13: Logistics / Dispatch | Architecture Ready | Pending Implementation |
| M14: Delivery | Architecture Ready | Pending Implementation |
| M15: Returns | Architecture Ready | Pending Implementation |

### Phase 5: Finance
| Module | Status | Notes |
|--------|--------|-------|
| M16: Costing | Architecture Ready | Pending Implementation |
| M17: Accounts & Finance | Architecture Ready | Pending Implementation |
| M18: Accounts Receivable | Architecture Ready | Pending Implementation |
| M19: Accounts Payable | Architecture Ready | Pending Implementation |
| M20: Cash & Bank | Architecture Ready | Pending Implementation |
| M21: Fixed Assets | Architecture Ready | Pending Implementation |

### Phase 6: Support
| Module | Status | Notes |
|--------|--------|-------|
| M22: Human Resources | Architecture Ready | Pending Implementation |
| M23: Attendance & Leave | Architecture Ready | Pending Implementation |
| M24: Payroll | Architecture Ready | Pending Implementation |
| M25: Projects / Jobs | Architecture Ready | Pending Implementation |
| M26: Budgeting | Architecture Ready | Pending Implementation |
| M27: Maintenance | Architecture Ready | Pending Implementation |

### Phase 7: System
| Module | Status | Notes |
|--------|--------|-------|
| M28: Reports & Dashboards | Architecture Ready | Pending Implementation |
| M29: Document Management | Architecture Ready | Pending Implementation |
| M30: Notifications & Approvals | Architecture Ready | Pending Implementation |
| M31: Audit Trail | Architecture Ready | Pending Implementation |
| M32: System Administration | Architecture Ready | Pending Implementation |
| M33: API & Integrations | Architecture Ready | Pending Implementation |
| M34: Backup & Security | Architecture Ready | Pending Implementation |

## 4. Version History

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0 | 2026-08-18 | ERP Team | Initial architecture foundation |
| 1.1 | 2026-08-18 | ERP Team | ERP-00002: Company & Organization Module |
| 1.2 | 2026-08-18 | ERP Team | ERP-00002-R01: Supabase DB & Division/Section Structure |
| 1.3 | 2026-08-18 | ERP Team | ERP-00003: Users, Roles, Permissions & Access Control |
| 1.4 | 2026-08-19 | ERP Team | ERP-00004: Item Master & UOM Module |
| 1.5 | 2026-08-19 | ERP Team | ERP-00005: Inventory & Warehouse Management (R07 Final Acceptance) |
| 1.6 | 2026-08-19 | ERP Team | ERP-00006: Procurement Module (Code Complete, 42/42 E2E) |
| 1.7 | 2026-08-20 | ERP Team | ERP-00006-R01: Local Dev Environment Recovery + Standards |
| 1.8 | 2026-08-20 | ERP Team | ERP-00006-R02: Authentication & Password Management Fix |
| 1.9 | 2026-08-20 | ERP Team | ERP-00006-R03: v.toFixed Runtime Crash Fix (Numeric Formatting) |

## 5. Next Steps

1. Seed demo data for ERP-00006 procurement tables
2. Re-run ERP-00006 E2E tests with live database
3. Begin M05: Sales module implementation
4. Follow module implementation sequence as defined in architecture

## 6. Notes

- All module boundaries and dependencies are documented
- Technology stack is established
- Project structure is ready for development
- Database schema design is documented
- API design principles are defined
- Security architecture is established
