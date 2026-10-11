/* READ-ONLY diagnostic: trace the "CCD-SP-002 ghost card" on Production Item Open Stock.
   Reproduces the exact matrix query (getDepartmentStockMatrix) and identifies where
   100,902.69 KG and 8,805,309 PCS come from. NO WRITES. */
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
  const c = new Client({
    host: e.DB_HOST, port: Number(e.DB_PORT), user: e.DB_USERNAME,
    password: e.DB_PASSWORD, database: e.DB_DATABASE, ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const q = async (sql, params = []) => (await c.query(sql, params)).rows;

  // ---- 1. Divisions master ----
  log('=== DIVISIONS ===');
  const divs = await q(`SELECT id, division_code, name, status FROM divisions ORDER BY division_code`);
  log(divs);

  // ---- 2. The warehouse(s) whose code involves CCD-SP ----
  log('\n=== WAREHOUSES with code ~ CCD or SP ===');
  const whs = await q(`
    SELECT w.id, w.warehouse_code, w.name, w.status, w.division_id, d.division_code, d.name AS div_name
    FROM warehouses w LEFT JOIN divisions d ON d.id = w.division_id
    WHERE w.warehouse_code ILIKE '%CCD%' OR w.warehouse_code ILIKE '%SP%'
    ORDER BY w.warehouse_code`);
  log(whs);

  // ---- 3. Exact CCD-SP-002 warehouse ----
  log('\n=== EXACT warehouse_code = CCD-SP-002 ===');
  const target = await q(`
    SELECT w.id, w.warehouse_code, w.name, w.status, w.division_id, d.division_code, d.name AS div_name
    FROM warehouses w LEFT JOIN divisions d ON d.id = w.division_id
    WHERE UPPER(w.warehouse_code) = 'CCD-SP-002'`);
  log(target);
  if (!target.length) { log('!! CCD-SP-002 warehouse row NOT FOUND'); await c.end(); return; }
  const whId = target[0].id;

  // ---- 4. Reproduce the matrix totals for THIS warehouse, all divisions ----
  log('\n=== MATRIX REPRO for CCD-SP-002 (no division filter) ===');
  const bal = await q(`
    SELECT b.id AS balance_id, b.on_hand, b.available, b.status AS bal_status, b.created_at, b.updated_at,
           i.item_code, i.name AS item_name, i.item_type, i.division_id AS item_div_id,
           d.division_code AS item_div_code, d.name AS item_div_name,
           u.code AS uom_code, u.symbol AS uom_symbol,
           i.weight_per_piece
    FROM inventory_balances b
    JOIN items i ON i.id = b.item_id
    LEFT JOIN divisions d ON d.id = i.division_id
    LEFT JOIN uoms u ON u.id = b.uom_id
    WHERE b.warehouse_id = $1 AND b.status = 'ACTIVE' AND b.on_hand > 0
    ORDER BY i.item_code`, [whId]);
  log(`rows=${bal.length}`);

  // Reproduce service conversion math
  let totKg = 0, totPcs = 0;
  for (const r of bal) {
    const uomCode = (r.uom_code || r.uom_symbol || 'PCS').toUpperCase();
    const isKg = uomCode === 'KG';
    const qty = Number(r.on_hand) || 0;
    const wpp = r.weight_per_piece ? Number(r.weight_per_piece) : 0;
    let cW = 0, cP = 0;
    if (isKg) { cW = qty; cP = wpp > 0 ? Math.round(qty / wpp) : 0; }
    else { cP = qty; cW = wpp > 0 ? Number((qty * wpp).toFixed(4)) : 0; }
    totKg += cW; totPcs += cP;
  }
  log(`TOTALS -> KG=${totKg.toFixed(2)}  PCS=${totPcs}`);
  log(`Target ghost = KG=100902.69  PCS=8805309  => KG match? ${Math.abs(totKg - 100902.69) < 0.5}  PCS match? ${Math.abs(totPcs - 8805309) < 2}`);

  log('\n--- per item ---');
  for (const r of bal) {
    const uomCode = (r.uom_code || r.uom_symbol || 'PCS').toUpperCase();
    const isKg = uomCode === 'KG';
    const qty = Number(r.on_hand) || 0;
    const wpp = r.weight_per_piece ? Number(r.weight_per_piece) : 0;
    let cW = 0, cP = 0;
    if (isKg) { cW = qty; cP = wpp > 0 ? Math.round(qty / wpp) : 0; }
    else { cP = qty; cW = wpp > 0 ? Number((qty * wpp).toFixed(4)) : 0; }
    log(`  ${r.item_code.padEnd(18)} type=${String(r.item_type).padEnd(16)} itemDiv=${r.item_div_code || 'NULL'} uom=${uomCode.padEnd(4)} onHand=${String(qty).padStart(12)} wpp=${wpp} => ${cW.toFixed(2)}KG / ${cP}PCS  (balUpdated=${r.updated_at})`);
  }

  // ---- 5. Division breakdown of this warehouse's stock ----
  log('\n=== Division breakdown of CCD-SP-002 stock ===');
  const brk = await q(`
    SELECT COALESCE(d.division_code,'(item division NULL)') AS div_code, COALESCE(d.name,'(none)') AS div_name,
           COUNT(*) AS rows, SUM(b.on_hand) AS on_hand
    FROM inventory_balances b
    JOIN items i ON i.id = b.item_id
    LEFT JOIN divisions d ON d.id = i.division_id
    WHERE b.warehouse_id = $1 AND b.status='ACTIVE' AND b.on_hand > 0
    GROUP BY 1,2 ORDER BY 3 DESC`, [whId]);
  log(brk);

  // ---- 6. Ledger provenance: what reference_types fed these balances ----
  log('\n=== stock_ledger provenance for CCD-SP-002 (by reference_type/direction) ===');
  const prov = await q(`
    SELECT sl.reference_type, sl.direction, COUNT(*) AS n, SUM(sl.quantity) AS qty
    FROM stock_ledger sl WHERE sl.warehouse_id = $1
    GROUP BY 1,2 ORDER BY 3 DESC`, [whId]);
  log(prov);

  // ---- 7. ORPHAN LEDGER ROWS: reference_id points at deleted production_entries ----
  log('\n=== ORPHAN stock_ledger rows (reference_id -> missing production_entries) ===');
  const orphan = await q(`
    SELECT sl.reference_type, COUNT(*) AS rows, SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END) AS net_qty
    FROM stock_ledger sl
    LEFT JOIN production_entries pe ON pe.id = sl.reference_id
    WHERE sl.reference_type = 'PRODUCTION_ENTRY' AND sl.reference_id IS NOT NULL AND pe.id IS NULL
    GROUP BY 1`);
  log(orphan);
  const orphanWh = await q(`
    SELECT w.warehouse_code, COUNT(*) AS rows,
           SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END) AS net_qty
    FROM stock_ledger sl
    LEFT JOIN production_entries pe ON pe.id = sl.reference_id
    LEFT JOIN warehouses w ON w.id = sl.warehouse_id
    WHERE sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id IS NOT NULL AND pe.id IS NULL
    GROUP BY 1 ORDER BY 2 DESC`);
  log('orphan rows by warehouse:');
  log(orphanWh);

  // ---- 8. Are the specific ghost quantities present in ledger as orphan rows? ----
  log('\n=== Do ghost numbers (100902.69 / 8805309) appear in CCD-SP-002 ledger? ===');
  const ghost = await q(`
    SELECT sl.id, sl.transaction_type, sl.direction, sl.quantity, sl.reference_type, sl.reference_number,
           sl.reference_id, i.item_code, sl.created_at,
           (pe.id IS NULL) AS ref_missing
    FROM stock_ledger sl
    JOIN items i ON i.id = sl.item_id
    LEFT JOIN production_entries pe ON pe.id = sl.reference_id
    WHERE sl.warehouse_id = $1 AND (sl.quantity = 100902.69 OR sl.quantity = 8805309)`, [whId]);
  log(ghost);

  await c.end();
  log('\n[DONE - read-only]');
})().catch((err) => { console.error('TRACE ERROR:', err.message); process.exit(1); });
