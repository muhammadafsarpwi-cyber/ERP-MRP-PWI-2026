/* PROMPT-07-FIX runner: applies the Machine Master chain x3 (idempotency proof) */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const FILES = [
  '20260821190000_erp_00012b_machine_master_base.sql',
  '20260822000000_erp_00013_daily_production_entry.sql',
  '20260822030000_erp_00014_machine_master.sql',
  '20260822040000_erp_00014b_machine_master_alignment.sql',
];
const C = { host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } };

function prep(sql) {
  return sql.split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .filter((l) => !/^BEGIN;\s*$/i.test(l.trim()))
    .filter((l) => !/^COMMIT;\s*$/i.test(l.trim()))
    .join('\n');
}

async function runOnce(tag) {
  const c = new Client(C);
  await c.connect();
  c.on('notice', (n) => console.log('   notice:', n.message.trim()));
  for (const f of FILES) {
    const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
    try {
      await c.query(prep(raw));
      console.log(`[${tag}] OK   ${f}`);
    } catch (e) {
      const q = prep(raw);
      const pos = e.position ? parseInt(e.position, 10) : null;
      console.error(`[${tag}] FAIL ${f}\n   ${e.message}`);
      if (pos) {
        console.error(`   position=${pos} context: ...${JSON.stringify(q.slice(Math.max(0, pos - 120), pos + 120))}...`);
      }
      await c.end();
      process.exit(1);
    }
  }
  await c.end();
}

(async () => {
  for (const tag of ['RUN-1', 'RUN-2', 'RUN-3']) {
    console.log(`===== ${tag} =====`);
    await runOnce(tag);
  }
  console.log('ALL RUNS PASSED');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
