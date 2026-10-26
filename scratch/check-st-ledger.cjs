const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' },
});

async function main() {
  await c.connect();

  const r = await c.query(`
    SELECT pe.id, pe.entry_number, pe.entry_date, pe.actual_quantity, pe.item_id, it.item_code, it.name
    FROM production_entries pe
    JOIN items it ON it.id = pe.item_id
    WHERE pe.id = '3b0defb4-f050-4a4a-99a2-2db00cef29c8'
  `);
  console.log('Production Entry:');
  console.table(r.rows);

  const pei = await c.query(`
    SELECT pei.id, pei.actual_quantity, pei.entry_kind, it.item_code, it.name
    FROM production_entry_items pei
    JOIN items it ON it.id = pei.item_id
    WHERE pei.production_entry_id = '3b0defb4-f050-4a4a-99a2-2db00cef29c8'
  `);
  console.log('\nChild Items:');
  console.table(pei.rows);

  await c.end();
}

main().catch(console.error);
