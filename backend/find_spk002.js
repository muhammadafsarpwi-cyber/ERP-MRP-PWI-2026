const { Client } = require('pg');
require('dotenv').config({ path: 'd:/ERP-MRP-PWI-2026/backend/.env' });

const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME },
});

async function main() {
  await client.connect();

  console.log('=== 1. ALL SALES DELIVERIES FOR SPI-FG-SPK-002 ===');
  const dnRes = await client.query(`
    SELECT sd.id as delivery_id, sd.delivery_number, sd.delivery_date, sd.status, sd.warehouse_id, w.name as wh_name,
           c.company_name, c.customer_code,
           sdl.id as line_id, sdl.quantity as line_qty, u.code as uom_code
    FROM erp_sales.sales_delivery_lines sdl
    JOIN erp_sales.sales_deliveries sd ON sd.id = sdl.delivery_id
    JOIN public.items i ON i.id = sdl.item_id
    LEFT JOIN erp_sales.customers c ON c.id = sd.customer_id
    LEFT JOIN public.warehouses w ON w.id = sd.warehouse_id
    LEFT JOIN public.uoms u ON u.id = sdl.uom_id
    WHERE i.item_code = 'SPI-FG-SPK-002'
    ORDER BY sd.delivery_date ASC, sd.created_at ASC
  `);
  console.log('Count of sales deliveries with SPI-FG-SPK-002:', dnRes.rows.length);
  dnRes.rows.forEach(r => console.log(r));

  console.log('\n=== 2. ALL STOCK LEDGER OUT/DISPATCH RECORDS FOR SPI-FG-SPK-002 ===');
  const slRes = await client.query(`
    SELECT sl.id, sl.reference_number, sl.reference_type, sl.transaction_type, sl.direction,
           sl.quantity, sl.notes, sl.transaction_date, sl.warehouse_id, w.name as wh_name
    FROM public.stock_ledger sl
    JOIN public.items i ON i.id = sl.item_id
    LEFT JOIN public.warehouses w ON w.id = sl.warehouse_id
    WHERE i.item_code = 'SPI-FG-SPK-002'
    ORDER BY sl.transaction_date ASC, sl.created_at ASC
  `);
  console.log('All stock_ledger records for SPI-FG-SPK-002:', slRes.rows.length);
  slRes.rows.forEach(r => console.log(
    r.transaction_date ? r.transaction_date.toISOString().substring(0, 10) : 'null',
    r.direction,
    r.quantity,
    r.transaction_type,
    r.reference_number,
    'wh:', r.wh_name,
    'notes:', (r.notes || '').substring(0, 50)
  ));

  await client.end();
}

main().catch(console.error);
