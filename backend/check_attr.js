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
    const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'item_attribute_values' ORDER BY ordinal_position");
    console.log('ITEM_ATTRIBUTE_VALUES COLUMNS:', cols.rows.map(r => r.column_name).join(', '));
    
    const cols2 = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'item_attribute_definitions' ORDER BY ordinal_position");
    console.log('ITEM_ATTRIBUTE_DEFINITIONS COLUMNS:', cols2.rows.map(r => r.column_name).join(', '));
    
    await c.end();
  })
  .catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
