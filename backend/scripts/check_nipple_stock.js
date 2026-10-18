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
    SELECT ib.id, i.item_code, i.name, ib.on_hand, ib.available, u.code as uom
    FROM inventory_balances ib
    JOIN items i ON i.id = ib.item_id
    LEFT JOIN uoms u ON u.id = ib.uom_id
    JOIN warehouses w ON w.id = ib.warehouse_id
    WHERE w.name = 'SPI Nipple Packing Warehouse'
    ORDER BY i.item_code
  `);
  console.log('SPI Nipple Packing Warehouse current balances:');
  console.table(q.rows);

  const q2 = await pool.query(`
    SELECT i.item_code, i.name,
      SUM(CASE WHEN sl.direction = 'IN' THEN sl.quantity ELSE 0 END) as total_in,
      SUM(CASE WHEN sl.direction = 'OUT' THEN sl.quantity ELSE 0 END) as total_out
    FROM stock_ledger sl
    JOIN items i ON i.id = sl.item_id
    WHERE i.item_code LIKE 'FG-NP%'
    GROUP BY i.item_code, i.name
    ORDER BY i.item_code
  `);
  console.log('Stock ledger totals for Nipple items:');
  console.table(q2.rows.map(r => ({
    item: r.item_code,
    name: r.name,
    in_pcs: Number(r.total_in).toLocaleString(),
    in_grs: (Number(r.total_in) / 144).toLocaleString() + ' GRS',
    out_pcs: Number(r.total_out).toLocaleString(),
    out_grs: (Number(r.total_out) / 144).toLocaleString() + ' GRS'
  })));

  await pool.end();
}
run();
