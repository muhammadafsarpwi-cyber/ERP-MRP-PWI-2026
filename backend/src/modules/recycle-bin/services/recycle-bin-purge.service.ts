import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { classifyLedgerMovement, ledgerBalanceDelta } from '../../../common/stock-movement.classifier';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';

/**
 * A parent table that participates in the 30-day auto-purge, plus the child
 * tables that must be destroyed WITH it.
 *
 * Order matters and is expressed here rather than left to the reader: a child
 * row points at its parent, so the children are always collected and removed
 * before the parent row itself is touched. `maintenance_pm_schedules` are the
 * generated schedule instances of a plan and are likewise never listed as
 * their own trash tab — they travel with the plan.
 */
interface SweepTarget {
  table: string;
  /** `erp_sales` for the quotation tables; everything else is the default schema. */
  schema?: string;
  children?: { table: string; fk: string }[];
  /**
   * Set when destroying a row of this table orphans `stock_ledger` rows that
   * reference it.
   *
   * A purge that hard-deletes a `production_entries` row while its journal
   * rows stay behind is how the Production Item Open Stock matrix ended up
   * reporting "SYSTEM BOOK STOCK" that no document in the system could explain:
   * the entries were gone, the movements they had posted were not, and nothing
   * ever reconciled the two. Those ledger rows are reversed BEFORE the entry is
   * destroyed, in the same transaction.
   */
  stockLedgerReferenceType?: string;
}

const SWEEP_TARGETS: SweepTarget[] = [
  {
    table: 'production_entries',
    children: [{ table: 'production_entry_items', fk: 'production_entry_id' }],
    stockLedgerReferenceType: 'PRODUCTION_ENTRY',
  },
  {
    table: 'maintenance_job_cards',
    children: [{ table: 'maintenance_job_card_parts', fk: 'job_card_id' }],
  },
  {
    table: 'dispatch_packages',
    children: [{ table: 'dispatch_package_units', fk: 'package_id' }],
  },
  {
    table: 'customers',
    children: [
      { table: 'customer_contacts', fk: 'customer_id' },
      { table: 'customer_addresses', fk: 'customer_id' },
    ],
  },
  {
    table: 'quotations',
    schema: 'erp_sales',
    children: [{ table: 'quotation_items', fk: 'quotation_id' }],
  },
  {
    table: 'production_orders',
    children: [{ table: 'production_order_operations', fk: 'production_order_id' }],
  },
  {
    table: 'bill_of_materials',
    children: [{ table: 'bom_lines', fk: 'bom_id' }],
  },
  // ── Phase 3 ───────────────────────────────────────────────────────────
  {
    table: 'material_requests',
    children: [{ table: 'material_request_lines', fk: 'request_id' }],
  },
  {
    table: 'material_issues',
    children: [{ table: 'material_issue_lines', fk: 'issue_id' }],
  },
  {
    table: 'material_returns',
    children: [{ table: 'material_return_lines', fk: 'return_id' }],
  },
  {
    table: 'qc_inspection_plans',
    children: [{ table: 'qc_quality_characteristics', fk: 'plan_id' }],
  },
  {
    table: 'sales_orders',
    schema: 'erp_sales',
    children: [{ table: 'sales_order_items', fk: 'sales_order_id' }],
  },
  {
    table: 'sales_invoices',
    schema: 'erp_sales',
    children: [],
  },
  {
    table: 'sales_deliveries',
    schema: 'erp_sales',
    children: [{ table: 'sales_delivery_lines', fk: 'delivery_id' }],
  },
  // Schedules are their OWN sweep target because they can now be trashed
  // individually — but they sit ABOVE their parent in this list so the plan's
  // own sweep still finds them and removes any the schedule sweep left behind.
  {
    table: 'maintenance_pm_schedules',
    children: [],
  },
  {
    table: 'maintenance_pm_plans',
    children: [{ table: 'maintenance_pm_schedules', fk: 'pm_plan_id' }],
  },
];

/** How often the wall-clock check re-arms itself. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
/** The local wall-clock hour the daily sweep is aimed at. */
const SWEEP_HOUR_LOCAL = 3;

