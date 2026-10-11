import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

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
}

const SWEEP_TARGETS: SweepTarget[] = [
  {
    table: 'production_entries',
    children: [{ table: 'production_entry_items', fk: 'production_entry_id' }],
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
  targets: { table: string; purged: number; childrenPurged: number }[];
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

  constructor(private readonly dataSource: DataSource) {}

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

        if (dryRun) {
          for (const child of target.children ?? []) {
            const rows = await this.dataSource.query(
              `SELECT COUNT(*)::int AS n FROM "${child.table}" WHERE "${child.fk}" = ANY($1)`,
              [ids],
            );
            childrenPurged += Number(rows?.[0]?.n ?? 0);
          }
        } else {
          await this.dataSource.transaction(async (manager) => {
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
