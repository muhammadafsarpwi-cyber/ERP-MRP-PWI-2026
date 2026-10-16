const { Client } = require('pg');
require('dotenv').config({ path: 'd:/ERP-MRP-PWI-2026/backend/.env' });
const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME }
});
async function main() {
  await client.connect();

  const entries = await client.query(`
    SELECT pe.id, pe.entry_number, pe.entry_date, pe.machine_no, pe.item_id, i.item_code, i.name, pe.coil_size
    FROM production_entries pe
    LEFT JOIN items i ON i.id = pe.item_id
    WHERE pe.entry_date::text LIKE '2026-10-14%'
    ORDER BY pe.created_at DESC
    LIMIT 10
  `);
  console.log('Production Entries 2026-10-14:', entries.rows);

  // Also check production_entry_items
  if (entries.rows.length > 0) {
    const entryId = entries.rows[0].id;
    const items = await client.query(`
      SELECT pei.*, i.item_code, i.name, i.wire_size_mm, i.diameter_mm
      FROM production_entry_items pei
      LEFT JOIN items i ON i.id = pei.item_id
      WHERE pei.production_entry_id = $1
    `, [entryId]);
    console.log('Production Entry Items for', entryId, ':', items.rows);
  }

  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
