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
  const res = await client.query(`
    SELECT b.item_id, i.item_code, i.name, w.warehouse_code, b.available 
    FROM inventory_balances b 
    JOIN items i ON i.id = b.item_id 
    JOIN warehouses w ON w.id = b.warehouse_id 
    WHERE b.item_id IN ('1fb94e18-cb0a-4447-adfa-13f6d7c9e4af', '43cec585-2413-4374-a77d-fc4ed263276d')
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
run();
