import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The database guard for the 2026-10-11 CCD-SP-002 incident.
 *
 * WHAT HAPPENED. Two autocommit statements (xid 60087, then 60088) re-pointed
 * 11 `production_entries` and their PRODUCTION_RECEIPT/PRODUCTION_SCRAP rows
 * from CCD-SP-002 to SPI-SPK-003. `inventory_balances` and the
 * PRODUCTION_REVERSAL rows were left behind, so the receipts and their own
 * reversals ended up in different warehouses and 310,293 units of balance
 * became ghost stock on a card with no journal behind it. Nothing in the
 * database objected, because nothing in the database said the three tables had
 * to agree.
 *
 * THE GUARD. Two triggers, each aimed at one half of that split:
 *
 *   1. `stock_ledger` BEFORE UPDATE — the ledger is append-only. You cannot
 *      move, re-quantify or re-type a row that is already written; you append
 *      a reversal instead. This is the operation the 10-11 script performed,
 *      so it now fails on the statement itself rather than at report time.
 *
 *   2. `production_entries` AFTER INSERT/UPDATE OF warehouse_id, DEFERRABLE
 *      INITIALLY DEFERRED — a document may not claim a warehouse its own
 *      receipts do not sit in. Deferred because the application's edit path
 *      legitimately saves the entry first and re-posts the delta second, both
 *      inside one transaction; by COMMIT the two agree and the check passes.
 *      A script that moves only the document (statement 1 above) commits with
 *      the old warehouse still holding a non-zero net and is refused.
 *
 * The net is computed with the SAME family rules as
 * `src/common/stock-movement.classifier.ts`: scrap and its reversals are
 * balance-neutral, a reversal carries the sign of its origin, consumption is
 * excluded because it legitimately lives in the source store rather than the
 * receipt store. The two are deliberately kept in step here and there; if the
 * classifier ever changes, this predicate must change with it.
 *
 * ESCAPE HATCH. Both triggers stand down for the session that sets
 *   SET LOCAL app.ledger_maintenance = 'on';
 * so a reviewed repair can still do what it needs to do — but it has to say so
 * out loud, in the same transaction, instead of silently diverging.
 *
 * Nothing here breaks live data: as written, zero ledger pairs violated the
 * invariant and zero posted entries had a NULL warehouse.
 *
 * `up()` is idempotent (CREATE OR REPLACE / DROP ... IF EXISTS), so re-running
 * is harmless.
 */
export class LedgerWarehouseGuard1808000000000 implements MigrationInterface {
  name = 'LedgerWarehouseGuard1808000000000';

  private async tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = $1`,
      [table],
    );
    return rows.length > 0;
  }

  private async columnExists(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
      [table, column],
    );
    return rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.tableExists(queryRunner, 'stock_ledger'))) return;

    // ── 1. stock_ledger is append-only ────────────────────────────────────
    // Every column that decides what a row MEANS. `notes`, `reference_number`
    // and the org-scope columns are metadata and stay editable.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION stock_ledger_append_only()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $fn$
      DECLARE
        changed text[] := ARRAY[]::text[];
        col text;
      BEGIN
        IF current_setting('app.ledger_maintenance', true) = 'on' THEN
          RETURN NEW;
        END IF;

        FOREACH col IN ARRAY ARRAY[
          'warehouse_id', 'item_id', 'quantity', 'direction', 'uom_id',
          'transaction_type', 'reference_id', 'reference_type',
          'company_id', 'transaction_date'
        ] LOOP
          IF to_jsonb(OLD) -> col IS DISTINCT FROM to_jsonb(NEW) -> col THEN
            changed := changed || col;
          END IF;
        END LOOP;

        IF array_length(changed, 1) IS NULL THEN
          RETURN NEW;
        END IF;

        RAISE EXCEPTION
          'stock_ledger is append-only: refusing to update % of row % (id %). '
          || 'Ledger history is corrected by appending a reversal, never by '
          || 'editing a row that has already been written. For a reviewed '
          || 'one-off repair run: SET LOCAL app.ledger_maintenance = ''on''',
          array_to_string(changed, ', '), TG_TABLE_NAME, OLD.id
          USING ERRCODE = 'restrict_violation';
      END;
      $fn$`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_stock_ledger_append_only ON stock_ledger`);
    await queryRunner.query(`
      CREATE TRIGGER trg_stock_ledger_append_only
        BEFORE UPDATE ON stock_ledger
        FOR EACH ROW
        EXECUTE FUNCTION stock_ledger_append_only()`);

    // ── 2. a document must agree with its own receipts ────────────────────
    if (
      (await this.tableExists(queryRunner, 'production_entries')) &&
      (await this.columnExists(queryRunner, 'production_entries', 'warehouse_id'))
    ) {
      await queryRunner.query(`
        CREATE OR REPLACE FUNCTION production_entry_warehouse_guard()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $fn$
        DECLARE
          claimed uuid;
          bad text;
        BEGIN
          IF current_setting('app.ledger_maintenance', true) = 'on' THEN
            RETURN NULL;
          END IF;

          claimed := CASE WHEN TG_OP = 'DELETE' THEN OLD.warehouse_id
                          ELSE NEW.warehouse_id END;
          IF claimed IS NULL THEN
            RETURN NULL;
          END IF;

