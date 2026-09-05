const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: require('path').resolve(__dirname, '.env') });
const c = new Client({ host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT||'5432',10), user: process.env.DB_USERNAME||'postgres', password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE||'erp_database', ssl: process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false, connectionTimeoutMillis:10000 });
async function main(){
  await c.connect();
  console.log('=== Org permission codes present in DB ===');
  const perm = await c.query(`SELECT permission_code FROM permissions WHERE permission_code ~ '(company|branch|division|section|department|warehouse|admin\.users)' ORDER BY permission_code`);
  console.log(perm.rows.map(r=>r.permission_code).join('\n'));
  console.log('\n=== companies ===');
  const co = await c.query(`SELECT id, company_code, legal_name, status FROM companies`);
  co.rows.forEach(r=>console.log(r.id, r.company_code, r.status, r.legal_name));
  console.log('\n=== branches ===');
  const br = await c.query(`SELECT id, branch_code, company_id, status FROM branches`);
  br.rows.forEach(r=>console.log(r.id, r.branch_code, r.company_id, r.status));
  console.log('\n=== divisions (coal) ===');
  const dv = await c.query(`SELECT id, division_code, company_id, status FROM divisions`);
  dv.rows.forEach(r=>console.log(r.id, r.division_code, r.company_id, r.status));
  console.log('\n=== sections (id,company,division) ===');
  const se = await c.query(`SELECT id, section_code, company_id, division_id, status FROM sections LIMIT 20`);
  se.rows.forEach(r=>console.log(r.id, r.section_code, 'co='+r.company_id, 'div='+r.division_id, r.status));
  c.end();
}
main().catch(e=>{console.error('FAIL:', e.message); process.exit(1);});
