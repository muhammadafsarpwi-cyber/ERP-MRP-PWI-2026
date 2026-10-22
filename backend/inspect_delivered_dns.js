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

  const dns = await client.query(`
    SELECT sd.id, sd.delivery_number, sd.delivery_date, sd.company_id, sd.warehouse_id,
           c.company_name, c.customer_code
    FROM erp_sales.sales_deliveries sd
    LEFT JOIN erp_sales.customers c ON c.id = sd.customer_id
    WHERE sd.status = 'DELIVERED'
    ORDER BY sd.delivery_date ASC, sd.created_at ASC
  `);

  console.log('Delivered notes to confirm:', dns.rows.length);
  for (const dn of dns.rows) {
    const lines = await client.query(`
      SELECT sdl.*, i.item_code, u.code as uom_code
      FROM erp_sales.sales_delivery_lines sdl
      JOIN public.items i ON i.id = sdl.item_id
      LEFT JOIN public.uoms u ON u.id = sdl.uom_id
      WHERE sdl.delivery_id = $1
    `, [dn.id]);
    console.log(`\n${dn.delivery_number} (${dn.delivery_date.toISOString().substring(0,10)}) -> Customer: ${dn.company_name}`);
    lines.rows.forEach(l => {
      console.log(`   ${l.item_code}: ${l.quantity} ${l.uom_code}`);
    });
  }

  await client.end();
}

main().catch(console.error);
