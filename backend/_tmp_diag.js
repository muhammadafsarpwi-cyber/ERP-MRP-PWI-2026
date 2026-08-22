const { Client } = require('pg');
async function main() {
  const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r1 = await c.query("SELECT current_database() AS db, current_user AS usr, current_schemas(true) AS path");
  console.log('conn:', JSON.stringify(r1.rows[0]));
  const r2 = await c.query("SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_name ILIKE '%machine%' ORDER BY 1,2");
  console.log('machine-like relations:', JSON.stringify(r2.rows));
  try {
    const r3 = await c.query("SELECT count(*)::int AS n FROM public.machines");
    console.log('public.machines count:', r3.rows[0].n);
    const r4 = await c.query("SELECT count(*)::int AS n FROM public.machines WHERE is_active");
    console.log('public.machines active:', r4.rows[0].n);
  } catch (e) { console.log('public.machines query FAILED:', e.message); }
  await c.end();
}
main().catch((e) => { console.error('DIAG FAIL', e.message); process.exit(1); });
