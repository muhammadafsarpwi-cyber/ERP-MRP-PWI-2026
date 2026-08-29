# ERP Phase 4 Regression Report

**Date:** 2026-08-29
**Scope:** Re-execution of all Phase 2/3 verification tests after Phase 4 changes

---

## 1. Build Regression

| Test | Phase 2/3 | Phase 4 | Δ |
|---|---|---|---|
| Backend build (`npm run build`) | ✅ | ✅ | — |
| Frontend build (`npm run build`) | ✅ (858 kB gzip) | ✅ | — |
| Backend tests | 380/380 | 380/380 | — |
| Frontend tests | 35/35 | 35/35 | — |
| ESLint (`npm run lint`) | ✅ 0 errors | ✅ 0 errors | — |

## 2. API Regression (Phase 2 failures)

| Endpoint | Phase 2 | Phase 3 | Phase 4 | Δ |
|---|---|---|---|---|
| `GET /master-data/attributes` | ❌ 500 | ✅ 200 | ✅ 200 | — |
| `GET /master-data/items/{id}` | ❌ 500 | ✅ 200 | ✅ 200 | — |
| `PATCH /master-data/items/{id}` | ❌ 500 | ✅ 200 | ✅ 200 | — |

## 3. Workflow Regression

| Workflow | Phase 2/3 | Phase 4 | Δ |
|---|---|---|---|
| Procurement (PR→RFQ→PO→GRN→Invoice) | ✅ 10/10 | ✅ unchanged | — |
| Sales (Quote→SO→Delivery→Invoice→Return) | ✅ 20/20 | ✅ unchanged | — |
| Manufacturing endpoints | ✅ 12/12 | ✅ unchanged | — |
| Maintenance (assign→start→complete→verify→approve→close) | ✅ 18/18 | ✅ unchanged | — |
| **Finance (new):** | | | |
| Journal accounting (debit=credit) | N/A | N/A | ✅ verified |
| Journal posting | N/A | N/A | ✅ verified |
| Trial balance | N/A | N/A | ✅ verified |
| P&L | N/A | N/A | ✅ verified |
| Balance sheet | N/A | N/A | ✅ verified |
| AR report | N/A | N/A | ✅ verified |

## 4. RLS Security Regression

| Test | Phase 3 | Phase 4 | Δ |
|---|---|---|---|
| Admin items (90) | ✅ | ✅ | — |
| Admin companies (2) | ✅ | ✅ | — |
| Admin erp_users (5) | ✅ | ✅ | — |
| Admin role_permissions | ✅ 538 | ✅ 575 | +37 (new permissions) |
| Admin job cards (48) | ✅ | ✅ | — |
| Admin sales_orders (10) | ✅ | ✅ | — |
| Ordinary (no scope) items (0) | ✅ | ✅ | — |
| Ordinary erp_users (self only) | ✅ | ✅ | — |
| Ordinary role_permissions (0) | ✅ | ✅ | — |
| Ordinary job cards (0) | ✅ | ✅ | — |
| Anon items (0) | ✅ | ✅ | — |
| Anon erp_users (0) | ✅ | ✅ | — |
| Anon insert blocked | ✅ | ✅ | — |
| Cross-company: user@B sees B item | ✅ | ✅ | — |
| Cross-company: user@B sees A items (0) | ✅ | ✅ | — |

## 5. No Regressions Found

All previously-verified workflows, API endpoints, and RLS policies continue to function correctly. The new Finance module adds 22 API endpoints with no regressions to existing modules.