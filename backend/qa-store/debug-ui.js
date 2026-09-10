const { db, login, api } = require('./helper');

(async () => {
  const c = await db();
  await login();

  const r1 = await api('GET', '/store/dashboard/summary', null);
  console.log('summary status=' + r1.status);
  const j = r1.json;
  if (typeof j === 'object' && j !== null) {
    console.log('summary top keys: ' + Object.keys(j).join(', '));
    console.log('summary sample: ' + JSON.stringify(j).slice(0, 300));
  } else {
    console.log('summary body: ' + JSON.stringify(j));
  }

  const { rows: bc } = await c.query(`SELECT barcode, item_id, status, is_primary FROM item_barcodes ORDER BY created_at LIMIT 5`);
  console.log('barcodes in DB:');
  for (const r of bc) console.log('  ' + r.barcode + ' item=' + String(r.item_id).slice(0, 8) + ' status=' + r.status + ' primary=' + r.is_primary);

  const r2 = await api('GET', '/barcode-management/lookup/6281100123456', null);
  console.log('lookup 6281100123456 status=' + r2.status + ' body=' + JSON.stringify(r2.json).slice(0, 200));

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });