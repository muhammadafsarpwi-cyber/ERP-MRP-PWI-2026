const { db } = require('./helper');
(async () => {
  const c = await db();
  for (const t of ['role_permissions', 'roles', 'user_roles']) {
    const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [t]);
    console.log(t + ': ' + r.rows.map((x) => x.column_name).join(', '));
  }
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });