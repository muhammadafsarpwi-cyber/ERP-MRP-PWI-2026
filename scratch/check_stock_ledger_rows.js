const { Client } = require('d:/ERP-MRP-PWI-2026/backend/node_modules/pg');
require('d:/ERP-MRP-PWI-2026/backend/node_modules/dotenv').config({ path: 'd:/ERP-MRP-PWI-2026/backend/.env' });

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME },
    connectionTimeoutMillis: 10000,
  });

  await client.connect();
  console.log('Connected to DB successfully!');

  // 1. Get PE-2026-00185 and PE-2026-00260
  const pes = await client.query(`
    SELECT pe.id, pe.entry_number, pe.entry_date, pe.actual_quantity, pe.is_active, pe.deleted_at,
           pe.item_id, i.item_code, i.name as item_name
    FROM production_entries pe
    LEFT JOIN items i ON pe.item_id = i.id
    WHERE pe.entry_number IN ('PE-2026-00185', 'PE-2026-00260')
  `);
  console.log('\n=== PRODUCTION ENTRIES ===');
  console.log(JSON.stringify(pes.rows, null, 2));

  // 2. Get production_entry_items
  const peIds = pes.rows.map(r => `'${r.id}'`);
  if (peIds.length > 0) {
    const peItems = await client.query(`
      SELECT pei.id, pei.production_entry_id, pei.entry_kind, pei.line_number, pei.actual_quantity,
             pei.item_id, i.item_code, i.name as item_name
      FROM production_entry_items pei
      LEFT JOIN items i ON pei.item_id = i.id
      WHERE pei.production_entry_id IN (${peIds.join(',')})
    `);
    console.log('\n=== PRODUCTION ENTRY ITEMS ===');
    console.log(JSON.stringify(peItems.rows, null, 2));
  }

  // 3. Get Stock Ledger rows for WIP-ST-014 and WIP-ST-001
  const slRows = await client.query(`
    SELECT sl.id, sl.item_id, i.item_code, i.name as item_name,
           sl.transaction_type, sl.direction, sl.quantity,
           sl.reference_id, sl.reference_type, sl.notes, sl.transaction_date, sl.created_at
    FROM stock_ledger sl
    JOIN items i ON sl.item_id = i.id
    WHERE i.item_code IN ('WIP-ST-014', 'WIP-ST-001', 'WIP-SW-001')
      AND (
        sl.notes ILIKE '%PE-2026-00185%'
        OR sl.notes ILIKE '%PE-2026-00260%'
        ${peIds.length > 0 ? `OR sl.reference_id IN (${peIds.join(',')})` : ''}
      )
    ORDER BY sl.transaction_date ASC, sl.created_at ASC
  `);
  console.log('\n=== MATCHING STOCK LEDGER ROWS ===');
  console.log(JSON.stringify(slRows.rows, null, 2));

  // 4. All stock_ledger rows for WIP-ST-014
  const st014All = await client.query(`
    SELECT sl.id, sl.item_id, i.item_code, i.name as item_name,
           sl.transaction_type, sl.direction, sl.quantity,
           sl.reference_id, sl.reference_type, sl.notes, sl.transaction_date, sl.created_at
    FROM stock_ledger sl
    JOIN items i ON sl.item_id = i.id
    WHERE i.item_code = 'WIP-ST-014'
    ORDER BY sl.transaction_date ASC, sl.created_at ASC
  `);
  console.log(`\n=== ALL STOCK LEDGER ROWS FOR WIP-ST-014 (${st014All.rows.length}) ===`);
  console.log(JSON.stringify(st014All.rows, null, 2));

  await client.end();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
