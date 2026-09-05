const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: require('path').resolve(__dirname, '.env') });
const c = new Client({ host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT||'5432',10), user: process.env.DB_USERNAME||'postgres', password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE||'erp_database', ssl: process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false, connectionTimeoutMillis:10000 });
async function main(){
  await c.connect();
  const r = await c.query(`SELECT permission_code FROM permissions WHERE permission_code ~ '(warehouse-location|business-unit|inventory)' ORDER BY permission_code`);
  console.log('location/business-unit/inventory perms:', (r.rows.map(x=>x.permission_code).join(', ')||'(none)'));
  c.end();
}
main().catch(e=>{console.error('FAIL:', e.message); process.exit(1);});
