const { Client } = require('./node_modules/pg');
require('dotenv').config({ path: './.env' });

const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT id, item_code, name, weight_per_piece, pieces_per_kg, weight, cost_price, item_type
    FROM items 
    WHERE item_code IN ('WIP-ST-001', 'WIP-ST-002', 'WIP-ST-003', 'WIP-ST-004', 'WIP-ST-005')
    ORDER BY item_code
  `);
  console.table(res.rows);

  // Also check if there are other columns related to weight
  const cols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'items' AND (column_name LIKE '%wt%' OR column_name LIKE '%weight%' OR column_name LIKE '%kg%' OR column_name LIKE '%piece%')
  `);
  console.log('Weight related columns:');
  console.table(cols.rows);

  await client.end();
}
run().catch(console.error);
