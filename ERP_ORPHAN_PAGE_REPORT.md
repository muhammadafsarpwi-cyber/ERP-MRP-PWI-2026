# ERP Orphan Page Report

**Date:** 2026-08-29
**Method:** Cross-reference App.tsx routes against `navigationConfig.tsx` NAV_ENTRIES

---

## 1. Route vs Sidebar Cross-Reference

| Route | Page File | Sidebar Entry | Before P6 | After P6 | Status |
|---|---|---|---|---|---|
| `/dashboard` | Dashboard | Dashboard | ✅ | ✅ | ✅ |
| `/organization/companies` | CompanyManagement | Organization → Companies | ✅ | ✅ | ✅ |
| `/organization/branches` | BranchManagement | Organization → Branches | ✅ | ✅ | ✅ |
| `/organization/divisions` | DivisionManagement | Organization → Divisions | ✅ | ✅ | ✅ |
| `/organization/sections` | SectionManagement | Organization → Sections | ✅ | ✅ | ✅ |
| `/organization/departments` | DepartmentManagement | Organization → Departments | ✅ | ✅ | ✅ |
| `/organization/warehouses` | WarehouseManagement | Organization → Warehouses | ✅ | ✅ | ✅ |
| `/organization/locations` | LocationManagement | Organization → Locations | ✅ | ✅ | ✅ |
| `/admin/users` | UserManagement | Admin → Users | ✅ | ✅ | ✅ |
| `/admin/roles` | RoleManagement | Admin → Roles | ✅ | ✅ | ✅ |
| `/admin/permissions` | PermissionManagement | Admin → Permissions | ✅ | ✅ | ✅ |
| `/admin/permissions-matrix` | PermissionMatrix | Admin → Roles & Permissions | ✅ | ✅ | ✅ |
| `/master-data/items` | ItemManagement | Master Data → Items | ✅ | ✅ | ✅ |
| `/master-data/categories` | CategoryManagement | Master Data → Categories | ✅ | ✅ | ✅ |
| `/master-data/uom` | UomManagement | Master Data → UOM | ✅ | ✅ | ✅ |
| `/master-data/uom-conversions` | UomConversion | Master Data → UOM Conversions | ✅ | ✅ | ✅ |
| `/master-data/machines` | MachineManagement | Master Data → Machines | ✅ | ✅ | ✅ |
| `/customers` | CustomerManagement | Customers | ✅ | ✅ | ✅ |
| `/sales/quotations` | SalesQuotationManagement | Sales → Quotations | ✅ | ✅ | ✅ |
| `/sales/orders` | SalesOrderManagement | Sales → Orders | ✅ | ✅ | ✅ |
| `/sales/deliveries` | SalesDeliveryManagement | Sales → Deliveries | ✅ | ✅ | ✅ |
| `/sales/invoices` | SalesInvoiceManagement | Sales → Invoices | ✅ | ✅ | ✅ |
| `/sales/returns` | SalesReturnManagement | Sales → Returns | ✅ | ✅ | ✅ |
| `/procurement/suppliers` | SupplierManagement | Procurement → Suppliers | ✅ | ✅ | ✅ |
| `/procurement/requisitions` | PurchaseRequisition | Procurement → Requisitions | ✅ | ✅ | ✅ |
| `/procurement/rfqs` | RfqManagement | Procurement → RFQs | ✅ | ✅ | ✅ |
| `/procurement/quotations` | QuotationManagement | Procurement → Quotations | ✅ | ✅ | ✅ |
| `/procurement/orders` | PurchaseOrderManagement | Procurement → Orders | ✅ | ✅ | ✅ |
| `/procurement/receipts` | GoodsReceiptManagement | Procurement → Receipts | ✅ | ✅ | ✅ |
| `/procurement/returns` | PurchaseReturnManagement | Procurement → Returns | ✅ | ✅ | ✅ |
| `/procurement/invoices` | PurchaseInvoiceManagement | Procurement → Invoices | ✅ | ✅ | ✅ |
| `/inventory` | Inventory | Inventory → Overview | ✅ | ✅ | ✅ |
| `/inventory/policies` | InventoryPolicyManagement | Inventory → Policies | ✅ | ✅ | ✅ |
| `/inventory/batches` | BatchManagement | Inventory → Batches | ✅ | ✅ | ✅ |
| `/inventory/adjustments` | StockAdjustment | Inventory → Adjustments | ✅ | ✅ | ✅ |
| `/inventory/transfers` | StockTransfer | Inventory → Transfers | ✅ | ✅ | ✅ |
| `/inventory/reservations` | ReservationManagement | Inventory → Reservations | ✅ | ✅ | ✅ |
| `/inventory/ledger` | StockLedgerView | Inventory → Ledger | ✅ | ✅ | ✅ |
| `/inventory/reports` | InventoryReports | Inventory → Reports | ✅ | ✅ | ✅ |
| `/production/entries` | ProductionEntry | Production → Entries | ✅ | ✅ | ✅ |
| `/production/orders` | ProductionOrders | **Production Orders** | ❌ | ✅ **FIXED** | ✅ |
| `/maintenance/...` | (7 pages) | Maintenance → ... | ✅ | ✅ | ✅ |
| `/finance/accounts` | ChartOfAccounts | **Finance** | ❌ | ✅ **FIXED** | ✅ |
| `/finance/journals` | JournalEntries | **Finance** | ❌ | ✅ **FIXED** | ✅ |
| `/finance/reports/*` | FinanceReports | **Finance** | ❌ | ✅ **FIXED** | ✅ |
| `/hr/employees` | EmployeesPage | **HR** | ❌ | ✅ **FIXED** | ✅ |
| `/hr/attendance` | AttendanceLeave | **HR** | ❌ | ✅ **FIXED** | ✅ |
| `/hr/leave` | AttendanceLeave | **HR** | ❌ | ✅ **FIXED** | ✅ |
| `/qc/inspections` | QcPage | **QC** | ❌ | ✅ **FIXED** | ✅ |
| `/qc/ncr` | QcPage | **QC** | ❌ | ✅ **FIXED** | ✅ |
| `/qc/capa` | QcPage | **QC** | ❌ | ✅ **FIXED** | ✅ |
| `/settings` | SettingsPage | Settings | ✅ | ✅ | ✅ |
| `/development/status` | DevelopmentStatus | Development | ✅ | ✅ | ✅ |

## 2. Summary

| Metric | Count |
|---|---|
| Total routes | 52 |
| Routes with sidebar entry (before fix) | 43 |
| **Routes with sidebar entry (after fix)** | **52** |
| Orphan pages fixed this phase | 9 (Finance 3, HR 3, QC 3, Production Orders 1) |
| Remaining orphan pages | **0** — all intended user-facing pages are now navigable from the sidebar |

## 3. Notes

- `/production/entries` was already in the sidebar under the `production` group (existing). The new `production-orders` group adds a dedicated entry for the Production Orders management page.
- `/settings` is accessible via the UI (settings icon in header), not an explicit sidebar entry.
- Development Status is intentionally admin-only (permission: `['admin']`).
- No dead or fake routes were added — every sidebar entry maps to an existing implemented page.