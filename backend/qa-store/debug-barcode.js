const { db } = require('./helper');
(async () => {
  const c = await db();
  const n = await c.query(`SELECT COUNT(*)::int AS n FROM barcodes`);
  console.log('barcodes total rows=' + n.rows[0].n);
  const s = await c.query(`SELECT id, barcode_value, entity_type, entity_id, status, is_primary FROM barcodes LIMIT 5`);
  for (const r of s.rows) console.log('  ' + r.barcode_value + ' type=' + r.entity_type + ' ent=' + String(r.entity_id).slice(0, 8) + ' status=' + r.status);
  const hit = await c.query(`SELECT 1 FROM barcodes WHERE barcode_value='6281100123456'`);
  console.log('lookup value in barcodes table: ' + (hit.rows.length ? 'YES' : 'NO'));
  const ib = await c.query(`SELECT barcode, item_id, status FROM item_barcodes ORDER BY created_at LIMIT 3`);
  for (const r of ib.rows) console.log('  item_barcodes: ' + r.barcode + ' item=' + String(r.item_id).slice(0, 8) + ' status=' + r.status);
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });