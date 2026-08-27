# Maintenance Module Verification & Hardening Report

- **Date:** 2026-08-27
- **Module:** Maintenance (ERP-MRP-PWI-2026)
- **Scope:** Final hardening + regression audit of the existing maintenance module. No redesign; existing architecture preserved.
- **Protected modules NOT modified:** `dashboard/*`, `production/entries/*`, `procurement/*`, `sales/*`, `inventory/*`, `auth/*`, `organization/*`, `config/*`, `machine.entity.ts`. No existing migrations modified.

---

## 1. Files Inspected

### Backend (`backend/src/modules/maintenance/`)
- `enums/index.ts` – `JobCardStatus`, `MaintenanceType`, `VALID_TRANSITIONS`, `FrequencyType`, `PmScheduleStatus`
- `dto/*` – Create/Update/Assign/AddPart/AddWorkLog/Reject/Query DTOs, GenerateScheduleDto
- `controllers/job-card.controller.ts`, `team.controller.ts`, `category.controller.ts`, `pm.controller.ts`
- `services/maintenance-job-card.service.ts`, `maintenance-team.service.ts`, `maintenance-category.service.ts`, `maintenance-pm.service.ts`
- `entities/*` – all 13 maintenance entities
- `maintenance.module.ts`

### Backend (supporting modules — inspected only)
- `backend/src/modules/inventory/services/stock-ledger.service.ts`, `inventory-balance.service.ts`
- `backend/src/modules/inventory/entities/stock-ledger.entity.ts`, `inventory-balance.entity.ts`, `inventory-policy.entity.ts`
- `backend/src/app.module.ts`

### Frontend (`frontend/src/pages/maintenance/`)
- `JobCardList.tsx`, `JobCardCreate.tsx`, `JobCardDetail.tsx`
- `MaintenanceDashboard.tsx`, `MachineProfilePanel.tsx`, `SparePartsPanel.tsx`
- `PmPlansList.tsx`, `PmSchedules.tsx`, `TeamsList.tsx`, `CategoriesList.tsx`
- `MaintenanceReports.tsx`, `MaintenancePage.tsx`, `index.ts`, `JobCards.tsx`
- `jobCards.types.ts`

### Frontend (supporting — inspected only)
- `frontend/src/App.tsx`, `frontend/src/components/layout/MainLayout.tsx`

### Database (`supabase/migrations/`)
- `20260826100000_erp_00021_maintenance_module.sql` (13 tables + permissions + seed)
- `20260827100000_erp_00022_maintenance_demo_data.sql`
- `20260827110000_erp_00023_maintenance_job_card_org_context.sql`
- `20260828100000_erp_00024_maintenance_type_and_pm_scheduling.sql`

---

## 2. Bugs Found & Fixed

### FIX 1 — `assign()` recorded wrong `fromStatus` in history
**File:** `backend/src/modules/maintenance/services/maintenance-job-card.service.ts` (`assign()`)
**Bug:** The status-history row was written with `fromStatus: JobCardStatus.OPEN` hardcoded, even when the previous state was `REJECTED` (the only other legal pre-`ASSIGNED` state). The audit trail therefore lied about the workflow path.
**Fix:** Capture `const previousStatus = jobCard.currentStatus;` before mutation and use it for both the history row and the activity-log details.

### FIX 2 — `addPart()` stock posting was not atomic with part creation
**File:** `maintenance-job-card.service.ts` (`addPart()`)
**Bug:** The `MAINTENANCE_ISSUE` ledger entry, the `inventory_balances` update, and the part row were three separate writes with no shared transaction scope. A mid-way failure could leave a stock deduction with no part record (or vice-versa).
**Fix:** Wrapped the stock posting + part creation in `dataSource.transaction(async (manager) => ...)`. **Hardened further** so all writes run through the transaction manager's repositories (see Fix 7 / section 12).

### FIX 3 — `removePart()` reversal was not atomic and re-read the job card 5x
**File:** `maintenance-job-card.service.ts` (`removePart()`)
**Bug:** The `MAINTENANCE_RETURN` reversal + part delete were separate writes (crash mid-way = balance restored but part still attached), and the card was fetched repeatedly inside the flow (5 redundant `findOne` calls).
**Fix:** Cached `jobCard`/`issuedFrom` once; wrapped reversal + delete in a single `dataSource.transaction`; part delete now runs via the transaction manager.

### FIX 4 — PM `generateSchedules()` could create duplicate schedules
**File:** `backend/src/modules/maintenance/services/maintenance-pm.service.ts` (`generateSchedules()`)
**Bug:** Calling generation twice for the same plan/range inserted a second identical series of `SCHEDULED` rows; nothing prevented duplicates.
**Fix:** Before generating, load existing schedules for the plan into a `Set` of dates and skip dates already present.

### FIX 5 — Reports endpoint used the wrong permission
**File:** `backend/src/modules/maintenance/controllers/job-card.controller.ts` (`GET /reports`)
**Bug:** The reports endpoint was guarded by `maintenance.job_card.view`, not the dedicated `maintenance.reports.view` permission (seed exists in migration 00021, line 318).
**Fix:** Now guarded by `@RequirePermission('maintenance.reports.view')`.

### FIX 6 — Dead code in `JobCardCreate.tsx`
**File:** `frontend/src/pages/maintenance/JobCardCreate.tsx`
**Bug:** Unused `machines`/`machineLoading` state, an obsolete machine-list `useEffect`, and unused imports (`LoadingState`, `rowsOf`).
**Fix:** Removed the dead state/hook and both imports. Scan-based machine lookup is the single code path.

### FIX 7 — Genuine transaction scope for inventory writes (no "fake wrapper")
**File:** `maintenance-job-card.service.ts` (`writeStockMovementTx()` helper)
**Finding:** The initial `dataSource.transaction()` wrappers still called `StockLedgerService.create()` / `InventoryBalanceService.updateBalance()`, which use their **own injected repositories** — so those writes were NOT inside the transaction.
**Fix:** Added private helper `writeStockMovementTx(manager, ...)` that performs the ledger insert and the balance upsert (IN/OUT math + negative-stock policy check, mirroring the inventory service exactly) via `manager.getRepository(StockLedger)`, `manager.getRepository(InventoryBalance)`, `manager.getRepository(InventoryPolicy)`. All DB writes in `addPart`/`removePart` now share one real transaction. Removed the now-unused `StockLedgerService` injection.

---

## 3. Root Causes Revealed
- Audit-history bug came from hardcoding lifecycle assumptions instead of deriving state from the record.
- Non-transactional stock flows and missing duplicate-guards are classic "no shared mutation boundary" defects.
- Wrong RBAC binding came from copy-paste of the adjacent `job_card.view` route.
- The fake-transaction review caught the most subtle issue: a real TypeORM transaction is only "real" if every write is bound to its `EntityManager`.

---

## 4. Database / Migrations
- **No migration required** – all fixes are code-level (no schema change).
- Verified all 19 maintenance permissions are seeded in `migration 00021` and match those used by controllers:

```
maintenance.job_card.view|create|update|delete|assign|start|hold|complete|close|verify|approve
maintenance.team.view|manage   maintenance.category.view|manage
maintenance.pm.view|manage   maintenance.reports.view
```

- Migration `00024` columns (`maintenance_type`, `pm_plans.start_date`, `last_generated_at`) correctly backed by the PM service logic.

---

## 5. API Surface (unchanged routes, verified from controllers)
- `POST /maintenance/job-cards`, `GET /maintenance/job-cards`, `GET /maintenance/job-cards/:id`, `PATCH /maintenance/job-cards/:id`
- `POST .../assign|start|hold|waiting-for-parts|resume|complete|close|submit-for-verification|verify|approve|reject`
- `GET|POST .../parts`, `POST .../work-logs`, `POST .../attachments`
- `GET /maintenance/job-cards/reports` (now `maintenance.reports.view`)
- `GET .../machine/:machineId/stats`, `POST /maintenance/teams`, `GET /maintenance/teams`, `POST /maintenance/categories/{complaint|root-cause|failure}`, `GET /maintenance/categories/{...}`
- `GET|POST /maintenance/pm/plans`, `POST /maintenance/pm/plans/:id/generate-schedules`, `POST /maintenance/pm/schedules/:id/{complete|skip}`

---

## 6. Workflow (state machine) Verification
`VALID_TRANSITIONS` enforces the required chain; each transition's hardcoded `fromStatus` was checked:

| Transition | `fromStatus` recorded | Verified |
|---|---|---|
| start | IN_PROGRESS ← ASSIGNED | OK |
| hold | ON_HOLD ← actual (dynamic) | OK |
| waiting-for-parts | WAITING_FOR_PARTS ← actual (dynamic) | OK |
| resume | IN_PROGRESS ← actual (dynamic) | OK |
| complete | COMPLETED ← IN_PROGRESS | OK |
| close | CLOSED ← COMPLETED | OK |
| submit-for-verification | PENDING_VERIFICATION ← CLOSED | OK |
| verify | VERIFIED ← PENDING_VERIFICATION | OK |
| approve | APPROVED ← VERIFIED | OK |
| reject | REJECTED ← PENDING_VERIFICATION | OK |
| assign | ASSIGNED ← **actual previous (was OPEN)** | **FIX 1** |

