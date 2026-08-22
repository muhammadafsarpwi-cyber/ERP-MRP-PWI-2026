const { Client } = require('pg');
const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
const PE_ROW = '65600aac-a25c-4115-8230-6afbd4e1cb95';
(async () => {
  await c.connect();
  const st = JSON.parse(require('fs').readFileSync(__dirname + '/_tmp_guard_state.json', 'utf8'));
  await c.query('UPDATE public.production_entries SET machine_id=$1 WHERE id=$2', [st.prevMachineId, PE_ROW]);
  const chk = await c.query('SELECT machine_id FROM public.production_entries WHERE id=$1', [PE_ROW]);
  console.log('PE reverted, machine_id now:', chk.rows[0].machine_id);
  const canon = await c.query("SELECT COUNT(*)::int n FROM public.machines WHERE machine_id ~ '^MCH(0{2}[1-9]|0[1-5][0-7])$' AND is_active");
  console.log('canonical active:', canon.rows[0].n);
  const tot = await c.query('SELECT COUNT(*)::int total FROM public.machines');
  console.log('total:', tot.rows[0].total);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
