import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PROMPT-12/12A: Seed ~5 DEMO items for each of 12 production departments.
 * SPD spoke line (5 depts), SPD nipple line (3 depts), CCD cable line (4 depts).
 * Idempotent — skips inserts if DEMO-* items already exist.
 * Dynamically resolves Division/Section/Department UUIDs from the database.
 * Also fixes any existing DEMO items that have NULL organization fields.
 */
export class SeedDemoItemMaster1787550000000 implements MigrationInterface {
  name = 'SeedDemoItemMaster1787550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {

    // ── Resolve organization UUIDs dynamically from the database ────────────
    const resolveId = async (table: string, codeCol: string, codeVal: string): Promise<string> => {
      const rows = await queryRunner.query(
        `SELECT id FROM ${table} WHERE ${codeCol} = $1 LIMIT 1`, [codeVal],
      );
      if (!rows[0]?.id) throw new Error(`SeedDemoItemMaster: ${table} with ${codeCol}='${codeVal}' not found`);
      return rows[0].id;
    };

    // Divisions
    const SPD = await resolveId('divisions', 'division_code', 'SPD');
    const CCD = await resolveId('divisions', 'division_code', 'CCD');

    // Sections — resolve by section_code under the correct division
    const resolveSection = async (sectionCode: string, divisionId: string): Promise<string> => {
      const rows = await queryRunner.query(
        `SELECT id FROM sections WHERE section_code = $1 AND division_id = $2 LIMIT 1`,
        [sectionCode, divisionId],
      );
      if (!rows[0]?.id) throw new Error(`SeedDemoItemMaster: section '${sectionCode}' not found under division ${divisionId}`);
      return rows[0].id;
    };

    const SEC_SPOKE  = await resolveSection('SEC-010', SPD);
    const SEC_NIPPLE = await resolveSection('SEC-011', SPD);
    const SEC_PLT    = await resolveSection('SEC-012', SPD);
    const SEC_SPKPK  = await resolveSection('SEC-013', SPD);
    const SEC_SPIRAL = await resolveSection('SEC-015', CCD);
    const SEC_PVC    = await resolveSection('SEC-016', CCD);
    const SEC_CCDPK  = await resolveSection('SEC-017', CCD);

    // Departments — resolve by department_code
    const DEPT_STR   = await resolveId('departments', 'department_code', 'SPD-DEPT001');
    const DEPT_SWG   = await resolveId('departments', 'department_code', 'SPD-DEPT002');
    const DEPT_SPK   = await resolveId('departments', 'department_code', 'SPD-DEPT003');
    const DEPT_HDR   = await resolveId('departments', 'department_code', 'SPD-DEPT004');
    const DEPT_NPL   = await resolveId('departments', 'department_code', 'SPD-DEPT005');
    const DEPT_SPPL  = await resolveId('departments', 'department_code', 'SPD-DEPT006');
    const DEPT_NPLT  = await resolveId('departments', 'department_code', 'SPD-DEPT007');
    const DEPT_SPKPK = await resolveId('departments', 'department_code', 'SPD-DEPT008');
    const DEPT_FLT   = await resolveId('departments', 'department_code', 'CCD-DEPT001');
    const DEPT_SPR   = await resolveId('departments', 'department_code', 'CCD-DEPT002');
    const DEPT_PVC   = await resolveId('departments', 'department_code', 'CCD-DEPT003');
    const DEPT_CCDPK = await resolveId('departments', 'department_code', 'CCD-DEPT004');

    // UOMs — resolve by code
    const UOM_KG  = await resolveId('uoms', 'code', 'KG');
    const UOM_PCS = await resolveId('uoms', 'code', 'PCS');
    const UOM_M   = await resolveId('uoms', 'code', 'M');
    const UOM_EA  = await resolveId('uoms', 'code', 'EA');
    const UOM_BOX = await resolveId('uoms', 'code', 'BOX');

    // Categories — resolve by category_code
    const CAT_RAW_MET  = await resolveId('item_categories', 'category_code', 'CAT-RAW-MET');
    const CAT_FIN_MECH = await resolveId('item_categories', 'category_code', 'CAT-FIN-MECH');
    const CAT_FIN_ELEC = await resolveId('item_categories', 'category_code', 'CAT-FIN-ELEC');

    // Company — first company
    const compRows = await queryRunner.query(`SELECT id FROM companies LIMIT 1`);
    const CID = compRows[0]?.id;
    if (!CID) throw new Error('SeedDemoItemMaster: No company found');

    // ── Fix existing DEMO items with NULL org fields ────────────────────────
    // Maps: item_code prefix → { dept_code, sec_code, sec_div_code }
    const orgMap: Record<string, { deptCode: string; secCode: string; divCode: string }> = {
      'DEMO-RW-': { deptCode: 'SPD-DEPT001', secCode: 'SEC-010', divCode: 'SPD' },
      'DEMO-SW-': { deptCode: 'SPD-DEPT002', secCode: 'SEC-010', divCode: 'SPD' },
      'DEMO-SP-': { deptCode: 'SPD-DEPT003', secCode: 'SEC-010', divCode: 'SPD' },
      'DEMO-SPL-': { deptCode: 'SPD-DEPT006', secCode: 'SEC-012', divCode: 'SPD' },
      'DEMO-SPP-': { deptCode: 'SPD-DEPT008', secCode: 'SEC-013', divCode: 'SPD' },
      'DEMO-NR-': { deptCode: 'SPD-DEPT004', secCode: 'SEC-011', divCode: 'SPD' },
      'DEMO-NF-': { deptCode: 'SPD-DEPT005', secCode: 'SEC-011', divCode: 'SPD' },
      'DEMO-NPL-': { deptCode: 'SPD-DEPT007', secCode: 'SEC-012', divCode: 'SPD' },
      'DEMO-CW-': { deptCode: 'CCD-DEPT001', secCode: 'SEC-015', divCode: 'CCD' },
      'DEMO-CS-': { deptCode: 'CCD-DEPT002', secCode: 'SEC-015', divCode: 'CCD' },
      'DEMO-PC-': { deptCode: 'CCD-DEPT003', secCode: 'SEC-016', divCode: 'CCD' },
      'DEMO-CK-': { deptCode: 'CCD-DEPT004', secCode: 'SEC-017', divCode: 'CCD' },
    };

    // Build a code→id lookup for all org entities
    const orgIdLookup: Record<string, string> = {
      'SPD-DEPT001': DEPT_STR, 'SPD-DEPT002': DEPT_SWG, 'SPD-DEPT003': DEPT_SPK,
      'SPD-DEPT004': DEPT_HDR, 'SPD-DEPT005': DEPT_NPL, 'SPD-DEPT006': DEPT_SPPL,
      'SPD-DEPT007': DEPT_NPLT, 'SPD-DEPT008': DEPT_SPKPK,
      'CCD-DEPT001': DEPT_FLT, 'CCD-DEPT002': DEPT_SPR, 'CCD-DEPT003': DEPT_PVC,
      'CCD-DEPT004': DEPT_CCDPK,
      'SEC-010': SEC_SPOKE, 'SEC-011': SEC_NIPPLE, 'SEC-012': SEC_PLT,
      'SEC-013': SEC_SPKPK, 'SEC-015': SEC_SPIRAL, 'SEC-016': SEC_PVC,
      'SEC-017': SEC_CCDPK,
      'SPD': SPD, 'CCD': CCD,
    };

    // Fix any DEMO items with NULL or incorrect org fields
    for (const [prefix, mapping] of Object.entries(orgMap)) {
      const correctDeptId = orgIdLookup[mapping.deptCode];
      const correctSecId  = orgIdLookup[mapping.secCode];
      const correctDivId  = orgIdLookup[mapping.divCode];

      await queryRunner.query(
        `UPDATE items
         SET department_id = $1, section_id = $2, division_id = $3, updated_at = NOW()
         WHERE item_code LIKE $4
           AND (department_id IS NULL OR section_id IS NULL OR division_id IS NULL
                OR department_id != $1 OR section_id != $2 OR division_id != $3)`,
        [correctDeptId, correctSecId, correctDivId, `${prefix}%`],
      );
    }

    // ── Early return if DEMO items already exist (after fix-up above) ──────
    const existingCount = await queryRunner.query(
      `SELECT COUNT(*)::int AS cnt FROM items WHERE item_code LIKE 'DEMO-%'`,
    );
    if (existingCount[0]?.cnt > 0) return;

    const now = new Date().toISOString();

    // Helper: builds an INSERT for one item
    const item = (
      code: string, name: string, type: string, div: string, sec: string, dept: string,
      uomId: string, catId: string | null, opts: Record<string, any> = {},
    ) => {
      const defaults: Record<string, any> = {
        company_id: CID, item_code: code, name, item_type: type, status: 'ACTIVE',
        base_uom_id: uomId, division_id: div, section_id: sec, department_id: dept,
        category_id: catId, track_inventory: true, is_manufacturable: true,
        is_purchasable: type === 'RAW_MATERIAL', is_sellable: type === 'FINISHED_GOOD',
        is_stock_item: type === 'RAW_MATERIAL',
        created_at: now, updated_at: now,
      };
      const cols = { ...defaults, ...opts };
      const keys = Object.keys(cols);
      const vals = keys.map((k) => cols[k]);
      const placeholders = keys.map((_, i) => `$${i + 1}`);
      return {
        text: `INSERT INTO items (${keys.join(',')}) SELECT ${placeholders.join(',')} WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = $${keys.length + 1})`,
        values: [...vals, code],
      };
    };

    // ══════════════════════════════════════════════════════════════════════
    // SPD — SPOKE LINE
    // ══════════════════════════════════════════════════════════════════════

    // 1. Straightener — raw wire coils (RAW_MATERIAL, KG)
    for (const [code, name, wire, wpm, cost] of [
      ['DEMO-RW-001', 'Steel Wire Coil 1.60mm', '1.600', '0.0158', '280'],
      ['DEMO-RW-002', 'Steel Wire Coil 2.00mm', '2.000', '0.0247', '265'],
      ['DEMO-RW-003', 'Steel Wire Coil 2.50mm', '2.500', '0.0385', '250'],
      ['DEMO-RW-004', 'Steel Wire Coil 3.00mm', '3.000', '0.0555', '240'],
      ['DEMO-RW-005', 'Steel Wire Coil 3.45mm', '3.450', '0.0733', '230'],
    ]) {
      const q = item(code, name, 'RAW_MATERIAL', SPD, SEC_SPOKE, DEPT_STR, UOM_KG, CAT_RAW_MET, {
        wire_size_mm: wire, weight_per_meter: wpm, weight_per_piece: '25.000000',
        pieces_per_kg: '0.040000', cost_price: cost, selling_price: null,
        process_1: 'Wire Straightening', process_2: 'Wire Cutting',
        route_type: 'STANDARD_SPD', final_product: 'Straightened Wire',
        description: `Steel wire coil for spoke manufacturing — ${wire}mm diameter`,
        notes: 'PROMPT-12 DEMO DATA — raw material input for spoke line',
        lead_time_days: 7, minimum_stock_level: '500.0000', maximum_stock_level: '5000.0000',
        reorder_level: '1000.0000', safety_stock_level: '500.0000',
      });
      await queryRunner.query(q.text, q.values);
    }

    // 2. Swagging — straightened wire (SEMI_FINISHED, KG)
    for (const [code, name, wire, wpm] of [
      ['DEMO-SW-001', 'Straightened Wire 1.60mm', '1.600', '0.0158'],
      ['DEMO-SW-002', 'Straightened Wire 2.00mm', '2.000', '0.0247'],
      ['DEMO-SW-003', 'Straightened Wire 2.50mm', '2.500', '0.0385'],
      ['DEMO-SW-004', 'Straightened Wire 3.00mm', '3.000', '0.0555'],
      ['DEMO-SW-005', 'Straightened Wire 3.45mm', '3.450', '0.0733'],
    ]) {
      const q = item(code, name, 'SEMI_FINISHED', SPD, SEC_SPOKE, DEPT_SWG, UOM_KG, CAT_RAW_MET, {
        wire_size_mm: wire, weight_per_meter: wpm,
        process_1: 'Wire Straightening', process_2: 'Swagging',
        route_type: 'STANDARD_SPD', final_product: 'Spoke',
        description: `Straightened and swaged steel wire — ${wire}mm`,
        notes: 'PROMPT-12 DEMO DATA — semi-finished spoke line',
      });
      await queryRunner.query(q.text, q.values);
    }

    // 3. Spoke — formed spokes (SEMI_FINISHED, PCS)
    for (const [code, name, wire, wpp, lpp] of [
      ['DEMO-SP-001', 'Spoke 14G 190mm', '1.600', '0.003600', '190.000000'],
      ['DEMO-SP-002', 'Spoke 13G 208mm', '2.000', '0.005100', '208.000000'],
      ['DEMO-SP-003', 'Spoke 12G 208mm', '2.500', '0.008000', '208.000000'],
      ['DEMO-SP-004', 'Spoke 11G 232mm', '3.000', '0.012800', '232.000000'],
      ['DEMO-SP-005', 'Spoke 10G 250mm', '3.450', '0.017700', '250.000000'],
    ]) {
      const q = item(code, name, 'SEMI_FINISHED', SPD, SEC_SPOKE, DEPT_SPK, UOM_PCS, CAT_FIN_MECH, {
        wire_size_mm: wire, weight_per_piece: wpp, length_per_piece: lpp,
        pieces_per_kg: (1 / parseFloat(wpp)).toFixed(6),
        process_1: 'Wire Straightening', process_2: 'Swagging', process_3: 'Spoke Forming',
        route_type: 'STANDARD_SPD', final_product: 'Packed Spoke',
        description: `Formed spoke — gauge ${name.split(' ')[1]} ${name.split(' ')[2]}`,
        notes: 'PROMPT-12 DEMO DATA — semi-finished spoke line',
      });
      await queryRunner.query(q.text, q.values);
    }

    // 4. Spoke Plating — chrome plated spokes (SEMI_FINISHED, PCS)
    for (const [code, name, wire, wpp, lpp] of [
      ['DEMO-SPL-001', 'Plated Spoke 14G 190mm', '1.600', '0.003700', '190.000000'],
      ['DEMO-SPL-002', 'Plated Spoke 13G 208mm', '2.000', '0.005200', '208.000000'],
      ['DEMO-SPL-003', 'Plated Spoke 12G 208mm', '2.500', '0.008200', '208.000000'],
      ['DEMO-SPL-004', 'Plated Spoke 11G 232mm', '3.000', '0.013100', '232.000000'],
      ['DEMO-SPL-005', 'Plated Spoke 10G 250mm', '3.450', '0.018100', '250.000000'],
    ]) {
      const q = item(code, name, 'SEMI_FINISHED', SPD, SEC_PLT, DEPT_SPPL, UOM_PCS, CAT_FIN_MECH, {
        wire_size_mm: wire, weight_per_piece: wpp, length_per_piece: lpp,
        pieces_per_kg: (1 / parseFloat(wpp)).toFixed(6),
        process_1: 'Wire Straightening', process_2: 'Swagging',
        process_3: 'Spoke Forming', process_4: 'Chrome Plating',
        route_type: 'STANDARD_SPD', final_product: 'Packed Spoke',
        description: `Chrome-plated spoke — gauge ${name.split(' ')[2]} ${name.split(' ')[3]}`,
        notes: 'PROMPT-12 DEMO DATA — semi-finished spoke plating',
      });
      await queryRunner.query(q.text, q.values);
    }

    // 5. Spoke Packing — packed spokes (FINISHED_GOOD, BOX)
    for (const [code, name, wire, wpp, sell] of [
      ['DEMO-SPP-001', 'Packed Spoke 14G 190mm 100pcs/box', '1.600', '0.370000', '14.5000'],
      ['DEMO-SPP-002', 'Packed Spoke 13G 208mm 100pcs/box', '2.000', '0.520000', '18.0000'],
      ['DEMO-SPP-003', 'Packed Spoke 12G 208mm 100pcs/box', '2.500', '0.820000', '22.5000'],
      ['DEMO-SPP-004', 'Packed Spoke 11G 232mm 100pcs/box', '3.000', '1.310000', '28.0000'],
      ['DEMO-SPP-005', 'Packed Spoke 10G 250mm 100pcs/box', '3.450', '1.810000', '35.0000'],
    ]) {
      const q = item(code, name, 'FINISHED_GOOD', SPD, SEC_SPKPK, DEPT_SPKPK, UOM_BOX, CAT_FIN_MECH, {
        wire_size_mm: wire, weight_per_piece: wpp,
        pieces_per_kg: '2.702700',
        process_1: 'Wire Straightening', process_2: 'Swagging',
        process_3: 'Spoke Forming', process_4: 'Chrome Plating',
        packing_next_step: 'Final Inspection & Boxing',
        final_product: 'Packed Spoke',
        route_type: 'STANDARD_SPD',
        cost_price: (parseFloat(sell) * 0.65).toFixed(4),
        selling_price: sell,
        description: `Boxed chrome spokes — 100 pcs per box`,
        notes: 'PROMPT-12 DEMO DATA — finished good spoke line',
      });
      await queryRunner.query(q.text, q.values);
    }

    // ══════════════════════════════════════════════════════════════════════
    // SPD — NIPPLE LINE
    // ══════════════════════════════════════════════════════════════════════

    // 6. Header — brass rod (RAW_MATERIAL, KG)
    for (const [code, name, wire, wpm, cost] of [
      ['DEMO-NR-001', 'Brass Rod 8mm x 3m', '8.000', '0.420000', '620'],
      ['DEMO-NR-002', 'Brass Rod 10mm x 3m', '10.000', '0.654000', '600'],
      ['DEMO-NR-003', 'Brass Rod 12mm x 3m', '12.000', '0.942000', '580'],
      ['DEMO-NR-004', 'Brass Rod 14mm x 3m', '14.000', '1.284000', '560'],
      ['DEMO-NR-005', 'Brass Rod 16mm x 3m', '16.000', '1.680000', '540'],
    ]) {
      const q = item(code, name, 'RAW_MATERIAL', SPD, SEC_NIPPLE, DEPT_HDR, UOM_KG, CAT_RAW_MET, {
        wire_size_mm: wire, weight_per_meter: wpm, weight_per_piece: '50.000000',
        pieces_per_kg: '0.020000', cost_price: cost, selling_price: null,
        process_1: 'Heading', process_2: 'Nipple Forming',
        route_type: 'NIPPLE', final_product: 'Packed Nipple',
        description: `Brass rod stock for nipple manufacturing — ${wire}mm`,
        notes: 'PROMPT-12 DEMO DATA — raw material input for nipple line',
        lead_time_days: 10, minimum_stock_level: '200.0000', maximum_stock_level: '2000.0000',
        reorder_level: '400.0000', safety_stock_level: '200.0000',
      });
      await queryRunner.query(q.text, q.values);
    }

