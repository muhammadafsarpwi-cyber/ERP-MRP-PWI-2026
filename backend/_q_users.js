const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: require('path').resolve(__dirname, '.env') });
const c = new Client({ host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT||'5432',10), user: process.env.DB_USERNAME||'postgres', password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE||'erp_database', ssl: process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false, connectionTimeoutMillis:10000 });
async function main(){
  await c.connect();
  const r = await c.query(`SELECT email FROM auth.users LIMIT 10`);
  console.log('auth users:', r.rows.map(x=>x.email).join(', '));
  const roles = await c.query(`SELECT u.email, r.name role FROM erp_users u LEFT JOIN erp_user_roles ur ON ur.user_id=u.id LEFT JOIN erp_roles r ON r.id=ur.role_id LIMIT 15`);
  roles.rows.forEach(x=>console.log(x.email, x.role));
  c.end();
}
main().catch(e=>{console.error('FAIL:', e.message); process.exit(1);});
