const { Client } = require('pg');
const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
(async () => {
  await c.connect();
  const t = await c.query('SELECT COUNT(*)::int n FROM public.machines');
  console.log('total rows:', t.rows[0].n);
  const ina = await c.query("SELECT machine_id, machine_code, machine_name, status, is_active, updated_at::date FROM public.machines WHERE NOT is_active ORDER BY machine_id");
  console.log('inactive:', JSON.stringify(ina.rows, null, 1));
  const strays = await c.query("SELECT machine_id, machine_code, machine_name, is_active FROM public.machines WHERE machine_code LIKE 'E2E-%' OR machine_name ILIKE '%test%' ORDER BY machine_id");
  console.log('e2e/test rows:', JSON.stringify(strays.rows));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
