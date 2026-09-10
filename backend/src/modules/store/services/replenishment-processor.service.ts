import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ReplenishmentService } from './replenishment.service';

/**
 * Automatic store replenishment scheduler.
 *
 * Reuses the same in-process setInterval polling pattern as the notification
 * delivery processor (no cron/Bull dependency). Every poll runs the idempotent
 * replenishment check: rows are upserted from real inventory_balances and the
 * store_items min/reorder/max config, pipeline quantities are recomputed from
 * MR / PR / PO / GRN, and no duplicate material requests are ever created.
 *
 * Auto MR creation can be disabled per deployment via REPLENISHMENT_AUTO_MR=false.
 */
@Injectable()
export class ReplenishmentProcessorService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReplenishmentProcessorService.name);
  private readonly POLL_INTERVAL_MS = 60_000;
  private readonly MIN_RUN_INTERVAL_MS = 60_000;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastRunAt = 0;

  constructor(private readonly replenishmentService: ReplenishmentService) {}

  onApplicationBootstrap() {
    const autoMr = process.env.REPLENISHMENT_AUTO_MR !== 'false';
    this.timer = setInterval(() => {
      void this.tick(autoMr);
    }, this.POLL_INTERVAL_MS);
    this.logger.log(
      `Store replenishment processor started (poll every ${this.POLL_INTERVAL_MS}ms, autoMR=${autoMr})`,
    );
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(autoMr: boolean): Promise<void> {
    if (this.running) return;
    if (Date.now() - this.lastRunAt < this.MIN_RUN_INTERVAL_MS) return;

    this.running = true;
    try {
      const result = await this.replenishmentService.runReplenishmentCheck({ autoCreateMr: autoMr });
      this.lastRunAt = Date.now();
      this.logger.log(
        `Replenishment check ${result.runReference}: ${result.companiesProcessed} company(ies), ` +
          `${result.rowsChecked} rows checked, ${result.requestsAutoCreated} requests auto-created`,
      );
    } catch (error) {
      this.logger.error(`Replenishment check failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}