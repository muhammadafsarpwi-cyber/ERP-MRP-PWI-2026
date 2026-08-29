# ERP-MRP-PWI-2026 — Forensic Audit Report

**Date:** 2026-08-29
**Scope:** Entire repository (backend, frontend, Supabase migrations, database, auth, workflows, theme, demo data, build/env config)
**Method:** Full source inspection of 35 SQL migrations, ~100 backend TS modules, ~90 frontend pages/components + live build/test/lint verification.
**Constraint:** No files were modified during this audit.

---

## 0. Verification Commands Run (actually executed)

| Command | Result |
|---|---|
| `backend npm run build` (nest build) | ✅ PASS (compiles) |
| `backend npx tsc --noEmit` | ✅ PASS (no type errors) |
| `backend npm test` | ⚠️ **8 FAILED, 372 PASSED** (broken CompanyController spec) |
| `backend npx eslint src/**/*.ts` | ❌ **FAIL** — no ESLint config file found (`npm run lint` is broken) |
| `frontend npm run build` | ✅ PASS (858.4 kB gzip main bundle — warning) |
| `frontend npx tsc --noEmit` | ✅ PASS (no type errors) |
| `frontend npm test` | ✅ PASS (35 passed, 2 suites; react-router v6 deprecation warnings) |
| SQL migration scan (35 files) | ❌ **0 RLS policies / 0 ENABLE RLS / 0 GRANT statements** (grep verified) |
| `00014b` unterminated regex literal | ❌ **Confirmed** at `20260822040000...sql:202` |

**Legend:** ✅ verified working · ⚠️ partially working · ❌ broken

---

## 1. WORKING (verified)

| Area | Detail | Verification |
|---|---|---|
| Backend compile | NestJS app builds cleanly (`nest build`, `tsc --noEmit`) | ✅ |
| Frontend compile | React app builds cleanly (CRA production build) | ✅ |
| Auth token verification | `SupabaseJwtGuard` global via `APP_GUARD`; local JWT verify + Supabase API fallback | ✅ code verified |
| Global validation pipe | `whitelist + forbidNonWhitelisted + transform` in `main.ts` | ✅ |
| CORS allow-list | Production accepts only configured `FRONTEND_URL`; LAN dev origins in non-prod | ✅ |
| Swagger gating | `/api/docs` disabled in production unless `ENABLE_SWAGGER=true` | ✅ |
| Frontend routing | 40+ routes wired; sidebar navigationConfig with permission keys; protected routes | ✅ |
| Theme system | 20 palettes × light/dark, per-user scope via zustand + localStorage, CSS vars | ✅ (verified code + build) |
| Backend unit tests | 372 tests pass across 21 suites | ⚠️ partial (see Broken) |
| Frontend tests | 35 tests pass (auth smoke + navigation config) | ✅ |
| Entity/DB mapping | Entities map to Supabase DDL for most core tables; indexes & uniques exist in DDL (421 indexes, 303 FK refs) | ✅ |
| Maintenance module | 00021–00027 migrations + full job-card/PM/team/technician backend + 6 frontend pages | ✅ |
| Production module | Production orders, entries, machine targets, BOM, routing — controllers/services/tests present | ✅ |
| Dashboard | Summary/activity KPIs, filters, charts (recharts) | ✅ |

---

## 2. BROKEN (verified)

| # | Severity | File / Component | Problem | Why it matters | Recommended fix |
|---|---|---|---|---|---|
| B1 | CRITICAL | `supabase/migrations/20260822040000_erp_00014b_machine_master_alignment.sql:202` | Unterminated regex literal `WHERE machine_id ~ '^MCH[0-9]{3} AND is_active; AND is_active;` — string never closed, no `$` anchor. | Migration 00014b fails with a syntax error at the verification DO block; machines alignment is a dependency for 00015/00016/00017. | Fix to `~ '^MCH[0-9]{3}$' AND is_active`. Also fix mojibake (`â”€â”€`) at lines 45/195. |
| B2 | CRITICAL | `supabase/migrations/20260821140000...00009`, `...00010`, `...00011`, `...00017` | Hardcoded company UUID `7725aa04-a270-4314-9e82-90949cbe7791` is referenced (5 files) but **never inserted** anywhere. BOM, divisions/departments, sample items all FK-reference it. | Migrations abort on a clean apply (FK violation `companies`), or silently no-op (00011 placeholder deactivation never runs). | Insert the fixed company row with that exact UUID first, or resolve via `SELECT id FROM companies WHERE company_code='COMP-001'`. |
| B3 | CRITICAL | `supabase/migrations/20260821130000_fix_super_admin_permissions_and_role.sql` | Inserts `user_roles` for hardcoded user `52e0c38e-2b29-47ca-9fa5-30dcbadea734` — `erp_users` is **never seeded** anywhere in the 35 migrations. | Migration aborts (FK `user_roles.user_id → erp_users.id`) on clean apply. | Seed the super-admin `erp_users` row first, or make the insert conditional (`WHERE EXISTS`). |
| B4 | CRITICAL | `supabase/migrations/20260824000000_erp_00017_item_master_extension.sql` | Inserts sample routings with `bom_id = NULL`, but `production_routings.bom_id` was created `NOT NULL` in 00010. | NOT NULL violation aborts 00017 at the first routing insert. | Make `bom_id` nullable or supply a real BOM id. |
| B5 | CRITICAL | `supabase/migrations/20260820120000_sales_module.sql` + all seeds | `erp_sales` schema is referenced (`sales_orders`, `sales_invoices`, `customers`, `quotations`, `quotation_items`, `sales_order_items`) but **never created** by any file in this folder. | FK failures on the whole sales seed path (`42P01` / FK violations). | Add a base `erp_sales` schema migration that creates these tables before 20260820120000. |
| B6 | HIGH | `backend/src/modules/user/services/erp-user.service.ts:90-184` | Auth user (`auth.users` + `auth.identities`) is committed at line 137; ERP user created **outside** the transaction (line 140). If ERP-user save fails, auth user is orphaned. | Duplicate/orphaned auth accounts; `createFull` not atomic. | Use the same queryRunner for the ERP user insert, or compensate (delete auth user) on failure. |
| B7 | HIGH | `frontend/src/pages/production/entries/EntryDetail.tsx:129` | Links to `/production/orders/:id` but **no such route exists** in `App.tsx`. | Clicking the production-order link → blank/redirected (404). | Add a Production Orders page + route, or remove the link. |
| B8 | HIGH | `backend/package.json` (`lint` script) | `npm run lint` is broken — **no ESLint config file** exists in the backend (verified: "ESLint couldn't find a configuration file"). | No lint enforcement; code quality can't be checked via the documented command. | Add `.eslintrc.js` (or `eslint.config.js`) with `@typescript-eslint` + prettier presets. |
| B9 | HIGH | `frontend/src/services/api.ts:41-46` | `refresh_token` is stored (line 43) but **never used**; on 401 the user is force-logged-out via `window.location.href='/login'` (full reload, all state lost). | Token expiry = session loss + jarring full page reload; no silent refresh. | Add a 401-triggered refresh interceptor calling `/auth/refresh` with `refresh_token`; navigate via router/event. |
| B10 | HIGH | Maintenance spare-parts feature | `items.item_type` CHECK (item_master.sql:111) does **not** allow `SPARE_PART`, yet `SparePartsPanel.tsx:188` requires a "SPARE_PART type" item and demo data `00022:107` filters `item_type='SPARE_PART'`. | Spare-parts feature is unusable: no item can ever be `SPARE_PART`, so part selection and demo seeding silently fail. | Add `SPARE_PART` to the item_type CHECK, or change UI/demo to an existing type (e.g. `CONSUMABLE`). |
| B11 | HIGH | `backend/src/modules/organization/controllers/company.controller.ts:11` | Entire CompanyController (create/view/update/delete) gated by a single wrong permission `admin.users.update`. | Users with `admin.users.update` can delete companies; users with only `organization.company.*` can't view them. | Use per-action permissions `organization.company.create/view/update/delete`. |

---

## 3. MISSING

| # | Severity | Area | What's missing | Recommended fix |
|---|---|---|---|---|
| M1 | CRITICAL | DB security | **RLS entirely absent** — 0 `CREATE POLICY`, 0 `ENABLE ROW LEVEL SECURITY` across all 35 migrations. In Supabase, public-schema tables default to anon/authenticated access via PostgREST. | Enable RLS on all tables; add org-scoped policies keyed off `user_organization_scopes`. |
| M2 | HIGH | Frontend | No **Production Orders** management page (backend has the module; `EntryDetail` links to it). | Implement the page + route. |
| M3 | HIGH | Frontend | **Line-items editing** missing from all procurement/sales create/edit forms (PO, PR, RFQ, Quotation, GR, Invoice, Return, SO, Sales Quotation, Delivery, Invoice, Return). A PO/SO without lines is meaningless. | Add `Form.List` line-item editors with product/UOM/quantity/price + totals. |
| M4 | HIGH | Frontend | **FK dropdowns** missing — `companyId`, `supplierId`, `customerId`, `quotationId`, `poId`, `warehouseId`, `memberUserIds` are free-text UUID `<Input>` fields (e.g. `PurchaseOrderManagement.tsx:144-163`, `PmPlansList.tsx:151`, `TeamsList.tsx:225`). | Replace with `<Select>` populated from reference APIs. |
| M5 | MEDIUM | Backend | **Org-scope enforcement** — `OrgScopeGuard`/`RequireOrgScope` is defined but barely used; most controllers only check permissions, not company/division/section scope. | Apply `@UseGuards(OrgScopeGuard)` + `@RequireOrgScope()` to scoped modules. |
| M6 | MEDIUM | Backend | **Action-level permissions** — dashboard `summary`/`activity` and most CRUD endpoints lack `@RequirePermission(...)` (only class-level or none). | Decorate every mutating/list endpoint. |
| M7 | MEDIUM | Frontend | **Permission gating on pages** — once inside a page, create/edit/delete buttons are shown regardless of permissions (only sidebar nav + ProtectedRoute check). | Wrap actions in `PermissionGate`/`can()`. |
| M8 | LOW | Frontend | QC, finance/accounting, HR/payroll, general reports pages — advertised in README but not present. | Either implement or remove from README/roadmap. |
| M9 | LOW | Frontend | Export (CSV/PDF) on StockLedgerView/InventoryReports is a placeholder comment; `handleExport` unimplemented. | Implement or hide the button. |

---

## 4. PARTIALLY IMPLEMENTED

| # | Severity | Area | Detail |
|---|---|---|---|
| P1 | HIGH | Sales module | Backend entities/controllers/services exist for quotations/orders/invoices/deliveries/returns, but the schema the backend maps to (`erp_sales`) is not created by the repo's migrations, and frontend forms can't capture line items. |
| P2 | HIGH | Auth/user provisioning | `createFull` creates the auth user then the ERP user; password reset/invite flows exist but the "ERP user ↔ auth user" linkage is fragile (see B6) and `erp_users` is never seeded by migrations. |
| P3 | MEDIUM | Inventory | Balances/ledger/transfers/adjustments/reservations are implemented, but available-quantity arithmetic (`available = on_hand - reserved`) is not enforced at DB level; negative stock possible. |
| P4 | MEDIUM | Production planning | BOM/Routing/orders/entries exist, but MRP material requirement validation is guarded by app-layer only, and code-generation is non-atomic (race conditions). |
| P5 | MEDIUM | Reports/Dashboards | Dashboard KPIs are real; inventory "reports" page shows hardcoded `0` for 3 of 4 stats; maintenance reports exist but no general sales/production reports. |
| P6 | LOW | Theme | `--theme-icon-*` CSS vars are static (indigo) and not regenerated when the palette changes in `ThemeProvider.buildCssVars`. |

---

## 5. SECURITY RISKS

| # | Severity | File | Problem | Fix |
|---|---|---|---|---|
| S1 | CRITICAL | `supabase/migrations/*` (all) | No RLS → tables (users, roles, permissions, items, stock_ledger, job cards…) readable/writable by anon/authenticated via PostgREST if exposed. | Enable RLS + policies. |
| S2 | HIGH | `backend/.env` | `DB_SSL_REJECT_UNAUTHORIZED=false` disables TLS cert validation to the Supabase pooler (MITM risk). | Set true / pin cert; store secret in a secret manager, not plain `.env` committed copies. |
| S3 | HIGH | `backend/src/modules/procurement/services/purchase-order.service.ts:132` + `sales/services/sales-order.service.ts:21,31-50` | Mass assignment: `create({ poId, ...dto })` with `dto: any` spreads arbitrary fields. | Whitelist fields / use typed DTOs; the global `forbidNonWhitelisted` pipe helps only for `@Body()` DTOs, not `any`. |
| S4 | MEDIUM | `backend/src/modules/auth/guards/auth-rate-limit.guard.ts:11-12` | In-memory rate limiting — ineffective across multiple instances. | Redis-backed rate limit. |
| S5 | MEDIUM | `backend/src/modules/auth/services/supabase-auth.service.ts:22-25` | Falls back to `http://localhost:54321` + `dummy-key` when Supabase not configured — silently creates a dead client instead of failing fast. | Throw at bootstrap if config missing. |
| S6 | MEDIUM | `backend/src/modules/permission/controllers/permission-matrix.controller.ts:59-66` | `getMyPermissions` calls `getUserPermissions(authUserId)` where `authUserId` is the **Supabase auth id**, but the service expects the **ERP user id** → wrong permission set (or empty). | Resolve ERP user via `findByAuthUserId` before querying. |
| S7 | MEDIUM | `backend/src/modules/customer/...` + `sales/...` update endpoints | `Partial<CreateXDto>` + `Object.assign` allows arbitrary-field updates. | Dedicated update DTOs. |
| S8 | LOW | `backend/src/modules/item/services/item.service.ts:180-182` | `catch { /* table not present — skip */ }` silently skips reference checks before item deletion → can delete referenced items. | Log and fail closed. |

---

## 6. DATABASE RISKS

| # | Severity | Table / Migration | Problem | Fix |
|---|---|---|---|---|
| D1 | CRITICAL | All migrations | Not self-contained: hardcoded UUIDs (company/role/user/BOM items), missing `erp_sales` schema, 00014b syntax error — a clean apply fails in multiple places. | Make migrations idempotent + resolve IDs by lookup; add missing base schema. |
| D2 | HIGH | `user_organization_scopes` | `UNIQUE(user_id, company_id, division_id, section_id, department_id)` with nullable columns → NULLs are distinct → duplicate COMPANY scopes allowed. | Add partial unique index on `(user_id, company_id) WHERE division_id IS NULL AND ...`. |
| D3 | HIGH | `complete_erp_demo_data.sql` (Part 5) | `DELETE FROM item_attribute_values;` wipes the table on every run (destructive in a "seed" migration). | Guard with `WHERE created_by IS NULL` or use `ON CONFLICT`/NOT EXISTS. |
| D4 | HIGH | `machines` (00013) | Divergent duplicate `CREATE TABLE IF NOT EXISTS machines` with a different, smaller schema and conflicting global-unique constraint (vs 00012b canonical). | Remove the duplicate DDL; keep only canonical 00012b. |
| D5 | HIGH | `maintenance_*` | No CHECK constraints on `current_status`, `priority`, `maintenance_type`, `frequency_type/value`, `downtime_minutes`, durations. Any typo state accepted. | Add CHECK vocabularies + `>= 0` ranges. |
| D6 | HIGH | `production_entries`, `stock_ledger`, `inventory_balances`, `goods_receipt_lines`, `purchase_order_lines` | Quantity/available arithmetic unconstrained (negative available, over-receipt, `quantity_accepted+rejected > received`). | DB CHECKs + posting trigger. |
| D7 | MEDIUM | `uoms.company_id`, `production_entries.inventory_reference_id`, `sales_delivery_lines.batch_id`, `production_orders.sales_order_item_id`, `activity_logs.created_by`, `stock_adjustments.approved_by` … | FK columns with **no REFERENCES** (or no FK to `erp_users`). | Add FK constraints. |
| D8 | MEDIUM | `sales_deliveries`, `sales_returns`, `maintenance_job_cards`, `maintenance_pm_plans`, `maintenance_technicians`, `item_barcodes` | Global UNIQUE (not company-scoped) — second tenant collides. | Scope unique keys by `company_id`. |
| D9 | MEDIUM | `purchase_requisition_lines`, `rfq_lines`, `quotation_lines`, `purchase_order_lines`, `goods_receipt_lines`, `purchase_invoice_lines`, `sales_*_lines` | Missing `UNIQUE(parent_id, line_number)` → duplicate lines/idempotency issues. | Add composite unique constraints. |
| D10 | MEDIUM | `public.customers` vs `erp_sales.customers` | Two independent customer masters, no linkage; demo seeds both (CUST-000x vs SC-000x). | Consolidate to one customer table. |
| D11 | MEDIUM | `production_routings.bom_id` | `NOT NULL` but NULL inserted by 00017 (see B4). | Align constraint and data. |
| D12 | LOW | `erp_users` | No FK to `auth.users(id)`; no unique on email; no indexes on default_division/section/department_id. | Add FK + unique email + indexes. |
| D13 | INFO | Numeric types | `DECIMAL(15,4)`/`(15,6)`/`(19,4)`/`NUMERIC(19,4)` mixed for money across modules — no shared precision policy. | Standardize money precision. |

---

## 7. BUSINESS-LOGIC RISKS

| # | Severity | File:Line | Problem | Fix |
|---|---|---|---|---|
| BL1 | HIGH | `backend/src/modules/bom/services/bom.service.ts:156` | `id: In([bom.id]) ? undefined : undefined` — always `undefined`; a no-op (works only because the later `existingActive.id !== bom.id` check compensates). | Replace with `id: Not(bom.id)`. |
| BL2 | MEDIUM | BOM / routing / PO / SO / production order services | Sequence-based code generation (`generateBomCode`, `generateOrderNumber`, `generateRoutingCode`…) is non-atomic → unique-collision race under concurrency. | DB sequence or `INSERT ... ON CONFLICT` + retry. |
| BL3 | MEDIUM | `permission-matrix.service.ts:200-241`, `role.service.ts:104-131` | Batch permission assignments run in a loop without a transaction — partial application on failure. | Wrap in transaction. |
| BL4 | MEDIUM | `machine-target.service.ts:466-479` | `productionFamily` duplicates `uom-conversion.calculator.familyOf` with hardcoded UOM fallbacks — divergence risk. | Single source of truth. |
| BL5 | LOW | `machine-target.service.ts:33` | `PRODUCTION_UOM_CODES = ['KG','PCS','M','METER']` vs error message "allowed: KG, PCS, METER" (omits M). | Sync message/array. |
| BL6 | LOW | `production-entry.service.ts:1088` | `(entry.shift as any)?.plannedHours` — `plannedHours` is a direct `Shift` property; cast hides a real type issue. | Drop the cast, fix typing. |
| BL7 | INFO | `production-order.service.ts:706` | `lineQuantity*orderQuantity*(1+scrapFactor)/yieldPercentage*100` — **reviewed, mathematically correct** (`a/y*100 == a*100/y`); flagged by automated scan as 100x bug but it is not. Document yield as percentage (0–100) to avoid future confusion. | No code change; add comment. |

---

## 8. UI/UX ISSUES

| # | Severity | File | Problem | Fix |
|---|---|---|---|---|
| UX1 | HIGH | All procurement/sales/maintenance forms | Free-text UUID inputs for all FKs (see M4). | Selects/auto-complete. |
| UX2 | HIGH | Procurement/sales pages | No line-items editing (see M3). | Form.List line editors. |
| UX3 | MEDIUM | `Inventory.tsx:48-58` | 3 of 4 stat cards show hardcoded `0`. | Wire to real API data. |
| UX4 | MEDIUM | Inventory pages | API errors silently swallowed (`// silently fail`). | `message.error` with server message. |
| UX5 | MEDIUM | Most CRUD pages | Generic errors ("Failed to fetch…"), no server detail. | Show `err.response.data.message`. |
| UX6 | MEDIUM | Org pages | Raw `<Tag color>` instead of themed `StatusBadge`; theme bypassed. | Use `StatusBadge`. |
| UX7 | MEDIUM | Icon-only buttons (ItemManagement, MachineManagement, etc.) | Missing `aria-label`. | Add labels. |
| UX8 | MEDIUM | Inline styles | Majority of styling via inline `style` — poor maintainability + theming. | Move to CSS classes. |
| UX9 | LOW | `EntryForm.tsx` | Duplicate `runningHours` validator conflicts with onChange clamp (may reject values the handler allowed). | Remove duplicate validator. |
| UX10 | LOW | `DashboardFilters` | `filters.machineId` actually stores `machineCode` (misleading). | Rename. |
| UX11 | LOW | `theme.css:31-42` | `--theme-icon-*` not updated on palette change. | Include in `buildCssVars`. |

---

## 9. PERFORMANCE ISSUES

| # | Severity | Area | Problem | Fix |
|---|---|---|---|---|
| PF1 | MEDIUM | Frontend bundle | `main.9674ea8e.js` = **858 kB gzip** (CRA warning "significantly larger than recommended"); no code splitting. | Route-level `React.lazy`, split vendor chunks. |
| PF2 | MEDIUM | TypeORM | No `eager` loading; many list endpoints build queries with relations → potential N+1; dashboard fires many parallel queries. | Batch/`leftJoinAndSelect`, pagination everywhere. |
| PF3 | LOW | DB | Several FK columns lack indexes (`erp_users` defaults, `items` uom FKs, `serial_numbers` warehouse/location/batch, `production_entries` machine_id/uom_id, job-card created_by/team_id …). | Add indexes on hot FK paths. |
| PF4 | LOW | Auth | Local JWT validation re-runs `validateJwtSecret()` per request until first validation; subsequent calls fine. | Cache once (already cached via flags). |

---

## 10. ERP WORKFLOW ISSUES

| # | Severity | Workflow | Problem | Fix |
|---|---|---|---|---|
| WF1 | HIGH | Procurement | No UI to build lines or pick PO from open orders for GR; no partial-receipt workflow UI. | Add PO selection + line capture + partial receipt. |
| WF2 | HIGH | Sales | No SO→Invoice linkage UI; invoice requires free-text salesOrderId. | Order picker + flow-driven transitions. |
| WF3 | MEDIUM | Production | Production Orders have no frontend page; material-issue/complete flows driven only by API. | Build the missing page. |
| WF4 | MEDIUM | Maintenance | Spare-parts impossible (B10); PM schedule auto-generation → job card linkage unverified in UI. | Fix item type; surface schedule→card flow. |
| WF5 | MEDIUM | Notifications | `NotificationBell` exists but nothing triggers workflow-event notifications from the backend on status changes. | Emit notifications on transitions. |
| WF6 | LOW | Status vocabulary | Mixed-case statuses (`Draft` vs `DRAFT` vs `ACTIVE`), inconsistent across modules. | Standardize uppercase. |

---

## 11. DUPLICATE CODE

| # | Severity | Duplicated logic | Files | Fix |
|---|---|---|---|---|
| DC1 | LOW | `isDatabaseAvailable` DB probe | `app.module.ts:28-45` and `app.service.ts:34-53` | Shared utility. |
| DC2 | LOW | `toNum`/`toNumber`, `validateProductExists`, `round4` | bom.service, production-routing.service, production-order.service, production-entry.service | Shared math/validation utils. |
| DC3 | LOW | `productionFamily` vs `uom-conversion.calculator.familyOf` | machine-target.service vs calculator | Single source. |

---

## 12. DEAD CODE

| # | Severity | File | Detail |
|---|---|---|---|
| DE1 | LOW | `frontend/src/pages/customers/Customers.tsx` | Unused placeholder (route uses `CustomerManagement`). |
| DE2 | LOW | `frontend/src/pages/products/Products.tsx` | "Coming soon" page; `/products/*` route not in sidebar. |
| DE3 | LOW | `frontend/src/pages/maintenance/MaintenancePage.tsx` | Exported but never routed. |
| DE4 | LOW | `backend bom.service.ts:251-253` / `production-routing.service.ts:446-448` | `toNumber` duplicates `toNum`. |
| DE5 | LOW | `backend permission.service.ts:5` | Unused `ErpUser` import. |
| DE6 | INFO | `StockLedgerView.tsx:64`, `InventoryReports.tsx:37` | `search` state declared, never used in UI. |

---

## 13. INCORRECT CALCULATIONS

| # | Severity | File:Line | Issue | Fix |
|---|---|---|---|---|
| IC1 | INFO | `production-order.service.ts:706` | `.../yieldPercentage * 100` — **NOT a bug** (mathematically `a/y*100 = a*100/y`). Flagged by scanner; verified correct for percentage-yield semantics. | Add comment; keep formula. |
| IC2 | MEDIUM | `dashboard` + `production-entry` efficiency calcs | `efficiency = runningHours/plannedHours*100` — no guard when `plannedHours=0` in one spot (returns `null`; OK) but division semantics inconsistent with `achievement%` (0–100 vs fraction). | Standardize percentage vs fraction. |
| IC3 | MEDIUM | Procurement/sales totals | Totals rely on app-layer sum; no DB CHECK `received<=ordered`, `paid<=total`, `accepted+rejected<=received`. | Add CHECKs (see D6). |

