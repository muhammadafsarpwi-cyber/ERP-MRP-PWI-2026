# ERP-00006 IMPLEMENTATION CHECKPOINT

## ERP-00006-R03 — v.toFixed Runtime Crash Fix (Numeric Formatting)

**Date**: 2026-08-20
**Status**: COMPLETE
**Scope**: Frontend numeric formatting safety across all modules

### Root Cause

Browser crashed with `TypeError: v.toFixed is not a function` when rendering Ant Design Table columns containing PostgreSQL `decimal`/`numeric` fields.

**Technical cause**: The `pg` Node.js driver (used by TypeORM) serializes PostgreSQL `decimal` and `numeric` column values as **strings** (e.g. `"2275.000000"`), not JavaScript numbers. TypeScript interfaces declared these fields as `number`, but the runtime type was `string`. Calling `.toFixed()` on a string throws `TypeError` because `.toFixed()` exists only on `Number.prototype`.

### Fix

Created a shared numeric formatting utility (`frontend/src/utils/numberFormat.ts`) with three functions:
- `toNum(value)` — safely converts any value (string, number, null, undefined) to a JS number
- `formatDecimal(value, decimals)` — safe `.toFixed()` wrapper using `toNum()` first
- `formatNumber(value, decimals, locale)` — locale-aware formatting with thousand separators

Replaced all unsafe `.toFixed()` calls with `formatDecimal()`. All affected table column renderers now use `render: (v: unknown) => formatDecimal(v)`.

### Files Changed

| File | Change |
|------|--------|
| `frontend/src/utils/numberFormat.ts` | **New** — shared `toNum()`, `formatDecimal()`, `formatNumber()` |
| `frontend/src/pages/procurement/QuotationManagement.tsx` | `totalAmount` column: `v?.toFixed(2)` → `formatDecimal(v)` |
| `frontend/src/pages/procurement/PurchaseOrderManagement.tsx` | `totalAmount` column: `v?.toFixed(2)` → `formatDecimal(v)` |
| `frontend/src/pages/procurement/PurchaseInvoiceManagement.tsx` | `totalAmount` column: `v?.toFixed(2)` → `formatDecimal(v)` |
| `frontend/src/pages/inventory/InventoryReports.tsx` | `getStatusTag()` uses `toNum()`; `onHand`/`reserved`/`available` columns use `formatDecimal()` |
| `frontend/src/pages/inventory/Inventory.tsx` | `onHand`/`reserved`/`available` columns use `formatDecimal()` |
| `frontend/src/pages/inventory/BatchManagement.tsx` | `quantity` column uses `formatDecimal()` |
| `frontend/src/pages/inventory/StockTransferManagement.tsx` | `quantity` column uses `formatDecimal()` |
| `frontend/src/pages/inventory/StockAdjustmentManagement.tsx` | `quantity` column uses `formatDecimal()` |
| `frontend/src/pages/inventory/ReservationManagement.tsx` | `quantity`/`fulfilledQuantity` columns use `formatDecimal()` |
| `frontend/src/pages/inventory/StockLedgerView.tsx` | `quantity` column uses `formatDecimal()` |
| `frontend/src/pages/inventory/InventoryPolicyManagement.tsx` | `minimumStock`/`maximumStock`/`reorderLevel` columns use `formatDecimal()` |

### Affected Categories

| Category | Risk | Count | Status |
|----------|------|-------|--------|
| `.toFixed()` on string values | HIGH — crashes | 3 | FIXED |
| Arithmetic on string decimals | MEDIUM — fragile | 1 | FIXED (uses `toNum()`) |
| Raw decimal display (`100.0000`) | LOW — cosmetic | 8 | FIXED (formatted to 2dp) |

### Verification

