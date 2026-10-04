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

  // Let's check the production_entries table for the failed or recent entries
  const recent = await client.query(`
    SELECT id, entry_number, item_id, uom_id, target_quantity, actual_quantity, raw_material_warehouse_id, remarks, created_at 
    FROM production_entries 
    WHERE remarks LIKE '%HAND PACKING%' 
    ORDER BY created_at DESC LIMIT 5
  `);
  console.log('Recent hand packing entries in DB:');
  console.table(recent.rows);

  // Check the stock ledger
  const sl = await client.query(`
    SELECT sl.id, i.item_code, w.warehouse_code, sl.transaction_type, sl.quantity, sl.direction, sl.created_at 
    FROM stock_ledgers sl 
    JOIN items i ON sl.item_id = i.id 
    JOIN warehouses w ON sl.warehouse_id = w.id 
    ORDER BY sl.created_at DESC LIMIT 10
  `);
  console.log('Recent stock ledger rows:');
  console.table(sl.rows);

  await client.end();
}
run().catch(console.error);
