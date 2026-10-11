# Stock-Ledger Receipt Repair — DRY RUN (no rows written)

Generated: 2026-10-10T15:16:48.332Z
Source: live API @ http://localhost:3001/api/v1 — `production/inventory-report/:itemId/ledger` vs `production/entries[].nestedItems`

## What this measures

For every OUTPUT child line of every live entry, compare the receipt actually
posted to `stock_ledger` (net of reversals, `reference_type = PRODUCTION_ENTRY`)
against that child's own `actual_quantity`.

**Expected receipt = `production_entry_items.actual_quantity` for that child.**
Anything else means the document total was written to the parent part.

## Headline numbers

| Metric | Value |
|---|---|
| Entries inspected | 287 |
| Entries needing adjustment | 127 |
| — of which multi-item | 62 |
| Row-level adjustments | 132 |
| Items affected | 26 of 75 |
| Posted on these rows | 949453 |
| Correct on these rows | 2911040.9531 |
| **Net change to stock** | **-1961587.9531** |
| — currently OVER-stated (would decrease) | +528467 |
| — currently UNDER-stated (would increase) | -2490054.9531 |

## Per-item impact (largest first)

| Item | Rows | Posted today | Correct | Delta |
|---|---:|---:|---:|---:|
| WIP-SW-001 | 27 | 0 | 543919 | -543919 |
| WIP-ST-001 | 12 | 0 | 542812 | -542812 |
| WIP-ST-003 | 7 | 0 | 425697 | -425697 |
| WIP-ST-004 | 8 | 0 | 408660 | -408660 |
| WIP-SPL-013 | 27 | 436012 | 188429 | +247583 |
| WIP-ST-010 | 4 | 0 | 142507 | -142507 |
| WIP-ST-011 | 5 | 0 | 136630 | -136630 |
| WIP-SPL-001 | 11 | 189836 | 65799 | +124037 |
| WIP-ST-007 | 1 | 0 | 72000 | -72000 |
| WIP-ST-014 | 1 | 0 | 63803 | -63803 |
| WIP-SW-004 | 3 | 0 | 50469 | -50469 |
| WIP-ST-005 | 2 | 0 | 38000 | -38000 |
| WIP-SPL-009 | 2 | 40359 | 3799 | +36560 |
| WIP-SPL-002 | 5 | 65113 | 29648 | +35465 |
| WIP-SP-002 | 1 | 40000 | 10000 | +30000 |
| WIP-SW-002 | 1 | 0 | 27000 | -27000 |
| WIP-ST-002 | 1 | 0 | 25131 | -25131 |
| WIP-SP-001 | 2 | 37500 | 21300 | +16200 |
| WIP-SP-005 | 2 | 50500 | 40000 | +10500 |
| WIP-SPL-014 | 4 | 52579 | 45966 | +6613 |
| WIP-SPL-005 | 1 | 8412 | 4415 | +3997 |
| WIP-SP-013 | 1 | 26000 | 22200 | +3800 |
| WIP-SP-009 | 1 | 2890 | 2200 | +690 |
| RM-WIRE-012 | 1 | 0 | 575.4981 | -575.4981 |
| FLAT-STRIP-002 | 1 | 252 | 17 | +235 |
| RM-WIRE-002 | 1 | 0 | 64.455 | -64.455 |

## Largest row-level adjustments

