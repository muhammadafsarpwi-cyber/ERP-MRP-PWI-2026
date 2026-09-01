import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRouteTypeMaster1789000000000 implements MigrationInterface {
  name = 'AddRouteTypeMaster1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Route types master table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS route_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        route_code VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by UUID,
        updated_by UUID,
        is_active BOOLEAN DEFAULT TRUE,
        UNIQUE(company_id, route_code)
      )
    `);

    // Add route_type_id to items
    const hasCol = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='items' AND column_name='route_type_id'`,
    );
    if (hasCol.length === 0) {
      await queryRunner.query(`ALTER TABLE items ADD COLUMN route_type_id UUID`);
    }

    // Seed initial route types for every company present in items
    const companies = await queryRunner.query(`SELECT DISTINCT company_id FROM items`);
    const routes = [
      ['CONTROL_CABLE', 'Control Cable', 'Manufacturing route for motorcycle control cables'],
      ['SPOKE', 'Spoke', 'Manufacturing route for motorcycle/bicycle spokes'],
      ['CCD', 'CCD (Control Cable Division)', 'Legacy route type - Control Cable Division'],
      ['STANDARD_SPD', 'Standard SPD', 'Legacy route type - Standard Spoke Division'],
      ['NIPPLE', 'Nipple', 'Legacy route type - Nipple manufacturing'],
      ['DIRECT_SPOKE', 'Direct Spoke', 'Legacy route type - Direct spoke production'],
      ['CUSTOM', 'Custom', 'Custom manufacturing route'],
    ];
    for (const row of companies) {
      for (const [code, name, desc] of routes) {
        await queryRunner.query(
          `INSERT INTO route_types (company_id, route_code, name, description) VALUES ($1,$2,$3,$4)
           ON CONFLICT (company_id, route_code) DO NOTHING`,
          [row.company_id, code, name, desc],
        );
      }
    }

    // Backfill route_type_id from existing route_type codes
    await queryRunner.query(`
      UPDATE items i SET route_type_id = rt.id
      FROM route_types rt
      WHERE rt.route_code = i.route_type AND i.route_type IS NOT NULL AND i.route_type_id IS NULL
    `);

    // Seed missing business categories (per company)
    const catSeeds = [
      ['CAT-RAW-HCS', 'High Carbon Steel Wire', 'High carbon steel wire for cable and spoke manufacturing', 'CAT-RAW-MET'],
      ['CAT-FIN-CC', 'Control Cable', 'Finished control cable products', 'CAT-FIN'],
      ['CAT-FIN-SPK', 'Spoke / Bike Spoke', 'Finished spoke products for motorcycles and bicycles', 'CAT-FIN'],
      ['CAT-RAW-PVC', 'PVC Raw Material', 'PVC compound and related raw materials', 'CAT-RAW-PLST'],
    ];
    const catCompanies = await queryRunner.query(`SELECT DISTINCT company_id FROM item_categories`);
    for (const row of catCompanies) {
      for (const [code, name, desc, parentCode] of catSeeds) {
        const parent = await queryRunner.query(
          `SELECT id FROM item_categories WHERE category_code=$1 AND company_id=$2`,
          [parentCode, row.company_id],
        );
        if (parent.length === 0) continue;
        await queryRunner.query(
          `INSERT INTO item_categories (company_id, category_code, name, description, parent_category_id, status)
           VALUES ($1,$2,$3,$4,$5,'ACTIVE')
           ON CONFLICT DO NOTHING`,
          [row.company_id, code, name, desc, parent[0].id],
        );
      }
    }

    // Permissions
    const perms = [
      ['item_route_type.create', 'Create Route Type'],
      ['item_route_type.view', 'View Route Types'],
      ['item_route_type.update', 'Update Route Type'],
      ['item_route_type.activate', 'Activate Route Type'],
      ['item_route_type.deactivate', 'Deactivate Route Type'],
    ];
    for (const [code, name] of perms) {
      await queryRunner.query(
        `INSERT INTO permissions (permission_code, name, resource, action, module, status)
         VALUES ($1,$2,'item_route_type', $3,'item','ACTIVE')
         ON CONFLICT (permission_code) DO NOTHING`,
        [code, name, code.replace('item_route_type.', '')],
      );
    }
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
      WHERE r.role_code IN ('SUPER_ADMIN','PRODUCTION')
        AND p.permission_code LIKE 'item_route_type.%' AND p.status='ACTIVE'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE items DROP COLUMN IF EXISTS route_type_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS route_types`);
  }
}