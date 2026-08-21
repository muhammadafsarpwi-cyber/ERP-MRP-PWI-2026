const { Client } = require('pg');
const client = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
(async () => {
  await client.connect();
  console.log('=== FK_ORPHAN_CHECK ===');
  const fks = await client.query(`SELECT n.nspname as cs, c.relname as ct, a1.attname as fc, n2.nspname as ps, c2.relname as pt, a2.attname as pc FROM pg_constraint p JOIN pg_class c ON c.oid = p.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_class c2 ON c2.oid = p.confrelid JOIN pg_namespace n2 ON n2.oid = c2.relnamespace JOIN pg_attribute a1 ON a1.attrelid = p.conrelid AND a1.attnum = p.conkey[1] AND a1.attnum > 0 JOIN pg_attribute a2 ON a2.attrelid = p.confrelid AND a2.attnum = p.confkey[1] AND a2.attnum > 0 WHERE p.contype = 'f' AND n.nspname IN ('public', 'erp_sales') AND array_length(p.conkey, 1) = 1 ORDER BY n.nspname, c.relname`);
  console.log('FK_COUNT|' + fks.rows.length);
  let totalOrphans = 0;
  for (const fk of fks.rows) {
    try {
      const orRes = await client.query('SELECT count(*) as orph FROM ' + fk.cs + '.' + fk.ct + ' t WHERE t.' + fk.fc + ' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ' + fk.ps + '.' + fk.pt + ' p WHERE p.' + fk.pc + ' = t.' + fk.fc + ')');
      const orph = parseInt(orRes.rows[0].orph);
      totalOrphans += orph;
      if (orph > 0) console.log('ORPHAN|' + fk.cs + '.' + fk.ct + '.' + fk.fc + ' -> ' + fk.ps + '.' + fk.pt + '.' + fk.pc + '|' + orph);
    } catch (e) { console.log('FK_ERR|' + fk.cs + '.' + fk.ct + '.' + fk.fc + '|' + e.message.substring(0, 100)); }
  }
  console.log('FK_ORPHAN_TOTAL|' + totalOrphans);
  console.log('\n=== SAMPLE_DATA ===');
  const samples = [
    ['companies', 'SELECT company_code, trade_name, base_currency, country, city FROM companies'],
    ['branches', 'SELECT branch_code, name, city FROM branches'],
    ['divisions', 'SELECT division_code, name FROM divisions'],
    ['warehouses', 'SELECT warehouse_code, name FROM warehouses'],
    ['warehouse_locations', 'SELECT location_code, name, warehouse_id FROM warehouse_locations'],
    ['items', 'SELECT item_code, name, item_type, cost_price, selling_price, currency FROM items ORDER BY item_code'],
    ['customers_pub', 'SELECT customer_code, name, customer_type, city, country FROM customers ORDER BY customer_code'],
    ['customers_erp', 'SELECT customer_code, company_name, city, country, currency FROM erp_sales.customers ORDER BY customer_code'],
    ['suppliers', 'SELECT supplier_code, name, city, currency_code FROM suppliers'],
    ['purchase_orders', 'SELECT po_code, supplier_id, total_amount, status FROM purchase_orders'],
    ['purchase_order_lines', 'SELECT po_id, item_id, quantity, unit_price, uom_id FROM purchase_order_lines'],
    ['inventory_balances', 'SELECT item_id, warehouse_id, on_hand, reserved, available, uom_id FROM inventory_balances'],
    ['stock_ledger', 'SELECT transaction_type, item_id, warehouse_id, quantity, direction FROM stock_ledger LIMIT 5'],
    ['roles', 'SELECT role_code, name FROM roles'],
    ['user_roles', 'SELECT user_id, role_id, status FROM user_roles'],
    ['erp_sales.so', 'SELECT order_number, customer_id, total_amount, status FROM erp_sales.sales_orders'],
    ['erp_sales.si', 'SELECT invoice_no, customer_id, total_amount, paid_amount, status FROM erp_sales.sales_invoices'],
    ['erp_sales.sr', 'SELECT return_number, customer_id, total_amount, status FROM erp_sales.sales_returns'],
    ['erp_sales.sd', 'SELECT delivery_number, customer_id, total_amount, status FROM erp_sales.sales_deliveries']
  ];
  for (const [tbl, q] of samples) {
    try { const r = await client.query(q); console.log('SAMPLE|' + tbl + '|' + JSON.stringify(r.rows)); } catch(e) { console.log('SAMPLE_ERR|' + tbl + '|' + e.message.substring(0,80)); }
  }
  console.log('\n=== DONE ===');
  await client.end();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
