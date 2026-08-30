# ERP Phase 7 — UAT Report

**Date:** 2026-08-29
**Scope:** Final UAT scenarios + data integrity testing

---

## 1. UAT Scenario Results

### Scenario A — Procurement (PR→RFQ→PO→GRN→QC→Stock→Invoice→AP→Payment)
| Step | Status |
|---|---|
| PR / RFQ / Quotation / PO / GRN | ✅ API chain (Phase 2) |
| QC on GRN | ✅ (Phase 5) |
| Supplier Invoice → AP | ✅ **auto-posted** (Phase 7 E2E: AP 1800) |
| Supplier Payment | ✅ **auto-posted** (Phase 7 E2E: AP→0, Cash reduced) |

### Scenario B — Sales (Quote→SO→Delivery→Stock→Invoice→AR→Receipt)
| Step | Status |
|---|---|
| Quotation / SO / Delivery / Stock | ✅ API chain (Phase 2) |
| Sales Invoice → AR | ✅ **auto-posted** (Phase 7 E2E: AR 3000) |
| Customer Receipt | ✅ **auto-posted** (Phase 7 E2E: AR→500, Cash increased) |

### Scenario C — Manufacturing (BOM→PO→Issue→Production→FG→Stock→Scrap→Downtime)
**⚠️ NOT FULLY VERIFIED** — 0 production orders in seed data; material issue/receipt UI missing. Backend endpoints exist.

### Scenario D — Maintenance (Request→JC→Start→Labor→Spares→Close→Approve→Complete)
**✅ Fully verified** (Phase 2: 18 API transitions).

### Scenario E — Quality (GRN→Inspection→PASS / FAIL→NCR→Disposition→CAPA)
**✅ API chain verified** (Phase 5: inspection PASS, NCR disposition REJECT, CAPA).

### Scenario F — HR (Employee→Shift→Attendance→Leave→Approval)
**✅ API chain verified** (Phase 5: employee, attendance, leave with day calc, approval).

### Scenario G — Finance (Source→Journal→Post→GL→TB→AR/AP→P&L→BS)
**✅ Fully verified** (Phase 7 E2E: all 4 auto-posting paths, TB always balanced, AR/AP correct).

## 2. Data Integrity / Edge-Case Testing

| Case | Result |
|---|---|
| Unbalanced journal | ✅ Rejected 400 |
| Posted journal delete | ✅ Rejected 403 |
| Payment > balance | ✅ Rejected (recordPayment guard) |
| Duplicate PO code | ✅ Rejected 409 |
| Duplicate account code | ✅ Rejected |
| Invalid status transition (post non-pending invoice) | ✅ Rejected |
| Cancel posted invoice | ✅ Rejected |
| Duplicate attendance date | ✅ Rejected |
| Leave end < start | ✅ Rejected |
| Anon insert (RLS) | ✅ Blocked |
| Cross-company access | ✅ Blocked |

## 3. UAT Score

**6.5 of 7 scenarios verified.** Manufacturing is the only gap (needs demo orders). **UAT readiness: 90%.**

## 4. NOT Declared Production-Ready

Manufacturing end-to-end not yet verified; remaining frontend gaps (line items in most forms, HR/QC page depth) prevent the FULL acceptance criteria from being met. Classification: **READY FOR FINAL UAT / BUSINESS SIGN-OFF** (for the verified domains).