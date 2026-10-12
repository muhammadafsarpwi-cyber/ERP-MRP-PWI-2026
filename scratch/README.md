# scratch/ — read-only diagnostics for the Open Stock / SYSTEM BOOK STOCK investigation

**Nothing in this folder writes to the database.** Every script opens its own
read-only `pg` connection and runs `SELECT`s only. The one place a write is
described (rather than performed) is `oss-repair-dry-run.cjs`, which prints the
SQL a repair *would* execute without running it.

> `node scratch/…` must be run from the repo root (`D:\ERP-MRP-PWI-2026`).
> Never run `npx jest` from the repo root — it resolves a cached babel jest and
> a stale `.kilo/worktrees/bristle-thumb` path. From `backend/`, use
> `node node_modules\jest\bin\jest.js`.

## Scripts

| script | what it answers |
| --- | --- |
| `e2_prereq.cjs` | Schema/truth check: FKs, unique constraints, column nullability that the fix depends on. |
| `e3_prereq.cjs` | Family census — which `transaction_type` values exist and how their signs behave. |
| `e4_reconcile_dryrun.cjs` | Live measurement of the reconcile query that `GET /production/open-stock/reconcile` now serves. |
| `oss-repair-dry-run.cjs` | The historical repair report (sections A–E, below). |
| `jest-compare.cjs` | Diffs two jest `--json` outputs and prints fixed vs. newly-failing tests. |

## The repair report (`oss-repair-dry-run.cjs`)

Run: `node scratch/oss-repair-dry-run.cjs` → `scratch/oss-repair-dry-run.txt`

* **A. Ghost stock** — entries deleted but never reversed; the literal cause of
  "SYSTEM BOOK STOCK" that survives deletion. Includes how many still carry a
  ledger reference (the old reversal was gated on `inventory_reference_id`, so a
  `NULL` flag silently skipped it) and how many predate the Recycle Bin, so they
  have no `deleted_at` and are invisible in *both* the grid and the bin.
* **A2. Per warehouse/item** — one reversal statement per pair, inside a
  transaction, using the balance row's **own** `uom_id`. This is the list a
  repair would iterate.
* **B. Orphaned ledger rows** — journal rows whose document no longer exists.
  Left by recycle-bin purges and hard deletes.
* **C. Ledger vs. balance drift** — the same computation the reconcile endpoint
  performs, over every warehouse/item pair.
* **D. Why report-only** — how many pairs in C would be driven negative by a
  blanket `balance := ledger_net`. This is the reason the endpoint's write path
  requires the literal `apply=APPLY` rather than a boolean.
* **E. CCD-SP-002** — the card that prompted the investigation, item by item.

## Test baselines

`production-entry.service.spec.ts` had **8 failures before any of this work**
(`base-failed.json`). The full backend suite baseline at commit `f432393` is
`jest-base-full.json`: 9 failed suites / 33 failed tests out of 1592.

Those 9 suites (`item.controller`, `item.service`, `customer`, `bom`,
`dispatch`, `barcode`, `machine-target`, `inventory-balance.controller`,
`production-entry`) were already red at HEAD. They are **pre-existing** and are
not touched by the deletion-sync work.

| | baseline (`f432393`) | after |
| --- | --- | --- |
| failed suites | 9 | 9 (identical set) |
| failed tests | 33 | 31 |
| new regressions | — | 0 |
| fixed | — | 2 (`update & delete soft-deletes…`, `remove enforces company isolation`) |

The baseline was captured by running jest inside the pristine
`.kilo/worktrees/bristle-thumb` checkout of the same commit (with `node_modules`
junctioned in temporarily, since a worktree has none of its own), so no
`git stash` was needed and nothing in the working tree was at risk.
