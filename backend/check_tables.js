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
    const r = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
    console.log('TABLES (' + r.rows.length + '):');
    r.rows.forEach(row => console.log('  ' + row.table_name));
    await c.end();
  })
  .catch(e => { console.log('ERROR: ' + e.message.split('\n')[0]); });
