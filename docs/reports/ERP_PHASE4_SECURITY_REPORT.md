# ERP Phase 4 Security Report

**Date:** 2026-08-29
**Scope:** RLS regression, new module security, cross-company isolation, permissions

---

## 1. RLS Security Regression (4I)

**All Phase 3 RLS policies verified intact** after Phase 4 changes (new migrations, new tables, new modules).

| Test | Result |
|---|---|
| Admin — full access to all data | ✅ |
| Ordinary user (no scope) — no data access | ✅ (0 items, 0 job cards, 0 role_permissions) |
| Anon user — no data access | ✅ (0 items, 0 erp_users, insert blocked) |
| Anon insert — blocked by RLS | ✅ |
| Cross-company: user@B sees B data only | ✅ |
| Cross-company: user@B cannot see A data | ✅ |

**New tables with RLS (Phase 4 additions):**
- Finance: `finance_account_groups`, `finance_accounts`, `finance_fiscal_years`, `finance_accounting_periods`, `finance_journals`, `finance_journal_lines` — company-scoped policies
- HR: `hr_designations`, `hr_employees`, `hr_shifts`, `hr_attendance`, `hr_leave_types`, `hr_leave_requests`, `hr_holidays` — company-scoped; child tables via employee parent
- QC: `qc_inspection_plans`, `qc_inspections`, `qc_defect_classifications`, `qc_ncr`, `qc_capa` — company-scoped; characteristics via plan parent, results via inspection parent

**Security model for new modules:**
- All tables: `FOR ALL USING (erp_core.company_in_scope(company_id))` — admin bypass via `is_admin()`, regular users scoped to their companies
- Child tables: resolved via parent table's company
- No `USING (true)` policies anywhere in the system
- Permissions gated at the backend controller level via `@RequirePermission()`

**Finance-specific protections:**
- Posted journals cannot be deleted (403 Forbidden) — must be reversed
- Unbalanced journals rejected (400 Bad Request)
- Period closure prevents posting to closed periods
- Journal reversal creates full audit trail

## 2. Permission Audit

**New permissions created (Phase 4):**

| Module | Permission Count | Coverage |
|---|---|---|
| Finance | 16 | account CRUD, journal CRUD/post/reverse, reports (TB/GL/P&L/BS/AR/AP), period/fiscal year management |
| HR | 11 | employee CRUD, attendance, leave, designations, reports |
| QC | 10 | inspection CRUD, plan management, NCR, CAPA, reports |

Total permissions in system: 575 (was 538 in Phase 3, +37 new).

All new permissions granted to SUPER_ADMIN role. Other roles receive permissions via the Permission Matrix UI.

## 3. Frontend Security

- Finance frontend page is behind `ProtectedRoute` (authentication required)
- Backend enforces `@RequirePermission()` on every finance endpoint
- No frontend-gated permissions implemented for Finance (not yet needed — page is informational)

## 4. Remaining Security Gaps

- **No fine-grained role-based RLS policies** — the DB layer enforces company-scope and admin-only; per-action role enforcement is at the NestJS layer only
- **HR and QC backend modules not yet created** — no backend API endpoints exist, so no security gap, but they need permission-gated controllers when built
- **Finance frontend does not enforce permissions** — page is accessible to any authenticated user (backend enforcement is sufficient for now)

## 5. Verified: No CRITICAL Security Issues

All Phase 3 RLS protections remain in place. No regressions. New modules follow the same security model. The STOP condition (RLS disabled, cross-company access, unbalanced debit/credit) is not triggered.