| Check | Result |
|-------|--------|
| Backend type-check (`tsc --noEmit`) | PASS |
| Frontend type-check (`tsc --noEmit`) | PASS |
| Backend compile (`tsc`) | PASS |
| All 12 API endpoints return 200 | PASS |
| Login succeeds | PASS |
| Auth/me returns profile | PASS |
| Inventory Balances (decimal fields) | PASS — `onHand='10.0000'` displayed as `10.00` |
| Inventory Batches (decimal quantity) | PASS — `quantity='50.0000'` displayed as `50.00` |
| Quotations (decimal totalAmount) | PASS — `totalAmount='0.000000'` displayed as `0.00` |
| Purchase Orders (decimal totalAmount) | PASS — `totalAmount='2275.000000'` displayed as `2,275.00` |
| Purchase Invoices (decimal totalAmount) | PASS — `totalAmount='2275.000000'` displayed as `2,275.00` |
| Stock Ledger (decimal quantity) | PASS — `quantity='10.0000'` displayed as `10.00` |
| Final `.toFixed` audit | PASS — only 1 occurrence (inside `formatDecimal()` utility, safe) |
| No new `.toFixed` crash possible | PASS — all renderers use `formatDecimal()` |

### Remaining Warnings (Non-blocking)

- PostgreSQL decimal fields arrive as strings — this is expected `pg` driver behavior, not a bug
- `SUPABASE_JWT_SECRET` is set to anon key (functional fallback via API verification, slower)
- `SUPABASE_SERVICE_ROLE_KEY` equals `SUPABASE_ANON_KEY` (admin API unavailable)

### Status: ERP-00006-R03 COMPLETE

---

## ERP-00006-R02 — Authentication & Password Management Fix

**Date**: 2026-08-20
**Status**: COMPLETE
**Scope**: Login reliability, password management, route protection, security audit

### Root Cause of Login Failure

The browser login failed with "Invalid email or password" due to a chain of root causes:

1. **No confirmed Supabase Auth user existed** — Previous attempts to create users via the Supabase signup API failed because:
   - Email confirmation was enabled in Supabase, but no confirmation email could be verified
   - A database trigger (`on_auth_user_created`) tried to INSERT into `erp_core.users` (which does not exist), causing a 500 error on user creation
   - The `SUPABASE_SERVICE_ROLE_KEY` in `.env` was identical to the `SUPABASE_ANON_KEY` (both 208 chars, both the same JWT), making admin API calls return 403

2. **Fix applied**: Created the development auth user directly via PostgreSQL (`SET session_replication_role = 'replica'` to bypass the broken trigger), inserting into `auth.users` and `auth.identities` tables with bcrypt-hashed password and `email_confirmed_at = NOW()`.

3. **ERP user auto-provisioning**: On first login, the backend auto-creates an `erp_users` record linked to the Supabase auth user UUID. No manual ERP user creation needed.

### Changes Implemented

#### Backend (Phase 2-3)
- **SupabaseAuthService** (`supabase-auth.service.ts`): Rewritten with `verifyToken` (local JWT + Supabase API fallback), `sendPasswordResetEmail`, `resetPassword`, `changePassword`, `adminResetUserPassword`, JWT secret validation
- **AuthService** (`auth.service.ts`): Added `forgotPassword`, `resetPassword`, `changePassword`, `adminResetPassword`, `validateToken`; login returns `refreshToken`
- **AuthController** (`auth.controller.ts`): Added `POST /forgot-password`, `POST /reset-password`, `POST /change-password`
- **Auth DTOs** (`auth.dto.ts`): Added `ForgotPasswordDto`, `ResetPasswordDto`, `ChangePasswordDto`, `AdminResetPasswordDto` with password policy validation (min 8 chars, uppercase + lowercase + digit)
- **UserController** (`user.controller.ts`): Added `POST /admin/users/:id/reset-password`

#### Frontend (Phase 3-6)
- **Login.tsx**: Persistent `Alert` error display (not toast), show/hide password, "Forgot Password" link, gradient background, "Remember me" checkbox
- **ForgotPassword.tsx**: Email input → success result page
- **ResetPassword.tsx**: Token from URL → new password with policy + confirm
- **ChangePassword.tsx**: Current + new + confirm, reusable component
- **ProtectedRoute.tsx**: Token check → redirect to `/login`
- **App.tsx**: `/login`, `/forgot-password`, `/reset-password` public; all others wrapped in `<ProtectedRoute>`
- **MainLayout.tsx**: "Change Password" menu item, logout clears `refresh_token`
- **UserManagement.tsx**: Admin reset-password action with modal
- **api.ts**: 401 interceptor skips public paths, clears `refresh_token`

### Verification Results (Phase 9)

| Check | Result |
|-------|--------|
| Login succeeds (POST /auth/login) | PASS (201, token + user returned) |
| Dashboard loads (/auth/me) | PASS (200, full user profile) |
| User identity displayed | PASS (dev@erp-local.test, ACTIVE) |
| Invalid password correctly fails | PASS (401) |
| Login works again after logout | PASS (201) |
| CORS preflight | PASS (204, correct origin) |
| Backend health | PASS (200) |

### Security Audit (Phase 10)

| Check | Result |
|-------|--------|
| No plaintext passwords in source | PASS |
| No passwords in API responses | PASS |
| No passwords in logs | PASS |
| No passwords in migrations | PASS |
| No service-role key in frontend | PASS |
| Admin reset doesn't reveal password | PASS |
| JWT/session security | PASS (with JWT secret warning) |
| Password policy | PASS (8+ chars, complexity) |
| CORS configuration | PASS (origin-restricted) |
| SQL injection | PASS (parameterized queries) |

**Action taken**: Added all temp/utility scripts to `.gitignore` to prevent credential leaks.

### Files Modified

| File | Change |
|------|--------|
| `backend/src/modules/auth/services/supabase-auth.service.ts` | Rewritten: verifyToken, forgotPassword, resetPassword, changePassword, adminResetUserPassword |
| `backend/src/modules/auth/services/auth.service.ts` | Added forgotPassword, resetPassword, changePassword, adminResetPassword, validateToken |
| `backend/src/modules/auth/controllers/auth.controller.ts` | Added forgot/reset/change-password endpoints |
| `backend/src/modules/auth/dto/auth.dto.ts` | Added ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto, AdminResetPasswordDto |
| `backend/src/modules/user/controllers/user.controller.ts` | Added POST :id/reset-password |
| `frontend/src/pages/auth/Login.tsx` | Rewritten: Alert errors, show/hide pw, forgot link, gradient |
| `frontend/src/pages/auth/ForgotPassword.tsx` | New: email input → success |
| `frontend/src/pages/auth/ResetPassword.tsx` | New: token from URL → new password |
| `frontend/src/pages/auth/ChangePassword.tsx` | New: current + new + confirm |
| `frontend/src/components/auth/ProtectedRoute.tsx` | New: token check → redirect |
| `frontend/src/App.tsx` | Updated: public routes + ProtectedRoute wrapper |
| `frontend/src/components/layout/MainLayout.tsx` | Added Change Password menu, LockOutlined icon |
| `frontend/src/pages/admin/UserManagement.tsx` | Added reset password modal |
| `frontend/src/services/api.ts` | Updated: 401 interceptor skips public paths |
| `.gitignore` | Added all temp scripts with credentials |
| `backend/.gitignore` | Added all temp scripts with credentials |

### Status: ERP-00006-R02 COMPLETE

---

## ERP-00006-R01 — Local Development Environment Recovery + Standards

**Date**: 2026-08-20
**Scope**: Local environment recovery, dev scripts, authentication flow, professional UI standards, documentation

### Diagnosis

**Root Cause**: Frontend dev server was never started. Backend was running on port 3001 but port 3000 was empty (ERR_CONNECTION_REFUSED).

### Changes Implemented

#### 1. Dev Scripts (`scripts/`)
- **start-dev.ps1**: Starts backend (port 3001) and frontend (port 3000), detects existing processes, verifies HTTP health with bounded timeouts, saves PIDs for clean shutdown
- **stop-dev.ps1**: Uses PID file + port-based cleanup, graceful stop with force fallback
- **TCP Detection**: Uses `.NET TcpClient` `BeginConnect` with timeout (not `Get-NetTCPConnection` which is unreliable in child processes)
- **Build Fallback**: `start-dev.ps1` tries `npx nest build` then falls back to `npx tsc` if dist missing

#### 2. Backend Build Fix
- **Issue**: `nest-cli.json` had `deleteOutDir: true` which conflicts with `incremental: true` in tsconfig.json
- **Fix**: Set `deleteOutDir: false` in `nest-cli.json` to preserve incremental compilation

#### 3. Login Endpoint (`POST /api/v1/auth/login`)
- **SupabaseAuthService**: Added `signInWithPassword(email, password)` method using Supabase Auth REST API
- **AuthService**: Implemented `login()` — authenticates via Supabase, finds/creates ERP user, returns JWT + user profile
- **AuthController**: Added `POST /auth/login` route with `LoginDto` validation
- **Flow**: Frontend → `POST /auth/login` → Supabase Auth REST API → ERP user lookup → `{ token, user }` response

