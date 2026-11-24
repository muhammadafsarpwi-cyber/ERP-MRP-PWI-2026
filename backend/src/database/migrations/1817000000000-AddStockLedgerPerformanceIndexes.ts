import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStockLedgerPerformanceIndexes1817000000000 implements MigrationInterface {
  name = 'AddStockLedgerPerformanceIndexes1817000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_ledger_item_date
      ON public.stock_ledger (item_id, transaction_date);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_ledger_company_date
      ON public.stock_ledger (company_id, transaction_date);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_ledger_company_item_date
      ON public.stock_ledger (company_id, item_id, transaction_date);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_production_entries_company_active_date
      ON public.production_entries (company_id, entry_date)
      WHERE is_active = true AND deleted_at IS NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_production_entry_items_company_kind_item
      ON public.production_entry_items (company_id, entry_kind, item_id)
      WHERE deleted_at IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS public.idx_production_entry_items_company_kind_item;`);
    await queryRunner.query(`DROP INDEX IF EXISTS public.idx_production_entries_company_active_date;`);
    await queryRunner.query(`DROP INDEX IF EXISTS public.idx_stock_ledger_company_item_date;`);
    await queryRunner.query(`DROP INDEX IF EXISTS public.idx_stock_ledger_company_date;`);
    await queryRunner.query(`DROP INDEX IF EXISTS public.idx_stock_ledger_item_date;`);
  }
}
