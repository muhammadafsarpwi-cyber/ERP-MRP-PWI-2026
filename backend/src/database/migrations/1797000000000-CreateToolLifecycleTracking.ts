import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TASK26 — Machine Tool & Component Lifecycle Tracking
 * (Store Issue → Machine Installation → Production Run → Removal →
 *  Automatic Production-Life Calculation → Disposition → Life History / Report)
 *
 * Builds on TASK25 (`machine_components` + `component_changes`). No stock is
 * duplicated: a store issue link points at the existing `material_issues`
 * (posted MATERIAL_ISSUE ledger movements already deplete inventory), and the
 * production life is derived from real `production_entries.actual_quantity`.
 *
 * Adds:
 *   machine_component_items           — multi-item Item-Master breakdown per
 *                                       tool / die / mould, each line with its
 *                                       own quantity + UOM (no cross-UOM sums).
 *   component_changes                — new columns:
 *                                       store_issue_id   (→ material_issues.id)
 *                                       disposition_type RETURN_TO_STORE /
 *                                                       SENT_FOR_REWORK / SCRAPPED /
 *                                                       LOST / RETAINED / OTHER
 *                                       disposition_note
 *                                       closed_at        (NULL = the installed
 *                                                         tool of this change is
 *                                                         currently ACTIVE)
 *   single-active enforcement        — partial unique index on
 *                                       (company_id, component_id)
 *                                       WHERE closed_at IS NULL AND is_active = TRUE
 *   backfill                        — existing TASK25 changes: every generation
 *                                       except the newest is marked closed, the
 *                                       newest stays open (the currently active
 *                                       tool) — no fabricated data.
 *
 * Permissions are REUSED from TASK25 (no new codes): install / remove / dispose /
 * link-issue map onto manufacturing.component_change.* and the multi-item
 * breakdown onto manufacturing.tool_component.*.
 */
export class CreateToolLifecycleTracking1797000000000 implements MigrationInterface {
  name = 'CreateToolLifecycleTracking1797000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Multi-item breakdown (Item Master) ────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS machine_component_items (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id    uuid NOT NULL REFERENCES companies(id),
        component_id  uuid NOT NULL REFERENCES machine_components(id),
        item_id       uuid NOT NULL REFERENCES items(id),
        quantity      numeric(19,4) NOT NULL DEFAULT 1.0000,
        uom_id        uuid NULL REFERENCES uoms(id),
        notes         text NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        created_by    uuid NULL,
        updated_by    uuid NULL,
        is_active     boolean NOT NULL DEFAULT TRUE
      )
    `);
    await queryRunner.query(`
      COMMENT ON TABLE machine_component_items IS
        'TASK26 - Multi-item Item-Master breakdown per tool / die / mould (quantity + UOM per line)'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_machine_component_items_active
        ON machine_component_items (company_id, component_id, item_id)
        WHERE is_active = TRUE
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_machine_component_items_company ON machine_component_items (company_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_machine_component_items_component ON machine_component_items (component_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_machine_component_items_item ON machine_component_items (item_id)`,
    );

    // ── 2. Extend component_changes with lifecycle columns ───────────────────
    await queryRunner.query(`
      ALTER TABLE component_changes
        ADD COLUMN IF NOT EXISTS store_issue_id uuid NULL REFERENCES material_issues(id),
        ADD COLUMN IF NOT EXISTS disposition_type varchar(30) NULL,
        ADD COLUMN IF NOT EXISTS disposition_note text NULL,
        ADD COLUMN IF NOT EXISTS closed_at timestamptz NULL
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN component_changes.closed_at IS
        'TASK26 - NULL while the tool installed by this change is ACTIVE; set at removal (single-active tool per component)'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN component_changes.disposition_type IS
        'TASK26 - RETURN_TO_STORE | SENT_FOR_REWORK | SCRAPPED | LOST | RETAINED | OTHER for the removed tool'
    `);

    // ── 3. Backfill lifecycle state for existing TASK25 data ─────────────────
    // MUST run before the partial unique index: every historic generation
    // except the newest per (company, component) is marked closed (the newest
    // stays open = the currently active tool). No fabricated data.
    await queryRunner.query(`
      UPDATE component_changes cc
         SET closed_at = COALESCE(x.created_at, cc.changed_at)
        FROM (
          SELECT c.id,
                 c.created_at,
                 ROW_NUMBER() OVER (
                   PARTITION BY c.company_id, c.component_id
                   ORDER BY c.change_date DESC, c.changed_at DESC, c.updated_at DESC
                 ) AS rn
            FROM component_changes c
           WHERE c.is_active = TRUE
        ) x
       WHERE x.id = cc.id AND x.rn > 1
    `);

    // ── 4. Single-active-tool enforcement (DB level, race-safe) ──────────────
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_component_changes_single_active
        ON component_changes (company_id, component_id)
        WHERE closed_at IS NULL AND is_active = TRUE
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_component_changes_closed_at ON component_changes (closed_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_component_changes_store_issue ON component_changes (store_issue_id)`,
    );

    // ── 5. Demo breakdown rows (clearly DEMO DATA, idempotent) ───────────────
    const companyRows = await queryRunner.query(`SELECT id FROM companies LIMIT 1`);
    const cid = companyRows[0]?.id as string | undefined;
    if (cid) {
      const one = async (sql: string, values: unknown[]): Promise<string | null> => {
        const rows = await queryRunner.query(sql, values);
        return rows[0]?.id ?? null;
      };

      const lookup = async (type: 'component' | 'item' | 'uom', code: string): Promise<string | null> => {
        if (type === 'component') {
          return one(
            `SELECT id FROM machine_components WHERE company_id = $1 AND component_code = $2 AND is_active = TRUE LIMIT 1`,
            [cid, code],
          );
        }
        if (type === 'uom') {
          return one(`SELECT id FROM uoms WHERE code = $1 LIMIT 1`, [code]);
        }
        return one(`SELECT id FROM items WHERE item_code = $1 LIMIT 1`, [code]);
      };

      const pcs = await lookup('uom', 'PCS');
      const rows: Array<[string, string, string]> = [
        ['FT-DIE-001', 'FG-CASING-001', '1.0000'],
        ['SP-CHAIN-001', 'WIP-SP-001', '1.0000'],
        ['BL-BLADE-001', 'WIP-FLAT-001', '1.0000'],
      ];
      for (const [componentCode, itemCode, qty] of rows) {
        const componentId = await lookup('component', componentCode);
        const itemId = await lookup('item', itemCode);
        if (!componentId || !itemId) continue;
        const existing = await one(
          `SELECT id FROM machine_component_items
            WHERE company_id = $1 AND component_id = $2 AND item_id = $3 AND is_active = TRUE LIMIT 1`,
          [cid, componentId, itemId],
        );
        if (existing) continue;
        await queryRunner.query(
          `INSERT INTO machine_component_items
             (company_id, component_id, item_id, quantity, uom_id, notes, created_at, updated_at, is_active)
           VALUES ($1,$2,$3,$4,$5,$6, NOW(), NOW(), TRUE)`,
          [cid, componentId, itemId, qty, pcs, `DEMO DATA - Item Master breakdown for ${componentCode}`],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_component_changes_single_active`);
    await queryRunner.query(
      `ALTER TABLE component_changes
        DROP COLUMN IF EXISTS store_issue_id,
        DROP COLUMN IF EXISTS disposition_type,
        DROP COLUMN IF EXISTS disposition_note,
        DROP COLUMN IF EXISTS closed_at`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS machine_component_items`);
  }
}