/* READ-ONLY: inventory_balances shape, for the purge-service balance write. */
const fs = require('fs'); const path = require('path');
const { Client } = require(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'node_modules', 'pg'));
function loadEnv() { const p = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env'); const o = {};
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim()); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); } return o; }

(async () => {
  const e = loadEnv();
  const c = new Client({ host: e.DB_HOST, port: Number(e.DB_PORT), user: e.DB_USERNAME, password: e.DB_PASSWORD, database: e.DB_DATABASE, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (sql) => (await c.query(sql)).rows;

  console.log('--- constraints on inventory_balances ---');
  console.log((await q(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
                       WHERE conrelid = 'inventory_balances'::regclass AND contype IN ('u','p')`))
    .map((r) => `${r.conname} :: ${r.def}`).join('\n') || '(none)');

  console.log('\n--- columns ---');
  console.log((await q(`SELECT column_name, data_type, is_nullable FROM information_schema.columns
                        WHERE table_name='inventory_balances' ORDER BY ordinal_position`))
    .map((r) => `${r.column_name} ${r.data_type}${r.is_nullable === 'NO' ? ' NOTNULL' : ''}`).join('\n'));

  console.log('\n--- stock_ledger defaults / nullability ---');
  console.log((await q(`SELECT column_name, is_nullable, column_default FROM information_schema.columns
                        WHERE table_name='stock_ledger' AND column_name IN
                        ('division_id','section_id','location_id','batch_id','serial_number','created_by','notes','reference_type','reference_number')`))
    .map((r) => `${r.column_name} ${r.is_nullable} default=${r.column_default}`).join('\n'));

  console.log('\n--- do production_entries rows purged by recycle bin leave ledger rows? ---');
  console.log((await q(`
    SELECT COUNT(*)::int AS entries_in_bin,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM stock_ledger sl WHERE sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
           ))::int AS with_ledger_rows
    FROM production_entries pe WHERE pe.deleted_at IS NOT NULL`)).map((r) => JSON.stringify(r)).join('\n'));

  await c.end(); console.log('\n[DONE - read-only]');
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