---

## 14. PERMISSION GAPS

| # | Severity | Gap | Detail |
|---|---|---|---|
| PG1 | HIGH | Company controller | Entire CRUD gated by `admin.users.update` (B11). |
| PG2 | HIGH | Dashboard | `summary`/`activity` accessible to any authenticated user (no `@RequirePermission`). |
| PG3 | MEDIUM | Org scope | `OrgScopeGuard` unused broadly — cross-company data access possible. |
| PG4 | MEDIUM | Frontend actions | Create/edit/delete buttons not gated on-page. |
| PG5 | MEDIUM | IAM case-sensitivity | `permissions.action` mixes UPPER/lower (`DELETE` vs `delete`); ADMIN grant filters only UPPERCASE → lowercase item/manufacturing deletes not stripped. |

---

## 15. RLS GAPS

| # | Severity | Gap |
|---|---|---|
| RLS1 | CRITICAL | Zero RLS enabled on any of 86 tables (verified by grep across all 35 migrations). |
| RLS2 | CRITICAL | No policies keyed to `user_organization_scopes` — even if RLS were enabled, org-scoped policies don't exist. |
| RLS3 | HIGH | Sensitive tables (`erp_users`, `roles`, `role_permissions`, `permissions`, `user_organization_scopes`, `stock_ledger`, `activity_logs`) all fully open. |

---

## 16. MISSING INDEXES

Add to (list is not exhaustive):
- `erp_users`: default_division_id, default_section_id, default_department_id
- `items`: weight_uom_id, dimension_uom_id, volume_uom_id
- `serial_numbers`: warehouse_id, location_id, batch_id
- `production_entries`: machine_id, downtime_reason_id, uom_id
- `maintenance_job_cards`: root_cause_category_id, failure_category_id, team_id, requested_by, created_by
- `activity_logs`: created_by, updated_by
- TypeORM entities declare many `@Index()` that may not exist in DB (production/machine/maintenance) — audit `information_schema` vs entity decorators.

## 17. MISSING FOREIGN KEYS

- `uoms.company_id` → `companies(id)`
- `production_entries.inventory_reference_id` → `stock_ledger(id)`
- `erp_sales.sales_delivery_lines.batch_id` → `batches(id)`
- `production_orders.sales_order_item_id` → `erp_sales.sales_order_items(id)`
- `activity_logs.created_by/updated_by`, `stock_adjustments.approved_by/posted_by`, `stock_transfers.approved_by/posted_by`, `inventory_reservations.reserved_by`, `purchase_orders.approved_by`, `quotations.evaluated_by`, `customers.assigned_to` → `erp_users(id)`
- `erp_users.auth_user_id` → `auth.users(id)` (Supabase pattern)

## 18. MISSING VALIDATION

| Area | Detail |
|---|---|
| Backend DTOs | Many status fields are plain `@IsString()` instead of `@IsEnum`; string fields lack `@MaxLength`; `AddWorkLogDto.technicianUserId` is `@IsString` not `@IsUUID`. |
| DB | Status/priority/frequency enums unconstrained (D5); quantity/precision CHECKs missing (D6). |
| Frontend | UUID fields unvalidated; no select dropdowns (M4); duplicate validator in EntryForm (UX9). |

## 19. MISSING ERROR HANDLING

| # | Severity | File | Issue |
|---|---|---|---|
| EH1 | MEDIUM | `notifications.service.ts:71-73` | Errors silently swallowed (`logger.warn`). |
| EH2 | MEDIUM | `activity-log.service.ts:42-43` | `return null as any` on failure — null-deref risk downstream. |
| EH3 | MEDIUM | `item.service.ts:180-182` | Reference checks skipped on missing tables → unsafe deletes. |
| EH4 | LOW | Frontend inventory pages | Errors ignored (`// silently fail`). |

## 20. MISSING DEMO / SAMPLE DATA

