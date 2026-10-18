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

    // Get PCS UOM ID
    const pcsRes = await client.query("SELECT id FROM uoms WHERE code = 'PCS'");
    const pcsUomId = pcsRes.rows[0].id;

    // 1. Update stock_ledger quantities from Gross to Pieces (* 144)
    const updateSl = await client.query(`
      UPDATE stock_ledger
      SET quantity = quantity * 144,
          uom_id = $1,
          notes = notes || ' (converted 144x GRS to PCS)'
      WHERE reference_number = 'GRN-0011'
        AND quantity < 20000 -- safeguard to ensure we only multiply once
      RETURNING id, item_id, quantity
    `, [pcsUomId]);
    console.log(`Updated ${updateSl.rowCount} stock_ledger rows for GRN-0011 to pieces`);

    // 2. Update inventory_balances in SPI Nipple Packing Warehouse
    // Item 1: FG-NP-001: was 77,000 (72000 + 5000), should be 72,000 + 720,000 = 792,000
    // Item 2: FG-NP-002: was 1,010,000 (1008000 + 2000), should be 1,008,000 + 288,000 = 1,296,000
    // Item 4: FG-NP-004: was 1,243,172 (1240672 + 2500), should be 1,240,672 + 360,000 = 1,600,672
    // Item 5: FG-NP-005: was 465,120 (455120 + 10000), should be 455,120 + 1,440,000 = 1,895,120
    const whRes = await client.query("SELECT id FROM warehouses WHERE name = 'SPI Nipple Packing Warehouse'");
    const whId = whRes.rows[0].id;

    const updates = [
      { code: 'FG-NP-001', onHand: 792000 },
      { code: 'FG-NP-002', onHand: 1296000 },
      { code: 'FG-NP-004', onHand: 1600672 },
      { code: 'FG-NP-005', onHand: 1895120 },
    ];

    for (const u of updates) {
      await client.query(`
        UPDATE inventory_balances ib
        SET on_hand = $1,
            available = $1,
            uom_id = $2
        FROM items i
        WHERE ib.item_id = i.id
          AND ib.warehouse_id = $3
          AND i.item_code = $4
      `, [u.onHand, pcsUomId, whId, u.code]);
      console.log(`Updated inventory_balances for ${u.code} to ${u.onHand} PCS (= ${u.onHand / 144} GRS)`);
    }

    // Also ensure FG-NP-003 uom_id is set to PCS
    await client.query(`
      UPDATE inventory_balances ib
      SET uom_id = $1
      FROM items i
      WHERE ib.item_id = i.id
        AND ib.warehouse_id = $2
        AND i.item_code = 'FG-NP-003'
    `, [pcsUomId, whId]);

    await client.query('COMMIT');
    console.log('Successfully committed UOM stock conversion.');

    // Verify
    const check = await client.query(`
      SELECT i.item_code, i.name, ib.on_hand, ib.available, u.code as uom
      FROM inventory_balances ib
      JOIN items i ON i.id = ib.item_id
      JOIN uoms u ON u.id = ib.uom_id
      WHERE ib.warehouse_id = $1
      ORDER BY i.item_code
    `, [whId]);
    console.table(check.rows.map(r => ({
      item: r.item_code,
      name: r.name,
      pieces: Number(r.on_hand).toLocaleString(),
      gross: (Number(r.on_hand) / 144).toLocaleString() + ' GRS',
      uom: r.uom
    })));

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during update:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
