# ERP Database Audit Report

**Scope:** 35 Supabase migrations (`supabase/migrations/`), TypeORM entities (`backend/src/modules/**/entities/`), 3 TypeORM migrations (`backend/src/database/migrations/`), `backend/src/config/database.config.ts`.
**Verified by:** full file-by-file read of all 35 SQL migrations; automated scan (86 CREATE TABLE, 421 CREATE INDEX, 303 REFERENCES); grep for RLS/GRANT (zero hits); live `tsc --noEmit` on entities.

---

## 1. Schema Inventory

| Metric | Count |
|---|---|
| Migrations | 35 |
| Tables created | 86 (80 public + 6 erp_sales) |
| Indexes | 421 |
| FK references | 303 |
| RLS policies / ENABLE RLS / GRANT | **0 / 0 / 0** |
| DB functions | 3 (`update_updated_at_column`, `fn_machines_assign_machine_id`, `fn_machines_touch_updated_at`) |
| Triggers | ~70 (`BEFORE UPDATE` timestamp updaters + 2 machine) |
| Native ENUM types | 0 (all VARCHAR + CHECK) |

**Schema split:** `public` (org, IAM, item, inventory, procurement, CRM, mfg, maintenance, audit) + `erp_sales` (only deliveries/returns + FKs to sales_orders/invoices/customers/quotations which are **not created by this repo**).

---

## 2. CRITICAL Database Findings

| # | Location | Problem | Fix |
|---|---|---|---|
| DB-C1 | `20260822040000_erp_00014b_machine_master_alignment.sql:202` | Unterminated regex `'^MCH[0-9]{3}` (missing closing quote + `$`) → syntax error in verification DO block; migration fails. Mojibake at lines 45/195. | `~ '^MCH[0-9]{3}$'`; fix encoding. |
| DB-C2 | `00009/00010/00011/00017` | Hardcoded company UUID `7725aa04-...` referenced but never inserted → FK violations / silent no-ops on clean apply. | Insert fixed row or resolve by `company_code`. |
| DB-C3 | `21130000` | `user_roles` insert references user `52e0c38e-...`; `erp_users` never seeded → FK abort. | Seed user first / guard with EXISTS. |
| DB-C4 | `00017` (Section 8) | Inserts `production_routings.bom_id = NULL` but column is `NOT NULL` (00010) → constraint violation. | Make nullable or provide real BOM. |
| DB-C5 | `20120000_sales_module.sql` + seeds | `erp_sales` tables (`sales_orders`, `sales_invoices`, `customers`, `quotations`, `quotation_items`, `sales_order_items`) referenced but never created in this folder. | Add base `erp_sales` schema migration. |
| DB-C6 | ALL tables | **Row Level Security never enabled** — in Supabase, public-schema tables are readable/writable by anon/authenticated by default. The entire IAM model (erp_users/roles/role_permissions/scopes) is DB-enforced dead weight. | Enable RLS + org-scoped policies. |

---

## 3. HIGH Database Findings

| # | Location | Problem | Fix |
|---|---|---|---|
| DB-H1 | `machines` in 00013 | Duplicate `CREATE TABLE IF NOT EXISTS machines` with smaller/different schema + global unique `uq_machines_company_code` contradicting canonical 00012b design. | Remove duplicate DDL. |
| DB-H2 | `user_organization_scopes` | `UNIQUE(user_id, company_id, division_id, section_id, department_id)` with nullable scope cols → NULLs distinct → duplicate COMPANY scopes allowed. | Partial unique index. |
| DB-H3 | `complete_erp_demo_data.sql` Part 5 | `DELETE FROM item_attribute_values;` destroys data on re-run. | Restrict deletion (e.g., `WHERE created_by IS NULL`) or idempotent upsert. |
| DB-H4 | `maintenance_job_cards`, `pm_plans`, `pm_schedules`, `job_card_status_history`, `work_logs` | No CHECK on state vocabulary (`current_status`, `priority`, `maintenance_type`, `frequency_type/value`, `downtime_minutes`, durations). | Add CHECK constraints + ranges. |
| DB-H5 | `inventory_balances`, `stock_ledger`, `goods_receipt_lines`, `purchase_order_lines`, `purchase_invoices` | Quantity/money arithmetic unconstrained (negative available, over-receipt, over-invoice). | DB CHECKs + posting trigger. |
| DB-H6 | `uoms.company_id`, `production_entries.inventory_reference_id`, `sales_delivery_lines.batch_id`, `production_orders.sales_order_item_id`, `activity_logs.created_by/updated_by`, `stock_adjustments.approved_by/posted_by`, `stock_transfers.approved_by/posted_by`, `inventory_reservations.reserved_by`, `purchase_orders.approved_by`, `quotations.evaluated_by`, `customers.assigned_to` | FK columns with no REFERENCES (or no FK to erp_users). | Add FK constraints. |
| DB-H7 | `sales_deliveries`, `sales_returns`, `maintenance_job_cards`, `maintenance_pm_plans`, `maintenance_technicians`, `item_barcodes` | Global UNIQUE (not company-scoped) — multi-tenant collisions. | Scope by `company_id`. |
| DB-H8 | Line tables (PR/RFQ/quotation/PO/GR/invoice/sales-*) | Missing `UNIQUE(parent_id, line_number)`. | Add composite uniques. |
| DB-H9 | `public.customers` vs `erp_sales.customers` | Two independent customer masters; demo seeds both (CUST vs SC) with no linkage. | Consolidate. |

---

## 4. MEDIUM / LOW Findings

| # | Table | Problem | Severity |
|---|---|---|---|
| DB-M1 | `erp_users` | No FK to `auth.users`; no unique email; no indexes on default_division/section/department_id | MEDIUM |
| DB-M2 | `uom_conversions` | No CHECK `from_uom_id <> to_uom_id`; no cycle prevention | MEDIUM |
| DB-M3 | `items` | No CHECK `min <= max stock`, no `price >= 0`, no uom-FK indexes | MEDIUM |
| DB-M4 | `item_barcodes` | No partial unique for one primary barcode per item; global barcode unique | MEDIUM |
| DB-M5 | `batches` | No CHECK `expiry > manufacture`, `quantity >= 0` | MEDIUM |
| DB-M6 | `serial_numbers` | No indexes on warehouse/location/batch; status unconstrained; reference_id no FK | MEDIUM |
| DB-M7 | `stock_adjustments`/`stock_transfers` | No CHECK same-warehouse transfer; approved_by/posted_by no FK | MEDIUM |
| DB-M8 | `goods_receipt_lines` | No UNIQUE(receipt_id, po_line_id); `accepted+rejected <= received` unenforced | MEDIUM |
| DB-M9 | `purchase_invoices` | supplier_invoice_number indexed but not unique per supplier; `paid <= total` unenforced | MEDIUM |
| DB-M10 | `customer_contacts`/`customer_addresses` | Multiple primaries/defaults possible (no partial unique) | MEDIUM |
| DB-M11 | `production_entries` | Dedup index includes denormalized `machine_no` (not `machine_id`); efficiency % no range CHECK | MEDIUM |
| DB-M12 | `production_routings` | No CHECK `effective_to >= effective_from`, `status`, `is_default`; no product-consistency check vs BOM | MEDIUM |
| DB-M13 | `bom_lines` | No CHECK `quantity > 0`, scrap/yield ranges; no cycle prevention | MEDIUM |
| DB-M14 | `maintenance_*` categories | `company_id` nullable; no UNIQUE(company_id, code) → re-run duplicates (bare `ON CONFLICT DO NOTHING`) | MEDIUM |
| DB-M15 | `activity_logs` | No update trigger on `updated_at`; created_by/updated_by no FK | MEDIUM |
| DB-L1 | Index gaps | `erp_users` defaults, `items` uom FKs, `serial_numbers` location/batch, `production_entries` machine/uom, job-card created_by/team_id, `maintenance_job_card_status_history.changed_by` | LOW |
| DB-L2 | Status NOT NULL | Nearly every `status` column has default but nullable; enum-like columns unconstrained | LOW |
| DB-L3 | `erp_sales.sales_delivery_lines` | Has `created_at` but no `updated_at`/trigger (drift vs other tables) | LOW |
| DB-L4 | Money precision | `DECIMAL(15,4)/(15,6)/(19,4)` and `NUMERIC` mixed across modules — no policy | INFO |
| DB-L5 | Migration numbering | `00015` sorts after `00016`; three files share `erp_00013`; `00012b` sorts before `00012` | INFO |
| DB-L6 | `machines` trigger redefinition ×3 | Equivalent triggers re-created in 00012b/00013/00015 | INFO |

---

## 5. TypeORM vs Supabase Drift

| Severity | Finding |
|---|---|
| HIGH | Backend has only 3 TypeORM migrations (org/notifications/demo items) vs 35 Supabase migrations. TypeORM org migration predates `divisions`/`sections`/`departments.division_id`. Running `migration:run` or `schema:sync` conflicts with the applied Supabase schema. |
| HIGH | Entity `@Index()`/`@Unique()` metadata (production, machine, maintenance) doesn't match DDL everywhere; with `synchronize=false` the metadata can silently diverge from the DB. |
| MEDIUM | Length mismatches: `Uom.symbol` entity len 20 vs DDL VARCHAR(50); `Uom.uomType` 20 vs 30; `ItemSpecification.specValue` varchar(500) vs TEXT; `ItemDocument.fileUrl` 1000 vs 500. |
| MEDIUM | 17+ entities don't extend `BaseEntity` (manual id/audit columns, inconsistent `createdBy/updatedBy/isActive`) — e.g. `SalesOrder`, `StockLedger`, `DepartmentDivisionScope`. |
| MEDIUM | Multiple `@OneToMany(cascade: true)` + 22 `@ManyToOne(onDelete: 'CASCADE')` — redundant with DB FK cascades and risky if TypeORM ever deletes independently. |
| MEDIUM | `MachineTarget.standardHours`/`targetQuantity` typed `string \| number`; `Machine.capacity` uses `numeric` vs `decimal` elsewhere. |

---

## 6. Database Connection / Runtime Config

| Item | Value / Risk |
|---|---|
| Driver | `pg` via TypeORM `postgres` |
| SSL | `DB_SSL=true` ✅, but `DB_SSL_REJECT_UNAUTHORIZED=false` ⚠️ (verify disabled) |
| synchronize | `DB_SYNCHRONIZE=false` ✅ (safe) |
| logging | `DB_LOGGING=true` in dev — SQL log noise/overhead in prod |
| Pool | max 10, idle 30s, connectTimeout 30s, retry 5×/2s, keepConnectionAlive |
| Offline fallback | `isDatabaseAvailable` probe → starts in offline mode when DB unreachable (health OK, data ops fail) |
| Seed of auth.users | `erp-user.service.createFull` writes directly to `auth.users`/`auth.identities` with `session_replication_role='replica'` to bypass Supabase triggers — brittle; transaction leak (B6) |

---

## 7. Recommended Fix Priority (DB)

1. Enable RLS + org-scoped policies on all 86 tables (DB-C6).
2. Repair migration 00014b regex; make migrations idempotent/self-contained (DB-C1..C5).
3. Seed `erp_users` (DB-C3) and fix SPARE_PART demo (see main report B10).
4. Add FK constraints for the listed orphan FK columns (DB-H6).
5. Add quantity/state CHECK constraints (DB-H4/H5).
6. Scope global uniques by `company_id` (DB-H7).
7. Add `UNIQUE(parent, line_number)` to all line tables (DB-H8).
8. Align TypeORM entity metadata with DDL; consolidate the 3-TypeORM-migration drift.
