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
    // Check user_roles columns
    const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'user_roles' ORDER BY ordinal_position");
    console.log('USER_ROLES COLUMNS:', cols.rows.map(r => r.column_name).join(', '));
    
    // Check user_roles PK/unique constraints
    const cons = await c.query("SELECT conname, contype FROM pg_constraint WHERE conrelid = 'user_roles'::regclass");
    console.log('CONSTRAINTS:', cons.rows.map(r => r.conname + '(' + r.contype + ')').join(', '));
    
    await c.end();
  })
  .catch(e => { console.log('ERROR: ' + e.message); });
