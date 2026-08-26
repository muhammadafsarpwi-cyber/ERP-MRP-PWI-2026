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

  // Check BYPASSRLS privilege
  const role = await c.query(`SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname = 'postgres'`);
  console.log('=== postgres role privileges ===');
  console.table(role.rows);

  // Try setting a fake JWT claim (what Supabase pooler might do)
  console.log('\n=== TEST: Simulating RLS with JWT claims ===');
  
  // Check if SET request.jwt.claims affects visibility
  await c.query(`SET "request.jwt.claims" = '{"role":"anon"}'`);
  const rlsAnon = await c.query('SELECT COUNT(*)::int AS cnt FROM items');
  console.log('Items with JWT role=anon:', rlsAnon.rows[0].cnt);
  
  await c.query(`SET "request.jwt.claims" = '{"role":"authenticated"}'`);
  const rlsAuth = await c.query('SELECT COUNT(*)::int AS cnt FROM items');
  console.log('Items with JWT role=authenticated:', rlsAuth.rows[0].cnt);
  
  await c.query(`RESET "request.jwt.claims"`);
  const rlsReset = await c.query('SELECT COUNT(*)::int AS cnt FROM items');
  console.log('Items after RESET claims:', rlsReset.rows[0].cnt);

  // Check if search_path matters
  await c.query(`SET search_path TO public`);
  const rlsPublic = await c.query('SELECT COUNT(*)::int AS cnt FROM items');
  console.log('Items with search_path=public:', rlsPublic.rows[0].cnt);

  await c.end();
  console.log('\nDONE');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
