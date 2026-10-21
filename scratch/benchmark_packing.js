const { Client } = require('pg');

async function run() {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const start = Date.now();
  const res = await client.query(`
    SELECT pe.id, pe.entry_number, pe.entry_date, pe.created_at, pe.shift_id, pe.item_id,
           pe.machine_no, pe.operator_name, pe.actual_quantity,
           pe.remarks, pe.warehouse_id,
           it.item_code, it.name as item_name,
           sh.name as shift_name,
           w.name as warehouse_name
    FROM production_entries pe
    LEFT JOIN items it ON it.id = pe.item_id
    LEFT JOIN shifts sh ON sh.id = pe.shift_id
    LEFT JOIN warehouses w ON w.id = pe.warehouse_id
    WHERE pe.is_active = true
      AND (
        pe.remarks ILIKE '%[hand packing]%'
        OR pe.remarks ILIKE '%customer:%'
        OR pe.machine_no ILIKE 'hand-pack%'
      )
    ORDER BY pe.entry_date ASC, pe.created_at ASC
  `);
  const elapsed = Date.now() - start;
  console.log(`SUCCESS! Fetched ${res.rows.length} packing entries in ${elapsed} ms!`);
  await client.end();
}
run().catch(console.error);
