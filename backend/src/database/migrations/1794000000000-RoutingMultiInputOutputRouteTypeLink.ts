import { MigrationInterface, QueryRunner } from 'typeorm';

export class RoutingMultiInputOutputRouteTypeLink1794000000000 implements MigrationInterface {
  name = 'RoutingMultiInputOutputRouteTypeLink1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── routing_operation_inputs ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS routing_operation_inputs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        routing_operation_id UUID NOT NULL REFERENCES routing_operations(id) ON DELETE CASCADE,
        item_id UUID NOT NULL REFERENCES items(id),
        quantity DECIMAL(19,4) NOT NULL DEFAULT 0,
        uom_id UUID REFERENCES uoms(id),
        source_warehouse_id UUID REFERENCES warehouses(id),
        scrap_basis VARCHAR(20) NOT NULL DEFAULT 'WITH_SCRAP',
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        line_number INTEGER NOT NULL DEFAULT 10,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by UUID,
        updated_by UUID,
        is_active BOOLEAN DEFAULT TRUE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_routing_operation_inputs_operation
      ON routing_operation_inputs (routing_operation_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_routing_operation_inputs_item
      ON routing_operation_inputs (item_id)
    `);

    // ── routing_operation_outputs ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS routing_operation_outputs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        routing_operation_id UUID NOT NULL REFERENCES routing_operations(id) ON DELETE CASCADE,
        item_id UUID NOT NULL REFERENCES items(id),
        quantity DECIMAL(19,4) NOT NULL DEFAULT 0,
        uom_id UUID REFERENCES uoms(id),
        output_type VARCHAR(20) NOT NULL DEFAULT 'MAIN',
        yield_percentage DECIMAL(7,2) NOT NULL DEFAULT 100,
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        line_number INTEGER NOT NULL DEFAULT 10,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by UUID,
        updated_by UUID,
        is_active BOOLEAN DEFAULT TRUE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_routing_operation_outputs_operation
      ON routing_operation_outputs (routing_operation_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_routing_operation_outputs_item
      ON routing_operation_outputs (item_id)
    `);

    // ── route_type_id on production_routings (classification link) ─────────────
    const hasRouteTypeCol = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='production_routings' AND column_name='route_type_id'`,
    );
    if (hasRouteTypeCol.length === 0) {
      await queryRunner.query(`ALTER TABLE production_routings ADD COLUMN route_type_id UUID REFERENCES route_types(id)`);
    }

    // ── entry_kind / source_warehouse on production_entry_items ───────────────
    const hasKindCol = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='production_entry_items' AND column_name='entry_kind'`,
    );
    if (hasKindCol.length === 0) {
      await queryRunner.query(
        `ALTER TABLE production_entry_items ADD COLUMN entry_kind VARCHAR(20) NOT NULL DEFAULT 'OUTPUT'`,
      );
    }
    const hasSrcWhCol = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='production_entry_items' AND column_name='source_warehouse_id'`,
    );
    if (hasSrcWhCol.length === 0) {
      await queryRunner.query(
        `ALTER TABLE production_entry_items ADD COLUMN source_warehouse_id UUID REFERENCES warehouses(id)`,
      );
    }

    // ── Backfill: preserve every existing 1:1 input/output as junction rows ───
    // Backward-compatible migration: no legacy data is deleted; the primary
    // input/output rows mirror the legacy input_item_id/output_item_id columns.
    await queryRunner.query(`
      INSERT INTO routing_operation_inputs
        (company_id, routing_operation_id, item_id, quantity, uom_id,
         scrap_basis, is_primary, line_number, created_at, updated_at)
      SELECT o.company_id, o.id, o.input_item_id, o.input_quantity, o.uom_id,
             'WITH_SCRAP', TRUE, 10, NOW(), NOW()
      FROM routing_operations o
      WHERE o.input_item_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM routing_operation_inputs i
          WHERE i.routing_operation_id = o.id AND i.is_primary = TRUE
        )
    `);

    await queryRunner.query(`
      INSERT INTO routing_operation_outputs
        (company_id, routing_operation_id, item_id, quantity, uom_id,
         output_type, yield_percentage, is_primary, line_number, created_at, updated_at)
      SELECT o.company_id, o.id, o.output_item_id, o.output_quantity, o.uom_id,
             'MAIN', 100, TRUE, 10, NOW(), NOW()
      FROM routing_operations o
      WHERE o.output_item_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM routing_operation_outputs o2
          WHERE o2.routing_operation_id = o.id AND o2.is_primary = TRUE
        )
    `);

    // Backfill route_type_id from the legacy item route_type code when it can be
    // matched to a route type master record of the same company.
    await queryRunner.query(`
      UPDATE production_routings r SET route_type_id = rt.id
      FROM items i
      JOIN route_types rt ON rt.company_id = i.company_id AND rt.route_code = i.route_type
      WHERE r.product_id = i.id AND i.route_type IS NOT NULL AND r.route_type_id IS NULL
    `);

    // ── Permissions: routing operation reorder + duplicate ────────────────────
    const perms = [
      ['manufacturing.routing_operation.reorder', 'Reorder Routing Operation'],
      ['manufacturing.routing_operation.duplicate', 'Duplicate Routing Operation'],
    ];
    for (const [code, name] of perms) {
      await queryRunner.query(
        `INSERT INTO permissions (permission_code, name, resource, action, module, status)
         VALUES ($1,$2,'routing_operation',$3,'manufacturing','ACTIVE')
         ON CONFLICT (permission_code) DO NOTHING`,
        [code, name, code.replace('manufacturing.routing_operation.', '')],
      );
    }
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
      WHERE r.role_code IN ('SUPER_ADMIN','PRODUCTION')
        AND p.permission_code IN (
          'manufacturing.routing_operation.reorder',
          'manufacturing.routing_operation.duplicate'
        ) AND p.status='ACTIVE'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS routing_operation_outputs`);
    await queryRunner.query(`DROP TABLE IF EXISTS routing_operation_inputs`);
    await queryRunner.query(`ALTER TABLE production_routings DROP COLUMN IF EXISTS route_type_id`);
    await queryRunner.query(`ALTER TABLE production_entry_items DROP COLUMN IF EXISTS source_warehouse_id`);
    await queryRunner.query(`ALTER TABLE production_entry_items DROP COLUMN IF EXISTS entry_kind`);
    await queryRunner.query(`
      DELETE FROM role_permissions WHERE permission_id IN (
        SELECT id FROM permissions
        WHERE permission_code IN (
          'manufacturing.routing_operation.reorder',
          'manufacturing.routing_operation.duplicate'
        )
      )
    `);
    await queryRunner.query(`
      DELETE FROM permissions
      WHERE permission_code IN (
        'manufacturing.routing_operation.reorder',
        'manufacturing.routing_operation.duplicate'
      )
    `);
  }
}