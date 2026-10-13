const { Client } = require('pg');
require('dotenv').config({ path: 'd:/ERP-MRP-PWI-2026/backend/.env' });

const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME },
});

async function check() {
  await client.connect();
  const psa = await client.query(`
    SELECT sl.id, sl.company_id, sl.item_id, i.item_code, i.name as item_name, sl.warehouse_id, w.warehouse_code, sl.transaction_type, sl.direction, sl.quantity, sl.reference_type, sl.reference_number, sl.notes, sl.created_at
    FROM stock_ledger sl
    LEFT JOIN items i ON i.id = sl.item_id
    LEFT JOIN warehouses w ON w.id = sl.warehouse_id
    WHERE sl.reference_number IN ('PSA-20261006-1633', 'PSA-20261011-1347')
  `);
  console.log('PSA entries:');
  console.table(psa.rows);

  const bal = await client.query(`
    SELECT ib.id, ib.item_id, i.item_code, ib.warehouse_id, w.warehouse_code, ib.on_hand, ib.available, ib.reserved
    FROM inventory_balances ib
    JOIN items i ON i.id = ib.item_id
    JOIN warehouses w ON w.id = ib.warehouse_id
    WHERE i.item_code = 'WIP-ST-001'
  `);
  console.log('WIP-ST-001 balances:');
  console.table(bal.rows);

  // Also check ledger total for WIP-ST-001 in that warehouse
  const ledgerSum = await client.query(`
    SELECT 
      SUM(CASE WHEN sl.direction = 'IN' THEN sl.quantity ELSE -sl.quantity END) as net_ledger_qty,
      COUNT(*) as count
    FROM stock_ledger sl
    LEFT JOIN items i ON i.id = sl.item_id
    WHERE i.item_code = 'WIP-ST-001'
  `);
  console.log('WIP-ST-001 net ledger sum:');
  console.table(ledgerSum.rows);

  await client.end();
}
check().catch(console.error);
