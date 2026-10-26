const fs = require('fs');
const path = require('path');
const envStr = fs.readFileSync(path.join(__dirname, '../backend/.env'), 'utf8');
const env = {};
for (const line of envStr.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
}

const { Client } = require(path.join(__dirname, '../backend/node_modules/pg'));

const client = new Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to Supabase DB!');

  const po = (await client.query("SELECT id, po_code, status, company_id FROM purchase_orders WHERE po_code = 'PO-2026-1117'")).rows[0];
  console.log('PO:', po);

  if (po) {
    const poLines = (await client.query(
      `SELECT pol.id, pol.item_id, i.item_code, pol.quantity, pol.received_quantity 
       FROM purchase_order_lines pol 
       JOIN items i ON i.id = pol.item_id 
       WHERE pol.po_id = $1`, [po.id]
    )).rows;
    console.log('PO Lines:', poLines);
  }

  const existingGp = (await client.query("SELECT id, receipt_code, gate_pass_no, status, created_at FROM raw_material_receipts WHERE gate_pass_no = '3493'")).rows;
  console.log('Existing GP 3493:', existingGp);

  const recentReceipts = (await client.query("SELECT id, receipt_code, gate_pass_no, status, created_at FROM raw_material_receipts ORDER BY created_at DESC LIMIT 5")).rows;
  console.log('Recent Receipts:', recentReceipts);

  await client.end();
}

main().catch(console.error);
