const { db } = require('./helper');

async function cols(client, table) {
  const q = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`,
    [table]
  );
  return q.rows.map((r) => r.column_name).join(', ');
}

async function main() {
  const c = await db();
  try {
    for (const t of ['stores', 'store_items', 'material_requests', 'material_requests_lines', 'purchase_requisitions', 'purchase_requisition_lines', 'purchase_orders', 'purchase_order_lines', 'goods_receipts', 'goods_receipt_lines', 'stock_ledger_entries', 'store_balances', 'material_issues', 'material_returns']) {
      try {
        console.log(t + ': ' + await cols(c, t));
      } catch (e) {
        console.log(t + ': (table missing)');
      }
    }
    const stores = await c.query('SELECT * FROM stores');
    console.log('\n=== STORES ROWS ===');
    for (const s of stores.rows) console.log('  ' + JSON.stringify(s).slice(0, 500));
    const items = await c.query('SELECT * FROM store_items');
    console.log('\n=== STORE_ITEMS ROWS ===');
    for (const s of items.rows) console.log('  ' + JSON.stringify(s).slice(0, 500));
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });