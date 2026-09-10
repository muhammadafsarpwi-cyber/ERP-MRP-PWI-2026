const { db } = require('./helper');
(async () => {
  const c = await db();
  const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='item_barcodes' ORDER BY ordinal_position`);
  console.log(r.rows.map((x) => x.column_name).join(', '));
  const n = await c.query(`SELECT COUNT(*)::int AS n FROM item_barcodes`);
  console.log('rows=' + n.rows[0].n);
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });