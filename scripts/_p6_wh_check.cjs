const { Client } = require('pg');
const db = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
db.connect().then(async () => {
  const r = await db.query("SELECT location_code, warehouse_id, parent_location_id FROM warehouse_locations WHERE location_code LIKE 'CCD-%' ORDER BY location_code");
  console.table(r.rows);
  const w = await db.query('SELECT id, warehouse_code, name FROM warehouses');
  console.table(w.rows);
  await db.end();
  process.exit(0);
}).catch((e) => { console.error(e); process.exit(1); });
