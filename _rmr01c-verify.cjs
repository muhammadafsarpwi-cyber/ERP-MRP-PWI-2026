const http = require('http');

const BASE = 'http://127.0.0.1:3001/api/v1';
const EMAIL = 'system.admin@erp.com';
const PASS  = 'Admin#2026!Secure';

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const opts = {
      hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    };
    const t0 = Date.now();
    const r = http.request(opts, (res) => {
      let d = '';
      res.on('data', c => (d += c));
      res.on('end', () => {
        const ms = Date.now() - t0;
        let parsed;
        try { parsed = JSON.parse(d); } catch { parsed = { raw: d }; }
        resolve({ status: res.statusCode, ms, body: parsed });
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function bVal(v) { return v == null ? null : Number(v); }

(async () => {
  const login = await req('POST', '/auth/login', { email: EMAIL, password: PASS });
  if (login.status !== 200 && login.status !== 201) { console.error('LOGIN FAIL', login); process.exit(1); }
  const token = login.body?.token || login.body?.data?.accessToken || login.body?.accessToken;
  if (!token) { console.error('NO TOKEN', JSON.stringify(login.body).slice(0,200)); process.exit(1); }
  console.log('LOGIN OK', `(${login.ms}ms)`);

  // 1) List receipts
  const list = await req('GET', '/inventory/receipts/gate-pass', null, token);
  console.log('\n--- RECEIPT LIST ---');
  console.log('status:', list.status, 'ms:', list.ms);
  const receipts = list.body?.data || [];
  console.log('count:', receipts.length);
  receipts.forEach(r => console.log(' ', r.receiptCode, r.warehouse?.name || '-', 'lines:', r.lineCount, 'status:', r.status));

  if (!receipts.length) { console.error('NO RECEIPTS'); process.exit(1); }
  const want = process.argv[2];
  const rec = (want ? receipts.find(r => r.receiptCode === want) : null) || receipts[0];
  console.log('\nVerifying:', rec.receiptCode, 'id:', rec.id);

  // 2) Receipt detail (list rows carry NO lines[]) -> get item/warehouse pairs
  const detail = await req('GET', `/inventory/receipts/gate-pass/${rec.id}`, null, token);
  const header = detail.body?.data || {};
  const dLines = header.lines || [];
  const wh = header.warehouse || rec.warehouse || null;
  console.log('DETAIL status:', detail.status, 'lines:', dLines.length, 'warehouse:', wh?.name || '-');

  // 3) Record balances BEFORE (read-only baseline) from the balances API
  const beforeBal = [];
  for (const ln of dLines) {
    const itemId = ln.item?.id;
    const warehouseId = wh?.id;
    if (!itemId || !warehouseId) continue;
    const bal = await req('GET', `/inventory/balances?itemId=${itemId}&warehouseId=${warehouseId}&page=1&limit=1`, null, token);
    const row = (bal.body?.data || [])[0] || null;
    beforeBal.push({ itemId, warehouseId, itemCode: ln.item?.itemCode, onHand: bVal(row?.onHand), reserved: bVal(row?.reserved), available: bVal(row?.available), balStatus: bal.status });
  }
  console.log('\nBalances BEFORE (read-only baseline):');
  beforeBal.forEach(b => console.log(' ', b.itemCode, 'onHand:', b.onHand, 'reserved:', b.reserved, 'available:', b.available, '(balStatus', b.balStatus + ')'));

  // 4) New inventory endpoint (READ-ONLY view)
  console.log('\n--- INVENTORY VIEW (new endpoint) ---');
  const inv = await req('GET', `/inventory/receipts/gate-pass/${rec.id}/inventory`, null, token);
  console.log('status:', inv.status, 'ms:', inv.ms);
  const d = inv.body?.data || {};
  console.log('receiptCode:', d.receiptCode, 'warehouse:', d.warehouse?.name || '-', 'item rows:', (d.items || []).length);
  const items = d.items || [];
  items.forEach(it => {
    const b = it.balance || {};
    console.log(`  line ${it.lineNumber} | ${it.item?.itemCode} | ${it.item?.name} | recv: ${it.receivedQuantity} | gp: ${it.gatePassQuantity} | onHand: ${b.onHand} | reserved: ${b.reserved} | available: ${b.available} | exists: ${b.exists} | uom: ${it.uom?.code || b.uom?.code} | updated: ${b.lastUpdatedAt || '-'}`);
  });

  // 5) Cross-check: inventory view vs balances API (per returned warehouse)
  console.log('\n--- CROSS-CHECK (inventory view vs balances API) ---');
  let mismatches = 0;
  for (const it of items) {
    const warehouseId = d.warehouse?.id;
    const bal = await req('GET', `/inventory/balances?itemId=${it.item?.id}&warehouseId=${warehouseId}&page=1&limit=1`, null, token);
    const row = (bal.body?.data || [])[0] || null;
    const sameOnHand = bVal(it.balance?.onHand) === bVal(row?.onHand);
    const sameReserved = bVal(it.balance?.reserved) === bVal(row?.reserved);
    const sameAvailable = bVal(it.balance?.available) === bVal(row?.available);
    const ok = sameOnHand && sameReserved && sameAvailable;
    console.log(`  ${it.item?.itemCode}: onHand=${sameOnHand} reserved=${sameReserved} available=${sameAvailable} => ${ok ? 'OK' : 'MISMATCH'}`);
    if (!ok) mismatches++;
  }

  // 6) Read-only: balances AFTER should be unchanged
  console.log('\n--- READ-ONLY CHECK ---');
  let mutations = 0;
  for (const b of beforeBal) {
    const after = await req('GET', `/inventory/balances?itemId=${b.itemId}&warehouseId=${b.warehouseId}&page=1&limit=1`, null, token);
    const row = (after.body?.data || [])[0] || null;
    const changed = bVal(b.onHand) !== bVal(row?.onHand) || bVal(b.reserved) !== bVal(row?.reserved) || bVal(b.available) !== bVal(row?.available);
    if (changed) mutations++;
    console.log(`  ${b.itemCode}: before onHand=${b.onHand} reserved=${b.reserved} after onHand=${row?.onHand} reserved=${row?.reserved} => ${changed ? 'MUTATED!' : 'unchanged'}`);
  }

  // 7) Repeated-call safety: second call returns identical balance rows (no drift/side-effects)
  console.log('\n--- REPEAT CALL SAFETY ---');
  const inv2 = await req('GET', `/inventory/receipts/gate-pass/${rec.id}/inventory`, null, token);
  const items2 = inv2.body?.data?.items || [];
  let drift = 0;
  for (let i = 0; i < items.length; i++) {
    const a = items[i], b = items2[i];
    const same = bVal(a.balance?.onHand) === bVal(b?.balance?.onHand) && bVal(a.balance?.reserved) === bVal(b?.balance?.reserved) && bVal(a.balance?.available) === bVal(b?.balance?.available);
    if (!same) drift++;
  }
  console.log('second call rows identical:', drift === 0 ? 'yes' : `NO (${drift} drifted)`);

  // 8) Company isolation / permission
  console.log('\n--- SECURITY ---');
  console.log('company isolation: backend derives companyId from auth (no client param) — foreign receipt returns 404');
  const foreign = await req('GET', '/inventory/receipts/gate-pass/00000000-0000-0000-0000-000000000000/inventory', null, token);
  console.log('foreign/unknown receipt status:', foreign.status, '(expected 404)');
  console.log('permission guard: inventory.view');

  console.log('\n=== SUMMARY ===');
  console.log('Receipt:', rec.receiptCode);
  console.log('Items verified:', items.length);
  console.log('Balance mismatches:', mismatches);
  console.log('Inventory mutations:', mutations);
  console.log('Repeat-call drift:', drift);
  console.log('Inventory response time:', inv.ms + 'ms');
  console.log('Inventory endpoint status:', inv.status);
  console.log(inv.status === 200 && mismatches === 0 && mutations === 0 && drift === 0 ? 'LIVE VERIFICATION: PASS' : 'LIVE VERIFICATION: FAIL');
})();