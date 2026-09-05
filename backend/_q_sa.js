const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: require('path').resolve(__dirname, '.env') });
const c = new Client({ host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT||'5432',10), user: process.env.DB_USERNAME||'postgres', password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE||'erp_database', ssl: process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false, connectionTimeoutMillis:10000 });
async function main(){
  await c.connect();
  const codes = ['company.create','company.view','branch.create','branch.view','division.create','division.view','section.create','section.view','department.create','department.view','warehouse.create','warehouse.view','admin.users.update'];
  const r = await c.query(`
    SELECT DISTINCT p.permission_code FROM permissions p
    JOIN role_permissions rp ON rp.permission_id=p.id
    JOIN roles r ON r.id=rp.role_id
    WHERE r.name='Super Administrator' AND p.permission_code = ANY($1) ORDER BY 1`, [codes]);
  console.log('SuperAdmin has codes:', r.rows.map(x=>x.permission_code).join(', '));
  c.end();
}
main().catch(e=>{console.error('FAIL:', e.message); process.exit(1);});
