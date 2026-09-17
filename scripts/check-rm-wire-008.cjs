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
  const res = await c.query(`
    SELECT sl.id, sl.transaction_type, sl.direction, sl.quantity, sl.reference_type, sl.reference_id, sl.reference_number, sl.department_id, sl.notes
    FROM stock_ledger sl
    JOIN items i ON i.id = sl.item_id
    WHERE i.item_code = 'RM-WIRE-008'
    ORDER BY sl.transaction_date ASC;
  `);
  console.log('Stock ledger rows for RM-WIRE-008:');
  console.table(res.rows);

  for (const row of res.rows) {
    if (row.reference_id && row.reference_type === 'PRODUCTION_ENTRY') {
      const pe = await c.query(`
        SELECT pe.id, pe.entry_number, pe.department_id, d.name as dept_name, pe.item_id, it.item_code as pe_item_code, it.name as pe_item_name
        FROM production_entries pe
        LEFT JOIN departments d ON d.id = pe.department_id
        LEFT JOIN items it ON it.id = pe.item_id
        WHERE pe.id = $1
      `, [row.reference_id]);
      console.log(`Production entry for reference_id ${row.reference_id}:`);
      console.table(pe.rows);
    }
  }

  // Also check BOM / Routing for RM-WIRE-008 consumers
  const consumers = await c.query(`
    SELECT i.id, i.item_code, i.name, i.production_in_item_id, d.name as dept_name
    FROM items i
    LEFT JOIN departments d ON d.id = i.department_id
    WHERE i.production_in_item_id = (SELECT id FROM items WHERE item_code = 'RM-WIRE-008');
  `);
  console.log('Items that consume RM-WIRE-008:');
  console.table(consumers.rows);

  await c.end();
}

main().catch(console.error);
