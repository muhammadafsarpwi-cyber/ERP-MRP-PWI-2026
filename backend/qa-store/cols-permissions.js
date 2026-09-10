const { db } = require('./helper');
(async () => {
  const c = await db();
  const r = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='permissions' ORDER BY ordinal_position`);
  console.log(r.rows.map((x) => x.column_name + ':' + x.data_type).join(', '));
  const s = await c.query(`SELECT COUNT(*)::int AS n FROM permissions`);
  console.log('permissions rows=' + s.rows[0].n);
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });