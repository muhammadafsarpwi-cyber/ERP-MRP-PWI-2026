# Module Boundaries and Dependencies

## 1. Module Overview

The ERP system consists of 34 modules organized into 7 implementation phases. Each module has clear boundaries, responsibilities, and dependencies.

## 2. Module Registry

| ID | Module Name | Phase | Status | Dependencies |
|----|-------------|-------|--------|--------------|
| M01 | Company & Organization | 1 | Implemented | None |
| M02 | Users, Roles & Permissions | 1 | Implemented | M01 |
| M03 | Products & Item Master | 1 | Planned | M01 |
| M04 | Customers & CRM | 1 | Planned | M01, M03 |
| M05 | Sales | 2 | Planned | M01, M03, M04 |
| M06 | Inventory & Warehouse | 2 | Planned | M01, M03 |
| M07 | Purchasing / Procurement | 2 | Planned | M01, M03, M06 |
| M08 | Bill of Materials | 3 | Planned | M03 |
| M09 | Production Planning | 3 | Planned | M03, M06, M08 |
| M10 | Production / Manufacturing | 3 | Planned | M03, M06, M08, M09 |
| M11 | Work Orders | 3 | Planned | M10 |
| M12 | Quality Control | 3 | Planned | M03, M10 |
| M13 | Logistics / Dispatch | 4 | Planned | M05, M06 |
| M14 | Delivery | 4 | Planned | M13 |
| M15 | Returns | 4 | Planned | M05, M06, M14 |
| M16 | Costing | 5 | Planned | M03, M06, M08, M10 |
| M17 | Accounts & Finance | 5 | Planned | M01 |
| M18 | Accounts Receivable | 5 | Planned | M05, M17 |
| M19 | Accounts Payable | 5 | Planned | M07, M17 |
| M20 | Cash & Bank | 5 | Planned | M17 |
| M21 | Fixed Assets | 5 | Planned | M03, M17 |
| M22 | Human Resources | 6 | Planned | M01, M02 |
| M23 | Attendance & Leave | 6 | Planned | M22 |
| M24 | Payroll | 6 | Planned | M22, M23 |
| M25 | Projects / Jobs | 6 | Planned | M01, M02 |
| M26 | Budgeting | 6 | Planned | M17 |
| M27 | Maintenance | 6 | Planned | M03, M10 |
| M28 | Reports & Dashboards | 7 | Planned | All modules |
| M29 | Document Management | 7 | Planned | M01 |
| M30 | Notifications & Approvals | 7 | Planned | M02 |
| M31 | Audit Trail | 7 | Planned | M02 |
| M32 | System Administration | 7 | Planned | M02 |
| M33 | API & Integrations | 7 | Planned | All modules |
| M34 | Backup & Security | 7 | Planned | M32 |

## 3. Module Boundaries

### 3.1 M01: Company & Organization
**Purpose**: Define organizational structure and company information.

**Status**: Implemented (ERP-00002, ERP-00002-R01)

**Responsibilities**:
- Company master data (name, address, tax IDs, registration)
- Branch management within companies
- Business unit management
- Division management (organizational hierarchy level 1)
- Section management (organizational hierarchy level 2)
- Department hierarchy management (with Division/Section assignment)
- Warehouse management
- Warehouse location hierarchy
- Multi-company support (future)
- Company-level settings and configurations

**Boundaries**:
- Does NOT manage users (M02)
- Does NOT manage products (M03)
- Provides organizational context for all other modules

**Entities**:
- Company
- Branch
- BusinessUnit
- Division (NEW in ERP-00002-R01)
- Section (NEW in ERP-00002-R01)
- Department (with hierarchy and Division/Section references)
- Warehouse
- WarehouseLocation (with hierarchy)

**Organizational Hierarchy**:
```
Company
├── Branch
│   ├── Division
│   │   └── Section
│   │       └── Department
│   └── BusinessUnit
└── Department (can reference Division/Section)
```

**Key Changes in ERP-00002-R01**:
- Added Division entity with unique code per company
- Added Section entity (belongs to Division, unique code per company)
- Updated Department with `divisionId` and `sectionId` columns
- Created Supabase migration for version-controlled schema
- Initial Division seed data (5 configurable records)

### 3.2 M02: Users, Roles & Permissions
**Purpose**: Manage system users, authentication, authorization, and organizational access control.

**Status**: Implemented (ERP-00003)

**Responsibilities**:
- User management (CRUD, status, profile, Supabase Auth linking)
- Role management (CRUD, system role protection)
- Permission management (code-based authorization, module/action/resource-level)
- Authentication via Supabase Auth (JWT verification, user invitation)
- User-Role many-to-many assignments
- Role-Permission many-to-many assignments
- Organizational access scopes (Company/Division/Section/Department)
- Default organizational context per user
- Permission guards and Org Scope guards for authorization

**Boundaries**:
- Does NOT manage organizational structure (M01)
- Does NOT manage business data
- Provides security context for all modules
- Authentication handled by Supabase Auth, not custom auth

**Entities**:
- ErpUser (linked to Supabase Auth identity)
- Role (with system role protection)
- Permission (code-based, e.g. `organization.company.create`)
- UserRole (many-to-many)
- RolePermission (many-to-many)
- UserOrganizationScope (organizational access)
- UserDefaultOrgContext (default org context)
- UserActivityLog

**Key Features (ERP-00003)**:
- Supabase Auth integration (JWT verification, user invitation)
- Permission-based authorization (code-based, not role-name-based)
- Organizational access scopes (Company/Division/Section/Department)
- 11 initial system roles
- Organization module permissions seed data
- Administration UI (Users, Roles, Permissions pages)

### 3.3 M03: Products & Item Master
**Purpose**: Manage all product and item information.

**Responsibilities**:
- Product master data (name, description, SKU, barcode)
- Product categorization (categories, types, groups)
- Units of measure (UOM, conversions)
- Product pricing (cost, selling price, price lists)
- Product specifications and attributes
- Product status management
- Product images and documents

**Boundaries**:
- Does NOT manage inventory quantities (M06)
- Does NOT manage bills of materials (M08)
- Provides product master data for all modules

**Entities**:
- Product
- ProductCategory
- ProductType
- UnitOfMeasure
- UOMConversion
- ProductPrice
- PriceList
- ProductAttribute
- ProductImage

### 3.4 M04: Customers & CRM
**Purpose**: Manage customer information and relationships.

**Responsibilities**:
- Customer master data (name, contact, address)
- Customer categorization (type, segment, group)
- Customer contacts and communication
- Customer credit management
- Customer-specific pricing
- Customer interaction history
- Customer status management

**Boundaries**:
- Does NOT manage sales orders (M05)
- Does NOT manage invoices (M18)
- Provides customer master data for sales and finance

**Entities**:
- Customer
- CustomerType
- CustomerGroup
- CustomerContact
- CustomerAddress
- CustomerCredit
- CustomerInteraction

### 3.5 M05: Sales
**Purpose**: Manage the complete sales process from quotation to sales order.

**Responsibilities**:
- Quotation management (create, send, accept/reject)
- Sales order management (create, confirm, cancel)
- Sales order line items
- Pricing and discount calculations
- Sales order status tracking
- Customer credit checks
- Stock availability checks
- Sales order to production linkage

**Boundaries**:
- Does NOT manage customer master data (M04)
- Does NOT manage inventory (M06)
- Does NOT manage delivery (M14)
- Does NOT manage invoicing (M18)
- Links to production when stock is insufficient

**Entities**:
- Quotation
- QuotationLine
- SalesOrder
- SalesOrderLine
- SalesOrderStatus
- SalesOrderHistory

### 3.6 M06: Inventory & Warehouse
**Purpose**: Manage inventory levels, stock movements, and warehouse operations.

**Responsibilities**:
- Warehouse management (locations, zones, bins)
- Stock level tracking (on-hand, available, reserved, etc.)
- Stock movements (receipts, issues, transfers)
- Inventory transactions (all movements with audit trail)
- Stock reservations
- Safety stock management
- Inventory adjustments (with authorization)
- Batch/lot tracking
- Serial number tracking (if applicable)
- Inventory valuation

**Boundaries**:
- Does NOT manage products (M03)
- Does NOT manage procurement (M07)
- Does NOT manage production (M10)
- Provides inventory data for all modules

**Entities**:
- Warehouse
- WarehouseLocation
- StockLevel
- StockMovement
- StockReservation
- InventoryTransaction
- Batch
- InventoryAdjustment
- InventoryValuation

### 3.7 M07: Purchasing / Procurement
**Purpose**: Manage the procurement process from purchase requisition to supplier payment.

**Responsibilities**:
- Supplier master data
- Purchase requisition management
- Purchase order management
- Goods receipt management
- Supplier invoice management
- Supplier payment management
- Supplier evaluation
- Procurement approval workflow

