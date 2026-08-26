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

  // 1. Row count
  const cnt = await c.query('SELECT COUNT(*)::int AS c FROM items');
  console.log('DB ITEM COUNT:', cnt.rows[0].c);

  // 2. RLS status
  const rls = await c.query("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'items'");
  console.log('RLS ENABLED:', rls.rows[0]?.relrowsecurity);
  console.log('RLS FORCED:', rls.rows[0]?.relforcerowsecurity);

  // 3. Policies
  const pol = await c.query("SELECT policyname, cmd, roles, qual FROM pg_policies WHERE tablename = 'items'");
  console.log('SELECT POLICIES:', pol.rows.length === 0 ? 'NONE (zero policies)' : JSON.stringify(pol.rows));

  // 4. Role BYPASSRLS
  const role = await c.query("SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = current_user");
  console.log('CURRENT ROLE:', role.rows[0]?.rolname, 'BYPASSRLS:', role.rows[0]?.rolbypassrls);

  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
