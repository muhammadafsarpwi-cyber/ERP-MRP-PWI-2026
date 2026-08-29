# ERP Module Status Report

Assessment of each ERP module's completeness. Legend: ✅ Complete · ⚠️ Partial · ❌ Missing · 🚧 Incomplete

---

## Organization

| Component | Status | Notes |
|---|---|---|
| Company CRUD | ✅ | Backend + frontend; permission model wrong (B11) |
| Branch CRUD | ✅ | Backend + frontend |
| Division CRUD | ✅ | Backend + frontend; placeholder DIV-001..005 never deactivated |
| Section CRUD | ✅ | Backend + frontend |
| Business Unit CRUD | ✅ | Backend only; no frontend page |
| Department CRUD | ✅ | Backend + frontend |
| Warehouse CRUD | ✅ | Backend + frontend |
| Warehouse Location CRUD | ✅ | Backend + frontend |
| Department-Division Scope | ⚠️ | Backend entity/service; no frontend UI |
| Org-scope enforcement | ⚠️ | `OrgScopeGuard` exists but barely used |

## Auth / IAM

| Component | Status | Notes |
|---|---|---|
| Supabase JWT auth (global) | ✅ | Verified via `APP_GUARD` |
| Login / password | ✅ | Backend controller + frontend login page |
| Password reset flow | ✅ | Forgot → reset → change pages |
| Permission model (DB) | ✅ | `permissions`, `role_permissions`, `user_roles`, `user_organization_scopes` |
| Permission guard | ✅ | Controller-level, works with `@RequirePermission` |
| Permission matrix UI | ✅ | Admin page for bulk role-permission assignment |
| Rate limiting | ⚠️ | In-memory only; won't scale |
| Token refresh | ❌ | `refresh_token` stored but never used (api.ts) |
| RLS enforcement | ❌ | **Zero RLS policies** across 86 tables |
| User provisioning | ⚠️ | `createFull` — auth user then ERP user; orphan-risk (B6) |

## Master Data

| Component | Status | Notes |
|---|---|---|
| Items CRUD | ✅ | Full backend + frontend; attribute values/specs/barcodes/documents |
| Item Categories CRUD | ✅ | Backend + frontend |
| UOMs CRUD | ✅ | Backend + frontend |
| UOM Conversions CRUD | ✅ | Backend + frontend + calculator service |
| Machines CRUD | ✅ | Backend + frontend; 00014b migration broken (B1) |
| Machine Targets CRUD | ✅ | Backend + frontend |
| Shifts | ✅ | Backend entity; no dedicated frontend page (used in production entries) |
| Downtime Reasons | ✅ | Backend entity; no dedicated frontend page |

## Procurement

| Component | Status | Notes |
|---|---|---|
| Suppliers CRUD | ✅ | Backend + frontend |
| Supplier Items | ✅ | Backend entity; no frontend UI |
| Purchase Requisitions | ⚠️ | Backend + frontend, but **no line items UI** (M3), free-text UUIDs (M4) |
| RFQs | ⚠️ | Same as PR |
| Quotations | ⚠️ | Same as PR |
| Purchase Orders | ⚠️ | Same as PR; no PO-for-GR linkage picker |
| Goods Receipts | ⚠️ | Same as PR; no PO selection |
| Purchase Returns | ⚠️ | Same as PR |
| Purchase Invoices | ⚠️ | Same as PR |
| Status transitions | ⚠️ | DRAFT→SUBMITTED→APPROVED→... flow exists but no frontend transition UI |

## Sales

| Component | Status | Notes |
|---|---|---|
| Customers (CRM) | ✅ | Backend + frontend (contacts, addresses) |
| Sales Customers (erp_sales) | ⚠️ | Duplicate customer table; schema not in migrations (B5) |
| Sales Quotations | ⚠️ | Backend + frontend; no line items; schema may not exist |
| Sales Orders | ⚠️ | Same as Quotations |
| Sales Deliveries | ⚠️ | Same; no order picker; batch_id FK missing |
| Sales Invoices | ⚠️ | Same; no SO→Invoice linkage |
| Sales Returns | ⚠️ | Same |

## Inventory

