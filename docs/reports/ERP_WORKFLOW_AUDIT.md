# ERP Workflow Audit Report

**Scope:** Business workflows across procurement, sales, inventory, production, and maintenance — backend state machines, frontend flow support, data integrity along the chain, and demo-data-driven walkthroughs.

---

## 1. Procurement Workflow

**Documented flow:** PR → RFQ → Quotation(s) → PO → Approval → GR → Invoice → Payment → Return.

| Step | Backend | Frontend | Status |
|---|---|---|---|
| Purchase Requisition CRUD + status | ✅ (`purchase-requisition.*`) | ⚠️ header-only form, no lines | ⚠️ |
| RFQ CRUD | ✅ | ⚠️ header-only form | ⚠️ |
| Quotation (supplier response) | ✅ | ⚠️ header-only form | ⚠️ |
| PO creation + status | ✅ | ⚠️ header-only form; no PO-from-RFQ linkage | ⚠️ |
| PO approval | ✅ (`SUBMITTED→APPROVED` transition API) | ⚠️ actions not surfaced per-row | ⚠️ |
| Goods Receipt against PO | ✅ (po_id, line qty) | ⚠️ free-text `poId`; no partial-receipt UI | ⚠️ |
| Purchase Invoice | ✅ | ⚠️ header-only; no 3-way match UI | ⚠️ |
| Return | ✅ | ⚠️ header-only | ⚠️ |

**Issues:**
- WF-1 (HIGH): No UI to add/ed line items anywhere in the chain — a PO/PR/RFQ without lines carries no demand data. Forms only capture header fields (`PurchaseOrderManagement.tsx:139-201`, and identical pattern in 7 more pages).
- WF-2 (HIGH): GR requires manual UUID `poId`; there's no picker for open POs and no partial-receipt UX (over-receipt isn't prevented in DB either — see DB-H5).
- WF-3 (MEDIUM): Status transitions exist on the API but the frontend doesn't drive a step-by-step approval flow or show the allowed next states.
- WF-4 (MEDIUM): No CHECK enforcing `received_quantity <= quantity`, `accepted+rejected <= received`, `paid <= total` — data-integrity holes in the chain (DB-H5).

**Verdict:** ⚠️ Partially implemented — backend chain exists, frontend can't capture the core transaction detail (lines).

---

## 2. Sales Workflow

**Documented flow:** Quotation → Sales Order → Delivery → Invoice → Return (credit).

| Step | Backend | Frontend | Status |
|---|---|---|---|
| Customer master | ✅ | ✅ (CRM) — but duplicated in erp_sales | ⚠️ |
| Quotation | ✅ | ⚠️ no lines | ⚠️ |
| Sales Order | ✅ | ⚠️ no lines | ⚠️ |
| Delivery | ✅ | ⚠️ no order picker | ⚠️ |
| Invoice | ✅ | ⚠️ free-text `salesOrderId`; no linkage | ⚠️ |
| Return | ✅ | ⚠️ | ⚠️ |

**Issues:**
- WF-5 (HIGH): Same line-items gap as procurement — sales forms are header-only.
- WF-6 (HIGH): **Schema availability** — the entire `erp_sales` schema the entities map to is not created by the repo's migrations (B5). Even if the UI were complete, a fresh apply has no `sales_orders` table to write to.
- WF-7 (MEDIUM): No SO→Delivery→Invoice linkage; `sales_delivery_lines.batch_id` has no FK; `serial_number` is free text (no serial master reference).
- WF-8 (MEDIUM): No partial-delivery / partial-invoice semantics enforced; no credit-note workflow from returns to invoices.

**Verdict:** ⚠️ Partially implemented and blocked at the DB layer on fresh installs.

---

## 3. Inventory Workflow

**Flow:** Master data → Opening stock → Stock ledger postings (GRN, issue, transfer, adjustment, production) → Balances/Reservations.

| Step | Backend | Frontend | Status |
|---|---|---|---|
| Opening stock | ✅ controller/service | ❌ no UI | ⚠️ |
| Stock ledger | ✅ | ✅ StockLedgerView | ✅ |
| Balances | ✅ | ✅ Inventory page | ✅ |
| Batch mgmt | ✅ | ✅ BatchManagement | ✅ |
| Transfer | ✅ | ✅ StockTransferManagement | ✅ |
| Adjustment | ✅ | ✅ StockAdjustmentManagement | ✅ |
| Reservation | ✅ | ✅ ReservationManagement | ✅ |
| Policies (reorder etc.) | ✅ | ✅ InventoryPolicyManagement | ✅ |
| Serials | ✅ entity | ❌ no UI | ⚠️ |

**Issues:**
- WF-9 (MEDIUM): No `available = on_hand - reserved` DB trigger/CHECK → negative available possible; reservation expiry not enforced.
- WF-10 (MEDIUM): `production_entries.inventory_reference_id` has no FK to stock_ledger → double-posting guard is unenforced.
- WF-11 (LOW): Inventory reports page shows hardcoded `0` for 3 of 4 stats (`Inventory.tsx:48-58`).

**Verdict:** ✅ Mostly working; DB integrity gaps remain.

---

## 4. Production / MRP Workflow

**Flow:** Item → BOM → Routing → Production Order (from demand) → Material issue → Daily entry → Finish-good receipt → Stock.

