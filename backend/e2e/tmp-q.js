/* tmp-q: discover FT-01 chain + shifts */
const { Client } = require('pg');
(async () => {
  const c = await new Promise((r, j) => { const x = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } }); x.connect().then(() => r(x)).catch(j); });
  const m = (await c.query(`SELECT m.id, m.machine_code, d.name dep, s.name sec, dv.name div_, dv.id dvid, s.id secid, d.id depid FROM machines m JOIN departments d ON d.id=m.department_id JOIN sections s ON s.id=d.section_id JOIN divisions dv ON dv.id=s.division_id WHERE m.is_active=true ORDER BY m.machine_code LIMIT 8`)).rows;
  console.log(JSON.stringify(m, null, 1));
  const sh = (await c.query(`SELECT id, shift_code, name, planned_hours FROM shifts WHERE is_active=true ORDER BY shift_code LIMIT 6`)).rows;
  console.log(JSON.stringify(sh));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
