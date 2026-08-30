# ERP Phase 6 — Security Regression Report

**Date:** 2026-08-29
**Scope:** RLS regression after Phase 5/6 changes (new modules, auto-posting, frontend pages)

---

## 1. RLS Verification (5 user classes — retested Phase 3/4/5)

| Test | Phase 3 | Phase 4 | Phase 5 | Phase 6 | Δ |
|---|---|---|---|---|---|
| Admin items (90) | ✅ | ✅ | ✅ | ✅ | — |
| Admin companies | ✅ | ✅ | ✅ | ✅ | — |
| Admin erp_users (5) | ✅ | ✅ | ✅ | ✅ | — |
| Admin job cards (48) | ✅ | ✅ | ✅ | ✅ | — |
| Admin sales_orders (10) | ✅ | ✅ | ✅ | ✅ | — |
| Ordinary (no scope) items (0) | ✅ | ✅ | ✅ | ✅ | — |
| Ordinary erp_users (self only) | ✅ | ✅ | ✅ | ✅ | — |
| Ordinary role_permissions (0) | ✅ | ✅ | ✅ | ✅ | — |
| Anon items (0) | ✅ | ✅ | ✅ | ✅ | — |
| Anon insert blocked | ✅ | ✅ | ✅ | ✅ | — |
| Cross-company: user@B → B item | ✅ | ✅ | ✅ | ✅ | — |
| Cross-company: user@B → A items (0) | ✅ | ✅ | ✅ | ✅ | — |

**New tables with RLS:** Finance (6), HR (11), QC (7) — all with company-scoped policies; no `USING (true)`. Verified intact.

## 2. Finance-Specific Protections (verified Phase 4, unchanged)

| Protection | Status |
|---|---|
| Debit = credit enforced | ✅ |
| Posted journal cannot be deleted | ✅ |
| Posted journal reversal creates audit trail | ✅ |
| Accounting period must be open for posting | ✅ |
| Auto-posted journals are POSTED immediately (protected) | ✅ |

## 3. New Module Permissions (Phase 5/6, unchanged)

| Module | Permissions | Assigned to |
|---|---|---|
| Finance | 16 | SUPER_ADMIN |
| HR | 11 | SUPER_ADMIN |
| QC | 10 | SUPER_ADMIN |

Total permissions: 575. All new endpoints gated via `@RequirePermission()`. No frontend-only permission enforcement.

## 4. Audit Trail Verification

| Transaction | created_by | updated_by | posted_by | posted_at |
|---|---|---|---|---|
| Finance journals | ✅ | ✅ | ✅ | ✅ |
| Posted journals | — | — | ✅ | ✅ |
| Reversed journals | ✅ | ✅ | ✅ | ✅ |
| HR employees | ✅ | ❌ | N/A | N/A |
| QC inspections | ✅ | ❌ | N/A | N/A |

Auto-posted journals carry `createdBy`, `postedBy`, `postedAt` from the triggering user. Audit fields are set by the backend (cannot be falsified by ordinary users via API).

## 5. STOP Condition Verification

| Condition | Status |
|---|---|
| CRITICAL security issue | ❌ No — none found |
| RLS disabled | ❌ No — verified intact |
| Cross-company access | ❌ No — verified isolated |
| Debit/credit unbalanced | ❌ No — enforced |
| Working workflow broke | ❌ No — all pass |

**No STOP conditions triggered.**