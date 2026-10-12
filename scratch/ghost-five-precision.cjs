/**
 * PRECISION TEST â€” were the ghost balance row and the SPI-SPK-003 receipt
 * written in the SAME transaction? READ-ONLY.
 *
 * Postgres `now()` is transaction-scoped: every row a transaction inserts
 * carries the identical microsecond timestamp. So if the CCD-SP-002 balance
 * row and the SPI-SPK-003 receipt share a timestamp to the microsecond, one
 * transaction put them there â€” and since both writers take the same
 * `warehouseId` argument, something else must have supplied the warehouse.
 *
 * If the timestamps DIFFER, they were separate transactions and the
 * coincidence is a clock-rate artifact instead.
 *
 * Run:  node scratch/ghost-five-precision.cjs
 */
const fs = require('fs');
const path = require('path');
const { Client } = require(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'node_modules', 'pg'));

function loadEnv() {
  const p = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env');
  const o = {};
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim());
    if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return o;
}

const log = (s = '') => console.log(s);
const TABLE = (rows) => {
  if (!rows || !rows.length) { log('  (none)'); return; }
  log('  ' + Object.keys(rows[0]).join(' | '));
  for (const r of rows) log('  ' + Object.values(r).map(String).join(' | '));
};

(async () => {
  const e = loadEnv();
  const c = new Client({
    host: e.DB_HOST, port: Number(e.DB_PORT), user: e.DB_USERNAME,
    password: e.DB_PASSWORD, database: e.DB_DATABASE, ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const company = (await q(`SELECT id FROM companies ORDER BY created_at LIMIT 1`))[0].id;

  const WH_CCD = 'dc212cb0-364c-47ba-88db-1bde18f842de';
  const WH_SPK = '29e71f41-713e-45dc-bd69-4a3ce05a3801';
  const CODES = ['WIP-SP-002', 'WIP-SP-005', 'WIP-SP-010', 'WIP-SP-013', 'WIP-SP-014'];

  log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
  log('  PRECISION TEST â€” microsecond timestamps, same transaction or not?');
  log('  READ-ONLY. Nothing in this script writes to the database.');
  log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');

  const items = await q(`SELECT id, item_code FROM items WHERE company_id=$1 AND item_code = ANY($2)`,
    [company, CODES]);
  const itemIds = items.map((r) => r.id);

  // Every row written in the two-second anchors around each ghost balance row
  // creation, from BOTH tables, sorted by time. If the balance row and a
  // receipt ledger row are adjacent with identical microsecond stamps, they
  // were one transaction.
  log('\n\n1. INTERLEAVED TIMELINE â€” both tables, ordered by microsecond');
  log('   `same_txn` marks rows sharing an exact timestamp with the row above.');

  const rows = await q(`
    WITH anchors AS (
      SELECT b.item_id, b.created_at AS anchor
        FROM inventory_balances b
       WHERE b.company_id=$1 AND b.warehouse_id=$2 AND b.item_id = ANY($3)
    )
    SELECT 'BALANCE.created' AS src,
           i.item_code AS item,
           b.on_hand AS qty,
           'CCD-SP-002' AS warehouse,
           to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS ts,
           b.id AS row_id
      FROM inventory_balances b
      JOIN items i ON i.id = b.item_id
      JOIN anchors w ON w.item_id = b.item_id
     WHERE b.company_id=$1
       AND (ABS(EXTRACT(EPOCH FROM (b.created_at - w.anchor))) <= 3)
    UNION ALL
    SELECT 'BALANCE.updated', i.item_code, b.on_hand, 'CCD-SP-002',
           to_char(b.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.US'), b.id
      FROM inventory_balances b
      JOIN items i ON i.id = b.item_id
      JOIN anchors w ON w.item_id = b.item_id
     WHERE b.company_id=$1
       AND (ABS(EXTRACT(EPOCH FROM (b.updated_at - w.anchor))) <= 3)
    UNION ALL
    SELECT 'LEDGER', i.item_code, sl.quantity, wh.warehouse_code,
           to_char(sl.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US'), sl.id
      FROM stock_ledger sl
      JOIN items i ON i.id = sl.item_id
      JOIN warehouses wh ON wh.id = sl.warehouse_id
      JOIN anchors w ON w.item_id = sl.item_id
     WHERE sl.company_id=$1
       AND (ABS(EXTRACT(EPOCH FROM (sl.created_at - w.anchor))) <= 3)
    ORDER BY ts`, [company, WH_CCD, itemIds]);

  let prevTs = null;
  let prevWh = null;
  const out = [];
  for (const r of rows) {
    const sameTxn = prevTs === r.ts ? 'YES' : '';
    const sameWh = prevWh === r.warehouse ? 'same wh' : 'DIFF WH';
    out.push({
      src: r.src, item: r.item, warehouse: r.warehouse, qty: Number(r.qty),
      ts: r.ts, identical_ts_as_above: sameTxn, vs_row_above: prevTs ? sameWh : '(first)',
    });
    prevTs = r.ts;
    prevWh = r.warehouse;
  }
  TABLE(out);

  // â”€â”€ 2. Was a SPI-SPK-003 balance row created in the same transaction? â”€â”€â”€
  log('\n\n2. WAS THE CORRECT WAREHOUSE\'S BALANCE ROW CREATED IN THE SAME TICK?');
  const both = await q(`
    SELECT i.item_code,
           to_char(ccd.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS ccd_created,
           to_char(spk.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS spk_created,
           ccd.created_at = spk.created_at AS identical_ts,
           ROUND(ccd.on_hand::numeric,2) AS ccd_on_hand,
           ROUND(spk.on_hand::numeric,2) AS spk_on_hand
      FROM inventory_balances ccd
      JOIN items i ON i.id = ccd.item_id
      LEFT JOIN inventory_balances spk
        ON spk.company_id = ccd.company_id AND spk.item_id = ccd.item_id
       AND spk.warehouse_id = $3
     WHERE ccd.company_id=$1 AND ccd.warehouse_id=$2 AND ccd.item_id = ANY($4)
     ORDER BY i.item_code`, [company, WH_CCD, WH_SPK, itemIds]);
  TABLE(both);

  // â”€â”€ 3. Does the balance row's created_at match ANY ledger row exactly? â”€â”€
  log('\n\n3. EXACT MICROSECOND MATCH: balance row vs any ledger row, any warehouse');
  const match = await q(`
    SELECT i.item_code,
           to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS balance_ts,
           w.warehouse_code AS ledger_wh,
           sl.transaction_type, ROUND(sl.quantity::numeric,2) AS qty,
           sl.reference_number,
           to_char(sl.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS ledger_ts,
           b.created_at = sl.created_at AS exact_match
      FROM inventory_balances b
      JOIN items i ON i.id = b.item_id
      JOIN stock_ledger sl
        ON sl.company_id = b.company_id AND sl.item_id = b.item_id
       AND sl.created_at = b.created_at
      JOIN warehouses w ON w.id = sl.warehouse_id
     WHERE b.company_id=$1 AND b.warehouse_id=$2 AND b.item_id = ANY($3)
     ORDER BY i.item_code, w.warehouse_code`, [company, WH_CCD, itemIds]);
  TABLE(match);
  const exact = match.filter((m) => m.exact_match).length;
  log(`\n   ${exact}/${match.length} exact microsecond matches.`);
  const crossWh = match.filter((m) => m.exact_match && m.ledger_wh !== 'CCD-SP-002').length;
  log(`   ${crossWh} of those are in a DIFFERENT warehouse than the balance row â€”`);
  log(`   i.e. one transaction wrote a ledger row to one warehouse and a`);
  log(`   balance row to another.`);

  await c.end();
  log('\n[DONE â€” read-only, nothing was written]');
})().catch((err) => { console.error('ERR:', err.message); process.exit(1); });

