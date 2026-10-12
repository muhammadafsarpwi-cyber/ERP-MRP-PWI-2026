/**
 * Last read-only checks before the write. READ-ONLY.
 *   1. division_id / section_id / department_id on the 6 stranded reversal rows
 *      and on the 11 receipts the 10-11 script moved (did IT also fix division?).
 *   2. reserved on the destination balance rows (we must not clobber it).
 *   3. Are there ANY other stock_ledger rows in CCD-SP-002 for these 6 items?
 *   4. division_id of the two warehouses.
 *
 * Run:  node scratch/ghost-five-prewrite.cjs > scratch/ghost-prewrite.txt
 */
const path = require('path');
const { Client } = require(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'node_modules', 'pg'));

const loadEnv = () => {
  const fs = require('fs');
  const o = {};
  for (const l of fs
    .readFileSync(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env'), 'utf8')
    .split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim());
    if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return o;
};

const log = (s = '') => console.log(s);
const TABLE = (rows) => {
  if (!rows || !rows.length) {
    log('  (none)');
    return;
  }
  log('  ' + Object.keys(rows[0]).join(' | '));
  for (const r of rows) log('  ' + Object.values(r).map(String).join(' | '));
};

const CCD = 'dc212cb0-364c-47ba-88db-1bde18f842de';
const SPK = '29e71f41-713e-45dc-bd69-4a3ce05a3801';
const ITEMS = [
  'WIP-SP-002',
  'WIP-SP-005',
  'WIP-SP-006',
  'WIP-SP-010',
  'WIP-SP-013',
  'WIP-SP-014',
];

(async () => {
  const e = loadEnv();
  const c = new Client({
    host: e.DB_HOST,
    port: Number(e.DB_PORT),
    user: e.DB_USERNAME,
    password: e.DB_PASSWORD,
    database: e.DB_DATABASE,
    ssl: { rejectUnauthorized: false, servername: e.DB_SSL_SERVERNAME },
  });
  await c.connect();
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const company = (await q(`SELECT id FROM companies ORDER BY created_at LIMIT 1`))[0].id;
  const itemIds = (await q(
    `SELECT id FROM items WHERE company_id=$1 AND item_code = ANY($2)`,
    [company, ITEMS],
  )).map((r) => r.id);

  log('════════════════════════════════════════════════════════════════════');
  log('  PRE-WRITE CHECKS (READ-ONLY)');
  log('════════════════════════════════════════════════════════════════════');

  log('\n1. ORG COLUMNS ON THE 6 STRANDED REVERSAL ROWS');
  TABLE(await q(
    `SELECT sl.id, i.item_code, w.warehouse_code AS wh, pe.entry_number,
            sl.direction, ROUND(sl.quantity::numeric,3) AS qty,
            sl.division_id::text AS division_id,
            COALESCE(d.division_code,'(null)') AS division_code,
            sl.section_id::text AS section_id,
            sl.department_id::text AS department_id
       FROM stock_ledger sl
       JOIN items i ON i.id = sl.item_id
       JOIN warehouses w ON w.id = sl.warehouse_id
       LEFT JOIN production_entries pe ON pe.id = sl.reference_id
       LEFT JOIN divisions d ON d.id = sl.division_id
      WHERE sl.company_id=$1 AND sl.transaction_type='PRODUCTION_REVERSAL'
        AND sl.warehouse_id=$2
      ORDER BY i.item_code, sl.created_at`,
    [company, CCD],
  ));

  log('\n2. ORG COLUMNS ON THE 11 RECEIPTS THE 10-11 SCRIPT MOVED (are they consistent?)');
  TABLE(await q(
    `SELECT i.item_code, w.warehouse_code AS wh, sl.division_id::text AS division_id,
            COALESCE(d.division_code,'(null)') AS division_code,
            COUNT(*) AS rows,
            string_agg(DISTINCT sl.transaction_type, ',') AS types
       FROM stock_ledger sl
       JOIN items i ON i.id = sl.item_id
       JOIN warehouses w ON w.id = sl.warehouse_id
       LEFT JOIN divisions d ON d.id = sl.division_id
       JOIN production_entries pe ON pe.id = sl.reference_id
      WHERE sl.company_id=$1
        AND pe.entry_number IN ('PE-2026-00270','PE-2026-00290','PE-2026-00293',
             'PE-2026-00296','PE-2026-00298','PE-2026-00301','PE-2026-00308',
             'PE-2026-00309','PE-2026-00311','PE-2026-00312','PE-2026-00406')
      GROUP BY 1,2,3,4 ORDER BY 1,2`,
    [company],
  ));

  log('\n3. ARE THE STRANDED ROWS THE ONLY stock_ledger ROWS IN CCD-SP-002 FOR THESE ITEMS?');
  TABLE(await q(
    `SELECT i.item_code, sl.transaction_type, COUNT(*) AS rows,
            ROUND(SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)::numeric,3) AS net
       FROM stock_ledger sl
       JOIN items i ON i.id = sl.item_id
      WHERE sl.company_id=$1 AND sl.item_id = ANY($2) AND sl.warehouse_id=$3
      GROUP BY 1,2 ORDER BY 1,2`,
    [company, itemIds, CCD],
  ));

  log('\n4. DESTINATION BALANCE ROWS — reserved must be 0 (we move available, not reserved)');
  TABLE(await q(
    `SELECT i.item_code, w.warehouse_code AS wh, ib.id,
            ROUND(ib.on_hand::numeric,3) AS on_hand,
            ROUND(ib.reserved::numeric,3) AS reserved,
            ROUND(ib.available::numeric,3) AS available,
            ib.status
       FROM inventory_balances ib
       JOIN items i ON i.id = ib.item_id
       JOIN warehouses w ON w.id = ib.warehouse_id
      WHERE ib.company_id=$1 AND ib.item_id = ANY($2) AND ib.warehouse_id=$3`,
    [company, itemIds, SPK],
  ));

  log('\n5. DESTINATION BALANCE ROWS — reserved in CCD-SP-002 (source side)');
  TABLE(await q(
    `SELECT i.item_code, ROUND(ib.on_hand::numeric,3) AS on_hand,
            ROUND(ib.reserved::numeric,3) AS reserved,
            ROUND(ib.available::numeric,3) AS available, ib.status
       FROM inventory_balances ib
       JOIN items i ON i.id = ib.item_id
      WHERE ib.company_id=$1 AND ib.item_id = ANY($2) AND ib.warehouse_id=$3
      ORDER BY i.item_code`,
    [company, itemIds, CCD],
  ));

  log('\n6. WAREHOUSE DIVISIONS');
  TABLE(await q(
    `SELECT w.warehouse_code, w.division_id::text AS division_id,
            COALESCE(d.division_code,'(null)') AS division_code, d.name AS division_name
       FROM warehouses w LEFT JOIN divisions d ON d.id = w.division_id
      WHERE w.id IN ($1,$2)`,
    [CCD, SPK],
  ));

  log('\n7. IS stock_ledger.update() REALLY CALLED ANYWHERE? (defs + callers)');
  TABLE(await q(
    `SELECT tablename, indexname FROM pg_indexes
      WHERE tablename='stock_ledger' AND indexdef LIKE '%UNIQUE%' ORDER BY 1,2`));

  await c.end();
  log('\n[DONE — read-only, nothing was written]');
})().catch((err) => {
  console.error('ERR:', err.message);
  process.exit(1);
});
