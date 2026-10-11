/* READ-ONLY follow-up: (a) find what aggregates to the screenshot numbers,
   (b) prove the CCD-SP-002 items are LIVE (recent production), not ghosts. */
const fs = require('fs');
const path = require('path');
const { Client } = require(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'node_modules', 'pg'));
function loadEnv() {
  const p = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env');
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const log = (s) => console.log(s);
(async () => {
  const e = loadEnv();
  const c = new Client({ host: e.DB_HOST, port: Number(e.DB_PORT), user: e.DB_USERNAME, password: e.DB_PASSWORD, database: e.DB_DATABASE, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (sql, params = []) => (await c.query(sql, params)).rows;

  // Grand totals over the whole matrix (all active warehouses, SPD items only)
  log('=== SPD-item totals across ALL active warehouses (KG/PCS repro) ===');
  const all = await q(`
    SELECT w.warehouse_code, w.name, b.on_hand, u.code AS uom_code, i.item_code, i.weight_per_piece
    FROM inventory_balances b
    JOIN items i ON i.id = b.item_id
    JOIN warehouses w ON w.id = b.warehouse_id
    LEFT JOIN uoms u ON u.id = b.uom_id
    WHERE b.status='ACTIVE' AND b.on_hand > 0 AND w.status='ACTIVE'
      AND i.division_id = 'd1000000-0000-0000-0000-000000000001'`);
  let gKg = 0, gPcs = 0;
  for (const r of all) {
    const uom = (r.uom_code || 'PCS').toUpperCase(); const qty = Number(r.on_hand) || 0; const wpp = r.weight_per_piece ? Number(r.weight_per_piece) : 0;
    if (uom === 'KG') { gKg += qty; gPcs += wpp > 0 ? Math.round(qty / wpp) : 0; }
    else { gPcs += qty; gKg += wpp > 0 ? Number((qty * wpp).toFixed(4)) : 0; }
  }
  log(`SPD items everywhere -> KG=${gKg.toFixed(2)} PCS=${gPcs}  (screenshot: 100902.69 / 8805309)`);

  // All-division grand totals
  const all2 = await q(`
    SELECT b.on_hand, u.code AS uom_code, i.weight_per_piece
    FROM inventory_balances b JOIN items i ON i.id=b.item_id
    JOIN warehouses w ON w.id=b.warehouse_id LEFT JOIN uoms u ON u.id=b.uom_id
    WHERE b.status='ACTIVE' AND b.on_hand>0 AND w.status='ACTIVE'`);
  let aKg = 0, aPcs = 0;
  for (const r of all2) {
    const uom = (r.uom_code || 'PCS').toUpperCase(); const qty = Number(r.on_hand) || 0; const wpp = r.weight_per_piece ? Number(r.weight_per_piece) : 0;
    if (uom === 'KG') { aKg += qty; aPcs += wpp > 0 ? Math.round(qty / wpp) : 0; }
    else { aPcs += qty; aKg += wpp > 0 ? Number((qty * wpp).toFixed(4)) : 0; }
  }
  log(`ALL divisions      -> KG=${aKg.toFixed(2)} PCS=${aPcs}`);

  // Per active warehouse SPD totals
  log('\n=== Per-warehouse SPD-item totals ===');
  const rows = await q(`
    SELECT w.warehouse_code, w.name, b.on_hand, u.code AS uom_code, i.weight_per_piece
    FROM inventory_balances b JOIN items i ON i.id=b.item_id
    JOIN warehouses w ON w.id=b.warehouse_id LEFT JOIN uoms u ON u.id=b.uom_id
    WHERE b.status='ACTIVE' AND b.on_hand>0 AND w.status='ACTIVE'
      AND i.division_id='d1000000-0000-0000-0000-000000000001'`);
  const agg = {};
  for (const r of rows) {
    const uom = (r.uom_code || 'PCS').toUpperCase(); const qty = Number(r.on_hand) || 0; const wpp = r.weight_per_piece ? Number(r.weight_per_piece) : 0;
    let kg = 0, pcs = 0;
    if (uom === 'KG') { kg = qty; pcs = wpp > 0 ? Math.round(qty / wpp) : 0; } else { pcs = qty; kg = wpp > 0 ? Number((qty * wpp).toFixed(4)) : 0; }
    agg[r.warehouse_code] = agg[r.warehouse_code] || { name: r.name, kg: 0, pcs: 0 };
    agg[r.warehouse_code].kg += kg; agg[r.warehouse_code].pcs += pcs;
  }
  Object.entries(agg).forEach(([k, v]) => log(`  ${k.padEnd(14)} ${v.name.padEnd(28)} ${v.kg.toFixed(2).padStart(12)} KG  ${String(v.pcs).padStart(10)} PCS`));

  // Liveness: recent production entries touching the CCD-SP-002 items
  log('\n=== LIVENESS: recent production_entries for CCD-SP-002 items (proves not ghosts) ===');
  const live = await q(`
    SELECT i.item_code, COUNT(pe.id) AS entries, MAX(pe.entry_date) AS latest
    FROM production_entries pe JOIN items i ON i.id = pe.item_id
    WHERE i.item_code IN ('WIP-SP-002','WIP-SP-005','WIP-SP-010','WIP-SP-013','WIP-SP-014')
    GROUP BY 1 ORDER BY 1`);
  log(live);

  // Any soft-deleted items or items with status != ACTIVE among these?
  log('\n=== Status of the 5 items (active/deleted?) ===');
  const st = await q(`
    SELECT item_code, status, division_id, created_at FROM items
    WHERE item_code IN ('WIP-SP-002','WIP-SP-005','WIP-SP-010','WIP-SP-013','WIP-SP-014')`);
  log(st);

  // Does items table even have deleted_at?
  log('\n=== items table columns (deleted_at present?) ===');
  const cols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='items' AND column_name IN ('deleted_at','status','division_id')`);
  log(cols);
  const balCols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='inventory_balances' AND column_name IN ('deleted_at','status')`);
  log('inventory_balances:', balCols);
  const ledCols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='stock_ledger' AND column_name IN ('deleted_at','status')`);
  log('stock_ledger:', ledCols);

  await c.end();
  log('\n[DONE - read-only]');
})().catch((err) => { console.error('ERR:', err.message); process.exit(1); });
