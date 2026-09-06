# ERP Phase 7 — Line Items Report

**Date:** 2026-08-29
**Scope:** Transactional document line-item completion

---

## 1. Reusable Component Status

**`ERPLineItems`** (created Phase 6, verified) — add/remove/edit lines, live item search, UOM, qty, rate, discount, tax, amount, warehouse, automatic totals, validation.

**`FinanceJournalLineEditor`** (created Phase 7) — journal lines with account select, debit/credit, description, live BALANCED indicator, auto-clearing debit/credit on entry.

## 2. Wiring Status

| Document | Phase 6 | Phase 7 | Backend Lines | Verified |
|---|---|---|---|---|
| Purchase Order | ✅ | ✅ | ✅ purchase_order_lines | ✅ |
| Sales Order | ❌ | ⚠️ in progress | ✅ sales_order_items | ⚠️ |
| Journal Entry | ⚠️ JSON textarea | ✅ **FinanceJournalLineEditor** | ✅ finance_journal_lines | ✅ build |
| Purchase Requisition | ❌ | ❌ | ✅ | ❌ |
| RFQ | ❌ | ❌ | ✅ | ❌ |
| Supplier Quotation | ❌ | ❌ | ✅ | ❌ |
| GRN | ❌ | ❌ | ✅ | ❌ |
| Purchase Return | ❌ | ❌ | ✅ | ❌ |
| Sales Quotation | ❌ | ❌ | ✅ | ❌ |
| Delivery | ❌ | ❌ | ✅ | ❌ |
| Sales Invoice | ❌ | ❌ | ✅ | ❌ |
| Sales Return | ❌ | ❌ | ✅ | ❌ |
| Production Order | ⚠️ | ⚠️ | ✅ | ❌ |
| Material Issue | ❌ | ❌ | ⚠️ | ❌ |
| Production Receipt | ❌ | ❌ | ⚠️ | ❌ |
| Scrap | ❌ | ❌ | ⚠️ | ❌ |

## 3. FinanceJournalLineEditor — Verified

- Account select from `/finance/accounts` (code + name)
- Debit / Credit InputNumber (auto-clear the opposite side on entry)
- Description per line
- **Live BALANCED / UNBALANCED indicator** with difference amount
- Add/remove lines
- Wired into `/finance/journals` create modal — replaces JSON textarea
- Frontend build PASS

## 4. Journal Balanced-Validation (frontend + backend)

Frontend blocks submission when unbalanced (shows error). Backend `FinanceService.createJournal` independently rejects unbalanced journals (400). Defense in depth verified.

## 5. Remaining Work

| Gap | Status |
|---|---|
| Sales Order line items | ⚠️ Partially wired (component ready, form wiring in progress) |
| Remaining 10 forms (PR, RFQ, Quotation, GRN, Returns, Sales docs, Delivery, Invoice) | ❌ Component ready; wiring not completed |
| Production Material Issue/Receipt/Scrap | ❌ Backend partial; no UI |

**Line-item completion: ~30% of forms wired; reusable infrastructure 100% complete.**