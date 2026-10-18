const { Client } = require('pg');
require('dotenv').config({ path: 'd:/ERP-MRP-PWI-2026/backend/.env' });

const client = new Client({
  host: process.env.DB_HOST,
  port: 6543,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log('Connected to Supabase!');

  // Allow po_id to be nullable so goods receipts can be created from PRs or direct receipts
  await client.query('ALTER TABLE goods_receipts ALTER COLUMN po_id DROP NOT NULL;');
  console.log('ALTER TABLE goods_receipts ALTER COLUMN po_id DROP NOT NULL executed successfully.');

  await client.end();
}

main().catch(console.error);
