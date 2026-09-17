
// Let's test with the same entity setup or direct raw query
const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
});

async function main() {
  await c.connect();
  const itemId = '83700083-14cc-4745-be42-6e84c7b5ff1c'; // RM-WIRE-001
  const ledgerRows = await c.query(`
    SELECT sl.id, sl.direction, sl.transaction_type, sl.reference_type, sl.reference_id, sl.reference_number,
           sl.department_id, sl.notes, d.name as sl_dept_name
    FROM stock_ledger sl
    LEFT JOIN departments d ON d.id = sl.department_id
    WHERE sl.item_id = $1
    ORDER BY sl.transaction_date ASC, sl.created_at ASC
  `, [itemId]);

  console.log(`Found ${ledgerRows.rows.length} ledger rows for RM-WIRE-001:`);
  console.table(ledgerRows.rows.slice(0, 10));

  const peIds = ledgerRows.rows
    .filter(r => r.reference_type && r.reference_type.toUpperCase() === 'PRODUCTION_ENTRY' && r.reference_id)
    .map(r => r.reference_id);
  console.log('PE IDs:', peIds);

  if (peIds.length > 0) {
    const pes = await c.query(`
      SELECT pe.id, pe.entry_number, pe.department_id, d.name as dept_name, pe.item_id, i.item_code
      FROM production_entries pe
      LEFT JOIN departments d ON d.id = pe.department_id
      LEFT JOIN items i ON i.id = pe.item_id
      WHERE pe.id = ANY($1::uuid[])
    `, [peIds]);
    console.log(`Found ${pes.rows.length} matched production entries:`);
    console.table(pes.rows);
  }

  await c.end();
}

main().catch(console.error);
