const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
});
async function test() {
  await client.connect();
  const res = await client.query(`
    SELECT d.id, d.department_code, d.name, d.division_id, d.section_id, s.section_code, s.name as section_name
    FROM departments d
    LEFT JOIN sections s ON d.section_id = s.id
    WHERE d.department_code LIKE '%CCD%' OR s.section_code LIKE '%111%' OR s.section_code LIKE '%CCD%'
  `);
  console.log('CCD Departments & Sections:', res.rows);

  const items = await client.query(`
    SELECT i.id, i.item_code, i.name, i.department_id, d.department_code, d.name as dept_name
    FROM items i
    JOIN departments d ON i.department_id = d.id
    WHERE d.department_code LIKE '%CCD%'
  `);
  console.log('Items assigned to CCD departments count:', items.rows.length);
  console.log('Items sample:', items.rows.slice(0, 5));

  // Also check items with section or division
  const itemsInDept = await client.query(`
    SELECT id, item_code, name, department_id, base_uom_id
    FROM items
    WHERE department_id = 'd8cf64a6-ebfc-4a94-a807-4960d3166752'
  `);
  console.log('Items in CCD-DEPT111:', itemsInDept.rows);

  await client.end();
}
test().catch(console.error);
