const { Client } = require('pg');
const db = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
(async () => {
  await db.connect();
  const c = await db.query('SELECT count(*)::int AS n, count(DISTINCT warehouse_id)::int AS w FROM warehouse_locations');
  console.log('total locations / warehouses:', JSON.stringify(c.rows[0]));
  const r = await db.query(
    `SELECT l.location_code, l.name, l.parent_location_id, p.location_code AS parent_code, w.warehouse_code
     FROM warehouse_locations l
     LEFT JOIN warehouse_locations p ON p.id = l.parent_location_id
     LEFT JOIN warehouses w ON w.id = l.warehouse_id
     ORDER BY l.created_at DESC`
  );
  console.log('rows (API default order createdAt DESC):');
  r.rows.forEach((x, i) => console.log(` ${i + 1}. ${x.location_code} | wh=${x.warehouse_code} | parent=${x.parent_code || 'NULL'}`));
  await db.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
