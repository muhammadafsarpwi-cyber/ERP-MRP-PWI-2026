# Business Rules Documentation

## 1. Sales Order Fulfillment Rules

### 1.1 Stock Check Rule
When a Sales Order is confirmed:
1. Check finished-goods inventory for each line item
2. Determine available quantity (on-hand minus reserved)
3. Compare available quantity with ordered quantity
4. Determine fulfillment method:
   - **Full Inventory**: If available >= ordered
   - **Partial Inventory + Production**: If available < ordered
   - **Full Production**: If available = 0

### 1.2 Reservation Rule
- Reserved stock cannot be used for other orders
- Reservation is created upon Sales Order confirmation
- Reservation is released upon:
  - Sales Order cancellation
  - Delivery completion
  - Manual release by authorized user

### 1.3 Production Trigger Rule
If shortage exists:
1. Calculate shortage quantity = ordered - available
2. Create Production Order for shortage quantity
3. Link Production Order to Sales Order
4. Set fulfillment status to "IN PRODUCTION"
5. Track production progress against Sales Order

## 2. Inventory Rules

### 2.1 Stock Movement Rule
No inventory quantity may change without a corresponding transaction. All movements must be:
- **Traceable**: Link to source document
- **Auditable**: Record who, when, what, why
- **Validated**: Check permissions and business rules

### 2.2 Stock Calculation Rule
```
Available = On Hand - Reserved - Safety Stock
Required = Sales Order Requirements + Production Requirements
Allocated = Reserved for Sales Orders
In Production = Quantity being manufactured
```

### 2.3 Negative Stock Rule
- System does NOT allow negative stock
- All stock checks must validate sufficient quantity
- Exception: Configurable per warehouse (with approval)

### 2.4 Batch/Lot Tracking Rule
- Products marked as batch-tracked must have batch information
- Batch numbers must be unique within product
- Expiry dates must be tracked for applicable products
- FIFO/FEFO picking rules apply

## 3. Production Rules

### 3.1 BOM Validation Rule
Before Production Order creation:
1. Validate BOM exists for product
2. Validate BOM is active and effective
3. Validate all BOM components exist
4. Calculate total material requirements

### 3.2 Material Availability Rule
Before Production Order release:
1. Check raw material availability
2. Reserve materials for production
3. If insufficient materials:
   - Option 1: Create Purchase Requisition
   - Option 2: Wait for material availability
   - Option 3: Partial release with approval

### 3.3 Production Completion Rule
When Production Order is completed:
1. Validate completed quantity
2. Calculate scrap quantity
3. Update finished goods inventory
4. Release reserved raw materials
5. Update production costs
6. Trigger QC inspection if required

## 4. Quality Control Rules

### 4.1 Inspection Trigger Rule
QC inspection is triggered:
- Upon goods receipt from supplier
- Upon production completion
- Upon customer complaint
- Upon random sampling schedule

### 4.2 Non-Conformance Rule
If QC inspection fails:
1. Create Non-Conformance record
2. Block affected inventory
3. Notify quality manager
4. Determine disposition:
   - Rework
   - Return to supplier
   - Scrap
   - Use as-is (with approval)

## 5. Financial Rules

### 5.1 Invoice Generation Rule
Sales Invoice is generated:
- Upon delivery completion
- Upon manual trigger (for advance payments)
- Must match delivery quantity
- Must apply correct pricing

### 5.2 Payment Application Rule
Customer payments are applied:
- To specific invoices (FIFO or specific)
- Must not exceed invoice amount
- Partial payments allowed
- Credit notes can offset invoices

### 5.3 Currency Rule
- All amounts stored in base currency
- Foreign currency transactions recorded with exchange rate
- Exchange rate gain/loss calculated at payment time

## 6. User Access Rules

### 6.1 Role-Based Access
- Users can only access modules assigned to their roles
- Actions within modules controlled by permissions
- Data access controlled by ownership or department

### 6.2 Approval Workflow
Certain actions require approval:
- Sales Order discount > threshold
- Inventory adjustment
- Production Order creation
- Payment release

### 6.3 Audit Trail Rule
All critical operations must be logged:
- Who performed the action
- When the action was performed
- What data was affected
- What changed (before/after)

## 7. Data Integrity Rules

### 7.1 Referential Integrity
- Foreign keys enforced at database level
- Cannot delete parent record with children
- Orphaned records not allowed

### 7.2 Validation Rules
- Required fields must be populated
- Data types must be valid
- Business rules must be satisfied
- Constraints must be respected

### 7.3 Transaction Integrity
- Multi-table updates in single transaction
- All-or-nothing execution
- Proper rollback on errors
- Consistent state maintained

## 8. Status Workflow Rules

### 8.1 Sales Order Status Flow
```
DRAFT → CONFIRMED → PROCESSING → DELIVERED → INVOICED → CLOSED
                                          ↓
                                      CANCELLED
```

### 8.2 Production Order Status Flow
```
PLANNED → RELEASED → IN_PROGRESS → COMPLETED → CLOSED
                                    ↓
                                ON_HOLD → IN_PROGRESS
                                    ↓
                                CANCELLED
```

### 8.3 Inventory Transaction Status Flow
```
PENDING → CONFIRMED → COMPLETED
    ↓
CANCELLED
```

## 9. Notification Rules

### 9.1 Event-Based Notifications
- Low stock alert
- Production delay alert
- Payment overdue alert
- QC failure alert
- Approval required alert

### 9.2 Scheduled Notifications
- Daily stock summary
- Weekly production report
- Monthly financial summary
- Quarterly performance review

## 10. Compliance Rules

### 10.1 Data Retention
- Financial records: 7 years
- Audit logs: 7 years
- Employee records: 10 years after termination
- Customer records: 7 years after last transaction

### 10.2 Data Privacy
- Customer data protected
- Employee data protected
- Access logged and auditable
- Right to deletion (with retention exceptions)