| Entry | Date | Machine | Item | Posted | Correct | Delta |
|---|---|---|---|---:|---:|---:|
| PE-2026-00201 | 2026-10-07 | ST-03 | WIP-ST-004 | 0 | 80090 | -80090 |
| PE-2026-00196 | 2026-10-06 | ST-01 | WIP-ST-001 | 0 | 80000 | -80000 |
| PE-2026-00197 | 2026-10-06 | ST-02 | WIP-ST-003 | 0 | 80000 | -80000 |
| PE-2026-00255 | 2026-10-08 | ST-02 | WIP-ST-003 | 0 | 80000 | -80000 |
| PE-2026-00257 | 2026-10-08 | ST-04 | WIP-ST-001 | 0 | 80000 | -80000 |
| PE-2026-00198 | 2026-10-06 | ST-03 | WIP-ST-004 | 0 | 75000 | -75000 |
| PE-2026-00256 | 2026-10-08 | ST-03 | WIP-ST-004 | 0 | 72096 | -72096 |
| PE-2026-00370 | 2026-10-09 | ST-03 | WIP-ST-007 | 0 | 72000 | -72000 |
| PE-2026-00182 | 2026-10-07 | ST-02 | WIP-ST-003 | 0 | 70000 | -70000 |
| PE-2026-00369 | 2026-10-09 | ST-02 | WIP-ST-003 | 0 | 68000 | -68000 |
| PE-2026-00252 | 2026-10-08 | ST-01 | WIP-ST-001 | 0 | 66402 | -66402 |
| PE-2026-00367 | 2026-10-09 | ST-01 | WIP-ST-001 | 0 | 64000 | -64000 |
| PE-2026-00185 | 2026-10-05 | ST-01 | WIP-ST-014 | 0 | 63803 | -63803 |
| PE-2026-00157 | 2026-10-03 | ST-01 | WIP-ST-001 | 0 | 51500 | -51500 |
| PE-2026-00158 | 2026-10-03 | ST-02 | WIP-ST-003 | 0 | 46500 | -46500 |
| PE-2026-00187 | 2026-10-05 | ST-03 | WIP-ST-004 | 0 | 46251 | -46251 |
| PE-2026-00092 | 2026-10-01 | ST-02 | WIP-ST-003 | 0 | 45574 | -45574 |
| PE-2026-00181 | 2026-10-07 | ST-01 | WIP-ST-001 | 0 | 45010 | -45010 |
| PE-2026-00096 | 2026-10-01 | ST-05 | WIP-ST-010 | 0 | 42200 | -42200 |
| PE-2026-00189 | 2026-10-05 | ST-05 | WIP-ST-010 | 0 | 40482 | -40482 |
| PE-2026-00142 | 2026-10-02 | ST-03 | WIP-ST-004 | 0 | 40000 | -40000 |
| PE-2026-00144 | 2026-10-02 | ST-05 | WIP-ST-011 | 0 | 40000 | -40000 |
| PE-2026-00184 | 2026-10-07 | ST-05 | WIP-ST-010 | 0 | 39825 | -39825 |
| PE-2026-00321 | 2026-10-01 | ST-01 | WIP-ST-001 | 0 | 37000 | -37000 |
| PE-2026-00141 | 2026-10-02 | ST-02 | WIP-ST-003 | 0 | 35623 | -35623 |
| … | | | | | | *+107 more rows in the CSV* |

## Orphan receipts (separate issue — NOT part of this repair)

199 receipt/reversal rows reference `production_entry` ids that no longer exist
(net 311145 pieces). These are excluded from every figure above.
They are unrelated to the multi-item pooling defect and need their own decision.

## Scope of an actual repair

A correct repair must touch **both** stores, in one transaction per entry:

1. `stock_ledger` — adjust the `PRODUCTION_RECEIPT` row for each affected
   `(entry, item)` pair so it equals the child quantity (and post a
   `PRODUCTION_REVERSAL` where the audit trail requires it).
2. `inventory_balances.on_hand / available` — the same delta, since receipts
   also wrote the balance. Fixing only the ledger would leave the two out of sync.
3. Reconciliation check: `SUM(stock_ledger IN - OUT)` must equal
   `inventory_balances.on_hand` for every touched item afterwards.

## Why no rows were written

This run is read-only by design. Every number above is a projection of what a
repair *would* change — nothing was posted, reversed or updated.

## Caveats

- Read window 2025-01-01 .. 2026-12-31 (all live entries fall in 2026-10).
- `PRODUCTION_SCRAP` is excluded — it is an audit trail with no balance impact.
- Reversals are netted so a fully undone receipt counts as 0, not as its original value.
- Row-level detail: `stock-ledger-repair-dry-run.csv` (same directory).