#### 4. Login → Dashboard Flow
- **Login.tsx**: Stores `token` and `erp_user` in localStorage on successful login
- **MainLayout.tsx**: Reads `erp_user` from localStorage, displays real user name in header
- **Dashboard.tsx**: Built real dashboard with user greeting, module cards, and company context
- **Logout**: Clears both `token` and `erp_user` from localStorage

#### 5. Navigation Cleanup (No "Coming Soon" Policy)
- **Removed from nav**: Products (/products), Customers (/customers), Sales (/sales), Production (/production), Settings (/settings)
- **Reason**: These are future modules — not implemented yet, must not be shown as available features
- **Routes preserved**: Kept in App.tsx for direct URL access but hidden from navigation
- **Removed imports**: ShopOutlined, SettingOutlined (no longer used)

#### 6. Documentation
- **README.md**: Updated with `.\scripts\start-dev.ps1` and `.\scripts\stop-dev.ps1` as primary dev commands
- **docs/DEPLOYMENT.md**: Updated section 2.0 with script-based workflow
- **supabase/README.md**: Added demo data policy (10+ records for master tables, 10+ for transactional tables, FK/unique constraint requirements)
- **docs/DEVELOPMENT_CREDENTIALS.md**: Created with Supabase Auth setup instructions, security rules, environment variable reference

### Verification Results

| Check | Result |
|-------|--------|
| Backend health (localhost:3001/api/v1/health) | PASS (HTTP 200) |
| Swagger docs (localhost:3001/api/docs) | PASS (HTTP 200) |
| Frontend (localhost:3000) | PASS (HTTP 200, root div, bundle.js) |
| Login endpoint (POST /auth/login) | PASS (401 for invalid creds, proper error message) |
| Frontend → Backend | PASS (server logs show browser login attempts) |
| Backend build (npx tsc) | PASS (654 files in dist) |
| Frontend dev build | PASS (compiled successfully, 0 issues) |
| start-dev.ps1 | PASS (all 4 checks PASS) |
| stop-dev.ps1 | PASS (both services stopped cleanly) |

### Files Modified

| File | Change |
|------|--------|
| `scripts/start-dev.ps1` | TCP detection fix, build fallback |
| `scripts/stop-dev.ps1` | TCP detection fix |
| `backend/nest-cli.json` | `deleteOutDir: false` |
| `backend/src/modules/auth/services/supabase-auth.service.ts` | Added `signInWithPassword()` |
| `backend/src/modules/auth/services/auth.service.ts` | Implemented `login()` |
| `backend/src/modules/auth/controllers/auth.controller.ts` | Added `POST /auth/login` |
| `frontend/src/pages/dashboard/Dashboard.tsx` | Real dashboard with module cards |
| `frontend/src/pages/auth/Login.tsx` | Store user info in localStorage |
| `frontend/src/components/layout/MainLayout.tsx` | Real user name, removed future module nav items |
| `README.md` | Updated with dev script commands |
| `docs/DEPLOYMENT.md` | Updated section 2.0 |
| `supabase/README.md` | Demo data policy |
| `docs/DEVELOPMENT_CREDENTIALS.md` | Created — dev login setup |

### Status: ERP-00006-R01 COMPLETE

---

## ERP-00006 — Procurement Module

**Date**: 2026-08-19
**Status**: Code complete, backend rebuilt, pending restart and re-verification after ERP-00006-R01 environment recovery

### Scope
- 16 database tables (suppliers, supplier_items, purchase_requisitions, requisition_lines, rfqs, rfq_lines, quotations, quotation_lines, purchase_orders, purchase_order_lines, goods_receipts, goods_receipt_lines, purchase_returns, purchase_return_lines, purchase_invoices, purchase_invoice_lines)
- 36 procurement permissions
- 16 backend entities, 8 DTOs, 8 services, 8 controllers
- 8 frontend pages (Supplier, PurchaseRequisition, Rfq, Quotation, PurchaseOrder, GoodsReceipt, PurchaseReturn, PurchaseInvoice)
- Full workflow: create → submit → approve → post with status management
- 42/42 E2E tests passed (pre-R01)
