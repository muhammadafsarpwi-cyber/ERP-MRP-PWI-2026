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
  const wh = await client.query(`SELECT id, name FROM warehouses WHERE name ILIKE '%Nipple%'`);
  if (wh.rows.length > 0) {
    const whId = wh.rows[0].id;
    const del = await client.query(`
      DELETE FROM inventory_balances
      WHERE warehouse_id = $1
        AND item_id NOT IN (
          SELECT id FROM items WHERE item_code LIKE 'FG-NP%'
        )
      RETURNING id, item_id
    `, [whId]);
    console.log('Deleted non-nipple balance rows:', del.rows.length);

    const remaining = await client.query(`
      SELECT ib.id, i.item_code, i.name as item_name, ib.on_hand, u.code as uom_code
      FROM inventory_balances ib
      JOIN items i ON ib.item_id = i.id
      JOIN uoms u ON ib.uom_id = u.id
      WHERE ib.warehouse_id = $1
      ORDER BY i.item_code
    `, [whId]);
    console.log('Remaining clean Nipple items:', JSON.stringify(remaining.rows, null, 2));
  }
  await client.end();
}

main().catch(console.error);
