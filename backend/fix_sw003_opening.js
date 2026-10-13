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

  console.log('--- STARTING TRANSACTION: FIX SW-003 OPENING AND CLEANUP REVERSALS ---');
  await client.query('BEGIN');
  try {
    const sw003ItemId = '085be503-05ef-4920-898b-19f36046e790'; // WIP-SW-003
    const sp009ItemId = 'c1000000-0000-0000-0000-000000000012'; // WIP-SP-009
    const swWarehouseId = 'd5685ddf-923a-4f7c-ba19-a5715cafa02e'; // SPI-SW-002

    // 1. Delete the 4 bad rows for WIP-SW-003 (the old 80,385 opening and its 3 reversal attempts)
    const badRowIds = [
      'bca51274-33e3-4b93-afb5-5b4a3017acbb', // original opening 80,385 (IN)
      '5f222f02-9ecb-4198-8459-d75c3c140f8c', // reversal 1 (OUT 80,385)
      '76c3fc4f-6824-4892-bbcd-2253c191e097', // reversal 2 (OUT 80,385)
      '3a21cea2-373e-499a-8f05-2a3b8ca4415f', // reversal 3 (IN 80,385)
    ];

    const delRes = await client.query(`
      DELETE FROM stock_ledger 
      WHERE id = ANY($1::uuid[])
      RETURNING id, transaction_type, quantity, reference_number
    `, [badRowIds]);
    console.log(`Deleted ${delRes.rowCount} bad stock_ledger rows:`, delRes.rows);

    // 2. Correct row c66e6e30-7785-48bd-a44e-c23aea33f0ff (POS-20261013-1238, 80,950 PCS)
    // Move it to WIP-SW-003
    const updateRes = await client.query(`
      UPDATE stock_ledger
      SET item_id = $1
      WHERE id = 'c66e6e30-7785-48bd-a44e-c23aea33f0ff'
      RETURNING id, item_id, quantity, reference_number, warehouse_id
    `, [sw003ItemId]);
    console.log('Updated opening stock row to point to WIP-SW-003:', updateRes.rows[0]);

    // 3. Update inventory_balances:
    // a) Remove 80,950 from WIP-SP-009 in SPI-SW-002 (should be 0)
    const balSp009 = await client.query(`
      UPDATE inventory_balances
      SET on_hand = 0,
          available = 0,
          updated_at = NOW()
      WHERE item_id = $1 AND warehouse_id = $2
      RETURNING id, on_hand, available
    `, [sp009ItemId, swWarehouseId]);
    console.log('Updated WIP-SP-009 balance in SPI-SW-002:', balSp009.rows[0]);

    // b) For WIP-SW-003 in SPI-SW-002:
    // With 80,950 opening and 80,950 consumption (39,060 + 39,000 + 2,890), net on_hand is 0
    const balSw003 = await client.query(`
      UPDATE inventory_balances
      SET on_hand = 0,
          available = 0,
          updated_at = NOW()
      WHERE item_id = $1 AND warehouse_id = $2
      RETURNING id, on_hand, available
    `, [sw003ItemId, swWarehouseId]);
    console.log('Updated WIP-SW-003 balance in SPI-SW-002:', balSw003.rows[0]);

    await client.query('COMMIT');
    console.log('--- TRANSACTION COMMITTED SUCCESSFULLY ---');

    // Verification
    console.log('=== VERIFY STOCK LEDGER FOR WIP-SW-003 ===');
    const ledgerVerify = await client.query(`
      SELECT sl.id, sl.created_at, sl.transaction_date, sl.transaction_type, sl.direction, sl.quantity,
             sl.reference_type, sl.reference_number, w.warehouse_code, i.item_code, sl.notes
      FROM stock_ledger sl
      JOIN warehouses w ON w.id = sl.warehouse_id
      JOIN items i ON i.id = sl.item_id
      WHERE sl.item_id = $1
      ORDER BY sl.transaction_date ASC, sl.created_at ASC
    `, [sw003ItemId]);
    console.table(ledgerVerify.rows);

    console.log('=== VERIFY BALANCES ===');
    const allBals = await client.query(`
      SELECT ib.id, i.item_code, w.warehouse_code, ib.on_hand, ib.available
      FROM inventory_balances ib
      JOIN items i ON i.id = ib.item_id
      JOIN warehouses w ON w.id = ib.warehouse_id
      WHERE ib.item_id IN ($1, $2) AND ib.warehouse_id = $3
    `, [sw003ItemId, sp009ItemId, swWarehouseId]);
    console.table(allBals.rows);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERROR during transaction:', err);
  } finally {
    await client.end();
  }
}

run();
