const { db } = require('./helper');
(async () => {
  const c = await db();
  const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='store_items' ORDER BY ordinal_position`);
  console.log('store_items cols: ' + r.rows.map((x) => x.column_name).join(', '));
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });