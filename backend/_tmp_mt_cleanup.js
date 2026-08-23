const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  const e = await c.query("DELETE FROM production_entries WHERE operator_name='E2E Operator' AND machine_target_id IS NOT NULL RETURNING id");
  console.log('entries deleted:', e.rowCount);
  const t = await c.query("DELETE FROM machine_targets WHERE remarks LIKE 'E2E-MT-%' OR remarks='DBG-FALLBACK' RETURNING id");
  console.log('targets deleted:', t.rowCount);
  const chk = await c.query("SELECT COUNT(*)::int n FROM machine_targets WHERE remarks LIKE 'E2E-MT-%'");
  console.log('remaining markers:', chk.rows[0].n);
  await c.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
