const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: require('path').resolve(__dirname, '.env') });
const c = new Client({ host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT||'5432',10), user: process.env.DB_USERNAME||'postgres', password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE||'erp_database', ssl: process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false, connectionTimeoutMillis:10000 });
async function main(){
  await c.connect();
  const dev = await c.query(`SELECT id, email FROM auth.users WHERE email=$1`, ['dev@erp-local.test']);
  const devId = dev.rows[0].id;
  console.log('dev user:', devId, dev.rows[0].email);
  const ur = await c.query(`SELECT user_id, role_id FROM user_roles WHERE user_id=$1`, [devId]);
  console.log('dev user_roles:', JSON.stringify(ur.rows));
  const rcols = ur.rows.length ? await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='user_roles' ORDER BY ordinal_position`) : null;
  if (rcols) console.log('user_roles cols:', rcols.rows.map(r=>r.column_name).join(', '));
  const roles = await c.query(`SELECT * FROM roles`);
  console.log('roles:', roles.rows.map(r=>JSON.stringify({id:r.id,name:r.name,slug:r.slug,active:r.is_active})).join(' | '));
  c.end();
}
main().catch(e=>{console.error('FAIL:', e.message); process.exit(1);});
