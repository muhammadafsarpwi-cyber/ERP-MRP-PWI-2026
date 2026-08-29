# ERP Phase 3 Retest Report

**Date:** 2026-08-29
**Method:** Live re-execution of the Phase 2 functional test battery against the remediated backend + database, plus new DB-level verification.

---

## 1. Retest Summary

| Metric | Phase 2 (before) | Phase 3 (after) | Δ |
|---|---|---|---|
| Backend build | ✅ pass | ✅ pass | — |
| Frontend build | ✅ pass (858 kB warn) | ✅ pass | — |
| Backend tests | 372 pass / **8 fail** | **380 pass / 0 fail** | +8 |
| Test suites | 22 | 22 | — |
| Frontend tests | 35 pass | 35 pass (unchanged) | — |
| ESLint | ❌ broken (no config) | ✅ exit 0 | fixed |
| API endpoints | 205/208 | **208/208** | +3 |
| Item detail 500s | 3 | **0** | fixed |
| RLS policies | 0 (on ERP tables) | **334** | +334 |

---

## 2. Previously-Failing Endpoints — RETESTED ✅

| Endpoint | Phase 2 | Phase 3 | Verification |
|---|---|---|---|
| `GET /master-data/attributes` | ❌ 500 | ✅ 200 (6 defs) | Root cause: entity `allowed_values` column not in DB; fixed entity |
| `GET /master-data/items/{id}` | ❌ 500 | ✅ 200 (DEMO-RW-004) | Root cause: entity `description` column not in DB; fixed entity |
| `PATCH /master-data/items/{id}` | ❌ 500 | ✅ 200 | Same entity fix |

---

## 3. P0 Fix Verification Matrix

### 3.1 RLS — 5 user classes + cross-company (DB-level, executed)

| Test | Expected | Actual | Result |
|---|---|---|---|
| Admin (SUPER_ADMIN) `items` | all | 90 | ✅ |
| Admin `companies` | 1 | 1 | ✅ |
| Admin `erp_users` | 5 | 5 | ✅ |
| Admin `role_permissions` | >0 | 538 | ✅ |
| Admin `maintenance_job_cards` | >0 | 48 | ✅ |
| Admin `erp_sales.sales_orders` | 10 | 10 | ✅ |
| Ordinary user (no scope) `items` | 0 | 0 | ✅ |
| Ordinary user `erp_users` | own row only | 1 (self) | ✅ |
| Ordinary user `role_permissions` | 0 | 0 | ✅ |
| Ordinary user `maintenance_job_cards` | 0 | 0 | ✅ |
| Anon `items` | 0 | 0 | ✅ |
| Anon `erp_users` | 0 | 0 | ✅ |
| Anon `erp_sales.sales_orders` | denied | denied | ✅ |
| Anon INSERT `items` | blocked | RLS violation | ✅ |
| User scoped to Company B → B item | 1 | 1 | ✅ |
| User scoped to Company B → A items | 0 | 0 | ✅ |
| Admin → Company A items | >0 | 90 | ✅ |
| **App still works after RLS (owner bypass)** | items/jc/so | 20/20/10 | ✅ |

### 3.2 CompanyController + getMyPermissions (API, executed)

| Test | Expected | Actual | Result |
|---|---|---|---|
| `GET /admin/permissions-matrix/my-permissions` | full set | **237** | ✅ (was 0) |
| `GET /companies` (with `company.view`) | 1 | 1 | ✅ |
| Backend CompanyController spec | pass | pass | ✅ |

### 3.3 Migration apply (DB, executed)

| Migration | Applied | Result |
|---|---|---|
| `00028_rls_constraints` | live DB | ✅ |
| `00029_rls_helper_functions_fix` | live DB | ✅ |
| `00030_base_schema_and_seed` | live DB | ✅ |

### 3.4 SPARE_PART (DB, verified)

- `items_item_type_check` replaced with `ck_items_item_type` including `SPARE_PART` ✅

### 3.5 Constraints (DB, verified)

- 12 CHECK constraints added; pre-validation found 0 data violations ✅
- 2 FKs added; 12 indexes added ✅

---

## 4. Workflow Regression Retest

| Workflow | Phase 2 | Phase 3 |
|---|---|---|
| Procurement (PR→RFQ→PO→GRN→Invoice) | ✅ 10/10 | ✅ unchanged |
| Sales (Quote→SO→Delivery→Invoice→Return) | ✅ 20/20 | ✅ unchanged |
| Manufacturing endpoints | ✅ 12/12 | ✅ unchanged (still 0 production orders in seed) |
| Maintenance (assign→start→hold→resume→complete→verify→approve→close) | ✅ 18/18 | ✅ unchanged |

No regressions observed.

---

## 5. Remaining Not-Verified Items (honest list)

1. **Clean-room fresh-DB migration apply** — not executed (no Docker/local Postgres available in this environment). Migrations were made deterministic/idempotent but a from-scratch apply is **unverified**.
2. **Maintenance spare-parts end-to-end UI flow** — constraint fixed; create-spare-part → job-card-issue → inventory-transaction flow not yet executed in UI.
3. **Finance / HR / QC modules** — do not exist; no tests.
4. **Frontend workflow completion** (line items, FK selects, token refresh, Production Orders page) — not implemented.
5. **New regression tests** for P0 fixes — RLS verified via live DB tests; not yet codified into the test suite.

---

## 6. Conclusion

All P0 (CRITICAL) findings from Phases 1–2 are now addressed and individually verified. The Phase 2 API failures (3) are resolved. Backend test suite is green (380/380), lint is green, builds are green. The ERP is **not declared production-ready**; Finance/HR/QC modules, frontend workflow completion, and clean-room migration verification remain as the next required phase.
