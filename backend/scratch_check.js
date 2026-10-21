const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
});
async function run() {
  await client.connect();
  const resTables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%sales%' OR table_name LIKE '%order%'");
  console.log('Tables:', resTables.rows.map(r => r.table_name));
  
  const resOrders = await client.query("SELECT id, order_number, customer_id, status FROM sales_orders WHERE order_number ILIKE '%05813%'");
  console.log('Sales order:', resOrders.rows);
  if (resOrders.rows.length > 0) {
    const soId = resOrders.rows[0].id;
    const resCols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'sales_order_lines' OR table_name = 'order_lines' OR table_name = 'sales_order_items'");
    console.log('Line columns:', resCols.rows.map(r => r.column_name));
    // Let's find the lines table
    const lines = await client.query("SELECT * FROM sales_order_lines WHERE sales_order_id = $1", [soId]).catch(() => null);
    if (lines) console.log('Lines:', lines.rows);
  }
  await client.end();
}
run().catch(e => console.error(e));
