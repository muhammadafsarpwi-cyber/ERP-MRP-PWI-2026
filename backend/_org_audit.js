const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: require('path').resolve(__dirname, '.env') });
const c = new Client({ host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT||'5432',10), user: process.env.DB_USERNAME||'postgres', password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE||'erp_database', ssl: process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false, connectionTimeoutMillis:10000 });
async function main(){
  await c.connect();
  const tables = ['companies','branches','divisions','sections','departments','warehouses','warehouse_locations'];
  for (const t of tables) {
    const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='${t}' AND (column_name LIKE '%_id' OR column_name='id') ORDER BY ordinal_position`);
    const ids = await c.query(`SELECT id, ${t === 'warehouses' || t === 'warehouse_locations' ? '' : ''} count(*)::int c FROM ${t} GROUP BY id LIMIT 1`);
    const sample = await c.query(`SELECT id FROM ${t} LIMIT 3`);
    console.log(`${t} columns:`, r.rows.map(x=>x.column_name).join(', '));
    console.log(`  sample ids:`, sample.rows.map(x=>x.id).join(' | ') || '(empty)');
  }
  await c.end();
}
main().catch(e=>{console.error('FAIL:', e.message); process.exit(1);});