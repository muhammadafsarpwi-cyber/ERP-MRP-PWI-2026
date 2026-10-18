const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME }
});

async function run() {
  const c = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'inventory_balances'");
  console.log('Columns:', c.rows.map(r => r.column_name));

  const q = `
    SELECT ib.*, w.name as warehouse_name, i.item_code, i.name as item_name
    FROM inventory_balances ib
    JOIN warehouses w ON w.id = ib.warehouse_id
    JOIN items i ON i.id = ib.item_id
    WHERE w.name IN ('Main Warehouse', 'ST Straightener Department', 'SW Swagging Department', 'SPK Spoke Department')
    ORDER BY w.name, i.item_code
  `;
  const res = await pool.query(q);
  console.log(`Found ${res.rows.length} rows`);
  res.rows.forEach(r => {
    console.log(`[${r.warehouse_name}] ${r.item_code} (${r.item_name}): current=${r.current_balance}, reserved=${r.reserved_balance}, avail=${r.available_balance}`);
  });
  await pool.end();
}

run().catch(console.error);
