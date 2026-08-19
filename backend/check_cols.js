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
    for (const t of ['item_specifications', 'item_documents', 'item_barcodes']) {
      const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name = '${t}' ORDER BY ordinal_position`);
      console.log(t + ': ' + cols.rows.map(r => r.column_name).join(', '));
    }
    await c.end();
  })
  .catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
