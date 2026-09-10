# ERP Store Module — Production-Readiness Audit Matrix (TASK 07)

**Scope:** CCD Store (`3b6b5628-859c-4df0-aab7-a69fd953bdd7`, Raw Material Store) — store API surface, MR → Manager → GM → PR → ETA → GRN → Stock workflow, replenishment, security/SoD, quantity/inventory reconciliation, and the UI-facing endpoints consumed by store pages.

**Method:** Live API checks against the running backend (fresh `dist` build), DB assertions (`recon-full`, `perm-db-check`), and static frontend mapping audit. Results reflect **executed checks only**; no un-executed claim is marked PASS.

| Check area | Result | Evidence |
|---|---|---|
| Store API smoke (dashboard, stores, lifecycle, MR list, issues, returns, replenishment, ledger, balances) | **PASS 9/9** | `api-smoke` (earlier run) |
| Store workflow + security + SoD + replenishment end-to-end | **PASS 32/32** | `workflow-audit.js` (rerun after fixes, `fail=0`) |
| Store quantity / inventory reconciliation | **PASS 5/5** | `recon-full.js` (`fail=0`) |
| UI-facing endpoint smoke (14 endpoints incl. barcode stats/list/lookup, dashboard/summary) | **PASS 15/15** | `uismoke.js` (`fail=0`) |
| Permission catalog cross-check (52 referenced codes) | 45 present+assigned / **7 absent** | `perm-db-check.js` |
| Real browser UI audit | **NOT EXECUTED** | requires interactive browser session |

---

## 1. Defects found and fixed (RESOLVED)

| ID | Severity | Defect | Fix | Verification |
|---|---|---|---|---|
| S1 | HIGH | `GET /store/dashboard/summary` → HTTP 500: `syntax error at or near "GROUP"` / `at end of input`. `storeScopeConds()` returns `[]` with no filters, leaving a dangling `AND ` in `countStores`, `countStoreItems`, `countInsufficientItems`, `buildStockSummary`. | Added `appendConds()` helper; all four queries now emit valid SQL with no filters | `uismoke.js` → summary 200 with kpi payload |
| S2 | HIGH | `convertRequestToPr` computed `allConverted` from stale `prCreatedQty` and substituted override-qty for converted qty → full conversion without overrides left MR `PARTIALLY_CONVERTED` | Use `lineUpdates` (final = `prCreatedQty + convertQty`) in `store.service.ts` | `workflow-audit.js` → `MR persisted FULLY_CONVERTED with pr_id linked` |
| S3 | HIGH | Store dashboard/trace SQL defects (charts + item lifecycle) crashing store pages | Fixed in `store-dashboard.service.ts` / trace queries (earlier) | smoke 9/9 |

Build verified: `npx tsc --noEmit` + `npx nest build` exit 0 on the S1/S2 round.

## 2. Open FAIL items

| ID | Severity | Item | Detail |
|---|---|---|---|
| F1 | HIGH | 7 permission codes referenced by `navigationConfig.tsx` are **absent from the DB permissions catalog**: `store.master.view`, `store.transfer.view`, `store.adjustment.view`, `store.reports.view`, `store.settings.view`, `store.settings.edit`, `store.master.edit` | Menu entries Store Master, Store Transfers, Stock Adjustments, Reports, Settings never render for any role; pages still reachable by direct URL. Fix = seed the codes and assign to the INVENTORY role (and readers for report/view codes). |
| F2 | MED | Barcode data inconsistency (observation, not a scan-flow failure): `item_barcodes` holds 10 values (`6281…`) while the lookup table `barcodes` holds 322 (`8901…`); values are disjoint per item | `master-data` barcode tab and `/barcode-management` scan operate on different corpora. Recommend a single source of truth / backfill so item barcodes resolve via scan. |

## 3. Security / SoD (verified PASS)

- `REPORT_VIEWER` (viewer) → 403 on dashboard create / store create.
- `MANAGEMENT` (gm) → 403 on create; 403 on convert-pr (`request.convert` missing for that role, mapped to store role only).
- `PRODUCTION` (prod) → 403 on approve.
- Self-approval → 400 (SoD guard).
- Manager approve → persisted (`approved_at` + `approved_by`); GM approve → persisted (`gm_approved_at` + `approved_by`).
- Post-convert MR DB state: `material_requests.pr_id` set, `status=FULLY_CONVERTED`; `purchase_requisitions.requisition_code = PR-MR-<req>` created.

## 4. Replenishment (verified PASS)

- Run `POST /store/replenishment/run` → `RUN-…`, 1 row checked, 0 auto-created; queue + KPIs return 200.
- Row actions adjust / defer / cancel / unreview executed; pre-existing NORMAL row `4f519134-7d7d-41e0-9f26-8841a8c05a9d` snapshot/restored (link re-nulled on cleanup).
- Create-MR from queue claims `store_replenishments.material_request_id/number`; cleanup nulls the link before deleting QA MRs.

## 5. Quantity / inventory reconciliation (verified PASS)

- Balance invariant `on_hand = available + reserved` across **43** balance rows (0 violations).
- Proof item `1c53e9a9-b020-4d3a-bcd4-67ab8b50ef6f` @ WH `aa9fedcb-27ac-47d2-a963-40d01c2594bc`: ledger net 2500 == on_hand 2500.
- CCD store thresholds: min500 / reorder750 / max3000.
- Coverage: CCD `store_items` = 1, balance warehouses = 5, ledger warehouses = 4, balance rows = 43.

## 6. UI-facing endpoints (verified PASS, 15/15)

`/store/dashboard`, `/store/dashboard/summary` (kpi payload), `/store/stores` (+ CCD present), `/store/lifecycle/items/{id}`, `/store/material-requests`, `/store/material-issues`, `/store/material-returns`, `/store/replenishment`, `/replenishment/kpis`, `/inventory/reports/ledger`, `/inventory/balances`, `/barcode-management/stats`, `/barcode-management?entityType=ITEM`, `/barcode-management/lookup/{value}` (scanned `8901000000003` → item).

Frontend mapping (static): StoreDashboard = 9 sections + 12 report cards; StoreItemLifecycle = 16 tabs incl. Barcode (JsBarcode); StoreReports = 12-card navigation hub (no direct API); barcode scan uses `html5-qrcode`; permission gating is sidebar-level via `navigationConfig.tsx` + in-page `can()`.

## 7. Not executed

- Real browser UI audit (dashboard tabs render, scan camera, print labels) — requires an interactive browser session.
- Camera barcode scan E2E.

## Net verdict

Store module is **functionally green** on the executed API/DB paths (32+15+5+9 = 61 checks, 0 failures). Two open items: F1 (7 dead nav permission codes — config seed) and F2 (barcode corpus reconciliation), plus the un-executed browser UI pass.

*Generated 2026-09-10 from live runs: `workflow-audit.js` 32/32, `uismoke.js` 15/15, `recon-full.js` 5/5, `perm-db-check.js` 45/52 present + 7 absent.*