const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: require('path').resolve(__dirname, '.env') });
const c = new Client({ host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT||'5432',10), user: process.env.DB_USERNAME||'postgres', password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE||'erp_database', ssl: process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false, connectionTimeoutMillis:10000 });
async function main(){
  await c.connect();
  const tables = ['companies','branches','divisions','sections','departments','warehouses','warehouse_locations'];
  for (const t of tables) {
    const total = await c.query(`SELECT count(*)::int c FROM ${t}`);
    const v0 = await c.query(`SELECT count(*)::int c FROM ${t} WHERE id::text ~ '^[0-9a-f]{8}-0000-0000-0000-'`);
    const code = t === 'companies' ? 'company_code' : t === 'warehouses' ? 'warehouse_code' : t === 'warehouse_locations' ? 'location_code' : t === 'branches' ? 'branch_code' : t === 'divisions' ? 'division_code' : t === 'sections' ? 'section_code' : 'department_code';
    const v0rows = await c.query(`SELECT id, ${code} AS code FROM ${t} WHERE id::text ~ '^[0-9a-f]{8}-0000-0000-0000-' LIMIT 6`);
    console.log(`\n${t}: total=${total.rows[0].c} version0=${v0.rows[0].c}`);
    v0rows.rows.forEach(r=>console.log(`   v0: ${r.id}  code=${r.code}`));
  }
  await c.end();
}
main().catch(e=>{console.error('FAIL:', e.message); process.exit(1);});