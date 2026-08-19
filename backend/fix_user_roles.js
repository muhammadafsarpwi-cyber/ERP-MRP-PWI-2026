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
    await c.query("ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id)");
    await c.query("ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true");
    console.log('DONE - added updated_by and is_active to user_roles');
    
    // Verify
    const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'user_roles' ORDER BY ordinal_position");
    console.log('USER_ROLES COLUMNS:', cols.rows.map(r => r.column_name).join(', '));
    
    await c.end();
  })
  .catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
