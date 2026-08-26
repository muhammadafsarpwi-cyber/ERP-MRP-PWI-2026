## TASK A: Roles & Permissions Matrix - End-to-End Verification Report

### Summary
| Area | Status | Details |
|------|--------|---------|
| Matrix API GET | PASS | Returns 11 roles, 55 resource modules, 219 unique permissions |
| Matrix API PUT (save) | PASS | Toggles correctly saved and verified in DB |
| Persistence (restore) | PASS | Original values restored and verified |
| Auth/me | PASS | Returns user data with permissions |
| CSS 3-column fix | NOT VERIFIED | No browser available for visual testing |

### Matrix API Structure
The matrix endpoint `GET /api/v1/admin/permissions-matrix` returns:
- `roles[]`: 11 roles (ADMIN, FINANCE, HR, INVENTORY, MANAGEMENT, PROCUREMENT, PRODUCTION, QUALITY_CONTROL, REPORT_VIEWER, SALES, SUPER_ADMIN)
- `rows[]`: 55 resource modules, each containing nested `permissions` map
- Each permission has `ACTIVATE`, `CREATE`, `DEACTIVATE`, `DELETE`, `UPDATE`, `VIEW` access levels
- Each access level contains `permissionId` (UUID) and `roleGranted` (map of roleId → boolean)
- `modules[]`: 8 module labels
- `moduleLabels` and `resourceLabels`: display-friendly names

### Save/Persistence Test Details
- **Test**: Toggled `branch.delete` for `REPORT_VIEWER` from `false` → `true`
- **PUT body**: `{ roles: [{ roleId: "<uuid>", permissions: [{ permissionId: "<uuid>", granted: true }] }] }`
- **Save HTTP**: 200 OK
- **Verification**: Re-fetched matrix, confirmed `branch.delete` = `true` for REPORT_VIEWER
- **Restore**: Toggled back to `false`, verified restoration

