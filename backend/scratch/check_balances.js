require('dotenv').config();
const { Client } = require('pg');
const c = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME }
});
c.connect().then(async () => {
  const r = await c.query(`
    SELECT sl.id, sl.item_id, sl.warehouse_id, sl.quantity, sl.transaction_type
    FROM stock_ledger sl
    JOIN items i ON i.id = sl.item_id
    JOIN warehouses w ON w.id = sl.warehouse_id
    WHERE (i.item_code = 'WIP-ST-001' AND w.warehouse_code = 'RM-002-SPI')
       OR (i.item_code = 'FG-NP-005' AND w.warehouse_code = 'CCD-FT-001')
  `);
  console.log('Stock ledger rows for these two:', r.rows);
  c.end();
}).catch(e => { console.error(e); process.exit(1); });
