const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  const s = await c.query("SELECT id, company_id, machine_code, machine_id, is_active FROM machines WHERE machine_code='ST-01'");
  console.log('MACHINES:', JSON.stringify(s.rows));
  const sh = await c.query('SELECT id, shift_code, company_id, is_active FROM shifts ORDER BY created_at LIMIT 12');
  console.log('SHIFTS:', JSON.stringify(sh.rows));
  await c.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
