const { Pool } = require('pg');
const pool = new Pool({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
});

async function run() {
  const depts = await pool.query(`
    SELECT d.id, d.name, d.division_id, div.name as div_name
    FROM departments d
    LEFT JOIN divisions div ON div.id = d.division_id
    WHERE d.is_active = true
    ORDER BY d.division_id, d.name;
  `);
  console.log('Departments:', JSON.stringify(depts.rows, null, 2));
  await pool.end();
}
run();
