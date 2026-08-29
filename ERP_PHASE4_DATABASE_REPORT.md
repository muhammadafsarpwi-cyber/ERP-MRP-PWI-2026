# ERP Phase 4 Database Report

**Date:** 2026-08-29
**Scope:** Clean-room migration verification, new module schemas, constraints, RLS

---

## 1. Clean-Room Migration Verification (4A) — RESULTS

**Test environment:** Fresh Postgres database `erp_cleanroom_test` with minimal Supabase auth schema replicated (auth.users, auth.uid(), anon/authenticated/service_role roles, uuid-ossp/pgcrypto extensions).

**Result: 29/40 migrations applied successfully (72.5%).**

### Root-cause fixes applied during Phase 4
| Issue | Fix |
|---|---|
| 00014b UTF-8 BOM preventing SQL parse | Stripped BOM bytes |
| Missing erp_sales schema before sales_module | New `20260820110000_erp_sales_base_schema.sql` |
| Company UUID not deterministic | Seed COMP-001 with fixed UUID `7725aa04-...` |
| SUPER_ADMIN role UUID not deterministic | Seed with fixed UUID `c37e82cb-...` |
| No warehouses seeded (demo data depended on them) | Warehouse seed added to initial org schema |
| erp_users not seeded before user_roles FK | New `20260818140000_seed_demo_erp_users.sql` |
| SPD/CCD divisions missing | Created in 00011 before scope inserts |
| inventory_policies duplicate key (demo data) | `DISTINCT ON (i.id, w.id)` added |
| sales_orders missing delivery_date | Added to base schema |
| sales_invoices missing customer_id | Added to base schema |
| user_roles/user_org_scopes seed referenced non-existent is_active | Removed from seed |

### Remaining cascade failures (11)
All remaining failures are cascade effects from the demo-data seed ordering:
- `20260821120000_complete_erp_demo_data.sql` and downstream migrations (00009, 00010, 00012, 00013, 00016, 00017, 00018, 00028, 00029)

**Implication:** The migration chain is **partially self-contained**. It works on the live production DB (which was built incrementally), but a completely clean apply still fails in the demo-data section. This is the primary remaining database risk.

---

## 2. New Module Schemas (Phase 4)

### Finance (applied ✅)
| Table | Purpose | RLS |
|---|---|---|
| `finance_account_groups` | Account group (Asset/Liability/Equity/Revenue/Expense) | ✅ |
| `finance_accounts` | Chart of Accounts (type, normal balance, AR/AP/bank flags) | ✅ |
| `finance_fiscal_years` | Fiscal year definition | ✅ |
| `finance_accounting_periods` | Monthly/periods within a fiscal year | ✅ |
| `finance_journals` | Journal header (type, status, totals, posted audit) | ✅ |
| `finance_journal_lines` | Journal lines (account, debit/credit, reference) | ✅ |

**Integrity:** debit/credit CHECK, journal status CHECK, unique journal_number, unique account_code per company, FK cascade on journal→lines.

### HR (applied ✅)
| Table | Purpose | RLS |
|---|---|---|
| `hr_designations` | Job designations | ✅ |
| `hr_employees` | Employee master (dept, designation, manager, salary) | ✅ |
| `hr_employee_documents` | Documents per employee | ✅ |
| `hr_employee_skills` | Skills per employee | ✅ |
| `hr_employee_training` | Training records | ✅ |
| `hr_employee_histories` | Status change history | ✅ |
| `hr_shifts` | Shift definitions | ✅ |
| `hr_attendance` | Daily attendance | ✅ |
| `hr_leave_types` | Leave types | ✅ |
| `hr_leave_requests` | Leave requests + approval | ✅ |
| `hr_holidays` | Holiday calendar | ✅ |

**Integrity:** UNIQUE(employee, date) attendance, status CHECKs, FK cascade on employee children.

### QC (applied ✅)
| Table | Purpose | RLS |
|---|---|---|
| `qc_inspection_plans` | Inspection plan definitions | ✅ |
| `qc_quality_characteristics` | Quality characteristics per plan | ✅ |
| `qc_inspections` | Inspection records (type, result, reference) | ✅ |
| `qc_inspection_results` | Measured results per characteristic | ✅ |
| `qc_defect_classifications` | Defect codes (severity) | ✅ |
| `qc_ncr` | Non-conformance reports | ✅ |
| `qc_capa` | Corrective/preventive actions | ✅ |

**Integrity:** result/disposition/status CHECKs, FK cascade on plan→characteristics, inspection→results.

---

## 3. Migration Inventory (final)

| Metric | Count |
|---|---|
| Total migrations | 44 |
| Applied clean-room | 29 (72.5%) |
| New migrations (Phase 4) | 7 |
| Tables (all schemas) | ~120 |
| RLS policies | ~450 |
| Permissions | 575 |

## 4. Remaining Database Risks

1. **Clean-room migration not fully reproducible** — demo-data cascade failures (HIGH)
2. **HR/QC backend modules not built** — tables exist but no TypeORM entities/APIs wired (MEDIUM — schema ready)
3. **TypeORM ↔ Supabase schema drift** — 3 TypeORM migrations vs 44 SQL migrations (MEDIUM)
4. **Missing FKs/CHECKs** — Phase 3 added the highest-value set; inventory/procurement/sales/maintenance still have gaps (MEDIUM)
5. **Finance integration** — journals are created manually; no automatic postings from Procurement (AP), Sales (AR), or Inventory (MEDIUM)