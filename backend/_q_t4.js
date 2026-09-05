const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: require('path').resolve(__dirname, '.env') });
const c = new Client({ host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT||'5432',10), user: process.env.DB_USERNAME||'postgres', password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE||'erp_database', ssl: process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false, connectionTimeoutMillis:10000 });
async function main(){
  await c.connect();
  const euc = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='erp_users' ORDER BY ordinal_position`);
  console.log('erp_users cols:', euc.rows.map(r=>r.column_name).join(', '));
  const r = await c.query(`
    SELECT a.email, r2.name role_name
    FROM auth.users a
    JOIN erp_users eu ON eu.auth_user_id = a.id
    JOIN user_roles ur ON ur.user_id = eu.id
    JOIN roles r2 ON r2.id = ur.role_id
    ORDER BY a.email`);
  r.rows.forEach(x=>console.log(x.email, '=>', x.role_name));
  c.end();
}
main().catch(e=>{console.error('FAIL:', e.message); process.exit(1);});
