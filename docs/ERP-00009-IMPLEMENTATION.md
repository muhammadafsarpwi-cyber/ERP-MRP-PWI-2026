# ERP-00009: Bill of Materials (M08) — Implementation Report

**Date**: 2026-08-21  
**Status**: COMPLETE  
**Module**: M08 — Manufacturing (Bill of Materials)

---

## 1. Scope

Implement a full Bill of Materials module with:
- Database tables, indexes, triggers, and permissions
- Backend CRUD with NestJS (entities, DTOs, services, controllers)
- Frontend management page
- Status workflow, cost calculation, and business rule enforcement
- Security audit and migration idempotency

## 2. Database

### Tables
| Table | Columns | Description |
|-------|---------|-------------|
| `bill_of_materials` | 16 | BOM header: company, product, status, estimated_cost |
| `bom_lines` | 16 | Component lines: item, quantity, UOM, scrap, yield |

### Relationships (5 FKs)
| From | To |
|------|----|
| `bill_of_materials.company_id` | `companies.id` |
| `bill_of_materials.product_id` | `items.id` |
| `bom_lines.bom_id` | `bill_of_materials.id` |
| `bom_lines.item_id` | `items.id` |
| `bom_lines.uom_id` | `uoms.id` |

### Constraints
- `uq_bom_code_company` — unique BOM code per company
- `uq_bom_line_number` — unique line number per BOM

### Indexes (6)
- `idx_bom_company`, `idx_bom_product`, `idx_bom_status`, `idx_bom_code`
- `idx_bom_lines_bom`, `idx_bom_lines_item`

### Triggers (2)
- `trg_bill_of_materials_updated_at` — auto-update `updated_at`
- `trg_bom_lines_updated_at` — auto-update `updated_at`

## 3. Permissions (10)

| Code | Module | Resource | Action |
|------|--------|----------|--------|
| `manufacturing.bom.view` | manufacturing | bom | VIEW |
| `manufacturing.bom.create` | manufacturing | bom | CREATE |
| `manufacturing.bom.update` | manufacturing | bom | UPDATE |
| `manufacturing.bom.delete` | manufacturing | bom | DELETE |
| `manufacturing.bom.change_status` | manufacturing | bom | CHANGE_STATUS |
| `manufacturing.bom.estimate_cost` | manufacturing | bom | ESTIMATE_COST |
| `manufacturing.bom_line.view` | manufacturing | bom_line | VIEW |
| `manufacturing.bom_line.create` | manufacturing | bom_line | CREATE |
| `manufacturing.bom_line.update` | manufacturing | bom_line | UPDATE |
| `manufacturing.bom_line.delete` | manufacturing | bom_line | DELETE |

All 10 granted to SUPER_ADMIN role.

## 4. API Endpoints (7)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/bom` | List all BOMs for company |
| `GET` | `/api/v1/bom/:id` | Get BOM by ID with lines |
| `GET` | `/api/v1/bom/product/:productId` | Get active BOM for product |
| `POST` | `/api/v1/bom` | Create new BOM with lines |
| `PUT` | `/api/v1/bom/:id` | Update DRAFT BOM |
| `DELETE` | `/api/v1/bom/:id` | Soft-delete BOM |
| `PUT` | `/api/v1/bom/:id/status` | Change BOM status |
| `PUT` | `/api/v1/bom/:id/recalculate` | Recalculate estimated cost |

All endpoints: SupabaseJwtGuard → OrgScopeGuard → PermissionGuard → RequireOrgScope → RequirePermission

## 5. Business Rules

| Rule | Implementation |
|------|----------------|
| Status workflow | DRAFT → ACTIVE → OBSOLETE only |
| One ACTIVE BOM per product/company | Enforced on create and status change |
| Self-reference | Component item cannot be the product itself |
| Circular reference | BFS traversal of component BOM trees |
| Min 1 line | At least one component line required |
| Edit only DRAFT | Active/Obsolite BOMs cannot be edited |
| Auto BOM code | Sequential: BOM-001, BOM-002, ... |
| Auto cost calculation | Σ (cost_price × quantity / yield_percentage) |
| ParseUUIDPipe | All @Param decorators return 400 on invalid UUID |
| Company isolation | companyId from JWT, spoofing prevented |

## 6. Demo Data

| BOM | Product | Status | Lines | Estimated Cost |
|-----|---------|--------|-------|----------------|
| BOM-001 | Precision Bearing 6205 | ACTIVE | 3 | 1,934.39 |
| BOM-002 | Industrial Widget | ACTIVE | 3 | 2,440.00 |
| BOM-003 | Premium Component Kit | DRAFT | 3 | 1,745.00 |

## 7. Verification Results

| Category | Result |
|----------|--------|
| API E2E Tests | 47/47 PASS |
| Unit Tests | 229/229 PASS (16 suites) |
| Migration Idempotency | 3/3 PASS |
| Database Columns | 32/32 verified |
| FK Integrity | 5/5 zero orphans |
| Unique Constraints | 2/2 verified |
| Indexes | 6/6 verified |
| Triggers | 2/2 verified |
| Demo Data | 3 BOMs, 9 lines, 10 perms |
| Frontend TypeScript | PASS (0 errors) |
| Frontend Build | PASS |
| Backend TypeScript | PASS (0 errors) |
| Backend Build | PASS |
