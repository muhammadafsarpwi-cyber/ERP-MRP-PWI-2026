const { Client } = require('pg');
require('dotenv').config({ path: 'd:/ERP-MRP-PWI-2026/backend/.env' });

const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log('Connected to Supabase!');

  // Check divisions
  const divs = await client.query('SELECT id, name, division_code FROM divisions LIMIT 10');
  console.log('Divisions in DB:', JSON.stringify(divs.rows, null, 2));

  // Check warehouses
  const whs = await client.query('SELECT id, name, warehouse_code, division_id FROM warehouses LIMIT 10');
  console.log('Warehouses in DB:', JSON.stringify(whs.rows, null, 2));

  // Check goods_receipts columns
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'goods_receipts'
    ORDER BY ordinal_position;
  `);
  console.log('goods_receipts columns in DB:', JSON.stringify(cols.rows, null, 2));

  await client.end();
}

main().catch(console.error);
