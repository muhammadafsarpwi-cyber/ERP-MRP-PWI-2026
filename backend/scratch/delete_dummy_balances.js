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
    DELETE FROM inventory_balances
    WHERE id IN ('879c5637-7e83-4586-ac63-23e2781da5ee', 'bcf6fead-ebde-45d4-9c40-559ce72e7f18')
    RETURNING id, item_id, warehouse_id
  `);
  console.log('Deleted dummy balances:', r.rows);
  c.end();
}).catch(e => { console.error(e); process.exit(1); });
