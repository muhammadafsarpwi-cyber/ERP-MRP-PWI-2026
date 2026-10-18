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
  const uoms = await pool.query('SELECT id, code, name FROM uoms');
  console.log('UOMs:');
  uoms.rows.forEach(u => console.log(u.id, u.code, u.name));

  const conv = await pool.query(`
    SELECT uc.*, u1.code as from_code, u2.code as to_code
    FROM uom_conversions uc
    JOIN uoms u1 ON u1.id = uc.from_uom_id
    JOIN uoms u2 ON u2.id = uc.to_uom_id
  `);
  console.log('\nUOM conversions:');
  conv.rows.forEach(c => console.log(`${c.from_code} -> ${c.to_code} factor=${c.conversion_factor}`));

  const itemCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'items' AND column_name LIKE '%uom%'");
  console.log('\nItem UOM columns:', itemCols.rows.map(r => r.column_name));

  const items = await pool.query(`
    SELECT i.id, i.item_code, i.name, 
           u1.code as base_uom, u2.code as pur_uom, u3.code as sale_uom
    FROM items i
    LEFT JOIN uoms u1 ON u1.id = i.base_uom_id
    LEFT JOIN uoms u2 ON u2.id = i.purchase_uom_id
    LEFT JOIN uoms u3 ON u3.id = i.sales_uom_id
    WHERE i.item_code LIKE 'FG-NP%'
  `);
  console.log('\nNipple items UOMs:');
  items.rows.forEach(it => console.log(`${it.item_code}: base=${it.base_uom}, pur=${it.pur_uom}, sale=${it.sale_uom}`));

  const ledger = await pool.query(`
    SELECT sl.id, sl.item_id, i.item_code, sl.quantity, sl.direction, u.code as uom_code, sl.reference_number
    FROM stock_ledger sl
    JOIN items i ON i.id = sl.item_id
    LEFT JOIN uoms u ON u.id = sl.uom_id
    WHERE sl.reference_number IN ('GRN-0011', 'CGR-2026-0001')
  `);
  console.log('\nStock ledger rows for receipt:');
  ledger.rows.forEach(l => console.log(`${l.item_code}: qty=${l.quantity} ${l.uom_code} (${l.direction}) ref=${l.reference_number}`));

  await pool.end();
}

run().catch(console.error);
