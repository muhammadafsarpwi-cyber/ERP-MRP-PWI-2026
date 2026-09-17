const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
});
async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT ro.id, ro.operation_code, ro.operation_name, ro.department_id, ro.section_id, ro.division_id, d.department_code, d.name as dept_name
    FROM routing_operations ro
    LEFT JOIN departments d ON ro.department_id = d.id
    LIMIT 20
  `);
  console.log(res.rows);
  await client.end();
}
main().catch(console.error);
