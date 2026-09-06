# ERP Phase 5 Security Report

**Date:** 2026-08-29
**Scope:** RLS regression, new module security, permissions

---

## 1. RLS Regression (Phase 3 → Phase 5)

All Phase 3 RLS policies verified intact after Phase 4/5 changes (new migrations, new modules).

| Test | Phase 3 | Phase 5 | Δ |
|---|---|---|---|
| Admin items (90) | ✅ | ✅ | — |
| Admin companies | ✅ | ✅ | — |
| Admin erp_users (5) | ✅ | ✅ | — |
| Admin role_permissions | ✅ 538 | ✅ 575 | +37 new |
| Admin job cards (48) | ✅ | ✅ | — |
| Admin sales_orders (10) | ✅ | ✅ | — |
| Ordinary (no scope) items (0) | ✅ | ✅ | — |
| Ordinary erp_users (self) | ✅ | ✅ | — |
| Ordinary role_permissions (0) | ✅ | ✅ | — |
| Anon items (0) | ✅ | ✅ | — |
| Anon insert blocked | ✅ | ✅ | — |
| Cross-company: user@B sees B | ✅ | ✅ | — |
| Cross-company: user@B sees A (0) | ✅ | ✅ | — |

**New tables with RLS enabled (Phase 4/5):**
- Finance: 6 tables
- HR: 11 tables
- QC: 7 tables
All with company-scoped policies, no `USING (true)`.

## 2. New Module Permissions

| Module | Permissions | Assigned to |
|---|---|---|
| Finance | 16 | SUPER_ADMIN |
| HR | 11 | SUPER_ADMIN |
| QC | 10 | SUPER_ADMIN |

Total permissions in system: 575 (was 538). All new permissions gated at the backend controller level via `@RequirePermission()`.

## 3. Finance-specific Protections

| Protection | Verified |
|---|---|
| Debit = credit enforced (unbalanced → 400) | ✅ |
| Posted journal cannot be deleted (403) | ✅ |
| Posted journal requires reversal (creates audit trail) | ✅ |
| Accounting period must be open for posting | ✅ |
| Period closure prevents new postings | ✅ |
| Journal reversal creates full audit trail | ✅ |

## 4. Remaining Security Gaps

- **No fine-grained role-based RLS policies** — DB layer enforces company-scope only; per-action role enforcement at NestJS layer
- **HR/QC frontend pages** not yet built — no frontend security concern yet
- **Finance frontend page** does not enforce permissions client-side (backend enforcement is sufficient)
- **No audit integration** for HR/QC operations (activity_logs table exists but not wired)

## 5. STOP Condition Verification

| Condition | Status |
|---|---|
| CRITICAL security issue | ❌ No |
| RLS became disabled | ❌ No — verified intact |
| Cross-company access possible | ❌ No — verified isolated |
| Debit/credit unbalanced | ❌ No — enforced |
| Working workflow broke | ❌ No — all pass |