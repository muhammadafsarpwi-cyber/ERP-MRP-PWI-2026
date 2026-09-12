import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DEMO ONLY — never referenced by application logic.
 *
 * Seeds a single, clearly identifiable, fully user-configurable Control Cable
 * Casing (CCD) flow:
 *
 *   Route Type : CCD  ("Control Cable Casing", ACTIVE, DEMO)
 *   Routing    : RTG-CCD-001  ("DEMO - Control Cable Casing", ACTIVE)
 *   Items      : RM-WIRE-001   (1.20 mm B4 Wire      - PURCHASED / RAW_MATERIAL)
 *                WIP-FLAT-001  (Flat Wire             - MANUFACTURED)
 *                WIP-SP-001    (Spiral                - MANUFACTURED)
 *                FG-CASING-001 (PVC Casing            - MANUFACTURED)
 *                PACK-CASING-001 (Packed Casing       - MANUFACTURED)
 *   Operations :
 *       10 Flattening : RM-WIRE-001 100 KG -> WIP-FLAT-001 95 KG  (scrap 5%)
 *       20 Spiral     : WIP-FLAT-001 95 KG -> WIP-SP-001 93 KG    (scrap 2%)
 *       30 PVC        : WIP-SP-001 93 KG  -> FG-CASING-001 92 KG  (scrap 1%)
 *       40 Packing    : FG-CASING-001 92 KG -> PACK-CASING-001 92 KG (scrap 0%)
 *
 * These names/quantities are DEMO DATA ONLY. The production engine must not
 * depend on them. All inserts are idempotent (WHERE NOT EXISTS by natural key).
 */
export class SeedRoutingIOTopology1795000000000 implements MigrationInterface {
  name = 'SeedRoutingIOTopology1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const compRows = await queryRunner.query(`SELECT id FROM companies LIMIT 1`);
    const CID = compRows[0]?.id;
    if (!CID) return;

    const one = async (sql: string, values: unknown[]): Promise<string | null> => {
      const rows = await queryRunner.query(sql, values);
      return rows[0]?.id ?? null;
    };

    const UOM_KG = await one(`SELECT id FROM uoms WHERE code = 'KG' LIMIT 1`, []);
    if (!UOM_KG) return;

    const findDept = async (code: string) => one(
      `SELECT id FROM departments WHERE department_code = $1 LIMIT 1`, [code],
    );
    const DEPT_FLT = await findDept('CCD-DEPT001');
    const DEPT_SPR = await findDept('CCD-DEPT002');
    const DEPT_PVC = await findDept('CCD-DEPT003');
    const DEPT_PCK = await findDept('CCD-DEPT004');

    const catRawMet = await one(
      `SELECT id FROM item_categories WHERE category_code = 'CAT-RAW-MET' AND company_id = $1 LIMIT 1`, [CID],
    );
    const catFinMech = await one(
      `SELECT id FROM item_categories WHERE category_code = 'CAT-FIN-MECH' AND company_id = $1 LIMIT 1`, [CID],
    );

    // ── Route Type (classification only — purely data) ──────────────────────
    const rtId = await one(
      `SELECT id FROM route_types WHERE company_id = $1 AND route_code = 'CCD' LIMIT 1`, [CID],
    );
    if (!rtId) {
      await queryRunner.query(
        `INSERT INTO route_types (company_id, route_code, name, description, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), NOW())`,
        [CID, 'CCD', 'Control Cable Casing', 'DEMO - Configurable control cable casing manufacturing route type'],
      );
    }
    const ccdRouteTypeId = await one(
      `SELECT id FROM route_types WHERE company_id = $1 AND route_code = 'CCD' LIMIT 1`, [CID],
    );
    if (!ccdRouteTypeId) return;

    // ── Demo Items ───────────────────────────────────────────────────────────
    const insertItem = async (
      code: string, name: string, type: string,
      deptId: string | null, catId: string | null,
      opts: Record<string, unknown> = {},
    ): Promise<string | null> => {
      const existing = await one(`SELECT id FROM items WHERE item_code = $1 LIMIT 1`, [code]);
      if (existing) return existing;
      const cols: Record<string, unknown> = {
        company_id: CID, item_code: code, name, item_type: type, status: 'ACTIVE',
        base_uom_id: UOM_KG, division_id: null, section_id: null, department_id: deptId,
        category_id: catId, track_inventory: true, batch_tracked: false, serial_tracked: false,
        expiry_tracked: false, is_manufacturable: type !== 'RAW_MATERIAL',
        is_purchasable: type === 'RAW_MATERIAL', is_sellable: type === 'FINISHED_GOOD',
        is_stock_item: true, created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(), ...opts,
      };
      const keys = Object.keys(cols);
      const vals = keys.map((k) => cols[k]);
      const ph = keys.map((_, i) => `$${i + 1}`);
      await queryRunner.query(
        `INSERT INTO items (${keys.join(',')}) VALUES (${ph.join(',')})`, vals,
      );
      return one(`SELECT id FROM items WHERE item_code = $1 LIMIT 1`, [code]);
    };

    const rmWire = await insertItem(
      'RM-WIRE-001', '1.20 mm B4 Wire', 'RAW_MATERIAL', DEPT_FLT, catRawMet,
      { description: 'B4 wire entering wire flattening', notes: 'DEMO DATA - purchased raw material' },
    );
    const wipFlat = await insertItem(
      'WIP-FLAT-001', 'Flat Wire', 'SEMI_FINISHED', DEPT_FLT, catRawMet,
      { description: 'Output of wire flattening', notes: 'DEMO DATA - manufactured WIP' },
    );
    const wipSpiral = await insertItem(
      'WIP-SP-001', 'Spiral', 'SEMI_FINISHED', DEPT_SPR, catRawMet,
      { description: 'Spiral wound intermediate', notes: 'DEMO DATA - manufactured WIP' },
    );
    const fgCasing = await insertItem(
      'FG-CASING-001', 'PVC Casing', 'FINISHED_GOOD', DEPT_PVC, catFinMech,
      { description: 'Finished PVC casing', notes: 'DEMO DATA - manufactured finished good' },
    );
    const packCasing = await insertItem(
      'PACK-CASING-001', 'Packed Casing', 'FINISHED_GOOD', DEPT_PCK, catFinMech,
      { description: 'Packed casing ready for despatch', notes: 'DEMO DATA - manufactured finished good' },
    );
    if (!rmWire || !wipFlat || !wipSpiral || !fgCasing || !packCasing) return;

    // ── Routing (header) ─────────────────────────────────────────────────────
    const rtgId = await one(
      `SELECT id FROM production_routings WHERE routing_code = 'RTG-CCD-001' LIMIT 1`, [],
    );
    if (!rtgId) {
      await queryRunner.query(
        `INSERT INTO production_routings
          (company_id, routing_code, name, description, product_id, route_type_id,
           status, base_quantity, estimated_total_time, is_default, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', 1, 0, FALSE, NOW(), NOW())`,
        [CID, 'RTG-CCD-001', 'DEMO - Control Cable Casing',
         'DEMO - User-configurable wire flattening, spiral, PVC and packing flow',
         fgCasing, ccdRouteTypeId],
      );
    }
    const rtgId2 = await one(
      `SELECT id FROM production_routings WHERE routing_code = 'RTG-CCD-001' LIMIT 1`, [],
    );
    if (!rtgId2) return;

    // ── Operations ───────────────────────────────────────────────────────────
    const insertOp = async (
      sequenceNo: number, code: string, name: string,
      deptId: string | null, inputItemId: string | null, outputItemId: string | null,
      inQty: string, outQty: string, scrapPct: string,
    ): Promise<string | null> => {
      const existing = await one(
        `SELECT o.id FROM routing_operations o WHERE o.routing_id = $1 AND o.operation_code = $2 LIMIT 1`,
        [rtgId2, code],
      );
      if (existing) return existing;
      await queryRunner.query(
        `INSERT INTO routing_operations
          (company_id, routing_id, sequence_no, operation_code, operation_name,
           division_id, section_id, department_id, setup_time_minutes, run_time_minutes,
           queue_time_minutes, wait_time_minutes, labor_required, machine_required,
           input_item_id, output_item_id, input_quantity, output_quantity, uom_id,
           scrap_percentage, setup_scrap_percentage, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NULL, NULL, $6,
                 0, 0, 0, 0, TRUE, FALSE,
                 $7, $8, $9, $10, $11,
                 $12, 0, 'ACTIVE', NOW(), NOW())`,
        [CID, rtgId2, sequenceNo, code, name, deptId, inputItemId, outputItemId,
         inQty, outQty, UOM_KG, scrapPct],
      );
      return one(
        `SELECT o.id FROM routing_operations o WHERE o.routing_id = $1 AND o.operation_code = $2 LIMIT 1`,
        [rtgId2, code],
      );
    };

