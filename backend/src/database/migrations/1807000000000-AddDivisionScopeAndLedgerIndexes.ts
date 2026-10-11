import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Performance indexes for the division-scoped hot paths.
 *
 * `synchronize` is false in this project (see `src/database/data-source.ts`),
 * so entity-level `@Index()` decorators never reach the database on their own.
 * Every index below is created defensively:
 *
 *   - the owning column is verified to exist first (columns added by earlier
 *     migrations may be absent on older databases),
 *   - `CREATE INDEX IF NOT EXISTS` makes the migration re-runnable,
 *   - composites are ordered leading-column-first so they can serve both the
 *     narrow (division only) and the wide (division + date) predicates.
 */
export class AddDivisionScopeAndLedgerIndexes1807000000000 implements MigrationInterface {
  name = 'AddDivisionScopeAndLedgerIndexes1807000000000';

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

  private async createIndex(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
    columns: string[],
  ): Promise<void> {
    // every column must exist — a half-built index name would poison IF NOT EXISTS
    for (const column of columns) {
      if (!(await this.columnExists(queryRunner, table, column))) return;
    }
    const cols = columns.map((c) => `"${c}"`).join(', ');
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${table}" (${cols})`,
    );
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── stock_ledger: org trail columns added by AddOrgTrailToStockLedger have no index ──
    await this.createIndex(queryRunner, 'stock_ledger', 'idx_stock_ledger_division', [
      'division_id',
    ]);
    await this.createIndex(queryRunner, 'stock_ledger', 'idx_stock_ledger_section', [
      'section_id',
    ]);
    await this.createIndex(queryRunner, 'stock_ledger', 'idx_stock_ledger_department', [
      'department_id',
    ]);

    // division-scoped ledger listing (paged by date, newest first)
    await this.createIndex(queryRunner, 'stock_ledger', 'idx_stock_ledger_company_division_date', [
      'company_id',
      'division_id',
      'transaction_date',
    ]);

    // item ledger / running balance per company
    await this.createIndex(queryRunner, 'stock_ledger', 'idx_stock_ledger_company_item_date', [
      'company_id',
      'item_id',
      'transaction_date',
    ]);

    // warehouse balance reads (item + warehouse within a company)
    await this.createIndex(queryRunner, 'stock_ledger', 'idx_stock_ledger_company_wh_item', [
      'company_id',
      'warehouse_id',
      'item_id',
    ]);

    // reference lookups (e.g. reverse every ledger row for one production entry)
    await this.createIndex(queryRunner, 'stock_ledger', 'idx_stock_ledger_reference', [
      'reference_type',
      'reference_id',
    ]);

    // ── production_entries: composite for the paginated division/date list ──
    await this.createIndex(
      queryRunner,
      'production_entries',
      'idx_prod_entries_company_division_date',
      ['company_id', 'division_id', 'entry_date'],
    );

    // ── machines: org scope filters (single-column indexes exist on some DBs only) ──
    await this.createIndex(queryRunner, 'machines', 'idx_machines_division_id', ['division_id']);
    await this.createIndex(queryRunner, 'machines', 'idx_machines_section_id', ['section_id']);
    await this.createIndex(queryRunner, 'machines', 'idx_machines_department_id', ['department_id']);

    // ── machine_targets: history range scan by machine + effective window ──
    await this.createIndex(queryRunner, 'machine_targets', 'idx_machine_targets_machine_from', [
      'machine_id',
      'effective_from',
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const indexes = [
      ['stock_ledger', 'idx_stock_ledger_division'],
      ['stock_ledger', 'idx_stock_ledger_section'],
      ['stock_ledger', 'idx_stock_ledger_department'],
      ['stock_ledger', 'idx_stock_ledger_company_division_date'],
      ['stock_ledger', 'idx_stock_ledger_company_item_date'],
      ['stock_ledger', 'idx_stock_ledger_company_wh_item'],
      ['stock_ledger', 'idx_stock_ledger_reference'],
      ['production_entries', 'idx_prod_entries_company_division_date'],
      ['machines', 'idx_machines_division_id'],
      ['machines', 'idx_machines_section_id'],
      ['machines', 'idx_machines_department_id'],
      ['machine_targets', 'idx_machine_targets_machine_from'],
    ] as const;

    for (const [table, index] of indexes) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${index}"`);
    }
  }
}