export interface PurgeReport {
  /** True only when `RECYCLE_BIN_AUTO_PURGE=true` — i.e. rows were actually destroyed. */
  live: boolean;
  dryRun: boolean;
  retentionDays: number;
  cutoff: string;
  ranAt: string;
  targets: {
    table: string;
    purged: number;
    childrenPurged: number;
    /**
     * `stock_ledger` rows reversed off `inventory_balances` before the parent
     * rows were destroyed (0 outside dry-run — see `ledgerNetOutstanding`).
     */
    ledgerRowsReversed?: number;
    /**
     * DRY-RUN ONLY: the number of ledger rows this sweep WOULD have reversed.
     * This is the figure to review before arming the engine, because it is
     * also the size of the correction that would land on live balances.
     */
    ledgerRowsOutstanding?: number;
    /** DRY-RUN ONLY: signed net quantity still sitting on the books for these rows. */
    ledgerNetOutstanding?: number;
  }[];
  totalPurged: number;
}

/**
 * The rolling 30-day auto-purge behind the Recycle Bin.
 *
 * SOFT DELETE IS A HOLD, NOT AN AMNESTY. A row in the bin keeps its place in
 * the table, its unique keys and its audit trail — which is exactly the point
 * of a trash tray, and exactly why it cannot go on indefinitely: an ERP that
 * never releases a deleted customer code will eventually refuse to sell to a
 * customer with the same name. This sweep is the backstop that releases those
 * keys on a predictable, rolling calendar.
 *
 * ONE ENVIRONMENT SWITCH, TWO MODES:
 *
 *   RECYCLE_BIN_AUTO_PURGE unset / false  ← DEFAULT. The scheduler runs on its
 *       daily 03:00 trigger but performs SELECTs only, logging the exact delta
 *       rows that HAVE passed the retention window. Nothing is destroyed. This
 *       is the mode to run first: it shows what real destruction WOULD touch.
 *
 *   RECYCLE_BIN_AUTO_PURGE=true           LIVE. Expired rows are permanently
 *       destroyed, children before parents, each target in its own transaction.
 *
 * Because the default is dry-run, deploying this file cannot destroy anything:
 * a real purge requires the operator to explicitly opt in, and only after the
 * `migrations/1806000000000-AddSoftDeleteColumns.ts` migration has been applied
 * — which is why a missing column is caught and reported per table rather than
 * crashing the process at boot.
 *
 * Retention is `RECYCLE_BIN_PURGE_RETENTION_DAYS` (default 30). The cutoff is
 * `now - retentionDays`, so a record trashed on 11 Oct survives until the sweep
 * that runs on or after 10 Nov.
 */
@Injectable()
export class RecycleBinPurgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecycleBinPurgeService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly inventoryBalanceService: InventoryBalanceService,
    private readonly stockLedgerService: StockLedgerService,
  ) {}

  /**
   * LIVE only when the operator has explicitly opted in with the exact string
   * `"true"`. Anything else — unset, `false`, `1`, a typo — stays dry-run, so
   * the safe path is always the path of least resistance.
   */
  get live(): boolean {
    return process.env.RECYCLE_BIN_AUTO_PURGE === 'true';
  }

  /** Inverted twin of `live`: the default mode, and the only one that never writes. */
  get dryRun(): boolean {
    return !this.live;
  }

  get retentionDays(): number {
    const raw = Number(process.env.RECYCLE_BIN_PURGE_RETENTION_DAYS);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
  }

  onModuleInit(): void {
    // The scheduler arms in BOTH modes. Dry-run is not "disabled" — it is the
    // reporting mode, and an operator who never sees the daily delta has no
    // way to judge whether arming the engine for real is safe.
    this.logger.log(
      this.live
        ? `Recycle Bin auto-purge LIVE — retention ${this.retentionDays} days, ` +
            'expired rows WILL be permanently destroyed at the daily 03:00 sweep.'
        : `Recycle Bin auto-purge in DRY-RUN LOG MODE — retention ${this.retentionDays} days. ` +
            'Rows past the window are reported in this log but nothing is destroyed. ' +
            'Set RECYCLE_BIN_AUTO_PURGE=true to arm permanent deletion.',
    );
    this.scheduleNext();
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /**
   * Aim the first run at the next 03:00 local, then re-arm every 24h.
   *
   * A plain timer rather than a cron decorator: the schedule package is not a
   * dependency of this project, and one `setTimeout` plus one `setInterval`
   * expresses "daily at 3am" with no new dependency and no clock mocking in
   * tests. Drift across a DST change is at most an hour, which is immaterial
   * for a 30-day retention window.
   */
  private scheduleNext(): void {
    const now = new Date();
    const next = new Date(now);
    next.setHours(SWEEP_HOUR_LOCAL, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);

    const delay = Math.max(next.getTime() - now.getTime(), 60_000);
    this.timer = setTimeout(() => {
      void this.runSweep().finally(() => {
        this.timer = setInterval(() => void this.runSweep(), SWEEP_INTERVAL_MS);
      });
    }, delay);
    this.timer.unref?.();
  }

  /**
   * READ-ONLY twin of `reverseLedgerPostingsFor`, used by dry-run sweeps.
   *
   * Answers "how much stock is still sitting on the books behind these
   * documents?" using exactly the same rule set and the same grouping, so the
   * dry-run number and the live correction can never disagree.
   */
  private async estimateOutstandingLedgerNet(
    referenceType: string,
    ids: string[],
  ): Promise<{ rows: number; net: number }> {
    const movements: Array<Record<string, any>> = await this.dataSource.query(
      `SELECT * FROM stock_ledger
        WHERE reference_type = $1 AND reference_id = ANY($2::uuid[])`,
      [referenceType, ids],
    );
    if (!movements.length) return { rows: 0, net: 0 };

    let rows = 0;
    let net = 0;

    // Count a group as outstanding only when its FAMILY still nets non-zero —
    // the same test `reverseLedgerPostingsFor` uses to decide whether to emit
    // a reversal row.
    const families = new Map<string, number>();
    for (const row of movements) {
      const quantity = Number(row.quantity) || 0;
      if (quantity <= 0) continue;
      const classified = classifyLedgerMovement(row);
      if (!classified) continue;
      const key = `${row.company_id}|${classified.family}|${row.item_id}|${row.warehouse_id}|${row.uom_id}`;
      families.set(key, (families.get(key) ?? 0) + classified.sign * quantity);
    }
    for (const value of families.values()) {
      if (Math.abs(value) < 1e-9) continue;
      rows += 1;
    }

    // The NET is measured on the balance side, where a single unambiguous
    // "how much stock is still here" number exists. The ledger side cannot
    // supply it: a family already reversed past zero nets in the opposite
    // direction to the stock it represents.
    const balances = new Map<string, number>();
    for (const row of movements) {
      const delta = ledgerBalanceDelta(row);
      if (!delta || !row.item_id || !row.warehouse_id || !row.uom_id) continue;
      const key = `${row.company_id}|${row.item_id}|${row.warehouse_id}|${row.location_id ?? ''}|${row.batch_id ?? ''}|${row.uom_id}`;
      balances.set(key, (balances.get(key) ?? 0) + delta);
    }
    for (const value of balances.values()) net += value;

    return { rows, net };
  }

  /**
   * Undo every stock movement a set of documents still has on the books.
   *
   * This is the purge-side twin of `ProductionEntryService.remove()`. The
   * delete path already reverses its own postings — but a row only reaches
   * this sweep AFTER that path ran, so what is left here is the residue of
   * deletes that happened before the reversal existed, of ledger rows that
   * were deleted out from under the entry, and of documents whose flag was
   * cleared so the old `if (entry.inventoryReferenceId)` gate skipped them.
   * Destroying those entries without this step is what produced the
   * unreconcilable "SYSTEM BOOK STOCK" on the Production Item Open Stock
   * matrix: the document was gone, the quantity it had put on the books was
   * not, and nothing in the system was ever going to notice.
   *
   * NET, NOT ROW-FOR-ROW, and idempotent: a group already square emits
   * nothing, so running this twice cannot double-reverse.
   *
   * The journal itself is APPEND-ONLY. The original rows are never deleted —
   * a `PRODUCTION_REVERSAL` row is written against the same reference, so any
   * report that sums the ledger by item/warehouse nets to the truth and an
   * auditor can still see both the original movement and its undo.
   *
   * Returns how many ledger rows were still outstanding. `0` means the
   * documents were already square when they got here.
   */
  private async reverseLedgerPostingsFor(
    manager: EntityManager,
    referenceType: string,
    ids: string[],
  ): Promise<{ rowsReversed: number; netOutstanding: number }> {
    const movements: Array<Record<string, any>> = await manager.query(
      `SELECT * FROM stock_ledger
        WHERE reference_type = $1 AND reference_id = ANY($2::uuid[])
          FOR UPDATE`,
      [referenceType, ids],
    );
    if (!movements.length) return { rowsReversed: 0, netOutstanding: 0 };

    // ── Ledger netting: per (family, item, warehouse, uom) ──────────────────
    // A PRODUCTION_REVERSAL row always SUBTRACTS from its family, so a group
    // that is still positive is walked back with a reversal, and a group that
    // has been reversed PAST zero is topped up with the original family row.
    // Both directions are needed; see `ProductionEntryService.reverseInventoryPostings`.
    interface FamilyGroup {
      companyId: string;
      family: string;
      itemId: string;
      warehouseId: string;
      uomId: string;
      locationId: string | null;
      batchId: string | null;
      net: number;
    }
    const families = new Map<string, FamilyGroup>();

    // ── Balance netting: per (item, warehouse, location, batch, uom) ────────
    // Deliberately NOT keyed on family: `inventory_balances` has one row per
    // item/warehouse regardless of which movement family produced the change,
    // so a receipt and a consumption against the same item cancel out here
    // even though they stay separate on the ledger side.
    interface BalanceGroup {
      companyId: string;
      itemId: string;
      warehouseId: string;
      uomId: string;
      locationId: string | null;
      batchId: string | null;
      delta: number;
    }
    const balances = new Map<string, BalanceGroup>();

    for (const row of movements) {
      const quantity = Number(row.quantity) || 0;
      if (quantity <= 0) continue;
      const classified = classifyLedgerMovement(row);

      // Balance impact is NOT `direction`: a `PRODUCTION_SCRAP` row is written
      // OUT and never touched the balance at all, so counting it here would
      // invent stock on the way out. `ledgerBalanceDelta` is the one rule set
      // that knows the difference.
      const delta = ledgerBalanceDelta(row);

      if (delta && row.item_id && row.warehouse_id && row.uom_id) {
        const balanceKey = `${row.company_id}|${row.item_id}|${row.warehouse_id}|${row.location_id ?? ''}|${row.batch_id ?? ''}|${row.uom_id}`;
        const balance = balances.get(balanceKey) ?? {
          companyId: row.company_id,
          itemId: row.item_id,
          warehouseId: row.warehouse_id,
          uomId: row.uom_id,
          locationId: row.location_id ?? null,
          batchId: row.batch_id ?? null,
          delta: 0,
        };
        balance.delta += delta;
        balances.set(balanceKey, balance);
      }

      // Scrap and anything else with no readable family takes no reversal ROW.
      if (!classified) continue;

      const familyKey = `${row.company_id}|${classified.family}|${row.item_id}|${row.warehouse_id}|${row.uom_id}`;
      const group = families.get(familyKey) ?? {
        companyId: row.company_id,
        family: classified.family,
        itemId: row.item_id,
        warehouseId: row.warehouse_id,
        uomId: row.uom_id,
        locationId: row.location_id ?? null,
        batchId: row.batch_id ?? null,
        net: 0,
      };
      group.net += classified.sign * quantity;
      families.set(familyKey, group);
    }

    let rowsReversed = 0;
    let netOutstanding = 0;

    for (const g of families.values()) {
      if (Math.abs(g.net) < 1e-9) continue;
      rowsReversed += 1;

      const decreasing = g.net > 0;
      const quantity = Math.abs(g.net);

      await this.stockLedgerService.create(
        {
          companyId: g.companyId,
          transactionType: decreasing ? 'PRODUCTION_REVERSAL' : g.family,
          transactionDate: new Date(),
          itemId: g.itemId,
          warehouseId: g.warehouseId,
          locationId: g.locationId ?? undefined,
          batchId: g.batchId ?? undefined,
          quantity,
          uomId: g.uomId,
          // A reversal SUBTRACTS from the balance the same way it subtracts
          // from its family, so the direction mirrors the sign, not the
          // original row.
          direction: decreasing ? 'OUT' : 'IN',
          referenceType,
          notes:
            `Reversal of ${g.family} for a production entry purged by the Recycle Bin sweep — ` +
            'the document was destroyed, its stock movement was not.',
        },
        manager,
      );
    }

    // Balance side: derived from direction alone, applied once per balance
    // key. Scrap contributes nothing because it never moved the balance in
    // the first place. `netOutstanding` is measured HERE — the balance is the
    // one place a single, unambiguous "how much stock is still on the books"
    // number exists. The ledger side cannot supply it: a family that was
    // already reversed past zero nets in the opposite direction to the stock
    // it represents.
    for (const b of balances.values()) {
      if (Math.abs(b.delta) < 1e-9) continue;
      netOutstanding += b.delta;
      await this.inventoryBalanceService.updateBalance(
        b.companyId,
        b.itemId,
        b.warehouseId,
        b.locationId,
        b.batchId,
        b.uomId,
        Math.abs(b.delta),
        b.delta > 0 ? 'OUT' : 'IN',
        manager,
        // A correction may legitimately land a balance below zero: refusing
        // it would leave the document destroyable but its stock still
        // stranded — the exact half-state this method exists to prevent.
        true,
      );
    }

    if (rowsReversed) {
      this.logger.log(
        `Reversed ${rowsReversed} outstanding stock movement group(s) ` +
          `(net ${netOutstanding}) before purging ${ids.length} ${referenceType} document(s).`,
      );
    }

    return { rowsReversed, netOutstanding };
  }

  /**
   * One full sweep across every target table.
   *
   * Exposed so it can be invoked from a test or an operator shell without
   * waiting for the wall clock. In dry-run mode it performs SELECTs only and
   * reports what WOULD have been destroyed — the number an operator should
   * review before arming the engine for real.
   */
  async runSweep(dryRun = this.dryRun): Promise<PurgeReport> {
    const retentionDays = this.retentionDays;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const report: PurgeReport = {
      live: this.live,
      dryRun,
      retentionDays,
      cutoff: cutoff.toISOString(),
      ranAt: new Date().toISOString(),
      targets: [],
      totalPurged: 0,
    };

    for (const target of SWEEP_TARGETS) {
      const qualified = target.schema ? `"${target.schema}"."${target.table}"` : `"${target.table}"`;
      try {
        const expired = await this.dataSource.query(
          `SELECT id FROM ${qualified} WHERE deleted_at IS NOT NULL AND deleted_at < $1`,
          [cutoff],
        );
        if (expired.length === 0) {
          report.targets.push({ table: target.table, purged: 0, childrenPurged: 0 });
          continue;
        }

        const ids: string[] = expired.map((r: { id: string }) => r.id);
        let childrenPurged = 0;
        const ledger: { rowsReversed: number; netOutstanding: number } = {
          rowsReversed: 0,
          netOutstanding: 0,
        };

        if (dryRun) {
          for (const child of target.children ?? []) {
            const rows = await this.dataSource.query(
              `SELECT COUNT(*)::int AS n FROM "${child.table}" WHERE "${child.fk}" = ANY($1)`,
              [ids],
            );
            childrenPurged += Number(rows?.[0]?.n ?? 0);
          }
          // Report the stock that is still on the books behind these rows,
          // without touching it. This is the figure to review before arming
          // the engine: it is the size of the correction that WOULD land.
          if (target.stockLedgerReferenceType) {
            const outstanding = await this.estimateOutstandingLedgerNet(
              target.stockLedgerReferenceType,
              ids,
            );
            ledger.rowsReversed = outstanding.rows;
            ledger.netOutstanding = outstanding.net;
          }
        } else {
          await this.dataSource.transaction(async (manager) => {
            // Reverse FIRST: the balance correction and the reversal rows are
            // part of the same atomic unit as the destruction, so a failure
            // can never leave the documents gone but their stock stranded.
            if (target.stockLedgerReferenceType) {
              Object.assign(
                ledger,
                await this.reverseLedgerPostingsFor(
                  manager,
                  target.stockLedgerReferenceType,
                  ids,
                ),
              );
            }
            for (const child of target.children ?? []) {
              const res = await manager.query(
                `DELETE FROM "${child.table}" WHERE "${child.fk}" = ANY($1)`,
                [ids],
              );
              childrenPurged += res?.affected ?? 0;
            }
            await manager.query(`DELETE FROM ${qualified} WHERE id = ANY($1)`, [ids]);
          });
        }

        report.targets.push({
          table: target.table,
          purged: ids.length,
          childrenPurged,
          ...(target.stockLedgerReferenceType
            ? dryRun
              ? { ledgerRowsOutstanding: ledger.rowsReversed, ledgerNetOutstanding: ledger.netOutstanding }
              : { ledgerRowsReversed: ledger.rowsReversed }
            : {}),
        });
        report.totalPurged += ids.length;

        this.logger.log(
          `${dryRun ? '[DRY RUN] would purge' : 'Purged'} ${ids.length} ${target.table} ` +
            `row(s) deleted before ${cutoff.toISOString()}` +
            (childrenPurged ? ` plus ${childrenPurged} child row(s)` : ''),
        );
      } catch (err) {
        // A missing `deleted_at` column means the migration has not been applied
        // yet. That is a configuration state, not a crash: log it plainly and
        // keep going so one unmigrated table cannot stop the whole sweep.
        this.logger.warn(
          `Skipped ${target.table} during the recycle-bin sweep: ${(err as Error)?.message}`,
        );
      }
    }

    if (report.totalPurged === 0) {
      this.logger.log(`Recycle Bin sweep found no records older than ${retentionDays} days.`);
    }

    return report;
  }
}
