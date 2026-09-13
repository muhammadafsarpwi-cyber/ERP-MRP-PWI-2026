import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Item Type master migration.
 *
 * - Creates the company-scoped `item_types` master table.
 * - Seeds the UNION of the canonical enum item types AND the real-world legacy
 *   values list (Raw Material, Bobbin, Equipment, Consumable, Stationery,
 *   Stationery/Tag, Electrical, Chain, Sanitary Fitting, Mech. Fittings, Belt,
 *   Bearing, Seal, Mech.Spare, Sanitary Fittings, Tools) for every company, so
 *   the master always contains both the standard hierarchy and the requested
 *   classifications. SANITARY_FITTING and SANITARY_FITTINGS stay separate rows.
 * - Dynamically inserts any other distinct `items.item_type` value found in the
 *   live data, guaranteeing a 1:1 backfill with zero data loss.
 * - Adds the authoritative `items.item_type_id` FK (source of truth), while the
 *   legacy `items.item_type` VARCHAR is kept in sync for backward compatibility.
 * - Drops the legacy static CHECK constraint so admin-created types like REWORK
 *   work without further migrations.
 * - Seeds item_type.* permissions for SUPER_ADMIN, PRODUCTION and ADMIN roles.
 */
export class CreateItemTypeMaster1798000000000 implements MigrationInterface {
  name = 'CreateItemTypeMaster1798000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS item_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        code VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by UUID,
        updated_by UUID,
        is_active BOOLEAN DEFAULT TRUE,
        UNIQUE(company_id, code)
      )
    `);

    const hasCol = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='items' AND column_name='item_type_id'`,
    );
    if (hasCol.length === 0) {
      await queryRunner.query(`ALTER TABLE items ADD COLUMN item_type_id UUID`);
    }

    // Seed the standard master (canonical enum order + the real-world legacy
    // value list) for EVERY company so the master exists regardless of whether a
    // company currently has items.
    const seeds: Array<[string, string, string, number]> = [
      ['RAW_MATERIAL', 'Raw Material', 'Raw materials and inputs', 1],
      ['WORK_IN_PROGRESS', 'Work in Progress', 'Work in progress items', 2],
      ['SEMI_FINISHED', 'Semi-Finished', 'Semi-finished goods', 3],
      ['FINISHED_GOOD', 'Finished Good', 'Finished products ready for sale', 4],
      ['PACKAGING_MATERIAL', 'Packaging Material', 'Packaging materials', 5],
      ['CONSUMABLE', 'Consumable', 'Consumable items', 6],
      ['SPARE_PART', 'Spare Part', 'Spare parts', 7],
      ['SERVICE', 'Service', 'Services', 8],
      ['ASSET', 'Asset', 'Assets', 9],
      ['OTHER', 'Other', 'Other item types', 10],
      ['BOBBIN', 'Bobbin', '', 11],
      ['EQUIPMENT', 'Equipment', '', 12],
      ['STATIONERY', 'Stationery', '', 13],
      ['STATIONERY_TAG', 'Stationery/Tag', '', 14],
      ['ELECTRICAL', 'Electrical', '', 15],
      ['CHAIN', 'Chain', '', 16],
      ['SANITARY_FITTING', 'Sanitary Fitting', '', 17],
      ['MECH_FITTINGS', 'Mech. Fittings', '', 18],
      ['BELT', 'Belt', '', 19],
      ['BEARING', 'Bearing', '', 20],
      ['SEAL', 'Seal', '', 21],
      ['MECH_SPARE', 'Mech. Spare', '', 22],
      ['SANITARY_FITTINGS', 'Sanitary Fittings', '', 23],
      ['TOOLS', 'Tools', '', 24],
    ];
    for (const [code, name, desc, sortOrder] of seeds) {
      await queryRunner.query(
        `INSERT INTO item_types (company_id, code, name, description, sort_order, status, created_at, updated_at, is_active)
         SELECT c.id, $1, $2, $3, $4, 'ACTIVE', NOW(), NOW(), TRUE FROM companies c
         ON CONFLICT (company_id, code) DO NOTHING`,
        [code, name, desc, sortOrder],
      );
    }

    // Dynamically add any historical `items.item_type` value not covered by the
    // seed list (data safety net — guarantees every existing item backfills
    // 1:1 with its own master row).
    const orphans = await queryRunner.query(
      `SELECT DISTINCT item_type FROM items WHERE item_type IS NOT NULL AND TRIM(item_type) <> ''`,
    );
    for (const row of orphans) {
      const code = String(row.item_type).trim().toUpperCase();
      await queryRunner.query(
        `INSERT INTO item_types (company_id, code, name, sort_order, status, created_at, updated_at, is_active)
         SELECT c.id, $1, $1, 100, 'ACTIVE', NOW(), NOW(), TRUE FROM companies c
         ON CONFLICT (company_id, code) DO NOTHING`,
        [code],
      );
    }

    // Backfill the authoritative item_type_id from the master code.
    await queryRunner.query(`
      UPDATE items i SET item_type_id = it.id
      FROM item_types it
      WHERE it.company_id = i.company_id AND it.code = i.item_type AND i.item_type_id IS NULL
    `);

    // Data-integrity guard: throw if any item remains unmapped (rolls back the
    // whole migration — the master must cover every existing classification).
    const unmapped = await queryRunner.query(
      `SELECT COUNT(*)::int AS c FROM items WHERE item_type_id IS NULL`,
    );
    if (Number(unmapped?.[0]?.c ?? 0) > 0) {
      throw new Error(`Item type backfill incomplete: ${unmapped[0].c} items have no item_type_id`);
    }

    // Index + FK so item types behave like the route types master.
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_items_item_type_id ON items(item_type_id)`);
    await queryRunner.query(`
      ALTER TABLE items DROP CONSTRAINT IF EXISTS fk_items_item_type
    `);
    await queryRunner.query(`
      ALTER TABLE items ADD CONSTRAINT fk_items_item_type
      FOREIGN KEY (item_type_id) REFERENCES item_types(id)
    `);

    // Drop the legacy static CHECK constraints so admin-created types (REWORK,
    // etc.) work without further migrations.
    await queryRunner.query(`ALTER TABLE items DROP CONSTRAINT IF EXISTS ck_items_item_type`);
    await queryRunner.query(`ALTER TABLE items DROP CONSTRAINT IF EXISTS items_item_type_check`);

    // Permissions
    const perms: Array<[string, string]> = [
      ['item_type.create', 'Create Item Type'],
      ['item_type.view', 'View Item Types'],
      ['item_type.update', 'Update Item Type'],
      ['item_type.activate', 'Activate Item Type'],
      ['item_type.deactivate', 'Deactivate Item Type'],
    ];
    for (const [code, name] of perms) {
      await queryRunner.query(
        `INSERT INTO permissions (permission_code, name, resource, action, module, status)
         VALUES ($1, $2, 'item_type', $3, 'item', 'ACTIVE')
         ON CONFLICT (permission_code) DO NOTHING`,
        [code, name, code.replace('item_type.', '')],
      );
    }
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
      WHERE r.role_code IN ('SUPER_ADMIN','PRODUCTION','ADMIN')
        AND p.permission_code LIKE 'item_type.%' AND p.status='ACTIVE'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE items DROP CONSTRAINT IF EXISTS fk_items_item_type`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_items_item_type_id`);
    await queryRunner.query(`
      ALTER TABLE items ADD CONSTRAINT ck_items_item_type CHECK (
        item_type IN ('RAW_MATERIAL','WORK_IN_PROGRESS','SEMI_FINISHED','FINISHED_GOOD',
        'PACKAGING_MATERIAL','CONSUMABLE','SPARE_PART','SERVICE','ASSET','OTHER')
      )
    `);
    await queryRunner.query(`ALTER TABLE items DROP COLUMN IF EXISTS item_type_id`);
    await queryRunner.query(`
      DELETE FROM role_permissions WHERE permission_id IN (
        SELECT id FROM permissions WHERE permission_code LIKE 'item_type.%'
      )
    `);
    await queryRunner.query(`DELETE FROM permissions WHERE permission_code LIKE 'item_type.%'`);
    await queryRunner.query(`DROP TABLE IF EXISTS item_types`);
  }
}