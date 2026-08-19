const pg = require('pg');
const c = new pg.Client({
  connectionString: 'postgresql://postgres.gnvobiwlzezostzjpqvu:pwiAfsar74()@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();
  const r = await c.query("SELECT id, email, auth_user_id, status FROM erp_users ORDER BY created_at");
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
})();
