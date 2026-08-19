const pg = require('pg');
const fs = require('fs');
const c = new pg.Client({
  connectionString: 'postgresql://postgres.gnvobiwlzezostzjpqvu:pwiAfsar74()@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();
  const sql = fs.readFileSync('D:/ERP-MRP-PWI-2026/supabase/migrations/20260819150000_serial_numbers.sql', 'utf8');
  await c.query(sql);
  console.log('Migration applied successfully');
  let r = await c.query('SELECT count(*) as c FROM serial_numbers');
  console.log('serial_numbers rows:', r.rows[0].c);
  r = await c.query("SELECT trigger_name FROM information_schema.triggers WHERE event_object_table='serial_numbers'");
  console.log('Triggers:', JSON.stringify(r.rows));
  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
