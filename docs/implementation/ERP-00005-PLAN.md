# ERP-00005 IMPLEMENTATION PLAN

## STATUS: COMPLETE

## Architecture Analysis

### Existing Infrastructure (ERP-00001 through ERP-00004)
- **BaseEntity**: id (UUID), createdAt, updatedAt, createdBy, updatedBy, isActive
- **Warehouses**: Already exist in `organization` module (company_id, warehouse_code, warehouse_type, status)
- **Warehouse Locations**: Already exist with self-referential parent hierarchy
- **Items**: Full item master with batch_tracked, serial_tracked, track_inventory flags
- **UOMs**: Global UOM system with conversions
- **Permissions**: `{module}.{resource}.{action}` pattern, role-based
- **Frontend**: Self-contained pages, Ant Design, apiService singleton

### Module Placement
- **Backend**: New `modules/inventory/` module (separate from organization)
- **Frontend**: Replace placeholder `pages/inventory/` with real CRUD pages
- **Navigation**: New "Inventory" submenu in MainLayout sidebar

## Database Tables (Migration: `20260819140000_inventory_management.sql`)

### New Tables (9)

| Table | Purpose | Key FKs |
|-------|---------|---------|
| `inventory_policies` | Item/warehouse inventory config | item_id, warehouse_id, preferred_location_id |
| `stock_ledger` | Immutable transaction log | item_id, warehouse_id, location_id, uom_id, company_id |
| `stock_adjustments` | Adjustment header (workflow) | company_id, warehouse_id, approved_by, posted_by |
| `stock_adjustment_lines` | Adjustment line items | adjustment_id, item_id, location_id, batch_id, uom_id |
| `stock_transfers` | Transfer header (workflow) | company_id, from_warehouse_id, to_warehouse_id, approved_by |
| `stock_transfer_lines` | Transfer line items | transfer_id, item_id, from_location_id, to_location_id, batch_id, uom_id |
| `inventory_reservations` | Stock reservations | item_id, warehouse_id, location_id, uom_id, reserved_by |
| `inventory_balances` | Current stock position | item_id, warehouse_id, location_id, batch_id, uom_id |
| `batches` | Batch/lot tracking | item_id, warehouse_id, location_id, company_id |

### Columns: `stock_ledger` (Core Table)
```
id UUID PK
created_at TIMESTAMPTZ
created_by UUID
company_id UUID NOT NULL
transaction_type VARCHAR(30) NOT NULL  -- RECEIPT, ISSUE, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT_IN, ADJUSTMENT_OUT, OPENING, RETURN_IN, RETURN_OUT
transaction_date TIMESTAMPTZ NOT NULL
item_id UUID NOT NULL
warehouse_id UUID NOT NULL
location_id UUID
quantity DECIMAL(15,4) NOT NULL
uom_id UUID NOT NULL
direction VARCHAR(10) NOT NULL  -- IN / OUT
reference_type VARCHAR(50)     -- ADJUSTMENT, TRANSFER, OPENING, MANUAL
reference_id UUID              -- FK to adjustment/transfer/etc
reference_number VARCHAR(100)  -- human-readable reference
batch_id UUID
serial_number VARCHAR(100)
notes TEXT
```

### Columns: `inventory_balances`
```
id UUID PK
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
company_id UUID NOT NULL
item_id UUID NOT NULL
warehouse_id UUID NOT NULL
location_id UUID
batch_id UUID
uom_id UUID NOT NULL
on_hand DECIMAL(15,4) DEFAULT 0
reserved DECIMAL(15,4) DEFAULT 0
available DECIMAL(15,4) DEFAULT 0  -- computed: on_hand - reserved
```

### Columns: `inventory_policies`
```
item_id UUID NOT NULL
warehouse_id UUID NOT NULL
minimum_stock DECIMAL(15,4) DEFAULT 0
maximum_stock DECIMAL(15,4) DEFAULT 0
reorder_level DECIMAL(15,4) DEFAULT 0
reorder_quantity DECIMAL(15,4) DEFAULT 0
safety_stock DECIMAL(15,4) DEFAULT 0
lead_time_days INTEGER DEFAULT 0
preferred_location_id UUID
tracking_type VARCHAR(10) DEFAULT 'NONE'  -- NONE, BATCH, SERIAL
allow_negative_stock BOOLEAN DEFAULT false
```

### Columns: `stock_adjustments`
```
company_id UUID NOT NULL
warehouse_id UUID NOT NULL
adjustment_code VARCHAR(50) NOT NULL
adjustment_type VARCHAR(20) NOT NULL  -- INCREASE, DECREASE, REVALUATION
reason TEXT
status VARCHAR(20) DEFAULT 'DRAFT'    -- DRAFT, SUBMITTED, APPROVED, POSTED, CANCELLED
approved_by UUID
approved_at TIMESTAMPTZ
posted_by UUID
posted_at TIMESTAMPTZ
```