| Component | Status | Notes |
|---|---|---|
| Inventory Balances | ✅ | Backend + ledger view; no `available=on_hand-reserved` trigger |
| Stock Ledger | ✅ | Backend + frontend (StockLedgerView) |
| Batch Management | ⚠️ | Backend + frontend; no expiry checks |
| Serials | ✅ | Backend entity |
| Stock Adjustments | ✅ | Backend + frontend; no posted_by FK |
| Stock Transfers | ✅ | Backend + frontend; no from≠to warehouse check |
| Inventory Reservations | ✅ | Backend + frontend |
| Inventory Policies | ✅ | Backend + frontend |
| Opening Stock | ✅ | Backend controller |
| Stock Reports | ⚠️ | Frontend page shows 3 hardcoded `0` stats |

## Production

| Component | Status | Notes |
|---|---|---|
| BOM (Bill of Materials) | ✅ | Backend + frontend; `In([bom.id])` no-op guard (BL1) |
| BOM Lines | ✅ | Backend + frontend (BOMManagement) |
| Production Routings | ✅ | Backend + frontend; `bom_id NOT NULL` conflict (B4) |
| Routing Operations | ✅ | Backend + frontend |
| Production Orders | ⚠️ | Backend complete; **no frontend page** (M2) |
| Production Order Operations | ⚠️ | Backend entity; no frontend |
| Production Entries | ✅ | Backend + frontend (EntryForm, EntryList, EntryDetail) |
| Production Planning | ⚠️ | Backend service; not frontend-visible |
| Material Issue | ⚠️ | Backend issue/receive flow; no standalone UI |

## Maintenance

| Component | Status | Notes |
|---|---|---|
| Job Cards | ✅ | Full backend + frontend (create/detail/list) |
| Job Card Parts | ❌ | **Unusable** — item_type `SPARE_PART` not in DB CHECK (B10) |
| Job Card Work Logs | ✅ | Backend + frontend |
| Job Card Attachments | ✅ | Backend entity; no frontend UI |
| Job Card Status History | ✅ | Backend entity |
| Complaint Categories | ✅ | Backend + frontend; `ON CONFLICT DO NOTHING` without target → duplicates |
| Failure Categories | ✅ | Same complaint |
| Root Cause Categories | ✅ | Same complaint |
| Teams | ✅ | Backend + frontend; comma-separated UUIDs (M4) |
| PM Plans | ✅ | Backend + frontend; company_id free-text UUID (M4) |
| PM Schedules | ⚠️ | Backend entity; frontend page exists |
| Technicians | ✅ | Backend + frontend |
| Maintenance Dashboard | ✅ | Frontend page with KPIs |
| Maintenance Reports | ✅ | Frontend page |

## Dashboard

| Component | Status | Notes |
|---|---|---|
| Executive Dashboard | ✅ | KPIs, charts, activity feed, machine/department performance |
| Dashboard Filters | ✅ | Company, date range, machine |
| Order Summary | ✅ | Bar chart |
| Production Trend | ✅ | Recharts line chart |
| Inventory Health | ✅ | Stock summary |
| Item Overview | ✅ | Top items |

## Audit / Notifications

| Component | Status | Notes |
|---|---|---|
| Activity Logs | ⚠️ | Backend entity/service; no FK to erp_users |
| Notifications | ⚠️ | Backend entity/service; frontend NotificationBell; no workflow triggers |
| Notification triggers | ❌ | No automatic notification on workflow transitions |

## Development / Admin

| Component | Status | Notes |
|---|---|---|
| User Management | ✅ | Backend + frontend |
| Role Management | ✅ | Backend + frontend |
| Permission Management | ✅ | Backend + frontend |
| Permission Matrix | ✅ | Backend + frontend |
| Settings | ⚠️ | Frontend page exists; basic |
| Development Status | ✅ | Env/db/version info page |

## Missing Modules

| Module | Status | Notes |
|---|---|---|
| Production Orders page | ❌ | No frontend; route doesn't exist |
| QC / Inspection | ❌ | Not in spec |
| HR / Payroll | ❌ | Not in spec |
| Finance / Accounting | ❌ | Not in spec |
| MRP / Planning | ⚠️ | Partial planning service; no UI |
| E2E tests | ❌ | Playwright dev-dep listed but no tests |
| CI Pipeline | ❌ | No CI config |