**Boundaries**:
- Does NOT manage inventory (M06)
- Does NOT manage accounting (M17)
- Provides procurement data for inventory and finance

**Entities**:
- Supplier
- PurchaseRequisition
- PurchaseRequisitionLine
- PurchaseOrder
- PurchaseOrderLine
- GoodsReceipt
- GoodsReceiptLine
- SupplierInvoice
- SupplierPayment

### 3.8 M08: Bill of Materials
**Purpose**: Define product structures and material requirements.

**Responsibilities**:
- BOM management (header, lines)
- BOM versions and effective dates
- Material requirements per BOM
- BOM cost calculations
- BOM validation
- BOM for production and costing

**Boundaries**:
- Does NOT manage products (M03)
- Does NOT manage production (M10)
- Provides BOM data for production and costing

**Entities**:
- BillOfMaterials
- BOMLine
- BOMVersion
- BOMComponent

### 3.9 M09: Production Planning
**Purpose**: Plan production based on demand and capacity.

**Responsibilities**:
- Master Production Schedule (MPS)
- Material Requirements Planning (MRP)
- Capacity planning
- Production scheduling
- Demand forecasting integration
- Production plan approval

**Boundaries**:
- Does NOT execute production (M10)
- Does NOT manage inventory (M06)
- Provides production plans for execution

**Entities**:
- ProductionPlan
- ProductionPlanLine
- CapacityPlan
- DemandForecast

### 3.10 M10: Production / Manufacturing
**Purpose**: Execute production orders and manage manufacturing operations.

**Responsibilities**:
- Production order management
- Production order status tracking
- Material issue to production
- Production progress tracking
- Production completion
- Finished goods receipt
- Production cost tracking
- Production reporting

**Boundaries**:
- Does NOT manage BOM (M08)
- Does NOT manage planning (M09)
- Does NOT manage quality (M12)
- Executes production plans

**Entities**:
- ProductionOrder
- ProductionOrderLine
- MaterialIssue
- MaterialIssueLine
- ProductionReceipt
- ProductionReceiptLine
- ProductionCost

### 3.11 M11: Work Orders
**Purpose**: Manage detailed work operations within production orders.

**Responsibilities**:
- Work order management
- Work center management
- Operation scheduling
- Labor tracking
- Machine time tracking
- Work order completion
- Work order costing

**Boundaries**:
- Part of production execution (M10)
- Does NOT manage materials
- Provides detailed operation tracking

**Entities**:
- WorkOrder
- WorkCenter
- Operation
- LaborEntry
- MachineEntry

### 3.12 M12: Quality Control
**Purpose**: Manage quality inspection and control processes.

**Responsibilities**:
- QC inspection plans
- Incoming material inspection
- In-process inspection
- Final product inspection
- QC test management
- Non-conformance management
- Corrective actions
- QC certificate management

**Boundaries**:
- Does NOT manage production (M10)
- Does NOT manage inventory (M06)
- Provides quality data for production and inventory

**Entities**:
- QCPlan
- QCInspection
- QCTest
- QCResult
- NonConformance
- CorrectiveAction
- QCCertificate

### 3.13 M13: Logistics / Dispatch
**Purpose**: Manage outbound logistics and dispatch operations.

**Responsibilities**:
- Dispatch planning
- Route planning
- Vehicle management
- Dispatch documentation
- Proof of delivery
- Dispatch tracking

**Boundaries**:
- Does NOT manage delivery confirmation (M14)
- Does NOT manage inventory (M06)
- Links sales orders to delivery

**Entities**:
- Dispatch
- DispatchLine
- Route
- Vehicle
- DeliveryProof

### 3.14 M14: Delivery
**Purpose**: Manage delivery confirmation and tracking.

**Responsibilities**:
- Delivery confirmation
- Delivery status tracking
- Partial deliveries
- Delivery documentation
- Customer confirmation

**Boundaries**:
- Does NOT manage dispatch (M13)
- Does NOT manage invoicing (M18)
- Confirms delivery completion

**Entities**:
- Delivery
- DeliveryLine
- DeliveryStatus
- DeliveryDocument

### 3.15 M15: Returns
**Purpose**: Manage customer returns and reverse logistics.

**Responsibilities**:
- Return authorization
- Return receipt
- Return inspection
- Return disposition
- Credit note generation
- Return to inventory

**Boundaries**:
- Does NOT manage sales (M05)
- Does NOT manage inventory (M06)
- Links to original sales order

