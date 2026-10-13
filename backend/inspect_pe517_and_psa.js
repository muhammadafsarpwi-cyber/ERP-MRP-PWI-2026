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

async function run() {
  await client.connect();

  console.log('=== 1. PE-2026-00517 Production Entry Header ===');
  const peRes = await client.query(`
    SELECT pe.id, pe.entry_number, pe.entry_date, pe.actual_quantity, pe.target_quantity,
           pe.machine_no, pe.operator_name, pe.item_id, i.item_code, i.name as item_name
    FROM production_entries pe
    LEFT JOIN items i ON i.id = pe.item_id
    WHERE pe.entry_number = 'PE-2026-00517'
  `);
  console.table(peRes.rows);

  const peId = peRes.rows[0].id;

  console.log('=== 2. PE-2026-00517 Production Entry Items ===');
  const peiRes = await client.query(`
    SELECT pei.id, pei.line_number, pei.entry_kind, pei.item_id, i.item_code, i.name as item_name,
           pei.actual_quantity, pei.target_quantity, pei.scrap_quantity, pei.remarks
    FROM production_entry_items pei
    LEFT JOIN items i ON i.id = pei.item_id
    WHERE pei.production_entry_id = $1
    ORDER BY pei.line_number ASC
  `, [peId]);
  console.table(peiRes.rows);

  console.log('=== 3. PE-2026-00517 Stock Ledger Entries ===');
  const slRes = await client.query(`
    SELECT sl.id, sl.item_id, i.item_code, i.name as item_name, sl.transaction_type, sl.direction,
           sl.quantity, sl.reference_number, sl.notes
    FROM stock_ledger sl
    LEFT JOIN items i ON i.id = sl.item_id
    WHERE sl.reference_id = $1 OR sl.reference_number = 'PE-2026-00517'
    ORDER BY sl.created_at ASC
  `, [peId]);
  console.table(slRes.rows);

  console.log('=== 4. Check PSA-20261006-1633 and PSA-20261011-1347 ===');
  const psaSl = await client.query(`
    SELECT sl.id, sl.item_id, i.item_code, sl.transaction_type, sl.direction, sl.quantity,
           sl.reference_type, sl.reference_id, sl.reference_number, sl.created_at
    FROM stock_ledger sl
    LEFT JOIN items i ON i.id = sl.item_id
    WHERE sl.reference_number IN ('PSA-20261006-1633', 'PSA-20261011-1347')
  `);
  console.log('Stock Ledger rows for PSA:');
  console.table(psaSl.rows);

  // Check what tables PSA records exist in
  const saTables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE '%adjust%'
  `);
  console.log('Adjustment tables:', saTables.rows);

  for (const t of saTables.rows) {
    const tData = await client.query(`SELECT * FROM ${t.table_name} WHERE adjustment_number IN ('PSA-20261006-1633', 'PSA-20261011-1347') OR id::text IN ('PSA-20261006-1633', 'PSA-20261011-1347')`);
    console.log(`Data in ${t.table_name}:`, tData.rows.length);
    if (tData.rows.length > 0) console.table(tData.rows);
  }

  await client.end();
}

run().catch(console.error);
