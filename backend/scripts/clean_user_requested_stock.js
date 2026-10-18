const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME }
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Delete ALL balance records for Main Warehouse
    const delMainWh = await client.query(`
      DELETE FROM inventory_balances
      WHERE warehouse_id IN (SELECT id FROM warehouses WHERE name = 'Main Warehouse')
      RETURNING id
    `);
    console.log(`Deleted ${delMainWh.rowCount} records from Main Warehouse`);

    // 2. In ST Straightener Department, delete non-ST items (WIP-SP-*, RM-WIRE-*, FLAT-STRIP-*)
    const delST = await client.query(`
      DELETE FROM inventory_balances
      WHERE warehouse_id IN (SELECT id FROM warehouses WHERE name = 'ST Straightener Department')
        AND item_id IN (
          SELECT id FROM items 
          WHERE item_code LIKE 'WIP-SP%' 
             OR item_code LIKE 'RM-WIRE%' 
             OR item_code LIKE 'FLAT-STRIP%'
        )
      RETURNING id
    `);
    console.log(`Deleted ${delST.rowCount} records from ST Straightener Department`);

    // 3. In SW Swagging Department, delete non-SW items (WIP-SP-*, RM-WIRE-*) and WIP-SW-003
    const delSW = await client.query(`
      DELETE FROM inventory_balances
      WHERE warehouse_id IN (SELECT id FROM warehouses WHERE name = 'SW Swagging Department')
        AND item_id IN (
          SELECT id FROM items 
          WHERE item_code LIKE 'WIP-SP%' 
             OR item_code LIKE 'RM-WIRE%'
             OR item_code = 'WIP-SW-003'
        )
      RETURNING id
    `);
    console.log(`Deleted ${delSW.rowCount} records from SW Swagging Department`);

    // 4. In SPK Spoke Department, delete WIP-SPL-013, WIP-SP-010, WIP-SP-009
    const delSPK = await client.query(`
      DELETE FROM inventory_balances
      WHERE warehouse_id IN (SELECT id FROM warehouses WHERE name = 'SPK Spoke Department')
        AND item_id IN (
          SELECT id FROM items 
          WHERE item_code IN ('WIP-SPL-013', 'WIP-SP-010', 'WIP-SP-009')
        )
      RETURNING id
    `);
    console.log(`Deleted ${delSPK.rowCount} records from SPK Spoke Department`);

    await client.query('COMMIT');
    console.log('Stock balance cleanup successfully COMMITTED.');

    // Verify remaining in each warehouse
    const check = await client.query(`
      SELECT w.name as warehouse_name, i.item_code, i.name as item_name, ib.on_hand, ib.available
      FROM inventory_balances ib
      JOIN warehouses w ON w.id = ib.warehouse_id
      JOIN items i ON i.id = ib.item_id
      WHERE w.name IN ('Main Warehouse', 'ST Straightener Department', 'SW Swagging Department', 'SPK Spoke Department')
      ORDER BY w.name, i.item_code
    `);
    console.log(`\nRemaining balance records (${check.rows.length}):`);
    check.rows.forEach(r => {
      console.log(`[${r.warehouse_name}] ${r.item_code} (${r.item_name}): on_hand=${r.on_hand}, avail=${r.available}`);
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during cleanup:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
