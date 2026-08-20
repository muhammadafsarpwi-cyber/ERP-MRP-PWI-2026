# Supabase Migrations

This directory contains version-controlled database migrations for the ERP system.

## Structure

```
supabase/
├── migrations/
│   ├── 20260818120000_initial_organization_schema.sql
│   ├── 20260818130000_users_roles_permissions.sql
│   ├── 20260819100000_item_master.sql
│   ├── 20260819140000_inventory_management.sql
│   ├── 20260819150000_serial_numbers.sql
│   └── 20260819160000_procurement.sql
└── README.md
```

## Migration Convention

- Each migration file must be named with a timestamp prefix: `<YYYYMMDDHHMMSS>_<description>.sql`
- Example: `20260818120000_initial_schema.sql`
- Migrations must be idempotent (safe to run multiple times)
- All schema changes must be tracked in migration files
- Never manually modify the production database schema

## Seed Data Policy

**Every new Supabase table MUST have demo data** when added to the system.

### Requirements by Table Type

#### Master / Reference Tables
- Minimum **10 realistic demo records**
- Examples: companies, branches, divisions, departments, warehouses, items, categories, suppliers, UOMs
- Must satisfy unique constraints and CHECK constraints
- Use realistic ERP industry values (e.g., standard UOM codes, common category names)

#### Transactional Tables
- Minimum **10 realistic records** where required parent/master data exists
- Examples: stock adjustments, purchase orders, goods receipts, purchase requisitions
- Foreign keys must reference existing master data
- Status fields must use valid enum values
- Dates must be realistic and internally consistent

### Seed Data Rules

1. **Satisfy all constraints**: Foreign keys, unique constraints, NOT NULL, CHECK constraints
2. **Use realistic values**: Industry-standard names, codes, and measurements
3. **Be safely rerunnable**: Use `INSERT ... ON CONFLICT DO NOTHING` or deterministic IDs
4. **Never contain production credentials**: All passwords, keys, and tokens must be dev-only
5. **Clearly marked as DEMO/SEED**: Add comments identifying seed data sections
6. **Deterministic IDs where appropriate**: For master data that other seeds reference, use fixed UUIDs

### Current Seed Data Status

| Table | Seed Data | Count |
|-------|-----------|-------|
| `companies` | Yes | 1 |
| `divisions` | Yes | 5 |
| `roles` | Yes | 11 |
| `permissions` | Yes | ~138 |
| `role_permissions` | Yes | Multiple |
| `uoms` | Yes | 22 |
| `uom_conversions` | Yes | 12 |
| All other tables | Pending | — |

### Tables Requiring Seed Data

**Master tables (10+ records each):**
- `branches` — 10+ branch offices
- `sections` — 10+ organizational sections
- `departments` — 10+ departments
- `warehouses` — 10+ warehouses
- `warehouse_locations` — 10+ locations across warehouses
- `item_categories` — 10+ product categories
- `items` — 10+ products/materials
- `suppliers` — 10+ vendors
- `supplier_items` — supplier-item associations

**Transactional tables (10+ records with valid FK references):**
- `erp_users` — 10+ test users
- `inventory_policies` — 10+ policies per warehouse
- `batches` — 10+ batch records
- `purchase_requisitions` + lines — 10+ requisitions
- `request_for_quotations` + lines — 10+ RFQs
- `quotations` + lines — 10+ quotations
- `purchase_orders` + lines — 10+ purchase orders
- `goods_receipts` + lines — 10+ goods receipts
- `purchase_invoices` + lines — 10+ invoices

## Workflow

1. Create migration file
2. Include seed data section (separated by comments)
3. Apply to development Supabase database
4. Verify schema and seed data
5. Test constraints and relationships
6. Commit migration file
7. Update this README with seed data status

## Rollback

Each migration should include a rollback section (commented) for reversibility where practical.
