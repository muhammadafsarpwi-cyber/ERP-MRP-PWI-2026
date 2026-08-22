const { Client } = require('pg');
const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
const PE_ROW = '65600aac-a25c-4115-8230-6afbd4e1cb95';
(async () => {
  await c.connect();
  const d1 = await c.query("DELETE FROM public.machines WHERE machine_code LIKE 'E2E-MM-%' RETURNING machine_code");
  console.log('purged test rows:', JSON.stringify(d1.rows));
  const cnt = await c.query('SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE is_active)::int active FROM public.machines');
  console.log('machines total/active:', JSON.stringify(cnt.rows[0]));
  const seq = await c.query("SELECT last_value FROM public.machines_machine_id_seq");
  console.log('seq last_value:', seq.rows[0].last_value);

  // ---- live delete-guard probe: temp-reference MCH001, expect API 409 handled outside ----
  const mch001 = await c.query("SELECT id FROM public.machines WHERE machine_id='MCH001'");
  const mid = mch001.rows[0].id;
  const prev = await c.query('SELECT machine_id FROM public.production_entries WHERE id=$1', [PE_ROW]);
  console.log('PE row prev machine_id:', prev.rows[0].machine_id);
  require('fs').writeFileSync(__dirname + '/_tmp_guard_state.json', JSON.stringify({ mid, prevMachineId: prev.rows[0].machine_id }));
  const upd = await c.query('UPDATE public.production_entries SET machine_id=$1 WHERE id=$2 RETURNING id', [mid, PE_ROW]);
  console.log('temp reference set:', JSON.stringify(upd.rows));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