`complete()` computes `downtimeMinutes` from `downtimeStart`→now inside a real queryRunner transaction. Activity logs present for all 9+ state actions.

## 7. Machine Verification
- Machine Master reused: job cards reference `machines` by id; `MachineProfilePanel` shows live stats.
- `JobCardCreate` scan input resolves via `GET /machines/by-code/:code` and validates the machine belongs to the selected org context (company/division/section/department).
- Dashboard `stats(companyId, machineId?)` and `machine/:machineId/stats` filter correctly.

## 8. RC / Item / Inventory Verification
- Spare parts reference the Item Master with `ITEM_TYPE=SPARE_PART`; negative-stock policy enforced on issue (OUT) via `inventory_policies.allow_negative_stock`; `MAINTENANCE_ISSUE`/`MAINTENANCE_RETURN` ledger types used.
- **All three writes in add/remove part now share one transaction** (ledger + balance + part), eliminating orphaned stock movements.

## 9. PM Module Verification
- Plans (CREATE/READ), frequency types, checklists.
- `generateSchedules()` now idempotent (duplicate dates skipped).
- `complete`/`skip` schedule endpoints update status; `lastGeneratedAt`/`nextDueDate` maintained.

## 10. RBAC Verification
- All 40+ middleware-guarded maintenance routes use an existing seeded permission (see section 4).
- `MaintenanceReports` page navigable only with `maintenance.reports.view`; sidebar gated in `MainLayout`.

## 11. Multi-Tenancy (company_id) Verification
- Every maintenance table carries `company_id` (migration 00021). All service queries filter by `companyId` (org-context helper from migration 00023). `findOne(id, companyId)` and machine-lookup org validation prevent cross-company reads.

## 12. Transaction Safety Summary
- `assign`, `complete`: queryRunner-transactional (pre-existing, correct).
- `addPart`, `removePart`: now genuinely transactional via `writeStockMovementTx` on the shared `EntityManager`.
- No fake wrappers remain: every write inside a `dataSource.transaction` callback uses the `manager`, not injected repositories.

## 13. TypeScript / Build / Lint Verification
- `backend`: `npx tsc --noEmit` → **PASS** (0 errors); `npm run build` (nest build) → **PASS**
- `frontend`: `npx tsc --noEmit` → **PASS** (0 errors); `npm run build` (react-scripts) → **PASS**
- `JobCardCreate.tsx` now contributes **zero** lint warnings.
- Pre-existing lint warnings remain in other maintenance files (unused imports): `App.tsx` (`MaintenancePage`), `CategoriesList.tsx` (`Col`,`Row`), `JobCardDetail.tsx` (`Typography`,`Upload`,`UploadOutlined`,`PaperClipOutlined`,`UUID_RE`), `JobCardList.tsx` (`JobCardContext`,`rowsOf`, plus an `anchor-is-valid` a11y warning), `MachineProfilePanel.tsx` (`errorText`), `MaintenanceDashboard.tsx` (`ThunderboltOutlined`), `PmPlansList.tsx` (`Card`,`Descriptions`,`selectedCompanyId`), `PmSchedules.tsx` (`Empty`), `SparePartsPanel.tsx` (`Select`,`Tooltip`,`label`,`selectedItemId`), `TeamsList.tsx` (`Card`,`Select`,`label`). These are **warnings only, not errors**, and pre-date this session; recommended as low-priority cleanup. CRA also emits its standard bundle-size advisory.

## 14. Code Verification Status
- **CODE VERIFICATION: PASSED** (TS + production builds for both projects after all fixes)
- **RUNTIME VERIFICATION: NOT AVAILABLE** — no browser/E2E session was run against a live Supabase instance; runtime behavior was not observed end-to-end.

## 15. Remaining Advisory Items
1. Clean up the pre-existing unused-import lint warnings listed in section 13.
2. Optional: verify `reject` permission choice (`maintenance.job_card.verify`) — intentional, since rejection is part of the verification step.
3. Manual smoke test recommended: create → assign → start → add part (insufficient stock) → remove part → complete → close → submit → verify → approve; and invoke `generate-schedules` twice to confirm idempotency.