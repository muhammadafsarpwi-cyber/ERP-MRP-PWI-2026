# ERP Phase 8 — Go-Live Checklist

**Date:** 2026-08-29

---

## 1. Database

| Item | Status |
|---|---|
| Clean-room migrations 43/43 | ✅ |
| RLS enabled on all tables | ✅ |
| Company-scoped policies | ✅ |
| Cross-company isolation | ✅ |
| Audit columns (created_by/updated_by/created_at/updated_at) | ⚠️ HR/QC partial (added via 00034) |
| Backup strategy | ❌ NOT DOCUMENTED |
| Restore procedure | ❌ NOT DOCUMENTED |

## 2. Backend

| Item | Status |
|---|---|
| Build passes | ✅ |
| 380/380 tests | ✅ |
| Validation (class-validator) | ✅ |
| Authorization (@RequirePermission) | ✅ |
| Transaction integrity (journal posting) | ✅ |
| Error handling | ⚠️ Some silent catches |

## 3. Frontend

| Item | Status |
|---|---|
| All major modules have pages | ⚠️ HR/QC partial |
| Line items in all forms | ❌ 2 of 12 |
| Finance journal editor | ✅ |
| Reports pages | ⚠️ Finance yes, others no |
| Loading/empty/error states | ⚠️ Partial |

## 4. Manufacturing (MANDATORY GATE)

| Item | Status |
|---|---|
| BOM → PO → Release | ✅ |
| Material issue → Production → FG → Scrap → Completion | ❌ BLOCKED (BOM UUID validation + operation workflow) |
| Demo BOMs usable in production orders | ❌ FAIL (b1000000-... invalid per @IsUUID) |

## 5. Finance

| Item | Status |
|---|---|
| Journal + debit=credit | ✅ |
| Auto-posting AR/AP/cash (E2E verified) | ✅ |
| TB/P&L/BS/AR/AP | ✅ |
| AR/AP aging | ❌ |

## 6. Security

| Item | Status |
|---|---|
| RLS | ✅ |
| Permissions | ✅ |
| Anon blocked | ✅ |
| Secrets handling | ✅ (.env gitignored) |
| Env separation (dev/test/prod) | ⚠️ Single .env; no prod .env committed |

## 7. BLOCKERS BEFORE GO-LIVE

1. **Manufacturing lifecycle not E2E verified** — demo BOM UUIDs invalid (`b1000000-...` fails `@IsUUID()`), material issue/receipt UI missing
2. **Line items in 10 of 12 transaction forms** not wired
3. **HR attendance/leave frontend** not built
4. **QC result-entry/disposition UI** not built
5. **Backup/recovery documentation** not produced
6. **Production environment** not configured (single .env; no prod secrets management)

## 8. GO-LIVE VERDICT

**NOT READY FOR PRODUCTION DEPLOYMENT.** Manufacturing E2E gate FAILED. Frontend workflow gaps remain. See Final Readiness Report for classification.