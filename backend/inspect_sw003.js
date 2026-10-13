const { Client } = require('pg');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const config = {};
env.split('\n').forEach(line => {
  const parts = line.trim().split('=');
  const k = parts[0];
  const v = parts.slice(1).join('=');
  if (k && v) config[k.trim()] = v.trim().replace(/^['"]|['"]$/g, '');
});

const client = new Client({
  host: config.DB_HOST,
  port: Number(config.DB_PORT) || 6543,
  user: config.DB_USERNAME,
  password: config.DB_PASSWORD,
  database: config.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: config.DB_SSL_SERVERNAME }
});

async function run() {
  await client.connect();
  const companyId = '7725aa04-a270-4314-9e82-90949cbe7791';
  const itemId = '085be503-05ef-4920-898b-19f36046e790';

  const res = await client.query(`
    SELECT
      sl.id,
      sl.transaction_date,
      sl.created_at,
      sl.transaction_type,
      sl.direction,
      sl.quantity,
      sl.reference_type,
      sl.reference_id,
      sl.reference_number,
      sl.notes,
      pe.entry_number,
      pe.entry_date,
      pe.machine_no,
      pe.shift_id,
      pe.created_at as pe_created_at,
      pe.deleted_at as pe_deleted_at
    FROM stock_ledger sl
    LEFT JOIN production_entries pe ON pe.id = sl.reference_id
    WHERE sl.company_id = $1 AND sl.item_id = $2
    ORDER BY sl.transaction_date ASC, sl.created_at ASC
  `, [companyId, itemId]);

  console.log('Stock ledger entries count:', res.rows.length);
  res.rows.forEach((r, idx) => {
    console.log(`[Row ${idx + 1}] Date: ${r.transaction_date?.toISOString().substring(0, 10)}, Qty: ${r.direction === 'IN' ? '+' : '-'}${r.quantity}, Type: ${r.transaction_type}, RefType: ${r.reference_type}, RefNum: ${r.reference_number}, PE: ${r.entry_number}, PEMachine: ${r.machine_no}, Created: ${r.created_at?.toISOString()}, Notes: ${r.notes}`);
  });

  const peRes = await client.query(`
    SELECT pe.*
    FROM production_entries pe
    WHERE pe.entry_number IN ('PE-2026-00230', 'PE-2026-00233', 'PE-2026-00234', 'PE-2026-00240', 'PE-2026-00222')
    ORDER BY pe.entry_number ASC
  `);
  console.log('\n--- Production Entries Details ---');
  peRes.rows.forEach(pe => {
    console.log(JSON.stringify({
      id: pe.id,
      entry_number: pe.entry_number,
      entry_date: pe.entry_date,
      shift_id: pe.shift_id,
      machine_no: pe.machine_no,
      actual_quantity: pe.actual_quantity,
      operator_id: pe.operator_id,
      notes: pe.notes,
      created_at: pe.created_at,
      created_by: pe.created_by,
      deleted_at: pe.deleted_at
    }, null, 2));
  });

  const peItemsRes = await client.query(`
    SELECT pei.*, pe.entry_number
    FROM production_entry_items pei
    JOIN production_entries pe ON pe.id = pei.production_entry_id
    WHERE pe.entry_number IN ('PE-2026-00230', 'PE-2026-00233')
  `);
  console.log('\n--- Production Entry Items ---');
  peItemsRes.rows.forEach(item => {
    console.log(JSON.stringify(item, null, 2));
  });




  const sl230 = await client.query(`
    SELECT sl.id, sl.transaction_date, sl.direction, sl.quantity, sl.transaction_type, sl.reference_type, sl.reference_number,
           i.item_code, i.name as item_name
    FROM stock_ledger sl
    LEFT JOIN items i ON i.id = sl.item_id
    WHERE sl.reference_id = 'b72bfc29-0be8-45e0-8963-68bce966c3e2'
  `);
  console.log('\n--- Stock Ledger rows for PE-2026-00230 ---');
  console.log(sl230.rows);

  await client.end();
}
run().catch(console.error);





