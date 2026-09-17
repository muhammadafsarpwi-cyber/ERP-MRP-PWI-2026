const { Client } = require('pg');

async function run() {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
  });
  await client.connect();
  const cols = await client.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'departments' ORDER BY ordinal_position");
  console.log('Departments columns:', cols.rows.map(c => `${c.column_name} (${c.data_type})`));
  const depts = await client.query("SELECT id, department_code, name, company_id, division_id, section_id, created_by, updated_by, created_at, updated_at FROM departments LIMIT 5");
  console.log('Sample depts:', depts.rows);
  await client.end();
}
run().catch(console.error);
