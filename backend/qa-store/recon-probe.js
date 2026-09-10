const { db } = require('./helper');
(async () => {
  const c = await db();
  const { rows: orphaned } = await c.query(
    `SELECT mr.id, mr.request_number, mr.status, mr.created_at
     FROM material_requests mr
     WHERE mr.request_number LIKE 'QA-WF-%'`);
  console.log('QA MRs still present:', JSON.stringify(orphaned));
  const { rows: repl } = await c.query(
    `SELECT sr.id, sr.store_id, sr.item_id, sr.material_request_id, sr.material_request_number
     FROM store_replenishments sr
     WHERE sr.material_request_id IS NOT NULL`);
  for (const r of repl) console.log('replinked:', JSON.stringify(r));
  const { rows: replAll } = await c.query(
    `SELECT sr.id, sr.status, sr.material_request_id, sr.deferred, sr.cancelled, sr.adjusted_quantity
     FROM store_replenishments sr ORDER BY sr.updated_at DESC LIMIT 5`);
  for (const r of replAll) console.log('repl:', JSON.stringify(r));
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });