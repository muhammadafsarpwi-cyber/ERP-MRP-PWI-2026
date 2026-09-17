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
    SELECT sl.id, sl.item_id, i.item_code, i.name as item_name, sl.direction, sl.quantity,
           sl.reference_type, sl.reference_id, sl.reference_number, sl.department_id, sl.notes
    FROM stock_ledger sl
    JOIN items i ON i.id = sl.item_id
    WHERE sl.notes ILIKE '%FT-02%'
    LIMIT 5;
  `);
  console.table(res.rows);

  if (res.rows.length > 0 && res.rows[0].reference_id) {
    const pe = await c.query(`
      SELECT pe.id, pe.entry_number, pe.department_id, d.name as dept_name, pe.item_id, it.item_code as pe_item_code
      FROM production_entries pe
      LEFT JOIN departments d ON d.id = pe.department_id
      LEFT JOIN items it ON it.id = pe.item_id
      WHERE pe.id = $1
    `, [res.rows[0].reference_id]);
    console.log('Production entry for reference_id:');
    console.table(pe.rows);
  }

  await c.end();
}

main().catch(console.error);