          SELECT string_agg(
                   w.warehouse_code || ' (net ' || ROUND(f.net::numeric, 3) || ')',
                   ', ' ORDER BY ABS(f.net) DESC)
            INTO bad
            FROM (
              SELECT sl.warehouse_id,
                     SUM(CASE
                           -- scrap records history and moves no stock, and
                           -- neither does a reversal of scrap
                           WHEN sl.transaction_type = 'PRODUCTION_SCRAP' THEN 0
                           WHEN sl.transaction_type = 'PRODUCTION_REVERSAL'
                                AND COALESCE(sl.notes, '') ~ '^Reversal of PRODUCTION_SCRAP' THEN 0
                           -- a reversal carries the sign of its origin, which
                           -- is always negative for a receipt
                           WHEN sl.transaction_type = 'PRODUCTION_REVERSAL'
                                AND COALESCE(sl.notes, '') ~ '^Reversal of PRODUCTION_RECEIPT'
                             THEN -sl.quantity
                           WHEN sl.transaction_type = 'PRODUCTION_RECEIPT'
                             THEN CASE WHEN sl.direction = 'IN'
                                       THEN sl.quantity ELSE -sl.quantity END
                           -- consumption belongs to the source store, not to
                           -- the receipt store, so it is out of scope here
                           ELSE 0
                         END) AS net
                FROM stock_ledger sl
               WHERE sl.reference_type = 'PRODUCTION_ENTRY'
                 AND sl.reference_id = NEW.id
               GROUP BY sl.warehouse_id
            ) f
            JOIN warehouses w ON w.id = f.warehouse_id
           WHERE f.warehouse_id IS DISTINCT FROM claimed
             AND ABS(f.net) > 0.0001;

          IF bad IS NOT NULL THEN
            RAISE EXCEPTION
              'production entry % claims warehouse %, but its own receipts still '
              || 'net stock in: %. Re-post the entry for the new warehouse inside '
              || 'this transaction (the edit screen does), or move the document '
              || 'and its ledger together.',
              NEW.id, claimed, bad
              USING ERRCODE = 'restrict_violation';
          END IF;

          RETURN NULL;
        END;
        $fn$`);

      await queryRunner.query(
        `DROP TRIGGER IF EXISTS trg_prod_entry_warehouse_guard ON production_entries`,
      );
      // Deferred: the application saves the entry and applies its ledger delta
      // in the same transaction, so this runs at COMMIT when both are done.
      await queryRunner.query(`
        CREATE CONSTRAINT TRIGGER trg_prod_entry_warehouse_guard
          AFTER INSERT OR UPDATE OF warehouse_id ON production_entries
          DEFERRABLE INITIALLY DEFERRED
          FOR EACH ROW
          EXECUTE FUNCTION production_entry_warehouse_guard()`);
    }

    // ── 3. a balance row cannot be re-pointed either ──────────────────────
    // The third leg of the split. Balances are keyed by (item, warehouse);
    // moving one in place would strand the quantity from its journal.
    if (await this.tableExists(queryRunner, 'inventory_balances')) {
      await queryRunner.query(`
        CREATE OR REPLACE FUNCTION inventory_balance_identity()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $fn$
        DECLARE
          changed text[] := ARRAY[]::text[];
          col text;
        BEGIN
          IF current_setting('app.ledger_maintenance', true) = 'on' THEN
            RETURN NEW;
          END IF;

          FOREACH col IN ARRAY ARRAY['warehouse_id', 'item_id', 'company_id'] LOOP
            IF to_jsonb(OLD) -> col IS DISTINCT FROM to_jsonb(NEW) -> col THEN
              changed := changed || col;
            END IF;
          END LOOP;

          IF array_length(changed, 1) IS NULL THEN
            RETURN NEW;
          END IF;

          RAISE EXCEPTION
            'inventory_balances is keyed by (item, warehouse): refusing to update '
            || '% of row % (id %). Move the quantity by adjusting both rows, not '
            || 'by re-pointing one. For a reviewed one-off repair run: '
            || 'SET LOCAL app.ledger_maintenance = ''on''',
            array_to_string(changed, ', '), TG_TABLE_NAME, OLD.id
            USING ERRCODE = 'restrict_violation';
        END;
        $fn$`);

      await queryRunner.query(
        `DROP TRIGGER IF EXISTS trg_inventory_balance_identity ON inventory_balances`,
      );
      await queryRunner.query(`
        CREATE TRIGGER trg_inventory_balance_identity
          BEFORE UPDATE ON inventory_balances
          FOR EACH ROW
          EXECUTE FUNCTION inventory_balance_identity()`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const drops = [
      `DROP TRIGGER IF EXISTS trg_stock_ledger_append_only ON stock_ledger`,
      `DROP TRIGGER IF EXISTS trg_prod_entry_warehouse_guard ON production_entries`,
      `DROP TRIGGER IF EXISTS trg_inventory_balance_identity ON inventory_balances`,
      `DROP FUNCTION IF EXISTS stock_ledger_append_only()`,
      `DROP FUNCTION IF EXISTS production_entry_warehouse_guard()`,
      `DROP FUNCTION IF EXISTS inventory_balance_identity()`,
    ];
    for (const sql of drops) {
      try {
        await queryRunner.query(sql);
      } catch {
        /* the object may not exist on this database */
      }
    }
  }
}
