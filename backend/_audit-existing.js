'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const CONFIG = {
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  ssl: { rejectUnauthorized: false },
};

const SCHEMAS = ['public', 'erp_sales'];
const q = (ident) => `"${String(ident).replace(/"/g, '""')}"`;
const fqn = (schema, table) => `${q(schema)}.${q(table)}`;

function truncateValue(v, max = 300) {
  if (v === null || v === undefined) return v;
  if (Buffer.isBuffer(v)) return `<binary ${v.length} bytes>`;
  if (typeof v === 'object') {
    try {
      const s = JSON.stringify(v);
      return s.length > max ? s.slice(0, max) + '...[truncated]' : JSON.parse(s);
    } catch (_) {
      return '<unserializable object>';
    }
  }
  if (typeof v === 'string' && v.length > max) return v.slice(0, max) + '...[truncated]';
  return v;
}

async function main() {
  const client = new Client(CONFIG);
  await client.connect();
  console.log('Connected to Supabase.\n');

  const report = {
    generatedAt: new Date().toISOString(),
    connection: { host: CONFIG.host, port: CONFIG.port, database: CONFIG.database, user: CONFIG.user },
    schemaCheck: {},
    tables: {},
    tableDetails: {},
    specificChecks: {},
    devUser: null,
    permissionCounts: {},
    seedingSummary: {},
  };

  // ---- 4. Does erp_sales schema exist? ----
  const schemaRes = await client.query(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('public','erp_sales') ORDER BY schema_name`
  );
  report.schemaCheck = {
    existingSchemas: schemaRes.rows.map((r) => r.schema_name),
    erpSalesExists: schemaRes.rows.some((r) => r.schema_name === 'erp_sales'),
  };

  // ---- 1. All tables in target schemas ----
  const tablesRes = await client.query(
    `SELECT table_schema, table_name
       FROM information_schema.tables
      WHERE table_schema = ANY($1)
        AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name`,
    [SCHEMAS]
  );

  const allTables = []; // { schema, name, rowCount }
  console.log('=== ROW COUNTS PER TABLE ===');
  for (const { table_schema, table_name } of tablesRes.rows) {
    let rowCount = null;
    let error = null;
    try {
      const c = await client.query(`SELECT COUNT(*)::bigint AS cnt FROM ${fqn(table_schema, table_name)}`);
      rowCount = Number(c.rows[0].cnt);
    } catch (e) {
      error = e.message;
    }
    const entry = { schema: table_schema, name: table_name, rowCount, error };
    allTables.push(entry);
    if (!report.tables[table_schema]) report.tables[table_schema] = [];
    report.tables[table_schema].push({ name: table_name, rowCount, error });
    console.log(`${table_schema}.${table_name}: ${error ? 'ERROR: ' + error : rowCount}`);
  }

  // ---- 2. Columns + sample row for non-empty tables ----
  console.log('\n=== NON-EMPTY TABLE DETAILS (columns + 1 sample row) ===');
  for (const t of allTables) {
    if (!t.rowCount || t.rowCount <= 0) continue;
    const colsRes = await client.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position`,
      [t.schema, t.name]
    );
    let sampleRow = null;
    try {
      const s = await client.query(`SELECT * FROM ${fqn(t.schema, t.name)} LIMIT 1`);
      if (s.rows.length > 0) {
        sampleRow = {};
        for (const col of colsRes.rows) {
          sampleRow[col.column_name] = truncateValue(s.rows[0][col.column_name]);
        }
      }
    } catch (e) {
      sampleRow = { __error: e.message };
    }
    report.tableDetails[`${t.schema}.${t.name}`] = {
      rowCount: t.rowCount,
      columns: colsRes.rows.map((c) => ({ name: c.column_name, type: c.data_type, nullable: c.is_nullable === 'YES' })),
      sampleRow,
    };
    console.log(`\n--- ${t.schema}.${t.name} (${t.rowCount} rows) ---`);
    console.log('Columns:', colsRes.rows.map((c) => `${c.column_name}:${c.data_type}`).join(', '));
    console.log('Sample:', JSON.stringify(sampleRow));
  }

  // ---- helpers for specific checks ----
  const findTables = (predicate) => allTables.filter((t) => predicate(t.name.toLowerCase(), t.schema));
  const findOne = (name) =>
    allTables.find((t) => t.name.toLowerCase() === name.toLowerCase()) ||
    allTables.find((t) => t.name.toLowerCase().includes(name.toLowerCase())) ||
    null;

  // ---- 3. Specific checks ----
  console.log('\n=== SPECIFIC CHECKS ===');

  const simpleChecks = ['erp_users', 'branches', 'sections', 'departments', 'business_units', 'warehouse_locations', 'item_categories'];
  for (const name of simpleChecks) {
    const t = findOne(name);
    report.specificChecks[name] = t ? { table: `${t.schema}.${t.name}`, rowCount: t.rowCount } : { missing: true };
    console.log(`${name}: ${t ? `${t.schema}.${t.name} -> ${t.rowCount} rows` : 'TABLE NOT FOUND'}`);
  }

  // Customers + contacts + addresses
  const customerTables = findTables((n) => n.includes('customer'));
  report.specificChecks.customers = customerTables.map((t) => ({ table: `${t.schema}.${t.name}`, rowCount: t.rowCount }));
  console.log('\ncustomer-related tables:');
  for (const t of customerTables) console.log(`  ${t.schema}.${t.name}: ${t.rowCount} rows`);
  const custContacts = customerTables.find((t) => t.name.toLowerCase().includes('contact'));
  const custAddr = customerTables.find((t) => t.name.toLowerCase().includes('address'));
  report.specificChecks.customerHasContactsAndAddresses = {
    contactsTable: custContacts ? `${custContacts.schema}.${custContacts.name} (${custContacts.rowCount})` : 'NOT FOUND',
    addressesTable: custAddr ? `${custAddr.schema}.${custAddr.name} (${custAddr.rowCount})` : 'NOT FOUND',
  };

  // Suppliers
  const supplierTables = findTables((n) => n.includes('supplier') || n.includes('vendor'));
  report.specificChecks.suppliers = supplierTables.map((t) => ({ table: `${t.schema}.${t.name}`, rowCount: t.rowCount }));
  console.log('\nsupplier/vendor tables:');
  for (const t of supplierTables) console.log(`  ${t.schema}.${t.name}: ${t.rowCount} rows`);

  // Procurement
  const procTables = findTables((n) =>
    ['purchase_', 'requisition', 'rfq', 'quotation_request', 'goods_receipt', 'grn'].some((k) => n.includes(k))
  );
  report.specificChecks.procurement = procTables.map((t) => ({ table: `${t.schema}.${t.name}`, rowCount: t.rowCount }));
  console.log('\nprocurement tables:');
  for (const t of procTables) console.log(`  ${t.schema}.${t.name}: ${t.rowCount} rows`);

  // Inventory
  const invTables = findTables((n) =>
    ['batch', 'inventory', 'stock', 'movement', 'serial'].some((k) => n.includes(k))
  );
  report.specificChecks.inventory = invTables.map((t) => ({ table: `${t.schema}.${t.name}`, rowCount: t.rowCount }));
  console.log('\ninventory tables:');
  for (const t of invTables) console.log(`  ${t.schema}.${t.name}: ${t.rowCount} rows`);

  // erp_sales documents + line items
  const salesTables = allTables.filter((t) => t.schema === 'erp_sales');
  const docGroups = ['quotation', 'order', 'delivery', 'invoice', 'return'];
  report.specificChecks.erpSales = {};
  console.log('\nerp_sales documents & line items:');
  for (const g of docGroups) {
    const group = salesTables.filter((t) => t.name.toLowerCase().includes(g));
    const items = group.filter((t) => t.name.toLowerCase().includes('item') || t.name.toLowerCase().includes('line'));
    const docs = group.filter((t) => !items.includes(t));
    report.specificChecks.erpSales[g] = {
      documents: docs.map((t) => ({ table: t.name, rowCount: t.rowCount })),
      lineItems: items.map((t) => ({ table: t.name, rowCount: t.rowCount })),
    };
    console.log(
      `  [${g}] docs: ${docs.map((t) => `${t.name}=${t.rowCount}`).join(', ') || 'none'} | lines: ${
        items.map((t) => `${t.name}=${t.rowCount}`).join(', ') || 'none'
      }`
    );
  }

  // ---- 5. Dev user in erp_users ----
  const usersTable = allTables.find((t) => t.name.toLowerCase() === 'erp_users');
  if (usersTable && usersTable.rowCount > 0) {
    const u = await client.query(`SELECT * FROM ${fqn(usersTable.schema, usersTable.name)}`);
    const rows = u.rows.map((r) => {
      const o = {};
      for (const k of Object.keys(r)) o[k] = truncateValue(r[k]);
      return o;
    });
    const dev =
      rows.find((r) => Object.values(r).some((v) => typeof v === 'string' && /\bdev\b|developer|admin@/i.test(v))) || rows[0];
    report.devUser = { table: `${usersTable.schema}.erp_users`, totalUsers: rows.length, matchedDevRow: dev, allUsers: rows };
    console.log(`\nerp_users: ${rows.length} row(s). Dev user match:`);
    console.log(JSON.stringify(dev, null, 2));
  } else {
    report.devUser = { table: usersTable ? `${usersTable.schema}.erp_users` : 'MISSING', totalUsers: 0 };
    console.log('\nerp_users: EMPTY or MISSING - no dev user.');
  }

  // ---- 6. Permissions & role_permissions counts ----
  for (const name of ['permissions', 'role_permissions']) {
    const t = allTables.find((x) => x.name.toLowerCase() === name);
    if (t) {
      report.permissionCounts[name] = { table: `${t.schema}.${t.name}`, rowCount: t.rowCount };
      console.log(`${name}: ${t.rowCount} rows (${t.schema})`);
    } else {
      report.permissionCounts[name] = { missing: true };
      console.log(`${name}: TABLE NOT FOUND`);
    }
  }

  // ---- Seeding summary ----
  const expected = {
    coreOrg: ['business_units', 'departments', 'sections', 'branches', 'warehouse_locations', 'item_categories', 'erp_users'],
    customers: ['customers', 'customer_contacts', 'customer_addresses'],
    suppliers: ['suppliers'],
    procurement: ['purchase_requisitions', 'purchase_orders', 'purchase_order_items'],
    inventory: ['batches', 'inventory_balances'],
    sales: ['quotations', 'quotation_items', 'sales_orders', 'sales_order_items', 'deliveries', 'delivery_items', 'invoices', 'invoice_items', 'sales_returns', 'sales_return_items'],
  };
  for (const [group, names] of Object.entries(expected)) {
    report.seedingSummary[group] = names.map((n) => {
      const exact = allTables.find((t) => t.name.toLowerCase() === n);
      if (exact) return { expected: n, actual: `${exact.schema}.${exact.name}`, status: exact.rowCount > 0 ? 'HAS_DATA' : 'EMPTY' };
      const partial = allTables.find((t) => t.name.toLowerCase().includes(n.replace(/s$/, '')));
      if (partial) return { expected: n, actual: `${partial.schema}.${partial.name}`, status: partial.rowCount > 0 ? 'HAS_DATA (name differs)' : 'EMPTY (name differs)' };
      return { expected: n, status: 'MISSING' };
    });
  }

  await client.end();

  const outPath = path.join(__dirname, '_audit-existing-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nFull JSON report saved to: ${outPath}`);
}

main().catch((e) => {
  console.error('AUDIT FAILED:', e);
  process.exit(1);
});
