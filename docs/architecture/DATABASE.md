# Database and Data Model Documentation

## 1. Database Design Principles

### 1.1 Naming Conventions
- **Tables**: snake_case, plural (e.g., `sales_orders`, `products`)
- **Columns**: snake_case (e.g., `created_at`, `order_number`)
- **Primary Keys**: `id` (UUID v4)
- **Foreign Keys**: `{referenced_table}_id` (e.g., `customer_id`)
- **Indexes**: `idx_{table}_{column}` for frequently queried columns
- **Unique Constraints**: `uniq_{table}_{column}`

### 1.2 Data Types
- **IDs**: UUID (primary and foreign keys)
- **Monetary**: DECIMAL(19,4) for amounts, DECIMAL(19,6) for rates
- **Quantities**: DECIMAL(19,4) for flexibility
- **Dates**: TIMESTAMP WITH TIME ZONE
- **Booleans**: BOOLEAN (default false)
- **Text**: VARCHAR for short text, TEXT for long text
- **JSON**: JSONB for flexible data storage

### 1.3 Audit Fields
Every entity must have:
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
created_by UUID REFERENCES users(id),
updated_by UUID REFERENCES users(id),
is_active BOOLEAN DEFAULT true
```

## 2. Core Entity Relationships

### 2.1 High-Level Entity Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ORGANIZATION DOMAIN                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │ Company │  │Depart-  │  │ Cost    │  │Company  │         │
│  │         │  │  ment   │  │ Center  │  │Settings │         │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     USER DOMAIN                                │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │  User   │◄─┤  Role   │◄─┤Permission│  │User     │         │
│  │         │  │         │  │         │  │Activity │         │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCT DOMAIN                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │ Product │◄─┤Product  │  │Unit of  │  │Product  │         │
│  │         │  │Category │  │ Measure │  │Price    │         │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOMER DOMAIN                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │Customer │◄─┤Customer │  │Customer │  │Customer │         │
│  │         │  │  Type   │  │ Contact │  │ Address │         │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SALES DOMAIN                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │Quotation│  │ Sales   │  │ Sales   │  │ Sales   │         │
│  │         │  │ Order   │  │ Order   │  │ Invoice │         │
│  │         │  │         │  │  Line   │  │         │         │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   INVENTORY DOMAIN                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │Warehouse│  │  Stock  │  │  Stock  │  │Inventory│         │
│  │         │  │  Level  │  │Movement │  │Transaction│       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   PRODUCTION DOMAIN                            │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │  Bill   │  │Production│  │Production│  │  Work  │         │
│  │of       │  │  Order   │  │  Order   │  │ Order  │         │
│  │Materials│  │          │  │  Line    │  │        │         │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    QUALITY DOMAIN                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │QC Plan  │  │QC       │  │QC Test  │  │Non-     │         │
│  │         │  │Inspection│  │         │  │Conform  │         │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LOGISTICS DOMAIN                            │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │Dispatch │  │Delivery │  │ Return  │  │Vehicle  │         │
│  │         │  │         │  │         │  │         │         │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FINANCE DOMAIN                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │ Account │  │Journal  │  │Sales    │  │Supplier │         │
│  │         │  │ Entry   │  │Invoice  │  │Invoice  │         │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

## 3. Core Entity Definitions

### 3.1 Base Entity
```typescript
// All entities inherit from this base
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string;

  @Column({ name: 'updated_by', nullable: true })
  updatedBy: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
