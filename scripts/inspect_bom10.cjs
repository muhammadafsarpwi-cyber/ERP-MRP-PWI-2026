const { Client } = require('../backend/node_modules/pg');

async function run() {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
  });
  await client.connect();
  const bomRes = await client.query(
    "SELECT b.* FROM bill_of_materials b WHERE b.bom_code = 'BOM-010'"
  );
  console.log('BOM:', bomRes.rows[0]);
  const txs = await client.query(
    "SELECT sl.transaction_type, sl.direction, i.item_code, i.name, sl.quantity, u.code as uom, w.warehouse_code FROM stock_ledger sl JOIN items i ON sl.item_id = i.id LEFT JOIN uoms u ON sl.uom_id = u.id JOIN warehouses w ON sl.warehouse_id = w.id WHERE sl.reference_id = '12b61a5e-bedc-4c1b-8fb5-c4e0515ba751' ORDER BY sl.created_at ASC"
  );
  console.log('Stock Ledger for PE:');
  console.table(txs.rows);
  await client.end();
}

run().catch(console.error);