    const insertInput = async (
      opId: string, itemId: string, quantity: string, primary: boolean, lineNumber: number,
    ): Promise<void> => {
      await queryRunner.query(
        `INSERT INTO routing_operation_inputs
          (company_id, routing_operation_id, item_id, quantity, uom_id, source_warehouse_id,
           scrap_basis, is_primary, line_number, created_at, updated_at)
         SELECT $1, $2, $3, $4, $5, NULL, 'WITH_SCRAP', $6, $7, NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM routing_operation_inputs i
           WHERE i.routing_operation_id = $2 AND i.item_id = $3
         )`,
        [CID, opId, itemId, quantity, UOM_KG, primary, lineNumber],
      );
    };

    const insertOutput = async (
      opId: string, itemId: string, quantity: string, primary: boolean, lineNumber: number,
    ): Promise<void> => {
      await queryRunner.query(
        `INSERT INTO routing_operation_outputs
          (company_id, routing_operation_id, item_id, quantity, uom_id,
           output_type, yield_percentage, is_primary, line_number, created_at, updated_at)
         SELECT $1, $2, $3, $4, $5, 'MAIN', 100, $6, $7, NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM routing_operation_outputs o
           WHERE o.routing_operation_id = $2 AND o.item_id = $3
         )`,
        [CID, opId, itemId, quantity, UOM_KG, primary, lineNumber],
      );
    };

    // 10 — Flattening : RM-WIRE-001 100 KG → WIP-FLAT-001 95 KG (5% scrap)
    const op10 = await insertOp(10, 'OP-CCD-010', 'Flattening', DEPT_FLT, rmWire, wipFlat, '100.0000', '95.0000', '5.00');
    if (op10) {
      await insertInput(op10, rmWire, '100.0000', true, 10);
      await insertOutput(op10, wipFlat, '95.0000', true, 10);
    }

    // 20 — Spiral : WIP-FLAT-001 95 KG → WIP-SP-001 93 KG (2% scrap)
    const op20 = await insertOp(20, 'OP-CCD-020', 'Spiral', DEPT_SPR, wipFlat, wipSpiral, '95.0000', '93.0000', '2.00');
    if (op20) {
      await insertInput(op20, wipFlat, '95.0000', true, 10);
      await insertOutput(op20, wipSpiral, '93.0000', true, 10);
    }

    // 30 — PVC : WIP-SP-001 93 KG → FG-CASING-001 92 KG (1% scrap)
    const op30 = await insertOp(30, 'OP-CCD-030', 'PVC', DEPT_PVC, wipSpiral, fgCasing, '93.0000', '92.0000', '1.00');
    if (op30) {
      await insertInput(op30, wipSpiral, '93.0000', true, 10);
      await insertOutput(op30, fgCasing, '92.0000', true, 10);
    }

    // 40 — Packing : FG-CASING-001 92 KG → PACK-CASING-001 92 KG (0% scrap)
    const op40 = await insertOp(40, 'OP-CCD-040', 'Packing', DEPT_PCK, fgCasing, packCasing, '92.0000', '92.0000', '0.00');
    if (op40) {
      await insertInput(op40, fgCasing, '92.0000', true, 10);
      await insertOutput(op40, packCasing, '92.0000', true, 10);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM routing_operation_inputs
      WHERE routing_operation_id IN (
        SELECT o.id FROM routing_operations o
        JOIN production_routings r ON r.id = o.routing_id
        WHERE r.routing_code = 'RTG-CCD-001'
      )
    `);
    await queryRunner.query(`
      DELETE FROM routing_operation_outputs
      WHERE routing_operation_id IN (
        SELECT o.id FROM routing_operations o
        JOIN production_routings r ON r.id = o.routing_id
        WHERE r.routing_code = 'RTG-CCD-001'
      )
    `);
    await queryRunner.query(`
      DELETE FROM routing_operations WHERE routing_id IN (
        SELECT id FROM production_routings WHERE routing_code = 'RTG-CCD-001'
      )
    `);
    await queryRunner.query(`DELETE FROM production_routings WHERE routing_code = 'RTG-CCD-001'`);
    // Delete only the demo items this migration created (existing RM-WIRE-001 / WIP-SP-001 are left untouched).
    await queryRunner.query(
      `DELETE FROM items WHERE item_code IN ('WIP-FLAT-001', 'FG-CASING-001', 'PACK-CASING-001')
       AND notes ILIKE 'DEMO DATA%'`,
    );
    await queryRunner.query(`DELETE FROM route_types WHERE route_code = 'CCD'`);
  }
}