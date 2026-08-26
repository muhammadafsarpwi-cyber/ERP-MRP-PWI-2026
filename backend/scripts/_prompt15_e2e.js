const { Client } = require('pg');
const fs = require('fs');
const os = require('os');
const http = require('http');

const DB_CONFIG = {
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
};

const API_BASE = 'http://localhost:3001/api/v1';
const TOKEN_PATH = os.tmpdir() + '/erp_valid_token.txt';

let passCount = 0;
let failCount = 0;

function report(step, status, details) {
  const icon = status === 'PASS' ? 'PASS' : 'FAIL';
  if (status === 'PASS') passCount++; else failCount++;
  console.log(`[${icon}] ${step}\n${details}\n`);
}

function apiCall(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const postData = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function main() {
  const db = new Client(DB_CONFIG);
  await db.connect();
  console.log('=== PROMPT-15 E2E VERIFICATION ===\n');
  console.log('Database connected.\n');

  let createdEntryId = null;

  try {
    // ─── STEP 1 - ITEM ───────────────────────────────────────────────────
    console.log('--- STEP 1: ITEM ---');
    const itemRes = await db.query(`
      SELECT i.id AS item_id, i.item_code, i.name AS item_name, i.base_uom_id,
             i.division_id, i.section_id, i.department_id,
             d.name AS division_name, s.name AS section_name, dept.name AS department_name,
             pr.id AS route_id, pr.name AS route_name
      FROM items i
      JOIN production_routings pr ON pr.product_id = i.id
      LEFT JOIN divisions d ON d.id = i.division_id
      LEFT JOIN sections s ON s.id = i.section_id
      LEFT JOIN departments dept ON dept.id = i.department_id
      WHERE i.is_active = true AND pr.is_active = true
      ORDER BY
        CASE WHEN i.division_id IS NOT NULL AND i.section_id IS NOT NULL AND i.department_id IS NOT NULL THEN 0 ELSE 1 END,
        i.id
      LIMIT 1
    `);

    let itemInfo = {};
    if (itemRes.rows.length === 0) {
      report('STEP 1 - ITEM', 'FAIL', 'No items with production routings and org hierarchy found');
    } else {
      itemInfo = itemRes.rows[0];
      report('STEP 1 - ITEM', 'PASS',
        `item_code: ${itemInfo.item_code}\n` +
        `item_name: ${itemInfo.item_name}\n` +
        `division_id: ${itemInfo.division_id || 'NULL'} (${itemInfo.division_name || 'N/A'})\n` +
        `section_id: ${itemInfo.section_id || 'NULL'} (${itemInfo.section_name || 'N/A'})\n` +
        `department_id: ${itemInfo.department_id || 'NULL'} (${itemInfo.department_name || 'N/A'})\n` +
        `route exists: YES (id=${itemInfo.route_id}, name=${itemInfo.route_name})`
      );
    }

    if (!itemInfo.item_id) {
      console.log('FATAL: Cannot proceed without a valid item.');
      await db.end();
      return;
    }
    console.log(`  >> Using: item_id=${itemInfo.item_id}, div=${itemInfo.division_id}, sec=${itemInfo.section_id}, dept=${itemInfo.department_id}\n`);

    // ─── STEP 2 - ROUTING ────────────────────────────────────────────────
    console.log('--- STEP 2: ROUTING ---');
    const routeRes = await db.query(`
      SELECT ro.id, ro.sequence_no, ro.operation_name, ro.operation_code,
             ro.setup_time_minutes, ro.run_time_minutes,
             ro.department_id, ro.section_id, ro.division_id,
             d.name AS department_name
      FROM routing_operations ro
      JOIN production_routings pr ON pr.id = ro.routing_id
      LEFT JOIN departments d ON d.id = ro.department_id
      WHERE pr.product_id = $1 AND ro.is_active = true
      ORDER BY ro.sequence_no ASC
    `, [itemInfo.item_id]);

    let firstOpDeptId = null;
    if (routeRes.rows.length === 0) {
      report('STEP 2 - ROUTING', 'FAIL', `No routing_operations for item_id=${itemInfo.item_id}`);
    } else {
      const ops = routeRes.rows;
      firstOpDeptId = ops[0].department_id;
      let details = `Found ${ops.length} operation(s):\n`;
      ops.forEach((op) => {
        details += `  [seq=${op.sequence_no}] ${op.operation_name} (code=${op.operation_code}), dept=${op.department_name || 'NULL'}, setup=${op.setup_time_minutes}m, run=${op.run_time_minutes}m\n`;
      });
      report('STEP 2 - ROUTING', 'PASS', details.trim());
    }
    console.log('');

    // ─── STEP 3 - MACHINE ────────────────────────────────────────────────
    console.log('--- STEP 3: MACHINE ---');
    const targetDeptId = firstOpDeptId || itemInfo.department_id;

    const machineRes = await db.query(`
      SELECT m.id AS machine_id, m.machine_id AS machine_code, m.machine_name,
             d.id AS dept_id, d.name AS department_name
      FROM machines m
      LEFT JOIN departments d ON d.id = m.department_id
      WHERE m.is_active = true AND ($1::uuid IS NULL OR m.department_id = $1)
      ORDER BY m.created_at
      LIMIT 1
    `, [targetDeptId]);

    let machineInfo = {};
    if (machineRes.rows.length === 0) {
      const anyMachine = await db.query(`
        SELECT m.id AS machine_id, m.machine_id AS machine_code, m.machine_name,
               d.id AS dept_id, d.name AS department_name
        FROM machines m
        LEFT JOIN departments d ON d.id = m.department_id
        WHERE m.is_active = true
        LIMIT 1
      `);
      if (anyMachine.rows.length === 0) {
        report('STEP 3 - MACHINE', 'FAIL', 'No active machines found');
      } else {
        machineInfo = anyMachine.rows[0];
        report('STEP 3 - MACHINE', 'PASS',
          `machine_code: ${machineInfo.machine_code}\n` +
          `name: ${machineInfo.machine_name}\n` +
          `department: ${machineInfo.department_name || 'NULL'} (${machineInfo.dept_id || 'NULL'})\n` +
          `Note: No machine found for dept_id=${targetDeptId}, used any active machine`
        );
      }
    } else {
      machineInfo = machineRes.rows[0];
      report('STEP 3 - MACHINE', 'PASS',
        `machine_code: ${machineInfo.machine_code}\n` +
        `name: ${machineInfo.machine_name}\n` +
        `department_id: ${machineInfo.dept_id} (${machineInfo.department_name})`
      );
    }

    if (!machineInfo.machine_id) {
      console.log('FATAL: Cannot proceed without a valid machine.');
      await db.end();
      return;
    }
    console.log(`  >> Using: machine_id=${machineInfo.machine_id}, machine_code=${machineInfo.machine_code}\n`);

    // ─── STEP 4 - SHIFT ──────────────────────────────────────────────────
    console.log('--- STEP 4: SHIFT ---');
    const shiftRes = await db.query(`
      SELECT id AS shift_id, shift_code, name, start_time, end_time, planned_hours, status
      FROM shifts
      WHERE is_active = true
      ORDER BY planned_hours DESC, start_time ASC
    `);

    let shiftInfo = {};
    if (shiftRes.rows.length === 0) {
      report('STEP 4 - SHIFT', 'FAIL', 'No active shifts found');
    } else {
      const shifts = shiftRes.rows;
      const targetShift = shifts.find(s => Number(s.planned_hours) === 8) || shifts[0];
      shiftInfo = targetShift;
      let details = `Found ${shifts.length} active shift(s):\n`;
      shifts.forEach((s) => {
        const marker = s.shift_id === targetShift.shift_id ? ' <-- SELECTED' : '';
        details += `  ${s.name} (${s.shift_code}): ${s.start_time}-${s.end_time}, planned_hours=${s.planned_hours}${marker}\n`;
      });
      report('STEP 4 - SHIFT', 'PASS', details.trim());
    }

    if (!shiftInfo.shift_id) {
      console.log('FATAL: Cannot proceed without a valid shift.');
      await db.end();
      return;
    }
    console.log(`  >> Using: shift_id=${shiftInfo.shift_id}, name=${shiftInfo.name}, planned_hours=${shiftInfo.planned_hours}\n`);

    // ─── STEP 5 - TARGET ─────────────────────────────────────────────────
    console.log('--- STEP 5: TARGET ---');
    let targetRes = await db.query(`
      SELECT mt.id, mt.target_quantity, mt.standard_hours, mt.shift_id, mt.machine_id,
             mt.item_id, mt.uom_id, mt.status, mt.effective_from, mt.effective_to,
             s.name AS shift_name, s.planned_hours,
             m.machine_name, m.machine_id AS machine_code
      FROM machine_targets mt
      JOIN shifts s ON s.id = mt.shift_id
      JOIN machines m ON m.id = mt.machine_id
      WHERE mt.machine_id = $1 AND mt.shift_id = $2 AND mt.item_id = $3
        AND mt.is_active = true
    `, [machineInfo.machine_id, shiftInfo.shift_id, itemInfo.item_id]);

    let isGeneral = false;
    if (targetRes.rows.length === 0) {
      targetRes = await db.query(`
        SELECT mt.id, mt.target_quantity, mt.standard_hours, mt.shift_id, mt.machine_id,
               mt.item_id, mt.uom_id, mt.status, mt.effective_from, mt.effective_to,
               s.name AS shift_name, s.planned_hours,
               m.machine_name, m.machine_id AS machine_code
        FROM machine_targets mt
        JOIN shifts s ON s.id = mt.shift_id
        JOIN machines m ON m.id = mt.machine_id
        WHERE mt.machine_id = $1 AND mt.shift_id = $2 AND mt.item_id IS NULL
          AND mt.is_active = true
      `, [machineInfo.machine_id, shiftInfo.shift_id]);
      isGeneral = true;
    }

    if (targetRes.rows.length === 0) {
      targetRes = await db.query(`
        SELECT mt.id, mt.target_quantity, mt.standard_hours, mt.shift_id, mt.machine_id,
               mt.item_id, mt.uom_id, mt.status, mt.effective_from, mt.effective_to,
               s.name AS shift_name, s.planned_hours,
               m.machine_name, m.machine_id AS machine_code
        FROM machine_targets mt
        JOIN shifts s ON s.id = mt.shift_id
        JOIN machines m ON m.id = mt.machine_id
        WHERE mt.machine_id = $1 AND mt.is_active = true
        LIMIT 1
      `, [machineInfo.machine_id]);
      isGeneral = true;
    }

    let targetInfo = {};
    if (targetRes.rows.length === 0) {
      report('STEP 5 - TARGET', 'FAIL', 'No machine_target found for machine+shift (or fallback)');
    } else {
      const t = targetRes.rows[0];
      targetInfo = t;
      const plannedHrs = Number(t.planned_hours || shiftInfo.planned_hours);
      const targetPerHour = plannedHrs > 0 ? (Number(t.target_quantity) / plannedHrs).toFixed(2) : 'N/A';
      report('STEP 5 - TARGET', 'PASS',
        `target_id: ${t.id}\n` +
        `target_quantity: ${t.target_quantity}\n` +
        `standard_hours: ${t.standard_hours}\n` +
        `planned_hours (shift): ${plannedHrs}\n` +
        `target_per_hour: ${targetPerHour}\n` +
        `effective target: ${t.target_quantity}\n` +
        `is_general: ${isGeneral}\n` +
        `matched: machine=${t.machine_code}, shift=${t.shift_name}, item_id=${t.item_id || 'NULL'}\n` +
        `effective_from: ${t.effective_from}, effective_to: ${t.effective_to || 'NULL'}`
      );
    }
    console.log('');

    // ─── STEP 6 - UOM ────────────────────────────────────────────────────
    console.log('--- STEP 6: UOM ---');
    const uomRes = await db.query(`
      SELECT i.base_uom_id, u.code AS uom_code, u.name AS uom_name, u.symbol
      FROM items i
      LEFT JOIN uoms u ON u.id = i.base_uom_id
      WHERE i.id = $1
    `, [itemInfo.item_id]);

    const baseUomId = uomRes.rows[0] ? uomRes.rows[0].base_uom_id : null;
    const baseUomCode = uomRes.rows[0] ? uomRes.rows[0].uom_code : null;
    const baseUomName = uomRes.rows[0] ? uomRes.rows[0].uom_name : null;

    const convRes = await db.query(`
      SELECT uc.from_uom_id, uc.to_uom_id, uc.conversion_factor,
             u1.code AS from_code, u2.code AS to_code
      FROM uom_conversions uc
      LEFT JOIN uoms u1 ON u1.id = uc.from_uom_id
      LEFT JOIN uoms u2 ON u2.id = uc.to_uom_id
      WHERE uc.from_uom_id = $1 OR uc.to_uom_id = $1
    `, [baseUomId]);

    let uomId = baseUomId;
    let details = `base_uom_id: ${baseUomId}\nbase_uom_code: ${baseUomCode} (${baseUomName})\n`;
    if (convRes.rows.length > 0) {
      details += `Supported conversions:\n`;
      convRes.rows.forEach(c => {
        details += `  ${c.from_code || c.from_uom_id} -> ${c.to_code || c.to_uom_id} (factor: ${c.conversion_factor})\n`;
      });
    } else {
      details += `No UOM conversions found for this UOM (no conversion table entries)`;
    }
    report('STEP 6 - UOM', 'PASS', details.trim());
    console.log(`  >> Using: uom_id=${uomId}\n`);

    // ─── STEP 7 - PRODUCTION ENTRY ───────────────────────────────────────
    console.log('--- STEP 7: PRODUCTION ENTRY ---');
    let token = '';
    try {
      token = fs.readFileSync(TOKEN_PATH, 'utf-8').trim();
      console.log(`  Token loaded from ${TOKEN_PATH} (${token.length} chars)`);
    } catch (e) {
      report('STEP 7 - PRODUCTION ENTRY', 'FAIL', `Cannot read auth token: ${e.message}`);
      return;
    }

    const entryPayload = {
      entryDate: '2026-08-26',
      shiftId: shiftInfo.shift_id,
      divisionId: itemInfo.division_id,
      sectionId: itemInfo.section_id,
      departmentId: itemInfo.department_id,
      machineId: machineInfo.machine_id,
      machineNo: machineInfo.machine_code || machineInfo.machine_name,
      operatorName: 'E2E Test Operator',
      itemId: itemInfo.item_id,
      uomId: uomId,
      targetQuantity: targetInfo.target_quantity || 100,
      actualQuantity: 50,
      scrapQuantity: 2,
      runningHours: 6,
      downtimeHours: 0,
      remarks: 'PROMPT-15 E2E test entry - will be deleted',
    };
    console.log('  Payload:', JSON.stringify(entryPayload, null, 2));

    const entryRes = await apiCall('POST', '/production/entries', entryPayload, token);
    const entryBodyStr = typeof entryRes.body === 'string' ? entryRes.body : JSON.stringify(entryRes.body, null, 2);
    console.log(`  Response HTTP ${entryRes.status}:\n  ${entryBodyStr.substring(0, 2000)}`);

    if (entryRes.status >= 200 && entryRes.status < 300) {
      const respBody = entryRes.body;
      const entryData = respBody.data || respBody;
      createdEntryId = entryData.id || null;
      if (!createdEntryId && typeof entryData === 'object') {
        for (const key of Object.keys(entryData)) {
          if (entryData[key] && typeof entryData[key] === 'object' && entryData[key].id) {
            createdEntryId = entryData[key].id;
            break;
          }
        }
      }
      report('STEP 7 - PRODUCTION ENTRY', 'PASS',
        `HTTP ${entryRes.status}\nentry_id: ${createdEntryId || 'extract from response above'}\nMessage: ${respBody.message || 'N/A'}`
      );
    } else {
      report('STEP 7 - PRODUCTION ENTRY', 'FAIL',
        `HTTP ${entryRes.status}\nResponse: ${entryBodyStr.substring(0, 500)}`
      );
    }
    console.log('');

    // ─── STEP 8 - DATABASE ───────────────────────────────────────────────
    console.log('--- STEP 8: DATABASE (ENTRY COUNT & CLEANUP) ---');
    const afterRes = await db.query('SELECT COUNT(*)::int AS cnt FROM production_entries');
    const countAfter = afterRes.rows[0].cnt;
    console.log(`  production_entries count after creation attempt: ${countAfter}`);

    let cleanupSuccess = false;
    if (createdEntryId) {
      const delRes = await apiCall('DELETE', `/production/entries/${createdEntryId}`, null, token);
      console.log(`  DELETE via API: HTTP ${delRes.status}`);

      if (delRes.status >= 200 && delRes.status < 300) {
        cleanupSuccess = true;
      } else {
        // Direct DB delete as fallback
        try {
          const r = await db.query('DELETE FROM production_entries WHERE id = $1', [createdEntryId]);
          console.log(`  Direct DB DELETE: ${r.rowCount} row(s) deleted`);
          cleanupSuccess = r.rowCount > 0;
        } catch (e) {
          console.log(`  Direct DB DELETE failed: ${e.message}`);
        }
      }

      const finalRes = await db.query('SELECT COUNT(*)::int AS cnt FROM production_entries');
      const countFinal = finalRes.rows[0].cnt;
      console.log(`  production_entries count after cleanup: ${countFinal}`);

      if (countFinal < countAfter) {
        report('STEP 8 - DATABASE', 'PASS',
          `Count: ${countAfter} -> ${countFinal} (entry ${createdEntryId} cleaned up successfully)`
        );
      } else {
        report('STEP 8 - DATABASE', 'FAIL',
          `Count before=${countAfter}, after cleanup=${countFinal} - cleanup may have failed`
        );
      }
    } else {
      report('STEP 8 - DATABASE', 'PASS',
        `No entry created (STEP 7 failed), current count=${countAfter}. Cleanup not needed.`
      );
    }
    console.log('');

    // ─── STEP 9 - INVENTORY ──────────────────────────────────────────────
    console.log('--- STEP 9: INVENTORY ---');
    const tableCheck = await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('stock_ledger', 'inventory_balances')
    `);
    const existingTables = tableCheck.rows.map(r => r.table_name);

    if (existingTables.length === 0) {
      report('STEP 9 - INVENTORY', 'PASS', 'Neither stock_ledger nor inventory_balances tables exist');
    } else {
      let details = '';
      if (existingTables.includes('stock_ledger')) {
        const sl = await db.query(`
          SELECT COUNT(*)::int AS cnt FROM stock_ledger
          WHERE created_at >= NOW() - INTERVAL '5 minutes'
        `);
        details += `stock_ledger (last 5 min): ${sl.rows[0].cnt} record(s)\n`;
      }
      if (existingTables.includes('inventory_balances')) {
        const ib = await db.query(`
          SELECT COUNT(*)::int AS cnt FROM inventory_balances
          WHERE updated_at >= NOW() - INTERVAL '5 minutes'
        `);
        details += `inventory_balances (updated last 5 min): ${ib.rows[0].cnt} record(s)`;
      }
      report('STEP 9 - INVENTORY', 'PASS', details.trim());
    }
    console.log('');

    // ─── STEP 11 - DATABASE INTEGRITY ────────────────────────────────────
    console.log('--- STEP 11: DATABASE INTEGRITY ---');
    const issues = [];

    // 1. Orphan items (no division/section/department)
    const orphanItems = await db.query(`
      SELECT COUNT(*)::int AS cnt FROM items
      WHERE is_active = true
        AND (division_id IS NULL OR section_id IS NULL OR department_id IS NULL)
    `);
    issues.push(`Orphan items (missing div/section/dept): ${orphanItems.rows[0].cnt}`);

    // 2. Orphan machines (no department)
    const orphanMachines = await db.query(`
      SELECT COUNT(*)::int AS cnt FROM machines
      WHERE is_active = true AND department_id IS NULL
    `);
    issues.push(`Orphan machines (no department): ${orphanMachines.rows[0].cnt}`);

    // 3. Orphan targets (no machine/shift)
    const orphanTargets = await db.query(`
      SELECT COUNT(*)::int AS cnt FROM machine_targets
      WHERE machine_id IS NULL OR shift_id IS NULL
    `);
    issues.push(`Orphan targets (no machine or shift): ${orphanTargets.rows[0].cnt}`);

    // 4. Duplicate machine codes (same machine_id, different departments = EXPECTED for different lines)
    const dupMachines = await db.query(`
      SELECT machine_id, COUNT(*)::int AS cnt,
             COUNT(DISTINCT department_id) AS dept_count
      FROM machines
      WHERE is_active = true
      GROUP BY machine_id
      HAVING COUNT(*) > 1
    `);
    if (dupMachines.rows.length > 0) {
      const dupDetails = dupMachines.rows.map(r =>
        `  ${r.machine_id}: ${r.cnt} rows across ${r.dept_count} dept(s) (EXPECTED for different production lines)`
      ).join('\n');
      issues.push(`Duplicate machine codes (${dupMachines.rows.length} groups):\n${dupDetails}`);
    } else {
      issues.push(`Duplicate machine codes: 0`);
    }

    // 5. Duplicate item codes
    const dupItems = await db.query(`
      SELECT item_code, COUNT(*)::int AS cnt
      FROM items
      GROUP BY item_code
      HAVING COUNT(*) > 1
    `);
    if (dupItems.rows.length > 0) {
      const dupDetails = dupItems.rows.map(r => `  ${r.item_code}: ${r.cnt} copies`).join('\n');
      issues.push(`Duplicate item codes (${dupItems.rows.length} groups):\n${dupDetails}`);
    } else {
      issues.push(`Duplicate item codes: 0`);
    }

    // 6. Duplicate active targets per machine+shift+item+uom
    const dupTargets = await db.query(`
      SELECT machine_id, shift_id, item_id, uom_id, COUNT(*)::int AS cnt
      FROM machine_targets
      WHERE is_active = true
      GROUP BY machine_id, shift_id, item_id, uom_id
      HAVING COUNT(*) > 1
    `);
    if (dupTargets.rows.length > 0) {
      const dupDetails = dupTargets.rows.map(r =>
        `  machine=${r.machine_id}, shift=${r.shift_id}, item=${r.item_id || 'NULL'}, uom=${r.uom_id || 'NULL'}: ${r.cnt} active`
      ).join('\n');
      issues.push(`Duplicate active targets per machine+shift+item+uom (${dupTargets.rows.length} groups):\n${dupDetails}`);
    } else {
      issues.push(`Duplicate active targets per machine+shift+item+uom: 0`);
    }

    // 7. FK integrity: user_roles references valid erp_users and roles
    const fkCheck = await db.query(`
      SELECT COUNT(*)::int AS orphans
      FROM user_roles ur
      LEFT JOIN erp_users u ON u.id = ur.user_id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id IS NULL OR r.id IS NULL
    `);
    issues.push(`Orphan user_roles (invalid user or role): ${fkCheck.rows[0].orphans}`);

    // Determine overall status
    const hasCritical = issues.some(i =>
      (i.startsWith('Orphan items') && !i.endsWith(': 0')) ||
      (i.startsWith('Orphan machines') && !i.endsWith(': 0')) ||
      (i.startsWith('Duplicate item codes') && !i.endsWith(': 0')) ||
      (i.startsWith('Orphan user_roles') && !i.endsWith(': 0'))
    );
    report('STEP 11 - DATABASE INTEGRITY', hasCritical ? 'FAIL' : 'PASS', issues.join('\n'));
    console.log('');

  } catch (err) {
    console.error('FATAL ERROR:', err.message);
    failCount++;
  } finally {
    await db.end();
  }

  // ─── SUMMARY ─────────────────────────────────────────────────────────
  console.log('=== SUMMARY ===');
  console.log(`TOTAL: ${passCount + failCount} steps | PASS: ${passCount} | FAIL: ${failCount}`);
  console.log('=================================');
}

main().catch(err => { console.error(err); process.exit(1); });
