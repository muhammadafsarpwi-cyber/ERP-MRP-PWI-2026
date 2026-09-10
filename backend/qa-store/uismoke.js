const { db, login, api, expect, summary, COMPANY } = require('./helper');

const ITEM = '1c53e9a9-b020-4d3a-bcd4-67ab8b50ef6f';
const STORE = '3b6b5628-859c-4df0-aab7-a69fd953bdd7';
const WAREHOUSE = 'aa9fedcb-27ac-47d2-a963-40d01c2594bc';

(async () => {
  const c = await db();
  await login();

  const { rows: bc } = await c.query(
    `SELECT b.barcode_value FROM barcodes b WHERE b.entity_type='ITEM' AND b.status='ACTIVE' AND b.entity_id=$1 LIMIT 1`, [ITEM]);
  const barcode = bc[0] && bc[0].barcode_value;

  const r1 = await api('GET', '/store/dashboard', null);
  const r1b = await api('GET', '/store/dashboard/summary', null);
  expect(r1.status === 200, 'GET /store/dashboard 200');
  expect(r1b.status === 200 && r1b.json && (r1b.json.kpis || r1b.json.totalStores || Array.isArray(r1b.json)), 'GET /store/dashboard/summary 200 with kpi payload');

  const r2 = await api('GET', '/store/stores', null);
  expect(r2.status === 200 && Array.isArray(r2.json), 'GET /store/stores list');
  const ccd = Array.isArray(r2.json) ? r2.json.find((s) => s.id === STORE) : null;
  expect(ccd != null, 'CCD store present in GET /store/stores');

  const r3 = await api('GET', '/store/lifecycle/items/' + ITEM + '?storeId=' + STORE, null);
  expect(r3.status === 200 && r3.json, 'GET /store/lifecycle/items/{id} 200 (StoreItemLifecycle page/Barcode tab)');

  const r4 = await api('GET', '/store/material-requests', null);
  expect(r4.status === 200 && Array.isArray(r4.json), 'GET /store/material-requests list (MR management page)');

  const r5 = await api('GET', '/store/material-issues', null);
  expect(r5.status === 200, 'GET /store/material-issues (issues page)');

  const r6 = await api('GET', '/store/material-returns', null);
  expect(r6.status === 200, 'GET /store/material-returns (returns page)');

  const r7 = await api('GET', '/store/replenishment', null);
  const r7b = await api('GET', '/store/replenishment/kpis', null);
  expect(r7.status === 200, 'GET /store/replenishment (low-stock queue)');
  expect(r7b.status === 200, 'GET /store/replenishment/kpis');

  const r8 = await api('GET', '/inventory/reports/ledger?warehouseId=' + WAREHOUSE, null);
  expect(r8.status === 200, 'GET /inventory/reports/ledger (StoreItemLedger page)');

  const r9 = await api('GET', '/inventory/balances?warehouseId=' + WAREHOUSE, null);
  expect(r9.status === 200, 'GET /inventory/balances (Stock Balance page)');

  const r10 = await api('GET', '/barcode-management/stats', null);
  expect(r10.status === 200, 'GET /barcode-management/stats (BarcodeDashboard)');

  const r11 = await api('GET', '/barcode-management?entityType=ITEM', null);
  expect(r11.status === 200, 'GET /barcode-management?entityType=ITEM (EntityBarcodeList)');

  if (barcode) {
    const r12 = await api('GET', '/barcode-management/lookup/' + encodeURIComponent(barcode), null);
    expect(r12.status === 200 && r12.json, 'GET /barcode-management/lookup/' + barcode + ' (ScanBarcode)');
  } else {
    console.log('  (skip) no ACTIVE barcode rows in item_barcodes');
  }

  summary('STORE UI-FACING ENDPOINT SMOKE');
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });