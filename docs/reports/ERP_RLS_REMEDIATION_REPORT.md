# ERP RLS Remediation Report

**Date:** 2026-08-29
**Migration:** `20260829120000_erp_00028_rls_constraints.sql` (policies + constraints + SPARE_PART)
**Patch:** `20260829130000_erp_00029_rls_helper_functions_fix.sql` (SECURITY DEFINER helpers)

---

## 1. Pre-Remediation State (verified)

| Item | State |
|---|---|
| RLS enabled on ERP tables | 87/93 tables had `relrowsecurity=true` but **zero policies** → deny-all for non-owners |
| Tables without RLS | 6 (`erp_sales.customers`, `quotations`, `quotation_items`, `sales_orders`, `sales_order_items`, `sales_invoices`) |
| Existing policies | Only `storage.objects` (Supabase Storage); **no ERP data policies** |
| Backend connection | `postgres` role (table owner) → bypasses RLS → app continued to work |
| Security helper schema | `erp_core` existed with `is_admin()`, `has_role()`, `has_any_role()` |

**Root problem:** RLS was "on" but not enforced — `authenticated`/`anon` roles were silently locked out of all data (deny-all), while there was no authorization model granting scoped access. This both (a) provided no working access path for PostgREST and (b) left no verification that authorization actually reflects company/role scope.

---

## 2. What Was Implemented

### 2.1 Helper functions (`erp_core` schema, all `SECURITY DEFINER`)

| Function | Purpose |
|---|---|
| `erp_core.current_erp_user_id()` | Resolve auth.uid() → ERP user id |
| `erp_core.is_admin()` | True if auth user has `SUPER_ADMIN` role (active) |
| `erp_core.has_role(code)` | True if auth user has given role |
| `erp_core.has_any_role(codes[])` | True if auth user has any of given roles |
| `erp_core.company_in_scope(company_id)` | Admin **OR** user has an org-scope row for that company |
| `erp_core.item_child_in_scope(item_id)` | Scope item child tables via parent item's company |
| `erp_core.uom_conversion_in_scope(from,to)` | Scope UOM conversions via either UOM's company |
| `erp_core.procurement_line_in_scope(table,id)` | Scope line tables via parent document's company |
| `erp_core.job_card_company_id(job_card_id)` | Resolve job card's company for child scoping |

All helpers are `SECURITY DEFINER` (owner = `postgres`) so they can read the RLS-protected authorization tables (`user_organization_scopes`, `roles`, `user_roles`, `erp_users`) when invoked inside a policy under the `authenticated` role. This was the critical fix in 00029 — without it, `company_in_scope()` returned false for all non-admin users (the authorization tables were hidden by RLS).

### 2.2 RLS enabled on all tables
Enabled RLS on the 6 remaining `erp_sales` tables (others already enabled).

### 2.3 Policies (334 created in public/erp_sales)

**Security/IAM tables — admin only (with self-read for erp_users):**
`companies`, `roles`, `permissions`, `role_permissions`, `user_roles`, `user_organization_scopes`, `department_division_scopes`, `activity_logs`, `erp_users` (admin all + `erp_users_self_select` so a user can read their own row).

**Company-scoped tables — `FOR ALL USING (erp_core.company_in_scope(company_id))`:**
- Organization: `branches`, `divisions`, `sections`, `departments`, `business_units`, `warehouses` (+ `warehouse_locations` via parent)
- Master data: `items`, `item_categories`, `uoms`, `item_attribute_definitions` (+ child tables via item: `item_attribute_values`, `item_barcodes`, `item_specifications`, `item_documents`; `uom_conversions` via UOM)
- Inventory: `inventory_balances`, `stock_ledger`, `batches`, `serial_numbers`, `inventory_policies`, `inventory_reservations`, `stock_adjustments`, `stock_transfers` (+ line tables via parent)
- Procurement: `suppliers`, `supplier_items`, `purchase_requisitions`, `request_for_quotations`, `quotations`, `purchase_orders`, `goods_receipts`, `purchase_returns`, `purchase_invoices` (+ all 7 line tables via parent)
- CRM: `customers` (+ `customer_contacts`, `customer_addresses` via parent)
- Manufacturing: `bill_of_materials`, `production_routings`, `production_orders`, `production_entries`, `production_order_operations`, `production_order_operation_logs`, `machines`, `machine_targets`, `shifts`, `downtime_reasons`, `routing_operations` (+ `bom_lines` via parent)
- Maintenance: `maintenance_job_cards`, `maintenance_teams`, `maintenance_technicians`, `maintenance_pm_plans`, 3 category tables (+ job-card children via parent, `maintenance_pm_schedules` via plan, `maintenance_team_members` via team)
- Sales (erp_sales): `customers`, `quotations`, `sales_orders`, `sales_invoices`, `sales_deliveries`, `sales_returns` (+ `quotation_items`, `sales_order_items`, `sales_delivery_lines`, `sales_return_lines` via parent)

**Notifications (user-scoped):**
`notifications` — SELECT/UPDATE/DELETE where `user_id = auth.uid()`; INSERT unrestricted (system-created).

**Design principle honored:** No blanket `USING (true)` policies. Every ERP policy resolves the caller's ERP identity → roles → org scope. Security tables are admin-only. Anon has no access.

---

## 3. Verification (actual tests run)

| Test | Result |
|---|---|
| Admin (`dev@erp-local.test`, SUPER_ADMIN) sees items | ✅ 90 items (all) |
| Admin sees companies | ✅ 1 |
| Admin sees erp_users | ✅ 5 |
| Admin sees role_permissions | ✅ 538 |
| Admin sees maintenance job cards | ✅ 48 |
| Admin sees sales_orders (erp_sales) | ✅ 10 |
| Ordinary user (no org scope) sees items | ✅ 0 (denied) |
| Ordinary user (no org scope) sees erp_users | ✅ 0 (except own row via self-read) |
| Ordinary user (no org scope) sees role_permissions | ✅ 0 |
| Ordinary user (no org scope) sees job cards | ✅ 0 |
| Anon sees items | ✅ 0 |
| Anon sees erp_users | ✅ 0 |
| Anon sees sales_orders | ✅ denied (no grants) |
| Anon INSERT into items | ✅ blocked by RLS |
| **Cross-company:** user scoped to Company B sees Company B item | ✅ 1 |
| **Cross-company:** user scoped to Company B sees Company A items | ✅ 0 |
| **Cross-company:** admin sees Company A items | ✅ 90 |
| App API after RLS (postgres owner bypass) | ✅ items 20, job cards 20, sales orders 10 |

### How RLS was tested
- `SET ROLE authenticated` + transaction-local `set_config('request.jwt.claims', '{sub:<auth_id>}')` to simulate PostgREST's auth context
- `SET ROLE anon` to simulate anonymous
- Created a temporary second company (B), a UOM, an item, and an org-scope row pointing a user to company B → verified the user could only see company B data, then cleaned up

---

## 4. Security Model Summary

| Actor | ERP data | Security tables | erp_users |
|---|---|---|---|
| `anon` | none | none | none |
| `authenticated` (no scope) | none | none | own row only |
| `authenticated` (company scope) | own company only | none | own row only |
| `authenticated` (SUPER_ADMIN) | all companies | all | all |
| `postgres` (backend service role) | all (owner bypass, intentional) | all | all |

---

## 5. Remaining Notes / Risks

- **Single-company live DB:** only one real company exists; cross-company isolation was verified with a synthetic second company (cleaned up after). Policy logic is company-scoped via `user_organization_scopes`.
- **Insert/Update/Delete policies** are company-scoped but not **role/permission-scoped at the DB layer** for non-admin users. The requirement "enforce role/permission authorization" is implemented as company-scope + admin-vs-non-admin; fine-grained per-action permissions (e.g., only Procurement can create POs) are enforced at the NestJS application layer. Extending each policy to require a specific role is possible but would require mapping all 237 permission codes to policies; recommended as a follow-up (P1).
- **erp_sales schema grants:** anon role has no privileges on `erp_sales` tables (returns "permission denied" rather than empty set). This is acceptable (denied) but could be normalized with explicit GRANTs if PostgREST read access via anon is ever desired (it should not be).
- **Helper function call cost:** SECURITY DEFINER functions run as owner; they are lightweight indexed lookups, acceptable at ERP scale.
