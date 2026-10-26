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
  const countByDept = await c.query(`
    SELECT pe.department_id, d.name AS dept_name, d.department_code, COUNT(pe.id) AS entry_count
    FROM production_entries pe
    LEFT JOIN departments d ON d.id = pe.department_id
    WHERE pe.is_active = true
      AND (
        pe.remarks ILIKE '%[hand packing]%'
        OR pe.machine_no ILIKE 'hand-pack%'
        OR pe.remarks ILIKE '%[packing]%'
        OR d.name ILIKE '%pack%'
      )
    GROUP BY pe.department_id, d.name, d.department_code
  `);
  console.log('Packing entries grouped by department:');
  console.table(countByDept.rows);

  const breakdown = await c.query(`
    SELECT d.name as dept_name, i.item_type,
           CASE 
             WHEN i.item_code ILIKE '%nip%' AND NOT i.item_code ILIKE '%spk%' THEN 'Pure Nipple'
             WHEN i.item_code ILIKE '%spk%' OR i.item_code ILIKE '%fg-spk%' THEN 'Spoke (+ Nipple set)'
             ELSE 'Other'
           END as category,
           count(pe.id) as count
    FROM production_entries pe
    LEFT JOIN departments d ON d.id = pe.department_id
    LEFT JOIN items i ON i.id = pe.item_id
    WHERE pe.is_active = true
      AND (pe.remarks ILIKE '%[hand packing]%' OR pe.machine_no ILIKE 'hand-pack%' OR d.name ILIKE '%pack%')
    GROUP BY d.name, i.item_type, 3
  `);
  console.table(breakdown.rows);
  await c.end();
}
main().catch(console.error);
