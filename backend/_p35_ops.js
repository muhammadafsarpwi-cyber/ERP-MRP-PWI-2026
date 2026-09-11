const { Client } = require('pg');
require('dotenv').config({ path: '.env' });
const c = new Client({ host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT || '5432', 10), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, ssl: { rejectUnauthorized: false } });
async function main() {
  await c.connect();
  let r = await c.query(`SELECT id, department_code, name FROM departments WHERE name ILIKE '%flatten%' OR name ILIKE '%spiral%'`);
  console.log('=== flatten/spiral departments ===');
  console.table(r.rows);
  r = await c.query(`SELECT operation_code, operation_name, department_id, status FROM operations WHERE department_id IS NOT NULL AND status='ACTIVE' ORDER BY operation_name`);
  console.log('=== active operations with department ===');
  console.table(r.rows.map(x => ({ code: x.operation_code, name: x.operation_name, dept: x.department_id, st: x.status })));
  r = await c.query(`SELECT operation_code, operation_name, department_id FROM operations WHERE operation_name ILIKE '%flatten%' OR operation_name ILIKE '%spiral%'`);
  console.log('=== flatten/spiral ops ===');
  console.table(r.rows);
  c.end();
}
main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });