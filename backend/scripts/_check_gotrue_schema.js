const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

(async () => {
  const env = {};
  const envPath = path.join(__dirname, '..', '.env');
  for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  
  const client = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await client.connect();
  
  // Check if system.admin can still login
  console.log('=== Checking system.admin login ===');
  const lr = await fetch(env.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' }),
  });
  const ld = await lr.json();
  console.log('system.admin login:', lr.status, lr.status === 200 ? 'SUCCESS' : ld.msg || ld.error);
  
  // Check auth schema tables
  console.log('\n=== Auth schema tables ===');
  const tables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'auth' ORDER BY table_name`);
  tables.rows.forEach(r => console.log('  ' + r.table_name));
  
  // Check for sessions table
  const hasSessions = await client.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'sessions') as exists`);
  console.log('\nauth.sessions exists:', hasSessions.rows[0].exists);
  
  // Check sessions columns if it exists
  if (hasSessions.rows[0].exists) {
    const sessCols = await client.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'sessions' ORDER BY ordinal_position`);
    console.log('sessions columns:');
    sessCols.rows.forEach(r => console.log('  ' + r.column_name + ': ' + r.data_type + (r.is_nullable === 'YES' ? ' NULL' : '')));
  }
  
  // Check grants on auth schema for postgres
  console.log('\n=== Auth schema grants ===');
  const grants = await client.query(`SELECT n.nspname as schema, r.rolname as grantee, has_schema_privilege(r.rolname, n.nspname, 'USAGE') as usage, has_schema_privilege(r.rolname, n.nspname, 'CREATE') as create_priv FROM pg_namespace n, pg_roles r WHERE n.nspname = 'auth' AND r.rolname IN ('anon', 'authenticated', 'service_role', 'postgres', 'supabase_auth_admin') ORDER BY r.rolname`);
  grants.rows.forEach(r => console.log('  ' + r.grantee + ': USAGE=' + r.usage + ' CREATE=' + r.create_priv));
  
  // Check if the auth.users table has any extra constraints or triggers
  console.log('\n=== Auth triggers on users ===');
  const triggers = await client.query(`
    SELECT trigger_name, event_manipulation, action_statement 
    FROM information_schema.triggers 
    WHERE event_object_schema = 'auth' AND event_object_table = 'users'
  `);
  triggers.rows.forEach(r => console.log('  ' + r.trigger_name + ': ' + r.event_manipulation + ' - ' + r.action_statement.substring(0, 100)));
  
  // Check the on_auth_user_created trigger function
  console.log('\n=== Trigger function ===');
  const triggerFn = await client.query(`
    SELECT p.proname, pg_get_functiondef(p.oid) as definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'erp_core' AND p.proname = 'handle_new_user'
  `);
  if (triggerFn.rows.length > 0) {
    console.log('handle_new_user definition:');
    console.log(triggerFn.rows[0].definition);
  } else {
    console.log('handle_new_user NOT FOUND in erp_core schema');
  }
  
  // Also check public schema
  const triggerFn2 = await client.query(`
    SELECT p.proname, pg_get_functiondef(p.oid) as definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
  `);
  if (triggerFn2.rows.length > 0) {
    console.log('handle_new_user in public:');
    console.log(triggerFn2.rows[0].definition);
  }
  
  await client.end();
  console.log('\nDone');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
