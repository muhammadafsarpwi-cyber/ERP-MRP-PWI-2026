const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' },
});

(async () => {
  await c.connect();
  
  // 1. Check current role
  const role = await c.query("SELECT current_user, session_user, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) as is_super");
  console.log('=== DB ROLE ===');
  console.table(role.rows);

  // 2. Companies table columns
  const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'companies' ORDER BY ordinal_position");
  console.log('\n=== COMPANIES COLUMNS ===');
  console.log(cols.rows.map(r => r.column_name).join(', '));

  // 3. Test RLS effect: try SELECT as the role
  const rlsTest = await c.query('SELECT COUNT(*)::int AS cnt FROM items');
  console.log('\n=== RLS TEST (direct conn as current role) ===');
  console.log('Items visible:', rlsTest.rows[0].cnt);

  // 4. Check if RLS is forced by any row security wrapper
  const forced = await c.query("SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('items','companies','divisions','sections','departments','machines')");
  console.log('\n=== KEY TABLES RLS STATUS ===');
  console.table(forced.rows);

  await c.end();
  console.log('\nDONE');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
