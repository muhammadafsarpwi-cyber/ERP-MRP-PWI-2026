const { db } = require('./helper');

(async () => {
  const c = await db();
  for (const t of ['permissions', 'roles', 'role_permissions', 'user_roles']) {
    const { rows } = await c.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [t]);
    console.log(t + ': ' + rows.map((r) => r.column_name).join(', '));
  }
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });