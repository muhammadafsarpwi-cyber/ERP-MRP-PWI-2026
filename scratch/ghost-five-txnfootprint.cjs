/**
 * FULL TRANSACTION FOOTPRINT. READ-ONLY.
 *
 * Postgres `now()` is transaction-scoped, so every row one transaction inserts
 * carries an identical microsecond timestamp. The ghost balance rows and the
 * SPI-SPK-003 receipts share one to the microsecond — so they were written by
 * ONE transaction.
 *
 * This enumerates EVERY row in EVERY public table at that exact timestamp, to
 * see the whole transaction in one shot: which tables were touched, and with
 * which warehouse on each. That is the only way to identify the writer, since
 * no single code path passes two different warehouses.
 *
 * Run:  node scratch/ghost-five-txnfootprint.cjs
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

const ANCHORS = [
  '2026-10-09 11:30:33.168514+00', // WIP-SP-002 ghost created + PE-2026-00298 receipt
  '2026-10-09 11:33:12.572932+00', // WIP-SP-005 ghost created + PE-2026-00301 receipt
  '2026-10-09 11:16:40.648830+00', // WIP-SP-010 ghost created + PE-2026-00290 receipt
  '2026-10-09 11:20:05.929161+00', // WIP-SP-013 ghost created + PE-2026-00293 receipt
  '2026-10-09 09:41:57.360200+00', // WIP-SP-014 ghost created + PE-2026-00270 receipt
];

(async () => {
  const e = loadEnv();
  const c = new Client({
    host: e.DB_HOST, port: Number(e.DB_PORT), user: e.DB_USERNAME,
    password: e.DB_PASSWORD, database: e.DB_DATABASE, ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;

  log('══════════════════════════════════════════════════════════════════════════');
  log('  FULL TRANSACTION FOOTPRINT — every row at each ghost timestamp');
  log('  READ-ONLY. Nothing in this script writes to the database.');
  log('══════════════════════════════════════════════════════════════════════════');

  // Every public table that has a timestamptz created_at column.
  const tables = (await q(`
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema='public'
       AND c.column_name='created_at'
       AND c.data_type='timestamp with time zone'
     GROUP BY c.table_name
     ORDER BY c.table_name`)).map((r) => r.table_name);

  log(`\n${tables.length} tables carry a timestamptz created_at.`);

  for (const anchor of ANCHORS) {
    log(`\n\n═══ TRANSACTION AT ${anchor} ═══════════════════════════════════`);
    let total = 0;
    for (const t of tables) {
      let rows;
      try {
        rows = await q(`SELECT * FROM public."${t}" WHERE created_at = $1::timestamptz LIMIT 200`, [anchor]);
      } catch { continue; }
      if (!rows.length) continue;
      total += rows.length;
      log(`\n  ── public.${t}  (${rows.length} row(s)) ──`);
      const keys = Object.keys(rows[0]).filter((k) =>
        ['id', 'company_id', 'item_id', 'warehouse_id', 'production_entry_id', 'entry_id',
         'transaction_type', 'direction', 'quantity', 'on_hand', 'uom_id', 'reference_type',
         'reference_id', 'reference_number', 'division_id', 'batch_id', 'location_id',
         'is_active', 'status', 'notes'].includes(k));
      log('    ' + keys.join(' | '));
      for (const r of rows) {
        const vals = keys.map((k) => {
          const v = r[k];
          if (v === null || v === undefined) return 'null';
          const s = String(v);
          return s.length > 46 ? s.slice(0, 46) + '…' : s;
        });
        log('    ' + vals.join(' | '));
      }
    }
    log(`\n  TOTAL rows in this transaction: ${total}`);
  }

  await c.end();
  log('\n[DONE — read-only, nothing was written]');
})().catch((err) => { console.error('ERR:', err.message); process.exit(1); });
