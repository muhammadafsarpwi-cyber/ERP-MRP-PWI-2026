# ERP-00013 · Daily Production Entry & Department-Wise Production Reporting

**Status:** IMPLEMENTED & VERIFIED (PROMPT-05)
**Date:** 2026-08-22
**Chain position:** AUDIT → DATABASE → BACKEND → API → FRONTEND → CALCULATIONS → INVENTORY INTEGRATION → TESTING → LIVE VERIFICATION → FIX FAILURES → RE-TEST → DOCUMENTATION

---

## 1. Business Flow (as implemented)

Daily shift production is captured per department with the full Sr. field set
(Date, Shift, Machine No., Operator, Supervisor, Coil Size, Item, Target,
Actual, UOM, Efficiency %, Achievement %, Running Hours, Downtime Hours,
Downtime Reason, Rejection/Scrap, Remarks, Department) and rolled up into a
department-wise report grouped **Division → Section → Department → Item/UOM**.

### Calculation rules (server-verified)

| Metric | Formula | Notes |
|---|---|---|
| Achievement % | `actualQuantity / targetQuantity × 100` | rounded 2dp; >100 allowed; target never overwritten by actual |
| Efficiency % | `runningHours / shift.plannedHours × 100` | planned hours come from the `shifts` master (seeded = 8 h) |
| Efficiency fallback | `runningHours / (runningHours + downtimeHours) × 100` | only when the shift has no planned hours |

- Downtime hours are **outside** running hours.
- Scrap/rejection is stored **separately** from actual good output.

### Inventory rule (single authoritative posting point)

- **Order-linked entries must NOT post to inventory.** Stock moves once, when
  the Production Order is completed (`completeProductionOrder`).
- **Make-to-stock entries** (`postToInventory: true` + `warehouseId`) create:
  - `stock_ledger` row `PRODUCTION_RECEIPT`, direction `IN`, quantity =
    actual good output, `reference_type='PRODUCTION_ENTRY'`,
    `reference_id=<entry id>`;
  - `inventory_balances` update (+actual on hand/available);
  - if `scrapQuantity > 0`: an additional `PRODUCTION_SCRAP` `OUT` ledger row
    as audit trail (**no balance impact**, matching the existing scrap convention);
  - the receipt ledger id is written back to
    `production_entries.inventory_reference_id` (audit + double-posting guard).

### Duplicate protection

Partial unique index:

```
uq_prod_entries_unique_submission ON production_entries (company_id, department_id, entry_date, shift_id, machine_no, item_id) WHERE is_active
```

Service-level pre-check returns HTTP 409 with the conflicting entry id;
updates exclude the row itself.

---

## 2. Database (Supabase Postgres)

Migrations (idempotent, applied and re-applied ≥3×):

| File | Purpose |
|---|---|
| `supabase/migrations/20260822000000_erp_00013_daily_production_entry.sql` | Tables `machines`, `shifts`, `downtime_reasons`, `production_entries`; unique index; permissions; seeds (3 shifts, 8 downtime reasons, 22 machines mapped to department codes) |
| `supabase/migrations/20260822010000_erp_00013_stock_ledger_production_types.sql` | Widens `stock_ledger_transaction_type_check` with `PRODUCTION_RECEIPT`, `PRODUCTION_ISSUE`, `PRODUCTION_SCRAP` — the types already used by the manufacturing layer (`production-order.service`, `production-entry.service`). No other value weakened. |
| `supabase/migrations/20260822020000_erp_00013_entry_inventory_reference.sql` | `production_entries.inventory_reference_id uuid NULL` + column comment |

Seeded masters: shifts `SHIFT-1/2/3` (06–14, 14–22, 22–06, planned_hours=8),
downtime reasons `MAINT, SETUP, POWER, MATERIAL, NO_ORDER, QUALITY, MANPOWER,
OTHER`, demo machines per department code (`ST-*` Straightener … `CPK-*`
CCD Packing).

> Migration-runner lesson (repo-wide): long explicit transactions through the
> Supabase pooler are silently rolled back, and comment-prepended statement
> splitters skip short trailing statements like `COMMIT;`. Use autocommit with
> comment stripping (see `backend/_tmp_apply_migration4.js` pattern, now removed).

