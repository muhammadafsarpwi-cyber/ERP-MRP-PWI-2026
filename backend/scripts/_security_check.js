const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await client.connect();
  
  // Trigger details
  const triggers = await client.query(`
    SELECT t.tgname, pg_get_triggerdef(t.oid) as def
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth' AND c.relname = 'users' AND NOT t.tgisinternal
  `);
  console.log('=== AUTH TRIGGERS ===');
  triggers.rows.forEach(r => console.log(r.tgname + ': ' + r.def));

  // Function body
  const func = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'erp_core')
  `);
  console.log('\n=== FUNCTION BODY ===');
  if (func.rows.length > 0) console.log(func.rows[0].prosrc);
  else console.log('Function not found');

  // What the function references
  console.log('\n=== ERP_CORE SCHEMA TABLES ===');
  const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'erp_core'");
  console.log('Tables:', tables.rows.map(r => r.table_name));

  // Does the application use erp_core.users anywhere?
  console.log('\n=== Does any code reference erp_core.users? ===');

  // Check if erp_users table has RLS or triggers
  const erpTriggers = await client.query(`
    SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'erp_users' AND NOT t.tgisinternal
  `);
  console.log('erp_users triggers:', erpTriggers.rows.map(r => r.tgname));

  // Orphaned user
  console.log('\n=== ORPHANED USER afsaralam2011@gmail.com ===');
  const orphan = await client.query(`
    SELECT u.id, u.email, u.created_at, u.last_sign_in_at,
           (SELECT COUNT(*) FROM erp_users e WHERE e.auth_user_id = u.id) as has_erp_user
    FROM auth.users u WHERE u.email = 'afsaralam2011@gmail.com'
  `);
  orphan.rows.forEach(r => console.log(JSON.stringify(r)));

  await client.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
