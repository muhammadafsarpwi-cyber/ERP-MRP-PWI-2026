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
  console.log('Connected to DB');

  // 1. Delivery notes
  const dns = await client.query(`
    SELECT id, delivery_number, status, sales_order_id, customer_id, total_amount, created_at
    FROM erp_sales.sales_deliveries
    ORDER BY created_at DESC LIMIT 10
  `);
  console.log('Deliveries:', dns.rows);

  // 2. Delivery items for these delivery notes
  if (dns.rows.length > 0) {
    const dnItems = await client.query(`
      SELECT sdi.id, sdi.delivery_id, sdi.item_id, sdi.quantity, sdi.warehouse_id, i.item_code, i.name
      FROM erp_sales.sales_delivery_lines sdi
      JOIN items i ON i.id = sdi.item_id
      WHERE sdi.delivery_id = ANY($1)
    `, [dns.rows.slice(0, 5).map(d => d.id)]);
    console.log('Delivery items:', dnItems.rows);
  }

  // 3. Stock of SPI-FG-SPK-002 and SPI-FG-SPK-003 in inventory and stock_ledger
  const items = await client.query(`
    SELECT id, item_code, name
    FROM items
    WHERE item_code IN ('SPI-FG-SPK-002', 'SPI-FG-SPK-003', 'SPI-FG-SPK-001')
  `);
  console.log('Items:', items.rows);

  for (const item of items.rows) {
    const inv = await client.query(`
      SELECT ib.warehouse_id, ib.on_hand, ib.available, ib.reserved, ib.status, w.name as warehouse_name
      FROM inventory_balances ib
      LEFT JOIN warehouses w ON w.id = ib.warehouse_id
      WHERE ib.item_id = $1
    `, [item.id]);
    console.log(`Inventory Balances for ${item.item_code} (${item.name}):`, inv.rows);

    const pe = await client.query(`
      SELECT id, entry_date, actual_quantity, remarks, is_active
      FROM production_entries
      WHERE item_id = $1
      ORDER BY created_at DESC LIMIT 5
    `, [item.id]);
    console.log(`Production Entries for ${item.item_code}:`, pe.rows);
  }

  // 4. Also check Sales Order SOC-2026-05813
  const so = await client.query(`
    SELECT so.id, so.order_number, so.customer_id, c.company_name
    FROM erp_sales.sales_orders so
    LEFT JOIN erp_sales.sales_customers c ON c.id = so.customer_id
    WHERE so.order_number ILIKE '%05813%'
  `);
  console.log('Sales order:', so.rows);

  if (so.rows.length > 0) {
    const soItems = await client.query(`
      SELECT soi.id, soi.item_id, soi.quantity, soi.package_quantity, i.item_code, i.name
      FROM erp_sales.sales_order_items soi
      JOIN items i ON i.id = soi.item_id
      WHERE soi.sales_order_id = $1
    `, [so.rows[0].id]);
    console.log('SO items:', soItems.rows);
  }

  await client.end();
}

run().catch(console.error);
