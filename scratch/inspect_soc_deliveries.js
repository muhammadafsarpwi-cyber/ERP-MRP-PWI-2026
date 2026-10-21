const fs = require('fs');
const path = require('path');
const { Client } = require(path.resolve(__dirname, '../backend/node_modules/pg'));
const envContent = fs.readFileSync(path.resolve(__dirname, '../backend/.env'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2 && !parts[0].startsWith('#')) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

async function run() {
  const client = new Client({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const soRes = await client.query(`
    SELECT so.id, so.order_number, soi.id as soi_id, soi.item_id, i.item_code, i.name, soi.quantity, soi.shipped_quantity
    FROM erp_sales.sales_orders so
    JOIN erp_sales.sales_order_items soi ON soi.sales_order_id = so.id
    LEFT JOIN items i ON i.id = soi.item_id
    WHERE so.order_number = 'SOC-2026-05813'
  `);
  console.log('SO items for SOC-2026-05813:');
  console.table(soRes.rows);

  if (soRes.rows.length > 0) {
    const soId = soRes.rows[0].id;
    const delRes = await client.query(`
      SELECT sd.id, sd.delivery_number, sd.status, sd.created_at, sdl.item_id, i.item_code, sdl.quantity
      FROM erp_sales.sales_deliveries sd
      LEFT JOIN erp_sales.sales_delivery_lines sdl ON sdl.delivery_id = sd.id
      LEFT JOIN items i ON i.id = sdl.item_id
      WHERE sd.sales_order_id = $1
      ORDER BY sd.delivery_number ASC, sdl.line_number ASC
    `, [soId]);
    console.log('Deliveries & Lines for SOC-2026-05813:');
    console.table(delRes.rows);
  }

  await client.end();
}

run().catch(console.error);
