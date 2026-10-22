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

  const deliveredDns = await client.query(`
    SELECT sd.id, sd.delivery_number, sd.delivery_date, sd.warehouse_id, w.name as wh_name,
           c.company_name, c.customer_code,
           sdl.id as line_id, i.item_code, i.name as item_name, sdl.quantity, u.code as uom_code
    FROM erp_sales.sales_deliveries sd
    JOIN erp_sales.sales_delivery_lines sdl ON sdl.delivery_id = sd.id
    JOIN public.items i ON i.id = sdl.item_id
    LEFT JOIN erp_sales.customers c ON c.id = sd.customer_id
    LEFT JOIN public.warehouses w ON w.id = sd.warehouse_id
    LEFT JOIN public.uoms u ON u.id = sdl.uom_id
    WHERE sd.status = 'DELIVERED'
    ORDER BY sd.delivery_date ASC, sd.delivery_number ASC, sdl.line_number ASC
  `);

  console.log('Unconfirmed DELIVERED lines count:', deliveredDns.rows.length);
  deliveredDns.rows.forEach(r => {
    console.log(
      r.delivery_number,
      r.delivery_date ? r.delivery_date.toISOString().substring(0, 10) : 'null',
      r.company_name,
      '->', r.item_code,
      r.quantity, r.uom_code
    );
  });

  await client.end();
}

main().catch(console.error);
