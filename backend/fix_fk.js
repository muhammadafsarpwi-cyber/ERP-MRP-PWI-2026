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
    // Find all FK constraints on user_roles
    const cons = await c.query(`
      SELECT c.conname, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      WHERE c.conrelid = 'user_roles'::regclass AND c.contype = 'f'
    `);
    for (const row of cons.rows) {
      console.log('user_roles FK: ' + row.conname + ' -> ' + row.def);
      if (row.def.includes('updated_by')) {
        await c.query('ALTER TABLE user_roles DROP CONSTRAINT ' + row.conname);
        console.log('DROPPED: ' + row.conname);
      }
    }

    // Find all FK constraints on role_permissions
    const rpCons = await c.query(`
      SELECT c.conname, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      WHERE c.conrelid = 'role_permissions'::regclass AND c.contype = 'f'
    `);
    for (const row of rpCons.rows) {
      console.log('role_permissions FK: ' + row.conname + ' -> ' + row.def);
      if (row.def.includes('updated_by')) {
        await c.query('ALTER TABLE role_permissions DROP CONSTRAINT ' + row.conname);
        console.log('DROPPED: ' + row.conname);
      }
    }

    await c.end();
  })
  .catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
