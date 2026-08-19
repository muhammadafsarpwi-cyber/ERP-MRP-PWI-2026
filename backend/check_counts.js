const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: process.env.DBPASS,
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' },
  connectionTimeoutMillis: 15000
});
c.connect()
  .then(async () => {
    const tables = ['companies','divisions','sections','departments','items','item_categories','uoms','uom_conversions','roles','permissions','erp_users'];
    for (const t of tables) {
      const r = await c.query('SELECT count(*)::int as cnt FROM ' + t);
      console.log(t + ': ' + r.rows[0].cnt + ' rows');
    }
    // Show company data
    const co = await c.query('SELECT id, code, name, status FROM companies LIMIT 5');
    console.log('\nCOMPANIES:');
    co.rows.forEach(r => console.log('  ' + r.code + ' | ' + r.name + ' | ' + r.status));
    await c.end();
  })
  .catch(e => { console.log('ERROR: ' + e.message); });
