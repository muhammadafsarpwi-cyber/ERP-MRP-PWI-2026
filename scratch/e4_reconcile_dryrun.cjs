/* READ-ONLY: mirrors reconcileBalances() to prove the SQL reproduces the
   known drift figures without writing anything. */
const fs = require('fs'); const path = require('path');
const { Client } = require(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'node_modules', 'pg'));
function loadEnv() { const p = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env'); const o = {};
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim()); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); } return o; }
const log = (s) => console.log(s);
const TABLE = (rows) => { if (!rows.length) { log('  (none)'); return; }
  log('  ' + Object.keys(rows[0]).join(' | '));
  for (const r of rows) log('  ' + Object.values(r).map(String).join(' | ')); };

(async () => {
  const e = loadEnv();
  const c = new Client({ host: e.DB_HOST, port: Number(e.DB_PORT), user: e.DB_USERNAME, password: e.DB_PASSWORD, database: e.DB_DATABASE, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;

  const company = (await q(`SELECT id FROM companies LIMIT 1`))[0]?.id;
  log(`company = ${company}\n`);

  log('=== 1. Does the ledger-net SQL parse and match items? ===');
  const ledgerRows = await q(`
    SELECT sl.warehouse_id, sl.item_id,
           SUM(CASE
                 WHEN sl.transaction_type = 'PRODUCTION_SCRAP' THEN 0
                 WHEN sl.transaction_type = 'PRODUCTION_REVERSAL'
                      AND COALESCE(sl.notes, '') ~ '^Reversal of PRODUCTION_SCRAP' THEN 0
                 WHEN sl.direction = 'OUT' THEN -sl.quantity
                 ELSE sl.quantity
               END) AS ledger_net,
           COUNT(*)::int AS ledger_rows
      FROM stock_ledger sl
      JOIN items item ON item.id = sl.item_id
     WHERE sl.company_id = $1
     GROUP BY sl.warehouse_id, sl.item_id`, [company]);
  log(`  pairs from ledger: ${ledgerRows.length}`);

  const balanceRows = await q(`
    SELECT ib.warehouse_id, ib.item_id, ib.on_hand, ib.status, ib.uom_id,
           (SELECT COUNT(*)::int FROM inventory_balances dup
             WHERE dup.company_id = ib.company_id
               AND dup.item_id = ib.item_id
               AND dup.warehouse_id = ib.warehouse_id) AS balance_rows
      FROM inventory_balances ib
      JOIN items item ON item.id = ib.item_id
     WHERE ib.company_id = $1`, [company]);
  log(`  pairs from balances: ${balanceRows.length}`);

  const byKey = new Map();
  const key = (w, i) => `${w}|${i}`;
  for (const r of ledgerRows) byKey.set(key(r.warehouse_id, r.item_id), {
    warehouseId: r.warehouse_id, itemId: r.item_id,
    ledgerNet: Number(r.ledger_net) || 0, ledgerRows: r.ledger_rows,
    balanceOnHand: 0, balanceRows: 0, uomId: null });
  for (const r of balanceRows) {
    const k = key(r.warehouse_id, r.item_id);
    const ex = byKey.get(k); const onHand = Number(r.on_hand) || 0;
    if (ex) { ex.balanceOnHand += onHand; ex.balanceRows = r.balance_rows; ex.uomId = ex.uomId ?? r.uom_id ?? null; }
    else byKey.set(k, { warehouseId: r.warehouse_id, itemId: r.item_id, ledgerNet: 0, ledgerRows: 0,
      balanceOnHand: onHand, balanceRows: r.balance_rows, uomId: r.uom_id ?? null });
  }

  const rows = [...byKey.values()].map((e2) => ({ ...e2, drift: Number((e2.balanceOnHand - e2.ledgerNet).toFixed(4)) }))
    .filter((r2) => Math.abs(r2.drift) >= 0.0001)
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

  log(`\n=== 2. Drift pairs: ${rows.length} ===`);
  const totalDrift = rows.reduce((s, r2) => s + r2.drift, 0);
  log(`  total drift (balance - ledger): ${totalDrift.toFixed(2)}`);
  log(`  balance-overstated pairs: ${rows.filter((r2) => r2.drift > 0).length}`);
  log(`  ledger-overstated pairs:   ${rows.filter((r2) => r2.drift < 0).length}`);
  log(`  balance rows with NO ledger behind them: ${[...byKey.values()].filter((r2) => r2.ledgerRows === 0 && r2.balanceOnHand !== 0).length}`);
  log(`  duplicate balance rows (balance_rows > 1): ${[...byKey.values()].filter((r2) => r2.balanceRows > 1).length}`);

  log('\n=== 3. Top 15 drift rows ===');
  TABLE(rows.slice(0, 15).map((r2) => ({
    item: r2.itemId.slice(0, 8), wh: r2.warehouseId.slice(0, 8),
    ledgerNet: r2.ledgerNet, onHand: r2.balanceOnHand, drift: r2.drift,
    balRows: r2.balanceRows })));

  log('\n=== 4. Would applying push anything negative? ===');
  const neg = rows.filter((r2) => r2.balanceRows === 1 && r2.uomId && (r2.balanceOnHand - r2.drift) < 0);
  log(`  pairs that would go negative: ${neg.length}`);
  TABLE(neg.slice(0, 10).map((r2) => ({ item: r2.itemId.slice(0, 8), wh: r2.warehouseId.slice(0, 8),
    onHand: r2.balanceOnHand, drift: r2.drift, after: (r2.balanceOnHand - r2.drift).toFixed(2) })));

  log('\n=== 5. Pairs SKIPPED by apply (rows != 1 or no uom) ===');
  log(`  skipped: ${rows.filter((r2) => !(r2.balanceRows === 1 && r2.uomId)).length}`);

  await c.end(); log('\n[DONE - read-only, nothing written]');
})().catch((err) => { console.error('ERR:', err.message); process.exit(1); });
