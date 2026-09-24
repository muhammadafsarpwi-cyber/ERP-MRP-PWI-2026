const { Client } = require('pg');
const db = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
db.connect().then(async () => {
  const r = await db.query("SELECT location_code, name, description FROM warehouse_locations WHERE location_code IN ('CCD-C01','CCD-C02','CCD-A01')");
  console.table(r.rows);
  await db.end();
  process.exit(0);
}).catch((e) => { console.error(e); process.exit(1); });
