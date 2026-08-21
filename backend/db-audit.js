const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();

  // SECTION 1: Column catalog
  const cols = await client.query(`
    SELECT c.table_schema, c.table_name, c.ordinal_position, c.column_name, c.data_type,
      c.character_maximum_length, c.numeric_precision, c.numeric_scale, c.is_nullable, c.column_default,
      CASE WHEN pk.column_name IS NOT NULL THEN 'PK' ELSE '' END as pk,
      CASE WHEN fk.column_name IS NOT NULL THEN fk.foreign_table_schema||'.'||fk.foreign_table_name||'.'||fk.foreign_column_name ELSE '' END as fk_target
    FROM information_schema.columns c
    LEFT JOIN (SELECT ku.table_schema, ku.table_name, ku.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema WHERE tc.constraint_type = 'PRIMARY KEY') pk ON pk.table_schema = c.table_schema AND pk.table_name = c.table_name AND pk.column_name = c.column_name
    LEFT JOIN (SELECT ku.table_schema, ku.table_name, ku.column_name, ccu.table_schema as foreign_table_schema, ccu.table_name as foreign_table_name, ccu.column_name as foreign_column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.constraint_schema WHERE tc.constraint_type = 'FOREIGN KEY') fk ON fk.table_schema = c.table_schema AND fk.table_name = c.table_name AND fk.column_name = c.column_name
    WHERE c.table_schema IN ('public', 'erp_sales')
    ORDER BY c.table_schema, c.table_name, c.ordinal_position
  `);
  console.log('=== COLUMN_CATALOG (' + cols.rows.length + ' columns) ===');
  for (const r of cols.rows) {
    console.log([r.table_schema+'.'+r.table_name, r.column_name, r.data_type, r.character_maximum_length||'', r.is_nullable==='NO'?'NN':'NL', r.pk, r.fk_target, (r.column_default||'').substring(0,60)].join('|'));
  }

  // SECTION 2: Constraints
  const cons = await client.query(`
    SELECT n.nspname as schema_name, c.relname as table_name, con.conname as constraint_name,
      CASE con.contype WHEN 'f' THEN 'FK' WHEN 'p' THEN 'PK' WHEN 'u' THEN 'UQ' WHEN 'c' THEN 'CK' ELSE con.contype::text END as ctype,
      pg_get_constraintdef(con.oid) as def
    FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'erp_sales') AND con.contype IN ('f','p','u','c')
    ORDER BY n.nspname, c.relname, con.contype, con.conname
  `);
  console.log('\n=== CONSTRAINTS (' + cons.rows.length + ') ===');
  for (const r of cons.rows) {
    console.log(r.schema_name+'.'+r.table_name+'|'+r.ctype+'|'+r.constraint_name+'|'+r.def);
  }

  // SECTION 3: Row counts
  const tables = await client.query(`
    SELECT n.nspname as schemaname, c.relname as tablename
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname IN ('public', 'erp_sales')
    ORDER BY n.nspname, c.relname
  `);
  console.log('\n=== ROW_COUNTS ===');
  for (const t of tables.rows) {
    const rc = await client.query('SELECT count(*) as cnt FROM ' + t.schemaname + '.' + t.tablename);
    console.log(t.schemaname+'.'+t.tablename+'|'+rc.rows[0].cnt);
  }

  // SECTION 4: Per-column non-null counts (critical data coverage)
  console.log('\n=== COLUMN_COVERAGE ===');
  for (const t of tables.rows) {
    const totalRes = await client.query('SELECT count(*) as cnt FROM ' + t.schemaname + '.' + t.tablename);
    const total = parseInt(totalRes.rows[0].cnt);
    const colInfo = await client.query(`
      SELECT a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod) as dtype, NOT a.attnotnull as nullable
      FROM pg_attribute a WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum
    `, [t.schemaname+'.'+t.tablename]);
    for (const col of colInfo.rows) {
      const nnRes = await client.query('SELECT count(*) as nn FROM ' + t.schemaname + '.' + t.tablename + ' WHERE ' + col.attname + ' IS NOT NULL');
      const nn = parseInt(nnRes.rows[0].nn);
      const pct = total > 0 ? Math.round(nn*100/total) : 0;
      console.log(t.schemaname+'.'+t.tablename+'|'+col.attname+'|'+col.dtype+'|'+(col.nullable?'NL':'NN')+'|'+nn+'/'+total+'|'+pct+'%');
    }
  }

  // SECTION 5: Orphan FK check
  console.log('\n=== FK_ORPHAN_CHECK ===');
  const fks = await client.query(`
    SELECT n.nspname as cs, c.relname as ct, a1.attname as fc, n2.nspname as ps, c2.relname as pt, a2.attname as pc
    FROM pg_constraint p
    JOIN pg_class c ON c.oid = p.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class c2 ON c2.oid = p.confrelid JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
    JOIN pg_attribute a1 ON a1.attrelid = p.conrelid AND a1.attnum = p.conkey[1] AND a1.attnum > 0
    JOIN pg_attribute a2 ON a2.attrelid = p.confrelid AND a2.attnum = p.confkey[1] AND a2.attnum > 0
    WHERE p.contype = 'f' AND n.nspname IN ('public', 'erp_sales') AND array_length(p.conkey, 1) = 1
    ORDER BY n.nspname, c.relname
  `);
  let totalOrphans = 0;
  for (const fk of fks.rows) {
    try {
      const orRes = await client.query(
        'SELECT count(*) as orph FROM ' + fk.cs + '.' + fk.ct + ' t WHERE t.' + fk.fc + ' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ' + fk.ps + '.' + fk.pt + ' p WHERE p.' + fk.pc + ' = t.' + fk.fc + ')'
      );
      const orph = parseInt(orRes.rows[0].orph);
      totalOrphans += orph;
      if (orph > 0) {
        console.log('ORPHAN|'+fk.cs+'.'+fk.ct+'.'+fk.fc+' -> '+fk.ps+'.'+fk.pt+'.'+fk.pc+'|'+orph);
      }
    } catch (e) {
      console.log('FK_ERR|'+fk.cs+'.'+fk.ct+'.'+fk.fc+' -> '+fk.ps+'.'+fk.pt+'.'+fk.pc+'|'+e.message.substring(0,80));
    }
  }
  console.log('FK_ORPHAN_TOTAL|'+totalOrphans);

  // SECTION 6: Composite FK orphan check
  console.log('\n=== COMPOSITE_FK_CHECK ===');
  const compositeFks = await client.query(`
    SELECT n.nspname as cs, c.relname as ct, p.conkey, p.confkey,
      (SELECT string_agg(a.attname, ',') FROM pg_attribute a WHERE a.attrelid = p.conrelid AND a.attnum = ANY(p.conkey) AND a.attnum > 0) as fk_cols,
      (SELECT string_agg(a.attname, ',') FROM pg_attribute a WHERE a.attrelid = p.confrelid AND a.attnum = ANY(p.confkey) AND a.attnum > 0) as pk_cols,
      n2.nspname as ps, c2.relname as pt
    FROM pg_constraint p
    JOIN pg_class c ON c.oid = p.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class c2 ON c2.oid = p.confrelid JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
    WHERE p.contype = 'f' AND n.nspname IN ('public', 'erp_sales') AND array_length(p.conkey, 1) > 1
    ORDER BY n.nspname, c.relname
  `);
  console.log('COMPOSITE_FK_COUNT|'+compositeFks.rows.length);
  for (const fk of compositeFks.rows) {
    console.log('CFK|'+fk.cs+'.'+fk.ct+'|'+fk.fk_cols+' -> '+fk.ps+'.'+fk.pt+'|'+fk.pk_cols);
  }

  // SECTION 7: Duplicate business keys
  console.log('\n=== DUPLICATE_CHECK ===');
  const dupChecks = [
    ['items', 'item_code, company_id'],
    ['suppliers', 'supplier_code, company_id'],
    ['purchase_orders', 'po_code, company_id'],
    ['purchase_requisitions', 'requisition_code, company_id'],
    ['request_for_quotations', 'rfq_code, company_id'],
    ['quotations', 'quotation_code, company_id'],
    ['goods_receipts', 'receipt_code, company_id'],
    ['purchase_returns', 'return_code, company_id'],
    ['purchase_invoices', 'invoice_code, company_id'],
    ['stock_adjustments', 'adjustment_code, company_id'],
    ['stock_transfers', 'transfer_code, company_id'],
    ['customers', 'customer_code, company_id'],
    ['item_categories', 'category_code, company_id'],
    ['batches', 'batch_number, item_id, company_id'],
    ['serial_numbers', 'serial_number, item_id'],
    ['item_barcodes', 'barcode']
  ];
  for (const [tbl, keys] of dupChecks) {
    try {
      const dr = await client.query('SELECT count(*) as dups FROM (SELECT ' + keys + ', count(*) as c FROM ' + tbl + ' GROUP BY ' + keys + ' HAVING count(*) > 1) sub');
      const dups = parseInt(dr.rows[0].dups);
      if (dups > 0) console.log('DUP|'+tbl+'|'+keys+'|'+dups);
    } catch(e) {}
  }
  // erp_sales tables
  const erpDupChecks = [
    ['erp_sales.customers', 'customer_code, company_id'],
    ['erp_sales.quotations', 'quotation_number, company_id'],
    ['erp_sales.sales_orders', 'order_number, company_id'],
    ['erp_sales.sales_invoices', 'invoice_no, company_id'],
    ['erp_sales.sales_deliveries', 'delivery_number'],
    ['erp_sales.sales_returns', 'return_number']
  ];
  for (const [tbl, keys] of erpDupChecks) {
    try {
      const dr = await client.query('SELECT count(*) as dups FROM (SELECT ' + keys + ', count(*) as c FROM ' + tbl + ' GROUP BY ' + keys + ' HAVING count(*) > 1) sub');
      const dups = parseInt(dr.rows[0].dups);
      if (dups > 0) console.log('DUP|'+tbl+'|'+keys+'|'+dups);
    } catch(e) {}
  }
  console.log('DUP_CHECK_DONE');

  // SECTION 8: RLS status
  console.log('\n=== RLS_STATUS ===');
  const rls = await client.query(`SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname IN ('public', 'erp_sales') ORDER BY schemaname, tablename`);
  for (const r of rls.rows) {
    console.log(r.schemaname+'.'+r.tablename+'|'+r.rowsecurity);
  }

  // SECTION 9: Sample data for key tables
  console.log('\n=== SAMPLE_DATA ===');
  const sampleQueries = [
    'SELECT company_code, trade_name, base_currency, country, city FROM companies',
    'SELECT branch_code, name, city FROM branches',
    'SELECT division_code, name FROM divisions',
    'SELECT section_code, name FROM sections',
    'SELECT department_code, name FROM departments LIMIT 3',
    'SELECT warehouse_code, name FROM warehouses',
    'SELECT location_code, name FROM warehouse_locations',
    'SELECT item_code, name, item_type, cost_price, selling_price, currency FROM items ORDER BY item_code',
    'SELECT customer_code, name, customer_type, city, country, credit_limit, status FROM customers ORDER BY customer_code',
    'SELECT supplier_code, name, city, currency_code, payment_terms FROM suppliers ORDER BY supplier_code',
    'SELECT po_code, order_date, total_amount, status FROM purchase_orders ORDER BY po_code',
    'SELECT i.item_code, ib.on_hand, ib.reserved, ib.available, u.code as uom FROM inventory_balances ib JOIN items i ON i.id = ib.item_id JOIN uoms u ON u.id = ib.uom_id ORDER BY i.item_code',
    'SELECT serial_number, status FROM serial_numbers ORDER BY serial_number LIMIT 5',
    'SELECT role_code, name FROM roles',
    'SELECT username, email, display_name FROM erp_users',
    'SELECT customer_code, company_name, city, country, currency FROM erp_sales.customers ORDER BY customer_code',
    'SELECT order_number, total_amount, status FROM erp_sales.sales_orders ORDER BY order_number',
    'SELECT invoice_no, total_amount, paid_amount, status FROM erp_sales.sales_invoices ORDER BY invoice_no'
  ];
  for (const q of sampleQueries) {
    const sr = await client.query(q);
    console.log('SAMPLE|' + q.split(' FROM ')[1].split(' ')[0] + '|' + JSON.stringify(sr.rows));
  }

  await client.end();
  console.log('\n=== AUDIT_COMPLETE ===');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
