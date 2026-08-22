const { Client } = require('pg');
async function main() {
  const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query("SELECT id, division_id, section_id, department_code, name FROM departments WHERE is_active ORDER BY department_code");
  for (const row of r.rows) console.log(JSON.stringify(row));
  const m = await c.query("SELECT machine_code, department_id FROM machines WHERE is_active ORDER BY machine_code");
  console.log('--- machines ---');
  for (const row of m.rows) console.log(JSON.stringify(row));
  await c.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
