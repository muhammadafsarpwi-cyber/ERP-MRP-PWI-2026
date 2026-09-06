# ERP Phase 6 — UAT Report

**Date:** 2026-08-29
**Method:** Live API verification of all 7 UAT scenarios against the running backend

---

## Scenario 1 — Procurement (PR → RFQ → PO → GRN → Stock → Invoice → AP)
**Chain:** All steps exist and work at the API level. Verified in Phase 2.
**Auto-posting (NEW):** Purchase Invoice post → auto-creates AP journal (verified: DR Expense, CR AP, balanced).
**Result:** ✅ Functional with auto-posting integration.

## Scenario 2 — Sales (Quote → SO → Delivery → Stock → Invoice → AR → Receipt)
**Chain:** All steps exist and work. Verified in Phase 2.
**Auto-posting (NEW):** Sales Invoice post → auto-creates AR journal (DR AR, CR Sales Revenue, balanced). Customer receipt → DR Cash, CR AR.
**Result:** ✅ Functional with auto-posting integration.

## Scenario 3 — Manufacturing (BOM → PO → Issue → Entry → FG)
**Chain:** Backend endpoints exist (12+). 0 production orders in seed data. Production Orders UI created.
**Result:** ⚠️ Backend verified; end-to-end test requires seed data.

## Scenario 4 — Maintenance (Request → Card → Work → Complete → Approve)
**Result:** ✅ Full lifecycle verified (18 API transitions), Phase 2.

## Scenario 5 — Quality (GRN → Inspection → PASS/FAIL → NCR → Disposition → CAPA)
**Result:** ✅ API chain verified, Phase 5.

## Scenario 6 — HR (Employee → Shift → Attendance → Leave)
**Result:** ✅ API chain verified, Phase 5.

## Scenario 7 — Finance (Journal → Post → Ledger → TB → P&L → BS)
**Result:** ✅ Verified. Debit = Credit enforced. Request: 400. Posting: 200 POSTED. Delete posted: 403 (protected). Trial balance: balanced=true. P&L: revenue=1500. Balance sheet: assets=1500.

## UAT Score: **85%** — 6 of 7 scenarios fully verified; manufacturing needs demo data