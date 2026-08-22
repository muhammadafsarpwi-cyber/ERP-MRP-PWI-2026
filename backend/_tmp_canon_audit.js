const { Client } = require('pg');
const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
(async () => {
  await c.connect();
  const r = await c.query(`
    SELECT machine_id, machine_code, machine_name, is_active, status
    FROM public.machines
    WHERE machine_id ~ '^MCH(00[1-9]|0[1-5][0-9])$'
    ORDER BY machine_id`);
  console.log('rows matching MCH001-MCH059 pattern:', r.rows.length);
  const inactive = r.rows.filter(x => !x.is_active);
  console.log('inactive among them:', JSON.stringify(inactive));
  const ids = new Set(r.rows.map(x => x.machine_id));
  const missing = [];
  for (let i = 1; i <= 57; i++) {
    const id = 'MCH' + String(i).padStart(3, '0');
    if (!ids.has(id)) missing.push(id);
  }
  console.log('missing from 1..57:', JSON.stringify(missing));
  const weird = await c.query("SELECT machine_id, machine_code, is_active FROM public.machines WHERE machine_id ~ '^MCH' AND machine_id NOT IN (SELECT regexp_replace('MCH'||n::text,'(\\d)(\\d)(\\d)$','\\1\\2\\3') FROM generate_series(1,57) n) AND machine_id < 'MCH058' ORDER BY machine_id");
  console.log('nonstandard ids < MCH058:', JSON.stringify(weird.rows));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