---

## 3. Backend API (NestJS, `/api/v1`)

Module wiring: `production.module.ts` → entities, DTOs,
`ProductionEntryService`, `ProductionEntryController`.

Guards on every route:
`SupabaseJwtGuard → OrgScopeGuard (@RequireOrgScope) → PermissionGuard (@RequirePermission)`.

| Method & path | Permission | Purpose |
|---|---|---|
| GET `/production/entries` | `…entries.view` | Filters: divisionId, sectionId, departmentId, dateFrom/dateTo, shiftId, machineNo (ILIKE), itemId, productionOrderId; sort+pagination; company-scoped |
| POST `/production/entries` | `…entries.create` | Full validation chain + calculations + optional inventory posting |
| GET `/production/entries/report` | `…entries.report` | Grouped report + per-dept `totalsByUom` + `grandTotalsByUom` (never sums across UOMs); accepts same filters |
| GET `/production/entries/:id` | `…entries.view` | Detail with relations (division/section/department/shift/item/uom/order) |
| PUT `/production/entries/:id` | `…entries.update` | Partial update; recalculates metrics; duplicate-excluding-self |
| DELETE `/production/entries/:id` | `…entries.delete` | Soft delete (`is_active=false`) |
| GET/POST `/production/machines` | view/create entries | Machine master (company+department scoped, duplicate-code guard) |
| GET `/production/shifts` | view | Shift master incl. planned_hours |
| GET `/production/downtime-reasons` | view | Downtime reason master |

### Validation chain (create/update)

1. Division exists in company & ACTIVE → Section belongs to Division →
   Department belongs to Section/Division (org-chain cannot be bypassed via API).
2. Shift exists in company.
3. Machine: when linked by id it must match the typed machineNo **and** belong
   to the selected department; a free-typed machineNo that matches a registered
   machine of the company is likewise enforced to the correct department
   (case-insensitive). Unknown free-text identifiers are allowed (unregistered machines).
4. Item ACTIVE within company; UOM valid for item (base UOM or either-direction
   conversion in `uom_conversions`).
5. Numeric guards: target > 0; actual/scrap/hours ≥ 0; hours ≤ 24 (DTO `@Max(24)`).
6. Optional Production Order linkage: order must exist in company; entry item
   must equal order product; operation (if given) must belong to that order.
7. Double-posting guard: `postToInventory` together with `productionOrderId`
   is rejected; `warehouseId` required when posting.

---

## 4. Frontend (React + antd v5)

| File | Role |
|---|---|
| `frontend/src/pages/production/ProductionEntries.tsx` | Nested router: `entries`, `entries/new`, `entries/:id`, `entries/:id/edit` |
| `frontend/src/pages/production/entries/EntryList.tsx` | Filter card (Division→Section→Department cascade, date range, shift, machine), records table (all Sr fields + KPI tags colour-coded), page summary statistics, **Department-Wise Report tab** (per-dept items, totals by UOM, grand totals strip) |
| `frontend/src/pages/production/entries/EntryForm.tsx` | Create/edit form: cascading org selectors, shift w/ planned hours, machine AutoComplete fed by department-filtered master, item-driven UOM restriction (base + convertible), live Efficiency/Achievement preview, downtime reason, optional order linkage + double-posting warning, make-to-stock posting switch + warehouse |
| `frontend/src/pages/production/entries/EntryDetail.tsx` | Read-only record, KPI panel, linkage/posting status, edit/delete actions |
| `frontend/src/pages/production/entries/lookups.ts` | Shared lookup loader (divisions, sections, departments, items, UOMs, conversions, shifts, machines, reasons, orders, warehouses) |

Menu: Production → **Daily Production Entry** (`MainLayout.tsx`).

---

## 5. Verification evidence (live, executable)

### Unit tests (backend)
`npx jest --silent` → **18 suites, 277/277 PASS** (baseline preserved; includes
29 tests in `production-entry.service.spec.ts` covering calculations,
validation chains, PO linkage, inventory integration, queries/masters,
update/delete).

### Builds
- Backend `npm run build` (nest): **PASS**
- Frontend `npx tsc --noEmit`: **PASS**
- Frontend `npm run build`: **PASS** (bundle contains Daily Production Entry UI)

