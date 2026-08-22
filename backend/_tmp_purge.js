const { Client } = require('pg');
async function main() {
  const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query("DELETE FROM machines WHERE machine_code LIKE 'E2E-MM-%' RETURNING machine_code");
  console.log('purged:', r.rows.map(x => x.machine_code));
  const n = await c.query('SELECT count(*)::int n FROM machines WHERE is_active');
  console.log('active now:', n.rows[0].n);
  await c.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