**Entities**:
- ReturnAuthorization
- ReturnReceipt
- ReturnInspection
- ReturnDisposition
- CreditNote

### 3.16 M16: Costing
**Purpose**: Calculate and track product and production costs.

**Responsibilities**:
- Standard cost management
- Actual cost tracking
- Cost variance analysis
- Production cost allocation
- Overhead cost allocation
- Cost reporting

**Boundaries**:
- Does NOT manage products (M03)
- Does NOT manage production (M10)
- Uses data from multiple modules

**Entities**:
- StandardCost
- ActualCost
- CostVariance
- CostAllocation
- OverheadCost

### 3.17 M17: Accounts & Finance
**Purpose**: Manage core accounting and financial operations.

**Responsibilities**:
- Chart of accounts
- General ledger
- Journal entries
- Financial periods
- Trial balance
- Financial statements
- Currency management
- Inter-company accounting

**Boundaries**:
- Does NOT manage specific receivables/payables
- Provides core accounting framework

**Entities**:
- Account
- JournalEntry
- JournalEntryLine
- FinancialPeriod
- Currency
- ExchangeRate

### 3.18 M18: Accounts Receivable
**Purpose**: Manage customer invoices and collections.

**Responsibilities**:
- Sales invoice generation
- Invoice management
- Payment collection
- Credit management
- Aging analysis
- Dunning management

**Boundaries**:
- Does NOT manage sales (M05)
- Does NOT manage general ledger (M17)
- Links to sales and payments

**Entities**:
- SalesInvoice
- SalesInvoiceLine
- CustomerPayment
- PaymentAllocation
- AgingReport

### 3.19 M19: Accounts Payable
**Purpose**: Manage supplier invoices and payments.

**Responsibilities**:
- Supplier invoice processing
- Payment scheduling
- Payment execution
- Vendor management
- Aging analysis
- 3-way matching

**Boundaries**:
- Does NOT manage procurement (M07)
- Does NOT manage general ledger (M17)
- Links to procurement and payments

**Entities**:
- SupplierInvoice
- SupplierInvoiceLine
- SupplierPayment
- PaymentSchedule
- AgingReport

### 3.20 M20: Cash & Bank
**Purpose**: Manage cash and bank operations.

**Responsibilities**:
- Bank account management
- Cash management
- Bank reconciliation
- Check management
- Wire transfers
- Cash flow reporting

**Boundaries**:
- Does NOT manage general ledger (M17)
- Does NOT manage receivables/payables
- Manages actual cash movements

**Entities**:
- BankAccount
- BankTransaction
- CashTransaction
- Check
- Reconciliation

### 3.21 M21: Fixed Assets
**Purpose**: Manage fixed assets and depreciation.

**Responsibilities**:
- Asset register
- Asset depreciation
- Asset disposal
- Asset transfer
- Asset maintenance
- Asset valuation

**Boundaries**:
- Does NOT manage products (M03)
- Does NOT manage accounting (M17)
- Provides asset data for accounting

**Entities**:
- FixedAsset
- AssetCategory
- DepreciationSchedule
- AssetDisposal
- AssetTransfer

### 3.22 M22: Human Resources
**Purpose**: Manage employee information and HR operations.

**Responsibilities**:
- Employee master data
- Department assignment
- Position management
- Employment history
- Document management
- Performance management

**Boundaries**:
- Does NOT manage attendance (M23)
- Does NOT manage payroll (M24)
- Provides employee master data

**Entities**:
- Employee
- Department
- Position
- EmploymentHistory
- EmployeeDocument

### 3.23 M23: Attendance & Leave
**Purpose**: Manage employee attendance and leave.

**Responsibilities**:
- Time tracking
- Attendance management
- Leave management
- Leave policies
- Overtime management
- Shift management

**Boundaries**:
- Does NOT manage employees (M22)
- Does NOT manage payroll (M24)
- Provides attendance data for payroll

**Entities**:
- Attendance
- Leave
- LeavePolicy
- Overtime
- Shift

### 3.24 M24: Payroll
**Purpose**: Manage employee payroll and compensation.

**Responsibilities**:
- Salary management
- Payroll processing
- Deductions management
- Tax calculations
- Payslip generation
- Payroll reporting

**Boundaries**:
- Does NOT manage employees (M22)
- Does NOT manage attendance (M23)
- Uses data from HR and attendance

**Entities**:
- Salary
- PayrollRun
- PayrollLine
- Deduction
- Payslip

### 3.25 M25: Projects / Jobs
**Purpose**: Manage projects and job costing.

**Responsibilities**:
- Project management
- Task management
- Resource allocation
- Time tracking
- Project costing
- Project billing

**Boundaries**:
- Does NOT manage employees (M22)
- Does NOT manage accounting (M17)
- Provides project data for costing

**Entities**:
- Project
- ProjectTask
- ProjectResource
- ProjectTimeEntry
- ProjectCost

### 3.26 M26: Budgeting
**Purpose**: Manage financial budgets and forecasting.

**Responsibilities**:
- Budget planning
- Budget allocation
- Budget tracking
- Variance analysis
- Forecasting
- Budget approval

**Boundaries**:
- Does NOT manage accounting (M17)
- Does NOT manage specific modules
- Uses data from multiple modules

**Entities**:
- Budget
- BudgetLine
- BudgetAllocation
- BudgetVariance
- Forecast

### 3.27 M27: Maintenance
**Purpose**: Manage equipment and facility maintenance.

**Responsibilities**:
- Maintenance scheduling
- Work order management
- Spare parts management
- Maintenance history
- Preventive maintenance
- Breakdown maintenance

**Boundaries**:
- Does NOT manage production (M10)
- Does NOT manage inventory (M06)
- Maintains equipment for production

**Entities**:
- MaintenanceSchedule
- MaintenanceWorkOrder
- SparePart
- MaintenanceHistory
- Equipment

### 3.28 M28: Reports & Dashboards
**Purpose**: Provide reporting and analytics capabilities.

**Responsibilities**:
- Standard reports
- Custom reports
- Dashboards
- KPI tracking
- Data visualization
- Export capabilities

**Boundaries**:
- Reads data from all modules
- Does NOT modify business data
- Provides read-only views

**Entities**:
- Report
- Dashboard
- KPI
- Chart
- ReportSchedule

### 3.29 M29: Document Management
**Purpose**: Manage documents and attachments.

**Responsibilities**:
- Document storage
- Document versioning
- Document access control
- Document templates
- Document search
- Document retention

**Boundaries**:
- Does NOT manage business data
- Provides document services for all modules

**Entities**:
- Document
- DocumentVersion
- DocumentTemplate
- DocumentAccess

### 3.30 M30: Notifications & Approvals
**Purpose**: Manage system notifications and approval workflows.

**Responsibilities**:
- Notification management
- Email notifications
- In-app notifications
- Approval workflows
- Workflow templates
- Escalation management

**Boundaries**:
- Does NOT manage business data
- Provides notification services for all modules

**Entities**:
- Notification
- NotificationTemplate
- ApprovalWorkflow
- ApprovalStep
- ApprovalRequest

### 3.31 M31: Audit Trail
**Purpose**: Track all system changes for compliance and auditing.

**Responsibilities**:
- Change tracking
- Audit log management
- Audit report generation
- Compliance reporting
- Data retention

**Boundaries**:
- Does NOT manage business data
- Reads data from all modules
- Provides audit capabilities

**Entities**:
- AuditLog
- AuditReport
- ComplianceReport
- DataRetention

### 3.32 M32: System Administration
**Purpose**: Manage system configuration and administration.

**Responsibilities**:
- System settings
- Configuration management
- System monitoring
- User management
- System maintenance
- System backup

**Boundaries**:
- Does NOT manage business data
- Manages system-wide settings

**Entities**:
- SystemSetting
- Configuration
- SystemLog
- Backup

### 3.33 M33: API & Integrations
**Purpose**: Manage API access and external integrations.

**Responsibilities**:
- API key management
- Webhook management
- External system integrations
- Data synchronization
- Integration monitoring

**Boundaries**:
- Does NOT manage business data
- Provides integration services

**Entities**:
- ApiKey
- Webhook
- Integration
- SyncLog

### 3.34 M34: Backup & Security
**Purpose**: Manage system backups and security.

**Responsibilities**:
- Database backups
- Backup scheduling
- Backup restoration
- Security scanning
- Vulnerability management
- Security reporting

**Boundaries**:
- Does NOT manage business data
- Manages system security

**Entities**:
- Backup
- BackupSchedule
- SecurityScan
- Vulnerability

## 4. Dependency Matrix

### 4.1 Phase 1: Foundation
```
M01 (Company)
   └── M02 (Users, Roles, Permissions)
   └── M03 (Products)
         └── M04 (Customers)
```

### 4.2 Phase 2: Core Transactions
```
M01, M03, M04
   └── M05 (Sales)
M01, M03
   └── M06 (Inventory)
M01, M03, M06
   └── M07 (Procurement)
```

### 4.3 Phase 3: Manufacturing
```
M03
   └── M08 (BOM)
M03, M06, M08
   └── M09 (Production Planning)
M03, M06, M08, M09
   └── M10 (Production)
M10
   └── M11 (Work Orders)
M03, M10
   └── M12 (Quality Control)
```

### 4.4 Phase 4: Fulfillment
```
M05, M06
   └── M13 (Logistics)
M13
   └── M14 (Delivery)
M05, M06, M14
   └── M15 (Returns)
```

### 4.5 Phase 5: Finance
```
M03, M06, M08, M10
   └── M16 (Costing)
M01
   └── M17 (Accounts & Finance)
M05, M17
   └── M18 (Accounts Receivable)
M07, M17
   └── M19 (Accounts Payable)
M17
   └── M20 (Cash & Bank)
M03, M17
   └── M21 (Fixed Assets)
```

### 4.6 Phase 6: Support
```
M01, M02
   └── M22 (Human Resources)
M22
   └── M23 (Attendance & Leave)
M22, M23
   └── M24 (Payroll)
M01, M02
   └── M25 (Projects)
M17
   └── M26 (Budgeting)
M03, M10
   └── M27 (Maintenance)
```

### 4.7 Phase 7: System
```
All Modules
   └── M28 (Reports & Dashboards)
M01
   └── M29 (Document Management)
M02
   └── M30 (Notifications & Approvals)
M02
   └── M31 (Audit Trail)
M02
   └── M32 (System Administration)
All Modules
   └── M33 (API & Integrations)
M32
   └── M34 (Backup & Security)
```

## 5. Module Interface Contracts

### 5.1 Service Layer Interfaces
Each module exposes services that other modules can consume:

```typescript
// Example: Product Module Service Interface
interface IProductService {
  getById(id: UUID): Promise<Product>;
  getByIds(ids: UUID[]): Promise<Product[]>;
  getBySku(sku: string): Promise<Product>;
  validateProduct(id: UUID): Promise<boolean>;
  getProductPrice(id: UUID, priceListId: UUID): Promise<number>;
}
```

### 5.2 Event Contracts
Modules communicate via events for loose coupling:

```typescript
// Example: Sales Order Events
interface SalesOrderEvents {
  'sales-order.created': { orderId: UUID; customerId: UUID };
  'sales-order.confirmed': { orderId: UUID; lines: SalesOrderLine[] };
  'sales-order.cancelled': { orderId: UUID; reason: string };
}
```

### 5.3 Data Contracts
Modules share data via DTOs:

```typescript
// Example: Product DTO for Sales
interface ProductSalesDTO {
  id: UUID;
  name: string;
  sku: string;
  price: number;
  availableQuantity: number;
}
```

## 6. Module Communication Patterns

### 6.1 Synchronous Communication
- Service method calls for real-time operations
- Used when immediate response is required
- Example: Checking stock availability during sales order creation

### 6.2 Asynchronous Communication
- Event-based messaging for non-critical operations
- Used for background processing and notifications
- Example: Sending email notification after order confirmation

### 6.3 Shared Database Access
- Direct database queries for read-only operations
- Used for reporting and analytics
- Example: Dashboard querying data from multiple modules

## 7. Module Isolation Rules

### 7.1 Direct Database Access
- Modules MUST NOT directly access other modules' tables
- Use service layer APIs for cross-module data access
- Exception: Reporting module (read-only access)

### 7.2 Business Logic
- Modules MUST NOT duplicate business logic
- Shared logic goes to common services
- Example: Validation logic in base services

### 7.3 State Management
- Modules own their own state
- No direct state modification across modules
- Use events for state change notifications

## 8. Testing Strategy per Module

### 8.1 Unit Tests
- Test individual service methods
- Mock dependencies
- Target: 80% code coverage

### 8.2 Integration Tests
- Test module interactions
- Use real database (test environment)
- Test cross-module workflows

### 8.3 E2E Tests
- Test complete business flows
- Test API endpoints
- Test user journeys

## 9. Documentation Requirements

### 9.1 Per Module Documentation
- Module overview and purpose
- Entity relationship diagrams
- API documentation
- Business rules
- Status workflows
- Permission requirements
- Integration points

### 9.2 Cross-Module Documentation
- Data flow diagrams
- Integration architecture
- Event contracts
- API contracts
