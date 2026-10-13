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
  console.log('--- STARTING TRANSACTION TO REMOVE PSA ADJUSTMENTS ---');
  await client.query('BEGIN');
  try {
    // 1. Fetch the PSA records
    const psaRes = await client.query(`
      SELECT id, company_id, item_id, warehouse_id, transaction_type, direction, quantity, reference_number
      FROM stock_ledger
      WHERE reference_number IN ('PSA-20261006-1633', 'PSA-20261011-1347')
    `);
    console.log('Found PSA records to remove:', psaRes.rows);

    for (const r of psaRes.rows) {
      const qty = parseFloat(r.quantity);
      // If it was OUT, reverting means adding back to on_hand and available
      const delta = r.direction === 'OUT' ? qty : -qty;

      // Update inventory_balances
      const updateBal = await client.query(`
        UPDATE inventory_balances
        SET on_hand = on_hand + $1,
            available = available + $1,
            updated_at = NOW()
        WHERE company_id = $2 AND item_id = $3 AND warehouse_id = $4
        RETURNING id, on_hand, available
      `, [delta, r.company_id, r.item_id, r.warehouse_id]);
      console.log(`Updated inventory_balances for item ${r.item_id} wh ${r.warehouse_id}:`, updateBal.rows[0]);

      // Delete the stock_ledger record
      await client.query(`DELETE FROM stock_ledger WHERE id = $1`, [r.id]);
      console.log(`Deleted stock_ledger record ${r.id} (${r.reference_number})`);
    }

    await client.query('COMMIT');
    console.log('--- TRANSACTION COMMITTED SUCCESSFULLY ---');

    // Verify balances for WIP-ST-001
    const balCheck = await client.query(`
      SELECT ib.id, i.item_code, w.warehouse_code, ib.on_hand, ib.available
      FROM inventory_balances ib
      JOIN items i ON i.id = ib.item_id
      JOIN warehouses w ON w.id = ib.warehouse_id
      WHERE i.item_code = 'WIP-ST-001'
    `);
    console.log('WIP-ST-001 Balances After:');
    console.table(balCheck.rows);

    // Verify stock ledger check
    const ledgerCheck = await client.query(`
      SELECT id, reference_number FROM stock_ledger
      WHERE reference_number IN ('PSA-20261006-1633', 'PSA-20261011-1347')
    `);
    console.log('PSA entries remaining in stock_ledger:', ledgerCheck.rows.length);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERROR during transaction, rolled back:', err);
  } finally {
    await client.end();
  }
}

run();
