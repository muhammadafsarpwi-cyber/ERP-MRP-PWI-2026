const { db } = require('./helper');
(async () => {
  const c = await db();
  const { rows } = await c.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND (
       table_name LIKE '%material_request%' OR table_name LIKE '%requisition%' OR table_name LIKE '%store_replenish%'
       OR table_name LIKE '%stock_ledger%' OR table_name LIKE '%material_request_timeline%'
     ) ORDER BY table_name`);
  console.log(rows.map((r) => r.table_name).join('\n'));
  for (const t of ['material_request_lines', 'material_requests', 'material_request_timeline', 'material_requests_timeline', 'store_replenishments']) {
    const { rows: cols } = await c.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [t]).catch(() => ({ rows: [] }));
    console.log('\n' + t + (cols.length ? ': ' + cols.map((r) => r.column_name).join(', ') : ': (no such table)'));
  }
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });