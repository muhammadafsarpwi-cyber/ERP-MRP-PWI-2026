# API Documentation

## 1. API Overview

The ERP system exposes a RESTful API for all operations. The API follows REST conventions and uses JSON for data exchange.

### 1.1 Base URL
```
http://localhost:3001/api/v1
```

### 1.2 Authentication
All API requests require JWT authentication via Bearer token:
```
Authorization: Bearer <token>
```

### 1.3 Response Format
All responses follow a consistent format:
```json
{
  "success": true,
  "data": {},
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20
  },
  "message": "Success"
}
```

### 1.4 Error Format
Errors follow a consistent format:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": []
  }
}
```

## 2. Authentication API

### 2.1 Login
```
POST /auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe"
    }
  }
}
```

### 2.2 Refresh Token
```
POST /auth/refresh
```

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 2.3 Logout
```
POST /auth/logout
```

## 3. Users API

### 3.1 List Users
```
GET /users
```

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)
- `search` (string): Search by name or email
- `roleId` (string): Filter by role

### 3.2 Get User
```
GET /users/:id
```

### 3.3 Create User
```
POST /users
```

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "password123",
  "firstName": "Jane",
  "lastName": "Smith",
  "phone": "+1234567890",
  "roleIds": ["role-uuid-1", "role-uuid-2"]
}
```

### 3.4 Update User
```
PATCH /users/:id
```

### 3.5 Delete User
```
DELETE /users/:id
```

## 4. Products API

### 4.1 List Products
```
GET /products
```

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page
- `search` (string): Search by name or SKU
- `categoryId` (string): Filter by category
- `type` (string): Filter by type (RAW_MATERIAL, FINISHED_GOOD, etc.)

### 4.2 Get Product
```
GET /products/:id
```

### 4.3 Create Product
```
POST /products
```

**Request Body:**
```json
{
  "sku": "PRD-001",
  "name": "Product Name",
  "description": "Product description",
  "type": "FINISHED_GOOD",
  "categoryId": "category-uuid",
  "uomId": "uom-uuid",
  "isPurchasable": true,
  "isSellable": true,
  "isManufactured": true
}
```

### 4.4 Update Product
```
PATCH /products/:id
```

### 4.5 Delete Product
```
DELETE /products/:id
```

## 5. Customers API

### 5.1 List Customers
```
GET /customers
```

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page
- `search` (string): Search by name or code
- `type` (string): Filter by type

### 5.2 Get Customer
```
GET /customers/:id
```

### 5.3 Create Customer
```
POST /customers
```

**Request Body:**
```json
{
  "code": "CUS-001",
  "name": "Customer Name",
  "type": "CORPORATE",
  "email": "customer@example.com",
  "phone": "+1234567890",
  "address": {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "country": "USA",
    "zipCode": "10001"
  },
  "currency": "USD",
  "creditLimit": 10000.00,
  "paymentTermsDays": 30
}
```

### 5.4 Update Customer
```
PATCH /customers/:id
```

### 5.5 Delete Customer
```
DELETE /customers/:id
```

## 6. Sales Orders API

### 6.1 List Sales Orders
```
GET /sales/orders
```

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page
- `status` (string): Filter by status
- `customerId` (string): Filter by customer
- `startDate` (string): Filter by start date
- `endDate` (string): Filter by end date

### 6.2 Get Sales Order
```
GET /sales/orders/:id
```

### 6.3 Create Sales Order
```
POST /sales/orders
```

**Request Body:**
```json
{
  "customerId": "customer-uuid",
  "orderDate": "2026-08-18",
  "lines": [
    {
      "productId": "product-uuid",
      "quantity": 100,
      "unitPrice": 25.00,
      "discount": 5.00
    }
  ]
}
```

### 6.4 Confirm Sales Order
```
POST /sales/orders/:id/confirm
```

### 6.5 Cancel Sales Order
```
POST /sales/orders/:id/cancel
```

## 7. Inventory API

### 7.1 List Stock Levels
```
GET /inventory/stock-levels
```

**Query Parameters:**
- `warehouseId` (string): Filter by warehouse
- `productId` (string): Filter by product
- `lowStock` (boolean): Show only low stock items

### 7.2 Get Stock Level
```
GET /inventory/stock-levels/:id
```

### 7.3 Create Stock Movement
```
POST /inventory/transactions
```

**Request Body:**
```json
{
  "type": "RECEIPT",
  "warehouseId": "warehouse-uuid",
  "productId": "product-uuid",
  "quantity": 100,
  "unitCost": 15.00,
  "referenceType": "purchase_receipt",
  "referenceId": "receipt-uuid"
}
```

### 7.4 Reserve Stock
```
POST /inventory/reservations
```

**Request Body:**
```json
{
  "productId": "product-uuid",
  "warehouseId": "warehouse-uuid",
  "quantity": 50,
  "referenceType": "sales_order",
  "referenceId": "order-uuid"
}
```

## 8. Production API

### 8.1 List Production Orders
```
GET /production/orders
```

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page
- `status` (string): Filter by status
- `productId` (string): Filter by product

### 8.2 Get Production Order
```
GET /production/orders/:id
```

### 8.3 Create Production Order
```
POST /production/orders
```

**Request Body:**
```json
{
  "productId": "product-uuid",
  "bomId": "bom-uuid",
  "plannedQuantity": 100,
  "plannedStartDate": "2026-08-20",
  "plannedEndDate": "2026-08-25",
  "salesOrderId": "order-uuid" // optional
}
```

### 8.4 Release Production Order
```
POST /production/orders/:id/release
```

### 8.5 Complete Production Order
```
POST /production/orders/:id/complete
```

## 9. Bills of Materials API

### 9.1 List BOMs
```
GET /production/boms
```

### 9.2 Get BOM
```
GET /production/boms/:id
```

### 9.3 Create BOM
```
POST /production/boms
```

**Request Body:**
```json
{
  "code": "BOM-001",
  "name": "Product Assembly BOM",
  "productId": "product-uuid",
  "baseQuantity": 1,
  "lines": [
    {
      "productId": "component-uuid",
      "quantity": 2,
      "uomId": "uom-uuid"
    }
  ]
}
```

## 10. Quality Control API

### 10.1 List QC Inspections
```
GET /quality/inspections
```

### 10.2 Create QC Inspection
```
POST /quality/inspections
```

### 10.3 Record QC Result
```
POST /quality/inspections/:id/results
```

## 11. Procurement API

### 11.1 List Purchase Orders
```
GET /procurement/orders
```

### 11.2 Create Purchase Order
```
POST /procurement/orders
```

### 11.3 Create Goods Receipt
```
POST /procurement/goods-receipts
```

## 12. Finance API

### 12.1 List Sales Invoices
```
GET /finance/sales-invoices
```

### 12.2 Create Sales Invoice
```
POST /finance/sales-invoices
```

### 12.3 Record Customer Payment
```
POST /finance/customer-payments
```

## 13. Common Query Parameters

### 13.1 Pagination
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20, max: 100)

### 13.2 Sorting
- `orderBy` (string): Field to sort by
- `order` (string): Sort direction (ASC or DESC)

### 13.3 Filtering
- Various field-specific filters
- `search` (string): Full-text search
- `startDate` (string): Start date filter
- `endDate` (string): End date filter

### 13.4 Field Selection
- `fields` (string): Comma-separated list of fields to include

## 14. Rate Limiting

API requests are rate-limited:
- 100 requests per minute per user
- 1000 requests per minute per API key

## 14. Versioning

API versioning is done via URL path:
- Current version: `/api/v1`
- Breaking changes will increment version
- Deprecated endpoints will be announced 6 months before removal
