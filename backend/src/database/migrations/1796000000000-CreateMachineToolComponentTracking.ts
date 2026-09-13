import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TASK25 - Machine Tool & Component Change Tracking
 *
 * Adds two business tables behind the ERP's standard BaseEntity audit columns:
 *   machine_components  - tool / component / die / mould / chain master per
 *                         machine, with expected life in quantity-of-products
 *                         (uom-scoped) and optional item-master linkage.
 *   component_changes   - replacement transactions (old -> new) with machine
 *                         production counter snapshots. RUN THIS AFTER a
 *                         machine-master seed so the demo rows can reference
 *                         FT-01 / SP-01 / BL-01 by machine_code.
 *
 * Permissions registered:
 *   manufacturing.tool_component.view / create / update / delete
 *   manufacturing.component_change.view / create / update / delete
 *   manufacturing.tool_consumption.report
 *
 * Demo data is clearly identifiable (DEMO- prefixed tool codes) and references
 * real machines; the counters match the TASK25 acceptance example, so the
 * "Production Since Previous" figure can be eyeballed directly in the UI.
 * All inserts are idempotent.
 */
export class CreateMachineToolComponentTracking1796000000000 implements MigrationInterface {
  name = 'CreateMachineToolComponentTracking1796000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Tables ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS machine_components (
        id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id              uuid NOT NULL REFERENCES companies(id),
        machine_id              uuid NOT NULL REFERENCES machines(id),
        item_id                 uuid NULL REFERENCES items(id),
        uom_id                  uuid NULL REFERENCES uoms(id),
        component_type          varchar(30) NOT NULL DEFAULT 'COMPONENT',
        component_name          varchar(255) NOT NULL,
        component_code          varchar(120) NOT NULL,
        expected_life_quantity  numeric(19,4) NULL,
        min_threshold           numeric(19,4) NULL,
        max_threshold           numeric(19,4) NULL,
        description             text NULL,
        created_at              timestamptz NOT NULL DEFAULT now(),
        updated_at              timestamptz NOT NULL DEFAULT now(),
        created_by              uuid NULL,
        updated_by              uuid NULL,
        is_active               boolean NOT NULL DEFAULT TRUE
      )
    `);
    await queryRunner.query(`
      COMMENT ON TABLE machine_components IS
        'TASK25 - Machine tool / component / die / mould / chain master tracked per machine'
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_machine_components_active_code
        ON machine_components (company_id, machine_id, component_code)
        WHERE is_active = TRUE
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_machine_components_company ON machine_components (company_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_machine_components_machine ON machine_components (machine_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_machine_components_type ON machine_components (component_type)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_machine_components_item ON machine_components (item_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS component_changes (
        id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id                  uuid NOT NULL REFERENCES companies(id),
        machine_id                  uuid NOT NULL REFERENCES machines(id),
        component_id                uuid NOT NULL REFERENCES machine_components(id),
        job_card_id                 uuid NULL REFERENCES maintenance_job_cards(id),
        old_tool_code               varchar(120) NULL,
        new_tool_code               varchar(120) NOT NULL,
        new_tool_description        varchar(255) NULL,
        change_date                 date NOT NULL,
        change_time                 time NULL,
        production_counter_before   numeric(19,4) NULL,
        production_counter_after    numeric(19,4) NULL,
        production_since_previous   numeric(19,4) NULL,
        reason                      varchar(255) NULL,
        condition_status            varchar(30) NULL,
        remarks                     text NULL,
        changed_at                  timestamptz NOT NULL DEFAULT now(),
        changed_by                  uuid NULL,
        created_at                  timestamptz NOT NULL DEFAULT now(),
        updated_at                  timestamptz NOT NULL DEFAULT now(),
        created_by                  uuid NULL,
        updated_by                  uuid NULL,
        is_active                   boolean NOT NULL DEFAULT TRUE,
        CONSTRAINT uq_component_changes_change UNIQUE (component_id, new_tool_code, change_date)
      )
    `);
    await queryRunner.query(`
      COMMENT ON TABLE component_changes IS
        'TASK25 - Machine tool / component replacement transactions with production counter snapshots'
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_component_changes_company ON component_changes (company_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_component_changes_machine ON component_changes (machine_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_component_changes_component ON component_changes (component_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_component_changes_change_date ON component_changes (change_date)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_component_changes_machine_component_date
         ON component_changes (machine_id, component_id, change_date)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_component_changes_condition_status ON component_changes (condition_status)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_component_changes_job_card ON component_changes (job_card_id)`,
    );

    // ── Permissions ───────────────────────────────────────────────────────────
    const perms: Array<[string, string, string]> = [
      ['manufacturing.tool_component.view', 'View Machine Tools & Components', 'view'],
      ['manufacturing.tool_component.create', 'Create Machine Tools & Components', 'create'],
      ['manufacturing.tool_component.update', 'Update Machine Tools & Components', 'update'],
      ['manufacturing.tool_component.delete', 'Delete Machine Tools & Components', 'delete'],
      ['manufacturing.component_change.view', 'View Component Changes', 'view'],
      ['manufacturing.component_change.create', 'Record Component Changes', 'create'],
      ['manufacturing.component_change.update', 'Update Component Changes', 'update'],
      ['manufacturing.component_change.delete', 'Delete Component Changes', 'delete'],
      ['manufacturing.tool_consumption.report', 'View Monthly Tool Consumption Report', 'report'],
    ];
    for (const [code, name, action] of perms) {
      await queryRunner.query(
        `INSERT INTO permissions (permission_code, name, resource, action, module, status)
         VALUES ($1,$2,'machine_tool_component',$3,'manufacturing','ACTIVE')
         ON CONFLICT (permission_code) DO NOTHING`,
        [code, name, action],
      );
    }
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
      WHERE r.role_code IN ('SUPER_ADMIN','PRODUCTION','MAINTENANCE')
        AND p.permission_code IN (
          'manufacturing.tool_component.view',
          'manufacturing.tool_component.create',
          'manufacturing.tool_component.update',
          'manufacturing.tool_component.delete',
          'manufacturing.component_change.view',
          'manufacturing.component_change.create',
          'manufacturing.component_change.update',
          'manufacturing.component_change.delete',
          'manufacturing.tool_consumption.report'
        ) AND p.status='ACTIVE'
      ON CONFLICT DO NOTHING
    `);

    // ── Demo data ─────────────────────────────────────────────────────────────
    const compRows = await queryRunner.query(`SELECT id FROM companies LIMIT 1`);
    const CID = compRows[0]?.id;
    if (!CID) return;

    const one = async (sql: string, values: unknown[]): Promise<string | null> => {
      const rows = await queryRunner.query(sql, values);
      return rows[0]?.id ?? null;
    };

    const uomPcs = await one(`SELECT id FROM uoms WHERE code = 'PCS' LIMIT 1`, []);
    if (!uomPcs) return;

    const findMachine = async (code: string): Promise<string | null> =>
      one(
        `SELECT m.id FROM machines m WHERE m.company_id = $1 AND m.machine_code = $2
          AND m.status = 'ACTIVE' LIMIT 1`,
        [CID, code],
      );
    const FT01 = await findMachine('FT-01');
    const SP01 = await findMachine('SP-01');
    const BL01 = await findMachine('BL-01');

    // Optional item-master linkage — one representative finished item per machine
    // machine so the UI's "linked item" column has a real value. Falls back to
    // NULL when the demo item is not present (no fabricated API data).
    const findItemByCode = async (code: string): Promise<string | null> =>
      one(`SELECT id FROM items WHERE item_code = $1 LIMIT 1`, [code]);
    const itemFT = await findItemByCode('FG-CASING-001');
    const itemSP = await findItemByCode('WIP-SP-001');
    const itemBL = await findItemByCode('WIP-FLAT-001');

    const insertComponent = async (
      machineId: string | null,
      code: string,
      name: string,
      type: string,
      expectedLife: string,
      minT: string,
      maxT: string,
      itemId: string | null,
    ): Promise<string | null> => {
      if (!machineId) return null;
      const existing = await one(
        `SELECT id FROM machine_components WHERE company_id = $1 AND machine_id = $2 AND component_code = $3 AND is_active = TRUE LIMIT 1`,
        [CID, machineId, code],
      );
      if (existing) return existing;
      await queryRunner.query(
        `INSERT INTO machine_components
          (company_id, machine_id, item_id, uom_id, component_type, component_name,
           component_code, expected_life_quantity, min_threshold, max_threshold,
           description, created_at, updated_at, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                 $11, NOW(), NOW(), TRUE)`,
        [CID, machineId, itemId, uomPcs, type, name, code, expectedLife, minT, maxT,
         `DEMO DATA - ${name} tracked per machine`],
      );
      return one(
        `SELECT id FROM machine_components WHERE company_id = $1 AND machine_id = $2 AND component_code = $3 LIMIT 1`,
        [CID, machineId, code],
      );
    };

    const ftDie = await insertComponent(FT01, 'FT-DIE-001', 'Fine Blanking Die', 'DIE', '200000.0000', '10000.0000', '750000.0000', itemFT);
    const ftRoll = await insertComponent(FT01, 'FT-ROLL-001', 'Flattening Roller Set', 'TOOL', '300000.0000', '20000.0000', '900000.0000', null);
    const spChain = await insertComponent(SP01, 'SP-CHAIN-001', 'Spiral Chain Assembly', 'CHAIN', '400000.0000', '30000.0000', '1200000.0000', itemSP);
    const spRoll = await insertComponent(SP01, 'SP-ROLL-001', 'Spiral Winding Roller', 'TOOL', '250000.0000', '15000.0000', '800000.0000', null);
    const blBlade = await insertComponent(BL01, 'BL-BLADE-001', 'Cutting Blade', 'TOOL', '100000.0000', '5000.0000', '350000.0000', itemBL);

    const insertChange = async (
      machineId: string | null,
      componentId: string | null,
      oldCode: string | null,
      newCode: string,
      changeDate: string,
      counterBefore: string | null,
      counterAfter: string | null,
      sincePrevious: string | null,
      condition: string | null,
      reason: string | null,
    ): Promise<void> => {
      if (!machineId || !componentId) return;
      await queryRunner.query(
        `INSERT INTO component_changes
          (company_id, machine_id, component_id, old_tool_code, new_tool_code,
           new_tool_description, change_date, change_time,
           production_counter_before, production_counter_after, production_since_previous,
           reason, condition_status, remarks, changed_at, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, NOW(), TRUE)
         ON CONFLICT (component_id, new_tool_code, change_date) DO NOTHING`,
        [CID, machineId, componentId, oldCode, newCode, `DEMO - ${newCode}`, changeDate, '09:30',
         counterBefore, counterAfter, sincePrevious, reason, condition, `DEMO DATA - ${newCode}`],
      );
    };

    // FT-01 / FT-DIE-001 — mirrors the TASK25 acceptance example:
    //   Previous counter after install 125,000 ; removal read 178,500 → life 53,500
    await insertChange(FT01, ftDie, null, 'DEMO-FT-DIE-009', '2026-08-25', null, '125000.0000', null, null, 'Planned replacement');
    await insertChange(FT01, ftDie, 'DEMO-FT-DIE-009', 'DEMO-FT-DIE-010', '2026-09-02', '178500.0000', '178500.0000', '53500.0000', 'USED', 'Tool life reached');
    // SP-01 / SP-CHAIN-001 — two readings so the report shows avg/min/max life
    await insertChange(SP01, spChain, null, 'DEMO-SP-CHAIN-004', '2026-08-20', null, '800000.0000', null, null, 'Planned replacement');
    await insertChange(SP01, spChain, 'DEMO-SP-CHAIN-004', 'DEMO-SP-CHAIN-005', '2026-09-05', '965250.0000', '965250.0000', '165250.0000', 'USED', 'Preventive change');
    // BL-01 / BL-BLADE-001 — single change inside the report month
    await insertChange(BL01, blBlade, 'DEMO-BL-BLADE-004', 'DEMO-BL-BLADE-005', '2026-09-08', '41200.0000', '41200.0000', null, 'DAMAGED', 'Blade chipped');
    // FT-01 / FT-ROLL-001 — roller set replaced in month (counts toward qty used)
    await insertChange(FT01, ftRoll, null, 'DEMO-FT-ROLL-007', '2026-09-10', null, '120000.0000', null, null, 'Planned replacement');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions WHERE permission_id IN (
        SELECT id FROM permissions
        WHERE permission_code IN (
          'manufacturing.tool_component.view',
          'manufacturing.tool_component.create',
          'manufacturing.tool_component.update',
          'manufacturing.tool_component.delete',
          'manufacturing.component_change.view',
          'manufacturing.component_change.create',
          'manufacturing.component_change.update',
          'manufacturing.component_change.delete',
          'manufacturing.tool_consumption.report'
        )
      )
    `);
    await queryRunner.query(`
      DELETE FROM permissions
      WHERE permission_code IN (
        'manufacturing.tool_component.view',
        'manufacturing.tool_component.create',
        'manufacturing.tool_component.update',
        'manufacturing.tool_component.delete',
        'manufacturing.component_change.view',
        'manufacturing.component_change.create',
        'manufacturing.component_change.update',
        'manufacturing.component_change.delete',
        'manufacturing.tool_consumption.report'
      )
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS component_changes`);
    await queryRunner.query(`DROP TABLE IF EXISTS machine_components`);
  }
}