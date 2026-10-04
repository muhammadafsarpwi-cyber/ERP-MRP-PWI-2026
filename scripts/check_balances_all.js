const { Client } = require('../backend/node_modules/pg');

async function check() {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
  });
  await client.connect();

  const bals = await client.query(`
    SELECT ib.id, ib.item_id, i.item_code, i.name, ib.warehouse_id, w.warehouse_code, ib.available, ib.on_hand
    FROM inventory_balances ib
    JOIN items i ON ib.item_id = i.id
    JOIN warehouses w ON ib.warehouse_id = w.id
    WHERE i.item_code ILIKE '%NP%' OR i.item_code ILIKE '%NIPPLE%' OR i.item_code ILIKE '%SPK%'
  `);
  console.log('All spoke & nipple balances:');
  console.table(bals.rows);

  await client.end();
}

check().catch(console.error);
