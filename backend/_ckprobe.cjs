const { Client } = require('pg');
require('dotenv').config({ path: 'D:\\ERP-MRP-PWI-2026\\backend\\.env' });
(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE });
  await c.connect();
  const r = await c.query(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'items'::regclass AND contype='c' ORDER BY conname`);
  for (const row of r.rows) console.log(row.conname, '=>', row.def);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