```

### 3.2 Company Entity
```typescript
@Entity('companies')
export class Company extends BaseEntity {
  @Column({ length: 100 })
  name: string;

  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 255, nullable: true })
  legalName: string;

  @Column({ length: 20, nullable: true })
  taxId: string;

  @Column({ length: 20, nullable: true })
  registrationNumber: string;

  @Column({ type: 'jsonb', nullable: true })
  address: Address;

  @Column({ length: 50, nullable: true })
  phone: string;

  @Column({ length: 100, nullable: true })
  email: string;

  @Column({ length: 100, nullable: true })
  website: string;

  @Column({ length: 3, default: 'USD' })
  defaultCurrency: string;

  @OneToMany(() => Department, department => department.company)
  departments: Department[];

  @OneToMany(() => CostCenter, costCenter => costCenter.company)
  costCenters: CostCenter[];
}
```

### 3.3 User Entity
```typescript
@Entity('users')
export class User extends BaseEntity {
  @Column({ length: 50, unique: true })
  username: string;

  @Column({ length: 100, unique: true })
  email: string;

  @Column({ length: 255 })
  password: string; // Hashed

  @Column({ length: 50 })
  firstName: string;

  @Column({ length: 50 })
  lastName: string;

  @Column({ length: 20, nullable: true })
  phone: string;

  @Column({ length: 500, nullable: true })
  avatar: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ nullable: true })
  lastLoginAt: Date;

  @Column({ nullable: true })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToMany(() => Role)
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id' },
    inverseJoinColumn: { name: 'role_id' }
  })
  roles: Role[];
}
```

### 3.4 Product Entity
```typescript
@Entity('products')
export class Product extends BaseEntity {
  @Column({ length: 50, unique: true })
  sku: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 50, nullable: true })
  barcode: string;

  @Column({ length: 20 })
  type: ProductType; // RAW_MATERIAL, FINISHED_GOOD, SEMI_FINISHED, CONSUMABLE

  @Column({ default: true })
  isPurchasable: boolean;

  @Column({ default: true })
  isSellable: boolean;

  @Column({ default: false })
  isManufactured: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  categoryId: string;

  @ManyToOne(() => ProductCategory)
  @JoinColumn({ name: 'category_id' })
  category: ProductCategory;

  @Column({ nullable: true })
  uomId: string;

  @ManyToOne(() => UnitOfMeasure)
  @JoinColumn({ name: 'uom_id' })
  uom: UnitOfMeasure;

  @Column({ type: 'decimal', precision: 19, scale: 4, default: 0 })
  weight: number;

  @Column({ type: 'decimal', precision: 19, scale: 4, default: 0 })
  volume: number;

  @Column({ type: 'jsonb', nullable: true })
  attributes: Record<string, any>;

  @OneToMany(() => ProductPrice, price => price.product)
  prices: ProductPrice[];
}
```

### 3.5 Customer Entity
```typescript
@Entity('customers')
export class Customer extends BaseEntity {
  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 20 })
  type: CustomerType; // INDIVIDUAL, CORPORATE, GOVERNMENT

  @Column({ length: 100, nullable: true })
  email: string;

  @Column({ length: 20, nullable: true })
  phone: string;

  @Column({ type: 'jsonb', nullable: true })
  address: Address;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'decimal', precision: 19, scale: 4, default: 0 })
  creditLimit: number;

  @Column({ type: 'decimal', precision: 19, scale: 4, default: 0 })
  currentBalance: number;

  @Column({ default: 0 })
  paymentTermsDays: number;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => CustomerContact, contact => contact.customer)
  contacts: CustomerContact[];

  @OneToMany(() => SalesOrder, order => order.customer)
  salesOrders: SalesOrder[];
}
```

### 3.6 Sales Order Entity
```typescript
@Entity('sales_orders')
export class SalesOrder extends BaseEntity {
  @Column({ length: 50, unique: true })
  orderNumber: string;

  @Column({ type: 'timestamp with time zone' })
  orderDate: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  confirmedAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  deliveredAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  invoicedAt: Date;

  @Column({ length: 20, default: 'DRAFT' })
  status: SalesOrderStatus;

  @Column({ length: 20, default: 'PENDING' })
  fulfillmentStatus: FulfillmentStatus;

  @Column({ type: 'decimal', precision: 19, scale: 4, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 19, scale: 4, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 19, scale: 4, default: 0 })
  totalAmount: number;