    // 7. Nipple — formed nipples (SEMI_FINISHED, PCS)
    for (const [code, name, wire, wpp, lpp] of [
      ['DEMO-NF-001', 'Nipple 8mm Chrome-Ready', '8.000', '0.038000', '25.000000'],
      ['DEMO-NF-002', 'Nipple 10mm Chrome-Ready', '10.000', '0.062000', '30.000000'],
      ['DEMO-NF-003', 'Nipple 12mm Chrome-Ready', '12.000', '0.090000', '35.000000'],
      ['DEMO-NF-004', 'Nipple 14mm Chrome-Ready', '14.000', '0.125000', '40.000000'],
      ['DEMO-NF-005', 'Nipple 16mm Chrome-Ready', '16.000', '0.165000', '45.000000'],
    ]) {
      const q = item(code, name, 'SEMI_FINISHED', SPD, SEC_NIPPLE, DEPT_NPL, UOM_PCS, CAT_FIN_MECH, {
        wire_size_mm: wire, weight_per_piece: wpp, length_per_piece: lpp,
        pieces_per_kg: (1 / parseFloat(wpp)).toFixed(6),
        process_1: 'Heading', process_2: 'Nipple Forming',
        route_type: 'NIPPLE', final_product: 'Packed Nipple',
        description: `Formed nipple — ${wire}mm, awaiting plating`,
        notes: 'PROMPT-12 DEMO DATA — semi-finished nipple line',
      });
      await queryRunner.query(q.text, q.values);
    }

    // 8. Nipple Plating — chrome plated nipples (SEMI_FINISHED, PCS)
    for (const [code, name, wire, wpp, lpp] of [
      ['DEMO-NPL-001', 'Plated Nipple 8mm', '8.000', '0.039000', '25.000000'],
      ['DEMO-NPL-002', 'Plated Nipple 10mm', '10.000', '0.064000', '30.000000'],
      ['DEMO-NPL-003', 'Plated Nipple 12mm', '12.000', '0.093000', '35.000000'],
      ['DEMO-NPL-004', 'Plated Nipple 14mm', '14.000', '0.128000', '40.000000'],
      ['DEMO-NPL-005', 'Plated Nipple 16mm', '16.000', '0.169000', '45.000000'],
    ]) {
      const q = item(code, name, 'SEMI_FINISHED', SPD, SEC_PLT, DEPT_NPLT, UOM_PCS, CAT_FIN_MECH, {
        wire_size_mm: wire, weight_per_piece: wpp, length_per_piece: lpp,
        pieces_per_kg: (1 / parseFloat(wpp)).toFixed(6),
        process_1: 'Heading', process_2: 'Nipple Forming', process_3: 'Chrome Plating',
        route_type: 'NIPPLE', final_product: 'Packed Nipple',
        is_sellable: true, selling_price: (parseFloat(wpp) * 150 * 100).toFixed(4),
        description: `Chrome-plated nipple — ${wire}mm`,
        notes: 'PROMPT-12 DEMO DATA — semi-finished nipple plating',
      });
      await queryRunner.query(q.text, q.values);
    }

    // ══════════════════════════════════════════════════════════════════════
    // CCD — CONTROL CABLE LINE
    // ══════════════════════════════════════════════════════════════════════

    // 9. Flattening — copper wire coils (RAW_MATERIAL, KG)
    for (const [code, name, wire, wpm, cost] of [
      ['DEMO-CW-001', 'Copper Wire Coil 0.50mm', '0.500', '0.001700', '850'],
      ['DEMO-CW-002', 'Copper Wire Coil 0.75mm', '0.750', '0.003900', '820'],
      ['DEMO-CW-003', 'Copper Wire Coil 1.00mm', '1.000', '0.006900', '790'],
      ['DEMO-CW-004', 'Copper Wire Coil 1.50mm', '1.500', '0.015600', '760'],
      ['DEMO-CW-005', 'Copper Wire Coil 2.50mm', '2.500', '0.043500', '720'],
    ]) {
      const q = item(code, name, 'RAW_MATERIAL', CCD, SEC_SPIRAL, DEPT_FLT, UOM_KG, CAT_RAW_MET, {
        wire_size_mm: wire, weight_per_meter: wpm, weight_per_piece: '20.000000',
        pieces_per_kg: '0.050000', cost_price: cost, selling_price: null,
        process_1: 'Wire Flattening', process_2: 'Spiral Winding',
        route_type: 'CCD', final_product: 'Control Cable',
        description: `Copper wire coil for CCD cable — ${wire}mm`,
        notes: 'PROMPT-12 DEMO DATA — raw material input for CCD line',
        lead_time_days: 5, minimum_stock_level: '300.0000', maximum_stock_level: '3000.0000',
        reorder_level: '600.0000', safety_stock_level: '300.0000',
      });
      await queryRunner.query(q.text, q.values);
    }

    // 10. Spiral — spiral-wound cable cores (SEMI_FINISHED, M)
    for (const [code, name, wire, wpm] of [
      ['DEMO-CS-001', 'Spiral Core 0.50mm', '0.500', '0.002200'],
      ['DEMO-CS-002', 'Spiral Core 0.75mm', '0.750', '0.004800'],
      ['DEMO-CS-003', 'Spiral Core 1.00mm', '1.000', '0.008200'],
      ['DEMO-CS-004', 'Spiral Core 1.50mm', '1.500', '0.018000'],
      ['DEMO-CS-005', 'Spiral Core 2.50mm', '2.500', '0.048000'],
    ]) {
      const q = item(code, name, 'SEMI_FINISHED', CCD, SEC_SPIRAL, DEPT_SPR, UOM_M, CAT_FIN_ELEC, {
        wire_size_mm: wire, weight_per_meter: wpm,
        process_1: 'Wire Flattening', process_2: 'Spiral Winding',
        route_type: 'CCD', final_product: 'Control Cable',
        description: `Spiral-wound cable core — ${wire}mm`,
        notes: 'PROMPT-12 DEMO DATA — semi-finished CCD spiral',
      });
      await queryRunner.query(q.text, q.values);
    }

    // 11. PVC — PVC-insulated cables (SEMI_FINISHED, M)
    for (const [code, name, wire, wpm] of [
      ['DEMO-PC-001', 'PVC Cable 0.50mm 3-Core', '0.500', '0.005500'],
      ['DEMO-PC-002', 'PVC Cable 0.75mm 3-Core', '0.750', '0.009200'],
      ['DEMO-PC-003', 'PVC Cable 1.00mm 3-Core', '1.000', '0.013500'],
      ['DEMO-PC-004', 'PVC Cable 1.50mm 3-Core', '1.500', '0.023000'],
      ['DEMO-PC-005', 'PVC Cable 2.50mm 3-Core', '2.500', '0.052000'],
    ]) {
      const q = item(code, name, 'SEMI_FINISHED', CCD, SEC_PVC, DEPT_PVC, UOM_M, CAT_FIN_ELEC, {
        wire_size_mm: wire, weight_per_meter: wpm,
        process_1: 'Wire Flattening', process_2: 'Spiral Winding', process_3: 'PVC Extrusion',
        route_type: 'CCD', final_product: 'Control Cable',
        description: `PVC-insulated 3-core cable — ${wire}mm`,
        notes: 'PROMPT-12 DEMO DATA — semi-finished CCD PVC',
      });
      await queryRunner.query(q.text, q.values);
    }

    // 12. CCD Packing — packed cables (FINISHED_GOOD, EA)
    for (const [code, name, wire, wpp, lpp, sell] of [
      ['DEMO-CK-001', 'Control Cable 0.50mm 100m Roll', '0.500', '0.550000', '100.000000', '95.0000'],
      ['DEMO-CK-002', 'Control Cable 0.75mm 100m Roll', '0.750', '0.920000', '100.000000', '135.0000'],
      ['DEMO-CK-003', 'Control Cable 1.00mm 100m Roll', '1.000', '1.350000', '100.000000', '185.0000'],
      ['DEMO-CK-004', 'Control Cable 1.50mm 50m Roll', '1.500', '1.150000', '50.000000', '165.0000'],
      ['DEMO-CK-005', 'Control Cable 2.50mm 50m Roll', '2.500', '2.600000', '50.000000', '280.0000'],
    ]) {
      const q = item(code, name, 'FINISHED_GOOD', CCD, SEC_CCDPK, DEPT_CCDPK, UOM_EA, CAT_FIN_ELEC, {
        wire_size_mm: wire, weight_per_piece: wpp, length_per_piece: lpp,
        process_1: 'Wire Flattening', process_2: 'Spiral Winding',
        process_3: 'PVC Extrusion', process_4: 'Cable Packing',
        packing_next_step: 'Labeling & Dispatch',
        final_product: 'Control Cable',
        route_type: 'CCD',
        cost_price: (parseFloat(sell) * 0.60).toFixed(4),
        selling_price: sell,
        description: `Rolled PVC control cable — ${wire}mm`,
        notes: 'PROMPT-12 DEMO DATA — finished good CCD line',
      });
      await queryRunner.query(q.text, q.values);
    }

    // ══════════════════════════════════════════════════════════════════════
    // ROUTING 1 — SPD Spoke Assembly (5 operations)
    // ══════════════════════════════════════════════════════════════════════

    const spokeRows = await queryRunner.query(
      `SELECT id FROM items WHERE item_code = 'DEMO-SPP-001' LIMIT 1`,
    );
    const spokeProductId = spokeRows[0]?.id;

    if (spokeProductId) {
      await queryRunner.query(
        `INSERT INTO production_routings
          (company_id, routing_code, name, description, product_id, status,
           base_quantity, estimated_total_time, is_default, effective_from,
           created_at, updated_at)
         SELECT $1::uuid, $2::varchar, $3::varchar, $4::text, $5::uuid, $6::varchar,
                $7::decimal, $8::decimal, $9::boolean, $10::timestamptz,
                NOW(), NOW()
         WHERE NOT EXISTS (SELECT 1 FROM production_routings WHERE routing_code = $2::varchar)`,
        [
          CID, 'RTG-DEMO-SPD', 'Spoke Assembly — Standard SPD',
          'Full spoke production: wire → straighten → swag → form → plate → pack',
          spokeProductId, 'ACTIVE', 1, 0, true,
          '2026-01-01T00:00:00.000Z',
        ],
      );

      const rtgSpdRows = await queryRunner.query(
        `SELECT id FROM production_routings WHERE routing_code = 'RTG-DEMO-SPD' LIMIT 1`,
      );
      const rtgSpdId = rtgSpdRows[0]?.id;

      if (rtgSpdId) {
        const itemIds: Record<string, string> = {};
        for (const code of [
          'DEMO-RW-001', 'DEMO-SW-001', 'DEMO-SP-001', 'DEMO-SPL-001', 'DEMO-SPP-001',
        ]) {
          const rows = await queryRunner.query(
            `SELECT id FROM items WHERE item_code = $1 LIMIT 1`, [code],
          );
          if (rows[0]) itemIds[code] = rows[0].id;
        }

        const spdOps = [
          { seq: 10, code: 'DEMO-OP-010', name: 'Wire Straightening', dept: DEPT_STR, sec: SEC_SPOKE, div: SPD, input: 'DEMO-RW-001', output: 'DEMO-SW-001', setup: 30, run: 5, queue: 10 },
          { seq: 20, code: 'DEMO-OP-020', name: 'Swagging', dept: DEPT_SWG, sec: SEC_SPOKE, div: SPD, input: 'DEMO-SW-001', output: 'DEMO-SW-001', setup: 15, run: 3, queue: 5 },
          { seq: 30, code: 'DEMO-OP-030', name: 'Spoke Forming', dept: DEPT_SPK, sec: SEC_SPOKE, div: SPD, input: 'DEMO-SW-001', output: 'DEMO-SP-001', setup: 20, run: 2, queue: 5 },
          { seq: 40, code: 'DEMO-OP-040', name: 'Spoke Chrome Plating', dept: DEPT_SPPL, sec: SEC_PLT, div: SPD, input: 'DEMO-SP-001', output: 'DEMO-SPL-001', setup: 45, run: 8, queue: 15 },
          { seq: 50, code: 'DEMO-OP-050', name: 'Final Inspection & Packing', dept: DEPT_SPKPK, sec: SEC_SPKPK, div: SPD, input: 'DEMO-SPL-001', output: 'DEMO-SPP-001', setup: 10, run: 4, queue: 5 },
        ];

        for (const op of spdOps) {
          const inId = itemIds[op.input] || null;
          const outId = itemIds[op.output] || null;
          await queryRunner.query(
            `INSERT INTO routing_operations
              (company_id, routing_id, sequence_no, operation_code, operation_name,
               division_id, section_id, department_id,
               setup_time_minutes, run_time_minutes, queue_time_minutes, wait_time_minutes,
               labor_required, machine_required,
               input_item_id, output_item_id, input_quantity, output_quantity, uom_id,
               scrap_percentage, setup_scrap_percentage, status,
               created_at, updated_at)
             SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
                    true,true,$13,$14,1,1,$15,0,0,'ACTIVE',NOW(),NOW()
             WHERE NOT EXISTS (SELECT 1 FROM routing_operations
                               WHERE routing_id = $2 AND sequence_no = $3)`,
            [CID, rtgSpdId, op.seq, op.code, op.name, op.div, op.sec, op.dept, op.setup, op.run, op.queue, 0, inId, outId, UOM_PCS],
          );
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ROUTING 2 — CCD Control Cable Assembly (4 operations)
    // ══════════════════════════════════════════════════════════════════════

    const ccdRows = await queryRunner.query(
      `SELECT id FROM items WHERE item_code = 'DEMO-CK-001' LIMIT 1`,
    );
    const ccdProductId = ccdRows[0]?.id;

    if (ccdProductId) {
      await queryRunner.query(
        `INSERT INTO production_routings
          (company_id, routing_code, name, description, product_id, status,
           base_quantity, estimated_total_time, is_default, effective_from,
           created_at, updated_at)
         SELECT $1::uuid, $2::varchar, $3::varchar, $4::text, $5::uuid, $6::varchar,
                $7::decimal, $8::decimal, $9::boolean, $10::timestamptz,
                NOW(), NOW()
         WHERE NOT EXISTS (SELECT 1 FROM production_routings WHERE routing_code = $2::varchar)`,
        [
          CID, 'RTG-DEMO-CCD', 'CCD Control Cable Assembly',
          'Full cable production: wire → flatten → spiral → PVC → pack',
          ccdProductId, 'ACTIVE', 1, 0, true,
          '2026-01-01T00:00:00.000Z',
        ],
      );

      const rtgCcdRows = await queryRunner.query(
        `SELECT id FROM production_routings WHERE routing_code = 'RTG-DEMO-CCD' LIMIT 1`,
      );
      const rtgCcdId = rtgCcdRows[0]?.id;

      if (rtgCcdId) {
        const ccdItemIds: Record<string, string> = {};
        for (const code of ['DEMO-CW-001', 'DEMO-CS-001', 'DEMO-PC-001', 'DEMO-CK-001']) {
          const rows = await queryRunner.query(`SELECT id FROM items WHERE item_code = $1 LIMIT 1`, [code]);
          if (rows[0]) ccdItemIds[code] = rows[0].id;
        }

        const ccdOps = [
          { seq: 10, code: 'DEMO-OP-110', name: 'Wire Flattening', dept: DEPT_FLT, sec: SEC_SPIRAL, div: CCD, input: 'DEMO-CW-001', output: 'DEMO-CS-001', setup: 20, run: 3, queue: 10 },
          { seq: 20, code: 'DEMO-OP-120', name: 'Spiral Winding', dept: DEPT_SPR, sec: SEC_SPIRAL, div: CCD, input: 'DEMO-CS-001', output: 'DEMO-CS-001', setup: 25, run: 6, queue: 10 },
          { seq: 30, code: 'DEMO-OP-130', name: 'PVC Extrusion', dept: DEPT_PVC, sec: SEC_PVC, div: CCD, input: 'DEMO-CS-001', output: 'DEMO-PC-001', setup: 40, run: 10, queue: 15 },
          { seq: 40, code: 'DEMO-OP-140', name: 'Cable Cutting & Packing', dept: DEPT_CCDPK, sec: SEC_CCDPK, div: CCD, input: 'DEMO-PC-001', output: 'DEMO-CK-001', setup: 15, run: 5, queue: 5 },
        ];

        for (const op of ccdOps) {
          const inId = ccdItemIds[op.input] || null;
          const outId = ccdItemIds[op.output] || null;
          await queryRunner.query(
            `INSERT INTO routing_operations
              (company_id, routing_id, sequence_no, operation_code, operation_name,
               division_id, section_id, department_id,
               setup_time_minutes, run_time_minutes, queue_time_minutes, wait_time_minutes,
               labor_required, machine_required,
               input_item_id, output_item_id, input_quantity, output_quantity, uom_id,
               scrap_percentage, setup_scrap_percentage, status,
               created_at, updated_at)
             SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
                    true,true,$13,$14,1,1,$15,0,0,'ACTIVE',NOW(),NOW()
             WHERE NOT EXISTS (SELECT 1 FROM routing_operations
                               WHERE routing_id = $2 AND sequence_no = $3)`,
            [CID, rtgCcdId, op.seq, op.code, op.name, op.div, op.sec, op.dept, op.setup, op.run, op.queue, 0, inId, outId, UOM_M],
          );
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM routing_operations WHERE operation_code LIKE 'DEMO-OP-%'`);
    await queryRunner.query(`DELETE FROM production_routings WHERE routing_code LIKE 'RTG-DEMO-%'`);
    await queryRunner.query(`DELETE FROM items WHERE item_code LIKE 'DEMO-%'`);
  }
}