| # | Severity | Detail |
|---|---|---|
| DM1 | HIGH | **`erp_users` never seeded** — `v_admin := (SELECT id FROM erp_users LIMIT 1)` is NULL across the whole demo seed → all `created_by` audit columns NULL, role-permission grants for users no-op. |
| DM2 | HIGH | 00022 spare-parts demo silently never inserts (item_type SPARE_PART doesn't exist). |
| DM3 | MEDIUM | `00010` demo routing: `uoms WHERE code='Pcs'` — seeded UOM is `PC` → falls back to first UOM; `BOM-002`/`SLD-0001`/`WH-MAIN-001` assumed pre-existing. |
| DM4 | MEDIUM | `00011` placeholder deactivation (DIV-001..005) is a silent no-op (wrong company UUID). |
| DM5 | LOW | No sales/inventory/production report sample datasets; dashboard trends depend on manual data. |

---

## 21. TYPEORM vs SUPABASE MIGRATION DRIFT

| Severity | Detail |
|---|---|
| HIGH | Backend has only **3 TypeORM migrations** (org tables, notifications, demo item seed) vs **35 Supabase migrations**; the TypeORM org migration predates `divisions`/`sections` and the `departments.division_id/section_id` FKs. `schema:sync`/`migration:run` would conflict with the Supabase-applied schema. |
| HIGH | Entity `@Index()`/`@Unique()` decorators (production, machine, maintenance) do not match the actual DDL in places — `synchronize=false` means the entity metadata and DB schema can silently diverge. |
| MEDIUM | Entity/DTO length mismatches (e.g. `Uom.symbol` len 20 vs VARCHAR(50); `ItemSpecification.specValue` varchar(500) vs TEXT; `ItemDocument.fileUrl` 1000 vs 500). |

---

## 22. OVERALL ERP READINESS SCORE

### **Score: 55 / 100**  (Not production-ready)

**Breakdown:**

| Dimension | Score /100 | Rationale |
|---|---|---|
| Architecture & structure | 80 | Clean modular NestJS + React + TypeORM; consistent patterns |
| Build health | 85 | Backend & frontend compile; 372 backend + 35 frontend tests pass |
| Test coverage quality | 55 | 8 failing tests; 22 suites cover only a subset; no e2e |
| Database schema breadth | 65 | 86 tables, 421 indexes, 303 FKs — but critical integrity gaps |
| Database migration reliability | 25 | 5 CRITICAL clean-apply blockers; hardcoded UUIDs; not self-contained |
| Security | 30 | No RLS anywhere; mass assignment; SSL verify disabled; weak rate limiting |
| Authorization model | 35 | Guards exist but scope enforcement + permission wiring incomplete |
| Frontend workflow completeness | 35 | No line items, no FK pickers, missing production-orders page, no refresh token |
| Business-logic correctness | 70 | Verified correct MRP math; isolated bugs, no systemic miscalculation |
| Maintenance & production modules | 60 | Rich feature set but spare-parts broken and PM→job-card linkage unverified |
| Theme system | 75 | Functional 20-palette system; minor icon-var/static-color gaps |
| Demo data | 40 | Broad but broken (erp_users, SPARE_PART, hardcoded UUIDs) |
| Tooling (lint/CI) | 30 | ESLint broken (no config); no CI config; no typecheck script wired |

**Gate to reach 80+:** (1) enable RLS + policies; (2) make migrations self-contained/idempotent (fix 00014b, hardcoded UUIDs, missing erp_sales, 00017 NULL bom); (3) seed erp_users; (4) fix SPARE_PART; (5) fix CompanyController permission + getMyPermissions ID bug; (6) add line items + FK pickers to frontend forms; (7) implement token refresh; (8) add ESLint config + fix failing CompanyController spec; (9) enforce DB CHECKs/FKs.

---

## Appendix — Files referenced (key)

- `backend/src/app.module.ts`, `backend/src/main.ts`, `backend/src/config/database.config.ts`
- `backend/src/modules/{auth,user,permission,organization,production,item,bom,inventory,procurement,sales,maintenance,role,dashboard,audit,notification}`
- `frontend/src/App.tsx`, `frontend/src/services/api.ts`, `frontend/src/hooks/usePermission.ts`, `frontend/src/theme/*`
- `supabase/migrations/*.sql` (35 files)
- `backend/src/database/migrations/*` (3 TypeORM migrations)
