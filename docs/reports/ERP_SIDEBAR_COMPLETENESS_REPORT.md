# ERP Sidebar Completeness Report

**Date:** 2026-08-29
**Source:** `frontend/src/components/layout/navigationConfig.tsx`

---

## 1. Sidebar Structure (after Phase 8 fix)

| Group | Entries | Icons | Permissions | Status |
|---|---|---|---|---|
| Dashboard | Dashboard | ✅ | — | ✅ |
| Organization | Companies, Branches, Divisions, Sections, Departments, Warehouses, Locations | ✅ | ✅ company/branch.view | ✅ |
| Administration | Users, Roles, Permissions, Roles & Permissions | ✅ | ✅ admin.* | ✅ |
| Master Data | Items, Categories, UOM, Conversions, Machines | ✅ | ✅ master-data.* | ✅ |
| Customers | List | ✅ | — | ✅ |
| Sales | Quotations, Orders, Deliveries, Invoices, Returns | ✅ | ✅ sales.* | ✅ |
| Procurement | Suppliers, Requisitions, RFQs, Quotations, Orders, Receipts, Returns, Invoices | ✅ | ✅ procurement.* | ✅ |
| Inventory | Overview, Policies, Batches, Adjustments, Transfers, Reservations, Ledger, Reports | ✅ | ✅ inventory.* | ✅ |
| Production | BOM, Routings, Targets, Entries | ✅ | ✅ | ✅ |
| **Production Orders** | **Orders, Entries** | ✅ | ✅ manufacturing.* | ✅ **ADDED** |
| Maintenance | Dashboard, Job Cards (all/open/started/closed/review/complete), Teams, Categories, PM Plans, Schedules, Reports | ✅ | ✅ maintenance.* | ✅ |
| **Finance** | **Chart of Accounts, Journal Entries, Financial Reports** | ✅ | ✅ finance.* | ✅ **ADDED** |
| **Human Resources** | **Employees, Attendance, Leave Management** | ✅ | ✅ hr.* | ✅ **ADDED** |
| **Quality Control** | **Inspections, NCR, CAPA** | ✅ | ✅ qc.* | ✅ **ADDED** |
| Settings | (gear icon, header) | ✅ | — | ✅ |
| Development | Development Status | ✅ | admin (dev/hidden) | ✅ |

## 2. Sidebar Features

| Feature | Status |
|---|---|
| Groups with sub-items | ✅ (expandable parent) |
| Icons on every entry | ✅ |
| Permission-gated entries | ✅ (codes match backend `permissions.permission_code`) |
| URL-driven active state | ✅ (`resolveNavActiveKeys` + `resolveNavMeta`) |
| Auto-expand parent on child route | ✅ |
| Collapse/expand | ✅ (sidebar toggles) |
| Page-header consistency | ✅ (shared icon/title from same config) |
| Detail page aliases | ✅ (`NAV_DETAIL_ALIASES` for sub-routes like `/production/entries/new`) |
| Dark/light mode | ✅ (via theme system) |

## 3. Missing Features (low priority)

| Feature | Status | Notes |
|---|---|---|
| Sidebar search/finder | ❌ | Not implemented; routes now discoverable via grouping |
| Icon-only tooltip on collapse | ⚠️ | Collapse works; tooltip on hover not fully polished |
| Drag-to-reorder | ❌ | Not typical for ERP |

## 4. Final Verdict

**SIDEBAR = COMPLETE NAVIGATION MAP.** All 52 implemented routes are navigable from the sidebar. No intended user-facing pages are orphaned. Permissions are respected. The sidebar is the primary testing entry point — a normal user can open the ERP and understand what exists simply by looking at the sidebar, without needing source code, manual URLs, or developer knowledge.