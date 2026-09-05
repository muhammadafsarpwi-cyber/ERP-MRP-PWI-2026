const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: require('path').resolve(__dirname, '.env') });
const c = new Client({ host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT||'5432',10), user: process.env.DB_USERNAME||'postgres', password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE||'erp_database', ssl: process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false, connectionTimeoutMillis:10000 });
async function main(){
  await c.connect();
  const tables = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%role%' OR table_name ILIKE '%permission%' OR table_name ILIKE '%user%') ORDER BY table_name`);
  console.log('relevant tables:', tables.rows.map(r=>r.table_name).join(', '));
  c.end();
}
main().catch(e=>{console.error('FAIL:', e.message); process.exit(1);});