### Migration idempotency
All three ERP-00013 migrations applied and re-applied **×3 each**: `0 FAIL`.

### Live API/E2E (63 checks, all PASS)
Script executed against the running backend + Supabase DB:

- Login OK (JWT returned); wrong password → 401.
- Masters endpoints; machines filtered by department return only that
  department's machines.
- CRUD: create (Spiral/SR-01/8000→7400 M), detail with relations, update
  (recalc 7600 → achievement 95.00, target untouched at 8000, no self-conflict),
  soft delete (excluded from list, detail then 404).
- Calculations verified server-side: achievement 92.50 → 95.00 after update;
  efficiency 87.50 (7h/8h); over-target entry allowed (6100/6000 = 101.67).
- Validation rejections: SPD division + CCD section (400), department outside
  section (400), foreign-company division (400), target 0 (400), negative
  actual (400), runningHours 30 (400), EA for M-item without conversion (400),
  unknown item (404), nonexistent order (404), malformed payload (400),
  **machine ST-01 submitted under Spiral dept rejected (400: "belongs to
  department 'Straightener'")**.
- Duplicate submission → 409 with conflicting entry reference.
- Inventory integration: make-to-stock entry produced
  `stock_ledger PRODUCTION_RECEIPT IN 3900` + `PRODUCTION_SCRAP OUT 40` rows
  (verified by direct SQL), balance `on_hand` increased, and
  `inventory_reference_id` written back on the entry.
- Report: grouped Division→Section→Department, per-department totals by UOM,
  grand totals aggregated across departments **per UOM** (M = 7600+3900+6100 =
  17600; KG = 4800); filters respected.
- Filters: division, section, department (incl. Flattening), machine number,
  shift, item, exact/ranged dates — counts verified exactly.
- Security: no token → 401; garbage token → 401; forged `companyId` query
  param ignored (results stay JWT-company-scoped); unknown ids → 404.
- DB integrity: active E2E rows persisted as expected.

### Browser-level verification
- Dev server on :3000 renders the React app (headless Chrome DOM dump: root
  mounted, login UI present).
- Production bundle contains the new pages.
- The exact request sequence used by the UI (login → masters lookups →
  entries list/report/form saves) is covered 1:1 by the live E2E suite above.

### Login credentials (development)
Password is never stored in source/config. Reset performed via direct SQL on
`auth.users` using bcrypt, per `docs/DEVELOPMENT_CREDENTIALS.md`:

- `dev@erp-local.test` / `Dev#2026Test` (also `muhammadafsarpwi@gmail.com`)
- erp_users mapping verified: ACTIVE, default_company_id = COMP-001
  (`7725aa04-a270-4314-9e82-90949cbe7791`)
- Role: Super Administrator → holds all five
  `manufacturing.production.entries.*` permissions (verified in DB)

> JWT note: `SUPABASE_JWT_SECRET` is configured with the anon key, so the
> guard logs a warning and falls back to verifying tokens through the Supabase
> Auth API (`/auth/v1/user`) — authentication is fully enforced, not bypassed.
> Setting the real HS256 secret removes the fallback round-trip.

### Fixes made during live verification (root causes)
1. **UUID validation vs seeded org IDs** — class-validator 0.14's `@IsUUID()`
   defaults to RFC v4-only; hand-seeded hierarchy ids (`d1000000-…`) are
   non-v4. DTO now uses `@IsUUID('loose')` (any well-formed GUID; garbage still
   rejected).
2. **stock_ledger CHECK constraint** — production transaction types were not
   in the DB whitelist although the application layer already used them;
   widened via idempotent migration (see §2).
3. **Machine↔department enforcement** for free-typed machine numbers added.
4. **Report grand totals** aggregated across departments per UOM (was last-
   write-wins per item group).
5. **`inventory_reference_id`** column + write-back after posting.
6. **DTO `@Max(24)`** for running/downtime hours (clean 400 instead of late 409).

## Known limitation (documented assumption)
Efficiency uses `shifts.planned_hours` (8 h) because no formal shift calendar
exists in the system yet. Changing a shift's planned hours affects future
calculations only (stored percentages are immutable history).
