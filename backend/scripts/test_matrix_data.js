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
    SELECT i.item_code, i.name, ib.on_hand, u.code as uom,
           (ib.on_hand / 144) as gross_calculated,
           (ib.on_hand / 144 / 10) as cartons_calculated
    FROM inventory_balances ib
    JOIN items i ON i.id = ib.item_id
    JOIN warehouses w ON w.id = ib.warehouse_id
    JOIN uoms u ON u.id = ib.uom_id
    WHERE w.name = 'SPI Nipple Packing Warehouse'
    ORDER BY i.item_code
  `);
  console.log('Production Open Stock Matrix data for SPI Nipple Packing Warehouse:');
  console.table(q.rows.map(r => ({
    item: r.item_code,
    name: r.name,
    pieces: Number(r.on_hand).toLocaleString() + ' PCS',
    gross: Number(r.gross_calculated).toLocaleString() + ' GRS',
    cartons: Number(r.cartons_calculated).toLocaleString() + ' CTN'
  })));
  await pool.end();
}
run();
