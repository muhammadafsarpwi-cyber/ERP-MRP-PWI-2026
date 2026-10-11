import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Universal Recycle Bin (ERP soft-delete) — adds the two trash columns to every
 * entity that participates in the recoverable-delete matrix:
 *
 *   deleted_at  TIMESTAMPTZ NULL  — when the row was moved to the bin
 *   deleted_by  UUID         NULL  — the operator profile that fired the delete
 *
 * The entities involved (mapped to the real tables in this schema):
 *
 *   ── Phase 1: the four original departments ──────────────────────────────
 *   ProductionEntry          -> production_entries          (+ production_entry_items)
 *   JobCard / JobCardItem    -> maintenance_job_cards       (+ maintenance_job_card_parts)
 *   DispatchLog              -> dispatch_packages
 *   Customer                 -> customers
 *
 *   ── Phase 2: departments whose delete path already existed ──────────────
 *   SalesQuotation           -> quotations            (erp_sales — was a HARD delete)
 *   ProductionOrder          -> production_orders     (was an isActive=false archive)
 *   BillOfMaterials          -> bill_of_materials     (was an isActive=false archive)
 *   MaintenancePmPlan        -> maintenance_pm_plans  (was an isActive=false archive)
 *
 *   ── Phase 3: departments that had NO delete endpoint at all ─────────────
 *   MaterialIssue            -> material_issues           (Store — Goods Outward Note)
 *   MaterialReturn           -> material_returns          (Store — Goods Inward Note)
 *   MaterialRequest          -> material_requests         (Store — requisition)
 *   SalesOrder               -> sales_orders              (erp_sales — Customer Purchase Order)
 *   SalesInvoice             -> sales_invoices            (erp_sales — invoicing)
 *   SalesDelivery            -> sales_deliveries          (erp_sales — the GATE PASS document)
 *   QcInspectionPlan         -> qc_inspection_plans       (QC — tolerance matrix)
 *   MaintenancePmSchedule    -> maintenance_pm_schedules  (Maintenance — generated PM logs)
 *
 * Each Phase-3 table gains a `@Delete` route in its owning module; until those
 * routes exist nothing can reach the bin, which is why they arrived together.
 *
 * CHILD / LINE TABLES ARE DELIBERATELY NOT INCLUDED: `quotation_items`,
 * `production_order_operations`, `bom_lines`, `material_*_lines` and
 * `sales_*_items/lines` travel with their parent. The parent row disappears
 * from every live grid, so the children are unreachable; permanent purge
 * hard-deletes them alongside the parent. They never appear as their own tab,
 * so they need no trash columns.
 *
 * WHY A MIGRATION IS MANDATORY: `synchronize` is false for both the runtime
 * DataSource and the CLI data-source, so the `@DeleteDateColumn()` decorators
 * added to the entities are inert until these columns physically exist. Until
 * then every SELECT for these tables would reference a missing column.
 *
 * Every statement is idempotent (`IF NOT EXISTS`), so re-running is a no-op.
 * The partial index keeps the bin grid's `WHERE deleted_at IS NOT NULL ORDER BY
 * deleted_at DESC` off a full table scan as the production tables grow into the
 * millions of rows, while costing nothing for the 99.99% of rows that are live.
 *
 * NO DATA IS TOUCHED: every column is added NULL with no default, so existing
 * rows stay exactly as they are and remain fully visible. Behaviour only changes
 * once a row is actually soft-deleted.
 */
export class AddSoftDeleteColumns1806000000000 implements MigrationInterface {
  name = 'AddSoftDeleteColumns1806000000000';

  /**
   * One entry per table that gains the trash columns. `schema` defaults to the
   * connection's current schema; the four Sales tables override it because the
   * Sales module keeps its documents in a dedicated `erp_sales` schema. Without
   * the override the `current_schema()` existence guard would never match those
   * tables and their columns would be silently, permanently missing.
   */
  private readonly tables: { name: string; schema?: string }[] = [
    // ── Phase 1 — the original four departments ───────────────────────────
    { name: 'production_entries' },
    { name: 'production_entry_items' },
    { name: 'maintenance_job_cards' },
    { name: 'maintenance_job_card_parts' },
    { name: 'dispatch_packages' },
    { name: 'customers' },
    // ── Phase 2 — departments that already had a delete path ──────────────
    { name: 'quotations', schema: 'erp_sales' }, // was a hard `repo.remove()`
    { name: 'production_orders' },
    { name: 'bill_of_materials' },
    { name: 'maintenance_pm_plans' },
    // ── Phase 3 — departments that had no delete endpoint at all ──────────
    { name: 'material_issues' }, // Store — Goods Outward Note
    { name: 'material_returns' }, // Store — Goods Inward Note
    { name: 'material_requests' }, // Store — requisition
    { name: 'sales_orders', schema: 'erp_sales' }, // Customer Purchase Order
    { name: 'sales_invoices', schema: 'erp_sales' },
    { name: 'sales_deliveries', schema: 'erp_sales' }, // the GATE PASS document
    { name: 'qc_inspection_plans' }, // QC tolerance matrix
    { name: 'maintenance_pm_schedules' }, // generated PM log instances
  ];

  private async tableExists(queryRunner: QueryRunner, table: string, schema?: string): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = COALESCE($2, current_schema()) AND table_name = $1`,
      [table, schema ?? null],
    );
    return rows.length > 0;
  }

  /** `"erp_sales"."quotations"` or `"quotations"` — safe to interpolate into DDL. */
  private qualified(table: string, schema?: string): string {
    return schema ? `"${schema}"."${table}"` : `"${table}"`;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { name, schema } of this.tables) {
      if (!(await this.tableExists(queryRunner, name, schema))) continue;

      const q = this.qualified(name, schema);
      await queryRunner.query(
        `ALTER TABLE ${q} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE ${q} ADD COLUMN IF NOT EXISTS deleted_by UUID NULL`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_${name}_deleted_at" ON ${q} (deleted_at) WHERE deleted_at IS NOT NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse order, index before column. `deleted_by` is dropped LAST so that
    // if this is interrupted halfway the remaining `deleted_at` column keeps
    // every query that already exists working.
    for (const { name, schema } of [...this.tables].reverse()) {
      if (!(await this.tableExists(queryRunner, name, schema))) continue;

      const q = this.qualified(name, schema);
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_${name}_deleted_at"`);
      await queryRunner.query(`ALTER TABLE ${q} DROP COLUMN IF EXISTS deleted_at`);
      await queryRunner.query(`ALTER TABLE ${q} DROP COLUMN IF EXISTS deleted_by`);
    }
  }
}
