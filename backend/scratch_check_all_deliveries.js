require('dotenv').config();
const { Client } = require('pg');
const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 6543),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false }
});
async function main() {
  await client.connect();

  console.log('=== ALL SALES DELIVERIES ===');
  const dels = await client.query(`
    SELECT d.id, d.delivery_number, d.delivery_date, d.status, d.warehouse_id, w.warehouse_code, w.name, d.created_at
    FROM erp_sales.sales_deliveries d
    LEFT JOIN warehouses w ON d.warehouse_id = w.id
    ORDER BY d.created_at DESC
  `);
  console.log(`Found ${dels.rows.length} deliveries:`);
  for (const d of dels.rows) {
    const sl = await client.query("SELECT count(*) as cnt FROM stock_ledger WHERE reference_number = $1", [d.delivery_number]);
    console.log(`- ${d.delivery_number}: date=${d.delivery_date}, status=${d.status}, wh=${d.warehouse_code}, stock_ledger_count=${sl.rows[0].cnt}`);
  }

  console.log('\n=== ALL STOCK LEDGER MOVEMENTS FOR SPI FG DISPATCH WAREHOUSE ===');
  const wh = await client.query("SELECT id FROM warehouses WHERE warehouse_code = 'SPI-FGDW-001' OR name ILIKE '%Dispatch%'");
  console.log('Dispatch warehouse(s):', wh.rows);
  if (wh.rows.length > 0) {
    const whId = wh.rows[0].id;
    const ledger = await client.query(`
      SELECT sl.id, sl.transaction_date, sl.transaction_type, sl.direction, sl.quantity, sl.reference_type, sl.reference_number, i.item_code, i.name, sl.notes
      FROM stock_ledger sl
      JOIN items i ON sl.item_id = i.id
      WHERE sl.warehouse_id = $1
      ORDER BY sl.transaction_date DESC, sl.created_at DESC
      LIMIT 30
    `, [whId]);
    console.log(`Total movements in dispatch warehouse (last 30):`);
    ledger.rows.forEach(r => {
      console.log(`[${r.transaction_date}] ${r.direction} ${r.quantity} | ${r.item_code} | ${r.transaction_type} | ref: ${r.reference_number} | ${r.notes}`);
    });
  }

  await client.end();
}
main().catch(e => { console.error(e); client.end(); });