### Columns: `stock_transfers`
```
company_id UUID NOT NULL
transfer_code VARCHAR(50) NOT NULL
from_warehouse_id UUID NOT NULL
to_warehouse_id UUID NOT NULL
from_location_id UUID
to_location_id UUID
status VARCHAR(20) DEFAULT 'DRAFT'  -- DRAFT, APPROVED, POSTED, CANCELLED
approved_by UUID
approved_at TIMESTAMPTZ
posted_by UUID
posted_at TIMESTAMPTZ
```

### Columns: `batches`
```
company_id UUID NOT NULL
item_id UUID NOT NULL
warehouse_id UUID NOT NULL
location_id UUID
batch_number VARCHAR(100) NOT NULL
manufacturing_date DATE
expiry_date DATE
supplier_reference VARCHAR(255)
quantity DECIMAL(15,4) DEFAULT 0
status VARCHAR(20) DEFAULT 'ACTIVE'
```

## Backend Module Structure

```
backend/src/modules/inventory/
├── entities/
│   ├── inventory-policy.entity.ts
│   ├── stock-ledger.entity.ts
│   ├── stock-adjustment.entity.ts
│   ├── stock-adjustment-line.entity.ts
│   ├── stock-transfer.entity.ts
│   ├── stock-transfer-line.entity.ts
│   ├── inventory-reservation.entity.ts
│   ├── inventory-balance.entity.ts
│   └── batch.entity.ts
├── dto/
│   ├── inventory-policy.dto.ts
│   ├── stock-adjustment.dto.ts
│   ├── stock-transfer.dto.ts
│   ├── inventory-reservation.dto.ts
│   ├── batch.dto.ts
│   └── stock-report.dto.ts
├── services/
│   ├── inventory-policy.service.ts
│   ├── stock-ledger.service.ts
│   ├── stock-adjustment.service.ts
│   ├── stock-transfer.service.ts
│   ├── inventory-reservation.service.ts
│   ├── inventory-balance.service.ts
│   └── batch.service.ts
├── controllers/
│   ├── inventory-policy.controller.ts
│   ├── stock-adjustment.controller.ts
│   ├── stock-transfer.controller.ts
│   ├── inventory-reservation.controller.ts
│   ├── inventory-balance.controller.ts
│   ├── batch.controller.ts
│   └── inventory-report.controller.ts
└── inventory.module.ts
```

## Frontend Pages

```
frontend/src/pages/inventory/
├── WarehouseManagement.tsx     (enhance existing org page OR new)
├── LocationManagement.tsx      (enhance existing org page OR new)
├── InventoryPolicyManagement.tsx
├── OpeningStockManagement.tsx
├── StockLedgerView.tsx         (read-only ledger view)
├── StockAdjustmentManagement.tsx
├── StockTransferManagement.tsx
├── ReservationManagement.tsx
├── BatchManagement.tsx
├── SerialNumberManagement.tsx
└── InventoryReports.tsx
```

## Permissions

### Warehouse (already exist in ERP-00001, verify)
- warehouse.view, warehouse.create, warehouse.update, warehouse.activate, warehouse.deactivate

### Location (already exist in ERP-00001, verify)
- warehouse_location.view, warehouse_location.create, warehouse_location.update

### Inventory (new)
- inventory.view
- inventory.adjustment.create
- inventory.adjustment.submit
- inventory.adjustment.approve
- inventory.adjustment.post
- inventory.transfer.create
- inventory.transfer.approve
- inventory.transfer.post
- inventory.reservation.view
- inventory.reservation.create
- inventory.reservation.release
- inventory.opening_stock.create
- inventory.batch.view
- inventory.batch.manage
- inventory.serial.view
- inventory.serial.manage
- inventory.reports.view

## Implementation Order

1. **Migration** - Create all tables, constraints, indexes, permissions
2. **Entities** - TypeORM entities matching migration
3. **DTOs** - Validation and API documentation
4. **Services** - Business logic (stock ledger as source of truth, balance calculations)
5. **Controllers** - REST endpoints with auth + permission guards
6. **Module Registration** - Add InventoryModule to AppModule
7. **Frontend** - CRUD pages, navigation
8. **Build & Test** - Verify everything works

## Key Business Rules

1. **Stock Ledger is Immutable** - Never UPDATE or DELETE ledger records
2. **Balances Derived from Ledger** - inventory_balances maintained transactionally
3. **No Hard Delete** - Stock history preserved, adjustments create reverse entries
4. **Decimal Precision** - All quantities use DECIMAL(15,4), never float
5. **Company Isolation** - All queries scoped by company_id
6. **Workflow Enforcement** - Adjustments/transfers go through DRAFT→APPROVED→POSTED
7. **Balance Validation** - Negative stock blocked unless allow_negative_stock policy
