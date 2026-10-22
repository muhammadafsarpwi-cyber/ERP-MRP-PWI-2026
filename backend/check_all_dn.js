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

  console.log('=== ALL SALES DELIVERIES IN SYSTEM ===');
  const res = await client.query(`
    SELECT sd.id, sd.delivery_number, sd.delivery_date, sd.status, sd.warehouse_id, w.name as wh_name,
           c.company_name,
           (SELECT count(*) FROM public.stock_ledger sl WHERE sl.reference_number = sd.delivery_number) as ledger_count,
           (SELECT count(*) FROM erp_sales.sales_delivery_lines sdl WHERE sdl.delivery_id = sd.id) as line_count
    FROM erp_sales.sales_deliveries sd
    LEFT JOIN erp_sales.customers c ON c.id = sd.customer_id
    LEFT JOIN public.warehouses w ON w.id = sd.warehouse_id
    ORDER BY sd.delivery_date ASC, sd.created_at ASC
  `);
  console.log('Total sales deliveries:', res.rows.length);
  res.rows.forEach(r => console.log(r));

  await client.end();
}

main().catch(console.error);
