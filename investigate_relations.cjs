const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const p = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env');
const out = {};
for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
  if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const c = new Client({
  host: out.DB_HOST, port: Number(out.DB_PORT), user: out.DB_USERNAME,
  password: out.DB_PASSWORD, database: out.DB_DATABASE, ssl: { rejectUnauthorized: false },
});

async function run() {
  await c.connect();
  console.log('Connected to database');
  
  // 1. Full sales_orders structure
  console.log('\n===== A. sales_orders full columns =====');
  const soCols = await c.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'erp_sales' AND table_name = 'sales_orders'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(soCols.rows, null, 2));
  
  // 2. Full sales_order_items structure
  console.log('\n===== B. sales_order_items full columns =====');
  const soiCols = await c.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'erp_sales' AND table_name = 'sales_order_items'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(soiCols.rows, null, 2));
  
  // 3. Check quotations table (may link to sales_orders)
  console.log('\n===== C. quotations columns =====');
  const qCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'erp_sales' AND table_name = 'quotations'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(qCols.rows, null, 2));
  
  console.log('\n===== D. quotation_items columns =====');
  const qiCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'erp_sales' AND table_name = 'quotation_items'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(qiCols.rows, null, 2));
  
  // 4. Check sales_deliveries
  console.log('\n===== E. sales_deliveries columns =====');
  const sdCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'erp_sales' AND table_name = 'sales_deliveries'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(sdCols.rows, null, 2));
  
  console.log('\n===== F. sales_delivery_lines columns =====');
  const sdlCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'erp_sales' AND table_name = 'sales_delivery_lines'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(sdlCols.rows, null, 2));
  
  // 5. Check sales_invoices
  console.log('\n===== G. sales_invoices columns =====');
  const siCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'erp_sales' AND table_name = 'sales_invoices'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(siCols.rows, null, 2));
  
  console.log('\n===== H. sales_invoice_lines columns =====');
  const silCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'erp_sales' AND table_name = 'sales_invoice_lines'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(silCols.rows, null, 2));
  
  // 6. Check sales_returns
  console.log('\n===== I. sales_returns columns =====');
  const srCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'erp_sales' AND table_name = 'sales_returns'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(srCols.rows, null, 2));
  
  console.log('\n===== J. sales_return_lines columns =====');
  const srlCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'erp_sales' AND table_name = 'sales_return_lines'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(srlCols.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });