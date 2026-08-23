const { Client } = require('pg');
const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
(async () => {
  await c.connect();
  const shifts = await c.query('SELECT id, company_id, shift_code, name, planned_hours, status, is_active FROM public.shifts ORDER BY shift_code');
  console.log('shifts:', JSON.stringify(shifts.rows));
  const uoms = await c.query("SELECT id, code, name, symbol, uom_type, status FROM public.uoms WHERE UPPER(code) IN ('KG','PCS','METER','MT','M') OR UPPER(symbol) IN ('KG','PCS','M') ORDER BY code");
  console.log('uoms (kg/pcs/meter-ish):', JSON.stringify(uoms.rows));
  const allUoms = await c.query('SELECT COUNT(*)::int n FROM public.uoms');
  console.log('uom count:', allUoms.rows[0].n);
  const peCols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='production_entries' AND column_name IN ('machine_target_id','standard_hours','calculated_target','working_hours','running_hours','target_quantity')");
  console.log('PE relevant cols:', JSON.stringify(peCols.rows));
  const perms = await c.query("SELECT permission_code FROM public.permissions WHERE permission_code LIKE '%machine%' ORDER BY permission_code");
  console.log('machine permissions:', JSON.stringify(perms.rows.map(r => r.permission_code)));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