| Step | Backend | Frontend | Status |
|---|---|---|---|
| BOM + lines | ✅ | ✅ BOMManagement | ✅ |
| Routing + operations | ✅ | ✅ RoutingManagement | ✅ |
| Machine master | ✅ | ✅ MachineManagement | ✅ |
| Machine targets | ✅ | ✅ TargetManagement | ✅ |
| Production Order | ✅ | ❌ no page/route | ⚠️ |
| Material issue / receipt | ✅ API | ⚠️ not surfaced | ⚠️ |
| Daily production entry | ✅ | ✅ EntryForm/EntryList/EntryDetail | ✅ |
| Finish-goods receipt | ✅ | ⚠️ | ⚠️ |

**Issues:**
- WF-12 (HIGH): Production Orders have **no frontend page**, yet `EntryDetail.tsx:129` links to `/production/orders/:id` (missing route). The MRP demand→order→issue loop can't be operated from the UI.
- WF-13 (MEDIUM): `computeRequiredQuantity` (verified correct math) but over-issue validation is app-layer only; a 2-instance race could over-issue.
- WF-14 (MEDIUM): `bom_id NOT NULL` vs demo NULL (B4) blocks demo routings; BOM active-swap guard has a no-op `In([bom.id])` expression (BL1).
- WF-15 (LOW): Code generation (BOM/order/routing numbers) is non-atomic → collision risk under concurrency (BL2).

**Verdict:** ⚠️ Backend rich, frontend missing the central Production Orders workflow.

---

## 5. Maintenance Workflow

**Flow:** Complaint → Job Card (OPEN → ASSIGNED → IN_PROGRESS → COMPLETED → VERIFIED/CLOSED) + Work logs + Parts + PM Plans → PM Schedule → auto-generated job cards.

| Step | Backend | Frontend | Status |
|---|---|---|---|
| Complaint/Failure/Root-cause categories | ✅ | ✅ CategoriesList | ✅ |
| Job card create/detail/list | ✅ | ✅ | ✅ |
| Status history + transitions | ✅ | ✅ | ✅ |
| Team + members | ✅ | ✅ TeamsList | ⚠️ comma-separated UUIDs |
| Technician directory | ✅ | ✅ (in teams/forms) | ✅ |
| Work logs | ✅ | ✅ | ✅ |
| Spare parts on job card | ✅ backend | ⚠️ UI present but **functionally broken** | ❌ |
| PM plans | ✅ | ✅ PmPlansList | ⚠️ free-text company UUID |
| PM schedules | ✅ | ✅ PmSchedules | ⚠️ |
| Auto-generate job card from schedule | ⚠️ | ⚠️ | ⚠️ |
| Reports | ✅ | ✅ MaintenanceReports | ✅ |

**Issues:**
- WF-16 (HIGH): **Spare parts are unusable.** `items.item_type` CHECK (item_master.sql:111) excludes `SPARE_PART`, while `SparePartsPanel.tsx:188` requires a "SPARE_PART type" item and demo data `00022:107` filters on it. No item can ever satisfy the feature.
- WF-17 (MEDIUM): Job-card state vocabulary is unconstrained at the DB level (`current_status`, `priority`, `maintenance_type`) — a stray status breaks the workflow silently (DB-H4).
- WF-18 (MEDIUM): `maintenance_job_cards.job_card_no` globally unique (not company-scoped); PM `plan_code` globally unique (DB-H7).
- WF-19 (LOW): Category seeding uses `ON CONFLICT DO NOTHING` without a target → duplicate categories on re-run.

**Verdict:** ⚠️ Strongest frontend module, but the spare-parts flow is broken end-to-end.

---

## 6. Cross-Cutting Workflow Issues

| # | Severity | Issue |
|---|---|---|
| WF-20 | MEDIUM | No workflow-event notifications — `NotificationBell` exists, but no backend emits notifications on status transitions (SO approved, PO received, job card assigned…). |
| WF-21 | MEDIUM | No audit integration: `activity_logs` table exists, `ActivityLogService.log` swallows errors, and most services never call it. |
| WF-22 | LOW | Status vocabulary is inconsistent (mixed case `Draft` vs `DRAFT`, `ACTIVE` vs `active`) across modules — breaks programmatic transitions. |
| WF-23 | LOW | No transaction around multi-step writes (permission matrix, role assignments, createFull) — partial failures leave inconsistent state (BL3, B6). |

---

## 7. Demo-Data Walkthrough Coverage

| Flow | Can it be demoed end-to-end? | Blocker |
|---|---|---|
| Procurement PR→PO→GR→Invoice | ❌ | No line-items UI; demo `erp_users` never seeded so approvals have no actor |
| Sales Quote→Order→Invoice | ❌ | erp_sales schema not created; no lines UI |
| Inventory stock→ledger→adjust | ⚠️ | Works with seeded items; audit `created_by` is NULL everywhere |
| Production BOM→Routing→Order→Entry | ⚠️ | BOM/routing seeds reference hardcoded UUIDs that don't exist (00009/00010 fail on clean apply) |
| Maintenance complaint→job card→parts | ❌ | Spare parts impossible (item type); demo parts block dead (SPARE_PART) |

---

## 8. Workflow Verdict

The **data layer supports** the full manufacturing loop, but the **frontend cannot execute** the procurement, sales, or production-order workflows end-to-end because (a) line items can't be captured, (b) FK selection is by raw UUID, (c) the production-orders page is missing, and (d) several DB/seed blockers prevent a clean demo. **Estimated workflow completeness: ~45%.**
