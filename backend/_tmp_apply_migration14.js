const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'supabase', 'migrations', '20260822030000_erp_00014_machine_master.sql');

async function main() {
  const raw = fs.readFileSync(FILE, 'utf8');
  const lines = raw.split('\n').filter((l) => !l.trim().startsWith('--'));
  let sql = lines.join('\n');
  sql = sql.replace(/^\s*BEGIN\s*;?\s*$/gim, '').replace(/^\s*COMMIT\s*;?\s*$/gim, '');
  // Split on ; at end of statements — safe here: no function bodies with embedded semicolons except COMMENT/ALTER which have none.
  const stmts = sql
    .split(/;\s*(?=\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const c = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  let n = 0;
  for (const s of stmts) {
    try {
      await c.query(s.endsWith(';') ? s : s + ';');
      n++;
    } catch (e) {
      console.error('FAILED at statement #' + (n + 1) + ': ' + s.slice(0, 120));
      console.error(e.message);
      process.exitCode = 1;
      await c.end();
      return;
    }
  }
  console.log('Applied ' + n + ' statements from ERP-00014');
  await c.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