  @Column({ type: 'decimal', precision: 19, scale: 4, default: 0 })
  discountAmount: number;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @Column({ nullable: true })
  customerId: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ nullable: true })
  quotationId: string;

  @ManyToOne(() => Quotation)
  @JoinColumn({ name: 'quotation_id' })
  quotation: Quotation;

  @OneToMany(() => SalesOrderLine, line => line.salesOrder, { cascade: true })
  lines: SalesOrderLine[];

  @OneToMany(() => ProductionOrder, prodOrder => prodOrder.salesOrder)
  productionOrders: ProductionOrder[];
}
```

### 3.7 Inventory Transaction Entity
```typescript
@Entity('inventory_transactions')
export class InventoryTransaction extends BaseEntity {
  @Column({ length: 50, unique: true })
  transactionNumber: string;

  @Column({ type: 'timestamp with time zone' })
  transactionDate: Date;

  @Column({ length: 30 })
  type: InventoryTransactionType;

  @Column({ length: 20 })
  status: InventoryTransactionStatus;

  @Column({ length: 500, nullable: true })
  description: string;

  @Column({ nullable: true })
  warehouseId: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ nullable: true })
  productId: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  quantity: number;

  @Column({ length: 20 })
  direction: StockDirection; // IN, OUT, TRANSFER

  @Column({ type: 'decimal', precision: 19, scale: 6, nullable: true })
  unitCost: number;

  @Column({ type: 'decimal', precision: 19, scale: 4, nullable: true })
  totalCost: number;

  @Column({ nullable: true })
  batchId: string;

  @ManyToOne(() => Batch)
  @JoinColumn({ name: 'batch_id' })
  batch: Batch;

  @Column({ nullable: true })
  referenceType: string; // 'purchase_receipt', 'sales_order', 'production_order'

  @Column({ nullable: true })
  referenceId: string;

  @OneToMany(() => InventoryTransactionLine, line => line.transaction, { cascade: true })
  lines: InventoryTransactionLine[];
}
```

### 3.8 Production Order Entity
```typescript
@Entity('production_orders')
export class ProductionOrder extends BaseEntity {
  @Column({ length: 50, unique: true })
  orderNumber: string;

  @Column({ type: 'timestamp with time zone' })
  plannedStartDate: Date;

  @Column({ type: 'timestamp with time zone' })
  plannedEndDate: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  actualStartDate: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  actualEndDate: Date;

  @Column({ length: 20, default: 'PLANNED' })
  status: ProductionOrderStatus;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  plannedQuantity: number;

  @Column({ type: 'decimal', precision: 19, scale: 4, default: 0 })
  completedQuantity: number;

  @Column({ type: 'decimal', precision: 19, scale: 4, default: 0 })
  scrappedQuantity: number;

  @Column({ nullable: true })
  productId: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ nullable: true })
  bomId: string;

  @ManyToOne(() => BillOfMaterials)
  @JoinColumn({ name: 'bom_id' })
  bom: BillOfMaterials;

  @Column({ nullable: true })
  salesOrderId: string;

  @ManyToOne(() => SalesOrder)
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder: SalesOrder;

  @OneToMany(() => ProductionOrderLine, line => line.productionOrder, { cascade: true })
  lines: ProductionOrderLine[];

  @OneToMany(() => MaterialIssue, issue => issue.productionOrder)
  materialIssues: MaterialIssue[];
}
```

### 3.9 Bill of Materials Entity
```typescript
@Entity('bill_of_materials')
export class BillOfMaterials extends BaseEntity {
  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 20, default: 'ACTIVE' })
  status: BOMStatus;

  @Column({ type: 'decimal', precision: 19, scale: 4, default: 1 })
  baseQuantity: number;

  @Column({ nullable: true })
  productId: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'timestamp with time zone', nullable: true })
  effectiveFrom: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  effectiveTo: Date;

  @Column({ type: 'decimal', precision: 19, scale: 4, default: 0 })
  estimatedCost: number;

  @OneToMany(() => BOMLine, line => line.bom, { cascade: true })
  lines: BOMLine[];
}
```

## 4. Key Relationships

### 4.1 Sales Flow Relationships
```
Customer 1──M Quotation
Quotation 1──M QuotationLine
Quotation 1──0..1 SalesOrder
SalesOrder 1──M SalesOrderLine
SalesOrder 1──M ProductionOrder (when production required)
SalesOrder 1──M DeliveryOrder
SalesOrder 1──M SalesInvoice
SalesInvoice 1──M CustomerPayment
```

### 4.2 Production Flow Relationships
```
ProductionOrder M──1 Product (finished good)
ProductionOrder M──1 BillOfMaterials
ProductionOrder 0..1──0..1 SalesOrder
ProductionOrder 1──M ProductionOrderLine
ProductionOrder 1──M MaterialIssue
MaterialIssue 1──M MaterialIssueLine
ProductionOrder 1──M ProductionReceipt
ProductionReceipt 1──M ProductionReceiptLine
```

### 4.3 Inventory Flow Relationships
```
Warehouse 1──M WarehouseLocation
WarehouseLocation 1──M StockLevel
StockLevel M──1 Product
StockLevel M──1 Warehouse
InventoryTransaction M──1 Product
InventoryTransaction M──1 Warehouse
InventoryTransaction M──0..1 Batch
```

### 4.4 Procurement Flow Relationships
```
Supplier 1──M PurchaseRequisition
PurchaseRequisition 1──M PurchaseRequisitionLine
PurchaseRequisition 1──0..1 PurchaseOrder
PurchaseOrder 1──M PurchaseOrderLine
PurchaseOrder 1──M GoodsReceipt
GoodsReceipt 1──M GoodsReceiptLine
GoodsReceipt 1──0..1 SupplierInvoice
SupplierInvoice 1──M SupplierPayment
```

## 5. Index Strategy

### 5.1 Primary Indexes
- Primary key indexes (automatic)
- Unique constraint indexes

### 5.2 Common Query Indexes
```sql
-- Sales Orders
CREATE INDEX idx_sales_orders_customer_id ON sales_orders(customer_id);
CREATE INDEX idx_sales_orders_status ON sales_orders(status);
CREATE INDEX idx_sales_orders_order_date ON sales_orders(order_date);

-- Inventory
CREATE INDEX idx_stock_levels_product_warehouse ON stock_levels(product_id, warehouse_id);
CREATE INDEX idx_inventory_transactions_product_id ON inventory_transactions(product_id);
CREATE INDEX idx_inventory_transactions_warehouse_id ON inventory_transactions(warehouse_id);
CREATE INDEX idx_inventory_transactions_reference ON inventory_transactions(reference_type, reference_id);

-- Production
CREATE INDEX idx_production_orders_status ON production_orders(status);
CREATE INDEX idx_production_orders_product_id ON production_orders(product_id);
CREATE INDEX idx_production_orders_sales_order_id ON production_orders(sales_order_id);
```

### 5.3 Composite Indexes
```sql
-- For common join queries
CREATE INDEX idx_sales_order_lines_order_product ON sales_order_lines(sales_order_id, product_id);
CREATE INDEX idx_stock_movements_product_date ON stock_movements(product_id, created_at);
```

## 6. Data Validation Rules

### 6.1 Required Fields
- All entities: `id`, `created_at`, `updated_at`, `is_active`
- Business entities: `code` or `number` (unique), `status`
- Financial entities: `amount`, `currency`, `date`

### 6.2 Business Rules
- Sales order total = sum of line totals
- Stock level cannot go below zero (unless configured)
- Production order completed quantity <= planned quantity
- Invoice amount = sum of line amounts
- All monetary amounts must be positive

### 6.3 Referential Integrity
- Foreign keys enforced at database level
- CASCADE DELETE only for child records (e.g., order lines)
- SET NULL for optional references
- No orphaned records allowed

## 7. Transaction Management

### 7.1 Transaction Boundaries
- Each business operation = one transaction
- Example: Creating sales order with lines = single transaction
- Example: Goods receipt with stock update = single transaction

### 7.2 Isolation Level
- READ COMMITTED (default)
- SERIALIZABLE for critical operations (e.g., inventory updates)

### 7.3 Locking Strategy
- Optimistic locking with version column
- Pessimistic locking for inventory updates
- Short transaction duration to minimize locks

## 8. Data Migration Strategy

### 8.1 Supabase Migration Version Control

As of ERP-00002-R01, **Supabase PostgreSQL** is the authoritative database. All schema changes must be tracked in version-controlled migration files under `supabase/migrations/`.

**Migration Convention**:
- Each migration file: `<YYYYMMDDHHMMSS>_<description>.sql`
- Example: `20260818120000_initial_organization_schema.sql`
- Migrations must be idempotent (safe to run multiple times)
- Never manually modify the production database schema
- TypeORM `synchronize: true` must NOT be used in production

**Migration Workflow**:
1. Create migration file with SQL DDL
2. Apply to development Supabase database
3. Verify schema and constraints
4. Test application integration
5. Commit migration file to version control
6. Update documentation

### 8.2 Version Control
- All migrations in version control
- Migrations must be reversible where practical
- Test migrations in development before production

### 8.2 Data Integrity
- Validate data before migration
- Backup before migration
- Rollback plan for each migration

## 9. Supabase Row-Level Security Strategy

### 9.1 RLS Architecture

The database architecture supports Supabase Row Level Security (RLS) for future enforcement of organizational data isolation at the database level.

**Current Implementation (ERP-00003)**:
- Organizational access control is enforced at the application layer via Permission Guard and Org Scope Guard
- All API endpoints verify authentication via Supabase JWT verification
- Permission checks use database queries across user_roles → role_permissions → permissions
- Organization scope checks verify user assignments against requested resources

**Future RLS Strategy**:
- RLS policies will be implemented for transactional modules (Sales, Inventory, Production, etc.)
- RLS policies will filter data based on `user_organization_scopes` table
- The `erp_users` table links Supabase Auth identity to organizational context
- RLS will enforce that users can only read/write data within their assigned organizational scope

### 9.2 RLS Design Principles

1. **Defense in Depth**: Application-level guards AND database-level RLS
2. **No Performance Compromise**: RLS policies designed for minimal query overhead
3. **SUPER_ADMIN Override**: System-level bypass for administrative operations
4. **Audit Trail**: All RLS-denied access attempts logged for security review

### 9.3 RLS Implementation Priority

- Phase 1 (ERP-00003): Application-level authorization (completed)
- Phase 2 (Future): Database-level RLS for transactional modules
- Phase 3 (Future): Complete RLS coverage for all data access

## 10. Backup Strategy

### 9.1 Backup Types
- Full backup: Daily
- Incremental backup: Hourly
- Transaction log backup: Every 15 minutes

### 9.2 Retention Policy
- Daily backups: 30 days
- Weekly backups: 12 weeks
- Monthly backups: 12 months
- Yearly backups: 7 years

## 11. Performance Optimization

### 10.1 Query Optimization
- Use EXPLAIN ANALYZE for slow queries
- Avoid N+1 queries (use eager loading)
- Use pagination for large result sets
- Cache frequent queries

### 10.2 Database Configuration
- Connection pooling (min: 5, max: 20)
- Shared buffers: 25% of RAM
- Work memory: 4MB
- Maintenance work memory: 64MB

### 10.3 Monitoring
- Track slow queries (> 100ms)
- Monitor connection pool usage
- Track table bloat
- Monitor index usage