### DTO Fix Applied
- `PermissionToggleDto` was missing `@IsBoolean()` decorator on `granted` field
- With global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`, this caused 400 errors
- **Fix**: Added `@IsBoolean()` to `backend/src/modules/permission/dto/permission-matrix.dto.ts`

### Files Modified
- `backend/src/modules/permission/dto/permission-matrix.dto.ts` — Added `@IsBoolean()` to `granted` field

### Auth Configuration Notes
- `SUPABASE_JWT_SECRET` is set to the anon key (starts with `eyJ`), not the HS256 signing secret
- Backend falls back to Supabase API (`/auth/v1/user`) for token verification
- Must use Supabase REST login to get valid tokens (not locally-minted JWTs)

---

## TASK B: PROMPT-15 - Production/MRP Integration E2E Test Report

### Summary
| Step | Status | Details |
|------|--------|---------|
| 1. Item | PASS | DEMO-SPP-001 — Packed Spoke 14G 190mm |
| 2. Routing | PASS | 5 operations (Wire Straightening → Swagging → Spoke Forming → Chrome Plating → Final Inspection) |
| 3. Machine | PASS | PKS-01 (Spoke Packing Station) |
| 4. Shift | PASS | General Shift (8h planned) |
| 5. Target Resolution | PASS | target=75 BOX/hour (item-specific) or general fallback |
| 6. UOM | PASS | BOX (no conversions defined) |
| 7. Production Entry CREATE | PASS | HTTP 201, entry created with target/achievement/efficiency |
| 8. Production Entry DELETE | PASS | HTTP 200, soft-deleted, count restored |
| 9. Inventory | PASS | stock_ledger and inventory_balances tables exist |
| 10. Proration | PASS | 6h → target × 0.75 |
| 11. Database Integrity | FAIL | 14 orphan items (missing division/section/department) |

### Org Scope Fix
- `system.admin@erp.com` initially failed with 403 "No organizational access scope assigned"
- **Fix**: Inserted a `COMPANY`-level `user_organization_scopes` row with `is_full_scope=true` for PakWiz Industries
- After fix: Production entry creation succeeded

### Database Integrity Issues
1. **14 orphan items** — Active items with `division_id IS NULL` or `department_id IS NULL`
2. **Duplicate machine codes** — SP-01 through SP-07 and APS-01 exist in multiple departments (expected for different production lines)
3. All foreign key constraints satisfied for user roles and permissions

### Production Entry Test Result
```
Entry created: HTTP 201
- Target: 75 BOX/hour
- Actual: 50 BOX
- Achievement: 66.67%
- Efficiency: 75%
- Soft deleted: HTTP 200
- Count restored: 20 → 21 → 20
```

---

## TASK C: User Management "Add User" Fix & Redesign Report

### Root Cause of "Operation failed"
The original Create User form required a raw Supabase `authUserId` (UUID) — a field no admin would know. The backend `POST /admin/users` only created an `erp_users` row (no auth user). When submitted with any non-UUID value, validation failed and the frontend's catch block showed generic "Operation failed".

### Solution Implemented

#### 1. New Backend Endpoint: `POST /admin/users/create-full`
**File**: `backend/src/modules/user/controllers/user.controller.ts` (new endpoint) + `backend/src/modules/user/services/erp-user.service.ts` (new `createFull` method)

**Flow**:
1. Validates email uniqueness against `erp_users`
2. Disables `on_auth_user_created` trigger (`SET session_replication_role = 'replica'`)
3. Creates `auth.users` row with bcrypt-hashed password (matching provisioning script column pattern)
4. Creates `auth.identities` row (email provider)
5. Re-enables triggers (`RESET session_replication_role`)
6. Creates `erp_users` row via TypeORM
7. Assigns roles (if provided)
8. Sends notification

**DTO**: `CreateUserFullDto` — email, password, displayName, firstName, lastName, phone, employeeId, username, roleIds

**Auth User Creation Pattern**: Matched the working `provision-system-admin.js` exactly (21 columns including `is_sso_user`, `is_anonymous`, proper NULL values for timestamp columns). Earlier attempts failed with Supabase GoTrue "Database error querying schema" because the auth.users row didn't match GoTrue's expected schema.

#### 2. Frontend Redesign: `UserManagement.tsx`
**Changes**:
- **Create User form**: Professional multi-section form with Email + Password + Personal Info + Role Assignment (no raw authUserId)
- **User table**: Avatar, name+email, employee ID, phone, color-coded role tags, last login with tooltip, status badges, fixed right-aligned actions
- **Search + filter**: Search bar and status filter dropdown
- **Separate Create/Edit modals**: Create modal includes password fields; Edit modal only allows profile changes
- **Better error handling**: Shows specific backend error messages instead of generic "Operation failed"
- **Responsive table**: Horizontal scroll with `scroll={{ x: 1100 }}`

#### 3. DTO Fix
- `PermissionToggleDto.granted`: Added missing `@IsBoolean()` decorator (prevents 400 errors from global ValidationPipe)

### Files Modified
| File | Change |
|------|--------|
| `backend/src/modules/user/services/erp-user.service.ts` | Added `DataSource` injection, `createFull()` method |
| `backend/src/modules/user/controllers/user.controller.ts` | Added `POST create-full` endpoint |
| `backend/src/modules/user/dto/user.dto.ts` | Added `CreateUserFullDto` |
| `backend/src/modules/permission/dto/permission-matrix.dto.ts` | Added `@IsBoolean()` to `granted` |
| `backend/src/modules/user/services/erp-user.service.spec.ts` | Added mocks for DataSource + SupabaseAuthService |
| `frontend/src/pages/admin/UserManagement.tsx` | Complete rewrite with professional form + table |

### E2E Test Results
| Test | Result |
|------|--------|
| Create user via API | PASS (HTTP 201) |
| Login as new user | PASS (HTTP 200, valid token) |
| Auth/me verification | PASS (email matches) |
| Validation: missing email | PASS (400) |
| Validation: weak password | PASS (400) |
| Validation: duplicate email | PASS (409) |
| Validation: no auth token | PASS (401) |
| Cleanup | PASS (user + auth removed) |

### Build Verification
| Check | Result |
|-------|--------|
| Backend TypeScript | 0 errors |
| Frontend TypeScript | 0 errors |
| Backend tests | 380/380 passed (22 suites) |
| Frontend build | NOT TESTED (timeout in prior session) |
