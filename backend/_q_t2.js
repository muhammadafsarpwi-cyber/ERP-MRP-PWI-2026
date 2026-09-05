const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: require('path').resolve(__dirname, '.env') });
const c = new Client({ host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT||'5432',10), user: process.env.DB_USERNAME||'postgres', password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE||'erp_database', ssl: process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false, connectionTimeoutMillis:10000 });
async function main(){
  await c.connect();
  const R = await c.query(`SELECT a.id uid, a.email, b.id rid, b.name role_name FROM auth.users a LEFT JOIN erp_roles b ON a.email ILIKE '%' || b.name || '%' LIMIT 5`);
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='erp_roles' ORDER BY ordinal_position`);
  console.log('erp_roles cols:', cols.rows.map(r=>r.column_name).join(', '));
  const dev = await c.query(`SELECT id, email FROM auth.users WHERE email=$1`, ['dev@erp-local.test']);
  console.log('dev:', JSON.stringify(dev.rows[0]));
  const rc = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name LIKE '%role%' ORDER BY table_name, ordinal_position`);
  rc.rows.forEach(r=>console.log(r.column_name));
  c.end();
}
main().catch(e=>{console.error('FAIL:', e.message); process.exit(1);});
