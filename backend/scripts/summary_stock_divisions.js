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
  const q = await pool.query(`
    SELECT d.name as division_name, w.name as warehouse_name, count(ib.id) as item_count
    FROM warehouses w
    LEFT JOIN divisions d ON d.id = w.division_id
    LEFT JOIN inventory_balances ib ON ib.warehouse_id = w.id
    GROUP BY d.name, w.name
    ORDER BY d.name, w.name
  `);
  console.log('Stock balance summary across all warehouses:');
  console.table(q.rows);
  await pool.end();
}
run();
